import calendar
import csv
import io
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated
from uuid import uuid4

from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field as PydanticField
from sqlmodel import Session

from app.models import AccountValueEntry, AccountValueSnapshot, Statement, Transaction, create_db_and_tables, engine
from app.services.analysis import summarize_transactions
from app.services.categorization import build_merchant_groups, merchant_key
from app.services.parser import StatementParseError, parse_statement
from app.services.statement_automation import continue_download_flow, start_download_flow

app = FastAPI(title="Finance Tracker API")
create_db_and_tables()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class StatementUploadResponse(BaseModel):
    id: str
    filename: str
    status: str
    parsed_format: str
    summary: dict


class MonthlySummaryResponse(BaseModel):
    total_spend: float
    top_categories: list
    monthly_breakdown: list
    weekly_breakdown: list
    last_30_days: dict


class ClearDatabaseResponse(BaseModel):
    status: str
    deleted_statements: int
    deleted_transactions: int


class ClearTransactionsResponse(BaseModel):
    status: str
    deleted_transactions: int


class ClearCategoriesResponse(BaseModel):
    status: str
    updated_transactions: int


class MerchantGroup(BaseModel):
    merchant_key: str
    display_name: str
    count: int
    examples: list[str]
    merchants: list[str] = PydanticField(default_factory=list)


class CategorizationSuggestionsResponse(BaseModel):
    groups: list[MerchantGroup]
    limit: int
    offset: int
    total: int
    has_more: bool


class CategoriesResponse(BaseModel):
    categories: list[str]


class CategorySummaryItem(BaseModel):
    name: str
    transaction_count: int


class CategorySummaryResponse(BaseModel):
    categories: list[CategorySummaryItem]


class CategoryMerchantGroup(BaseModel):
    merchant_key: str
    display_name: str
    count: int
    examples: list[str]
    merchants: list[str]


class CategoryDetailItem(BaseModel):
    name: str
    transaction_count: int
    merchant_groups: list[CategoryMerchantGroup]


class CategoryDetailsResponse(BaseModel):
    categories: list[CategoryDetailItem]
    uncategorized_groups: list[CategoryMerchantGroup]
    uncategorized_limit: int
    uncategorized_offset: int
    uncategorized_total: int
    uncategorized_has_more: bool


class RenameCategoryRequest(BaseModel):
    current_category: str
    new_category: str


class RenameCategoryResponse(BaseModel):
    status: str
    current_category: str
    new_category: str
    updated_transactions: int


class CategorizeMerchantRequest(BaseModel):
    merchant_key: str
    category: str
    excluded_merchants: list[str] = PydanticField(default_factory=list)


class CategorizeMerchantResponse(BaseModel):
    status: str
    merchant_key: str
    category: str
    updated_transactions: int


class RemoveMerchantCategoryRequest(BaseModel):
    merchant: str
    category: str


class RemoveMerchantCategoryResponse(BaseModel):
    status: str
    merchant: str
    category: str
    updated_transactions: int


class AccountValueEntryPayload(BaseModel):
    account_name: str
    account_type: str = "account"
    value: float = 0.0
    display_order: int = 0


class AccountValueSnapshotPayload(BaseModel):
    year: int
    month_end: str
    projected: float = 0.0
    recorded_date: str = ""
    notes: str = ""
    accounts: list[AccountValueEntryPayload] = PydanticField(default_factory=list)
    contributions: list[AccountValueEntryPayload] = PydanticField(default_factory=list)


class AccountValueSnapshotResponse(BaseModel):
    id: int
    year: int
    month_end: str
    projected: float
    recorded_date: str
    notes: str
    actual: float
    diff: float
    accounts: list[AccountValueEntryPayload]
    contributions: list[AccountValueEntryPayload]


class AccountValuesResponse(BaseModel):
    snapshots: list[AccountValueSnapshotResponse]


class AccountValuesImportResponse(BaseModel):
    status: str
    year: int
    imported_snapshots: int
    imported_entries: int


ACCOUNT_VALUE_BASE_COLUMNS = {
    "month end",
    "projected",
    "actual",
    "date",
    "diff",
    "cash",
    "vs last month",
    "notes",
}


def _parse_money(value: object) -> float:
    cleaned = str(value or "").strip()
    if not cleaned or cleaned == "-":
        return 0.0
    normalized = cleaned.replace("$", "").replace(",", "").replace("(", "-").replace(")", "")
    try:
        return round(float(normalized), 2)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid account value amount: {value}") from exc


def _normalize_month_end(value: object, year: int) -> str:
    cleaned = str(value or "").strip()
    if not cleaned:
        return ""

    month_lookup = {month.lower(): index for index, month in enumerate(calendar.month_name) if month}
    month_lookup.update({month.lower(): index for index, month in enumerate(calendar.month_abbr) if month})
    month_number = month_lookup.get(cleaned.lower())
    if month_number:
        last_day = calendar.monthrange(year, month_number)[1]
        return f"{year}-{month_number:02d}-{last_day:02d}"

    return cleaned


def _normalize_account_value_date(value: object) -> str:
    cleaned = str(value or "").strip()
    if not cleaned or cleaned == "-":
        return ""

    for date_format in ("%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y"):
        try:
            return datetime.strptime(cleaned, date_format).date().isoformat()
        except ValueError:
            pass

    return cleaned


def _mapped_csv_value(row: list[str], column_index: int | None) -> str:
    if column_index is None or column_index < 0 or column_index >= len(row):
        return ""
    return row[column_index]


def _entry_payloads(entries: list[AccountValueEntry], entry_type: str) -> list[AccountValueEntryPayload]:
    def normalized_entry_type(entry: AccountValueEntry) -> str:
        if entry.account_type == "account" and entry.account_name.lower().endswith(" contribution"):
            return "contribution"
        return entry.account_type

    def normalized_entry_name(entry: AccountValueEntry) -> str:
        if normalized_entry_type(entry) == "contribution" and entry.account_name.lower().endswith(" contribution"):
            return entry.account_name[:-len(" Contribution")].strip()
        return entry.account_name

    return [
        AccountValueEntryPayload(
            account_name=normalized_entry_name(entry),
            account_type=normalized_entry_type(entry),
            value=entry.value,
            display_order=entry.display_order,
        )
        for entry in sorted(entries, key=lambda item: (item.display_order, item.account_name.lower()))
        if normalized_entry_type(entry) == entry_type
    ]


def _snapshot_response(snapshot: AccountValueSnapshot, entries: list[AccountValueEntry]) -> AccountValueSnapshotResponse:
    accounts = _entry_payloads(entries, "account")
    contributions = _entry_payloads(entries, "contribution")
    actual = round(sum(account.value for account in accounts), 2)
    return AccountValueSnapshotResponse(
        id=snapshot.id or 0,
        year=snapshot.year,
        month_end=snapshot.month_end,
        projected=snapshot.projected,
        recorded_date=snapshot.recorded_date,
        notes=snapshot.notes,
        actual=actual,
        diff=round(actual - snapshot.projected, 2),
        accounts=accounts,
        contributions=contributions,
    )


def _all_account_value_snapshots(session: Session) -> list[AccountValueSnapshotResponse]:
    snapshots = session.query(AccountValueSnapshot).all()
    entries = session.query(AccountValueEntry).all()
    entries_by_snapshot: dict[int, list[AccountValueEntry]] = {}
    for entry in entries:
        entries_by_snapshot.setdefault(entry.snapshot_id, []).append(entry)

    return [
        _snapshot_response(snapshot, entries_by_snapshot.get(snapshot.id or 0, []))
        for snapshot in sorted(snapshots, key=lambda item: (item.year, item.month_end), reverse=True)
    ]


def _replace_snapshot_entries(
    session: Session,
    snapshot: AccountValueSnapshot,
    entries: list[AccountValueEntryPayload],
) -> None:
    for entry in session.query(AccountValueEntry).all():
        if entry.snapshot_id == snapshot.id:
            session.delete(entry)
    session.flush()

    for index, entry in enumerate(entries):
        if not entry.account_name.strip():
            continue
        session.add(
            AccountValueEntry(
                snapshot_id=snapshot.id or 0,
                account_name=entry.account_name.strip(),
                account_type=entry.account_type.strip() or "account",
                value=round(entry.value, 2),
                display_order=entry.display_order if entry.display_order else index,
            )
        )


@app.get("/api/health")
def health_check() -> dict:
    return {"status": "ok", "service": "finance-tracker-api"}


@app.post("/api/statements/upload", response_model=StatementUploadResponse)
async def upload_statement(
    file: UploadFile = File(...),
    column_mapping: Annotated[str | None, Form()] = None,
    has_header: Annotated[bool, Form()] = True,
) -> StatementUploadResponse:
    storage_dir = Path("storage/uploads")
    storage_dir.mkdir(parents=True, exist_ok=True)

    original_filename = Path(file.filename or "statement.csv").name
    if Path(original_filename).suffix.lower() != ".csv":
        raise HTTPException(status_code=415, detail="CSV upload is currently supported. Please choose a .csv statement.")

    destination = storage_dir / f"{uuid4()}-{original_filename}"
    with destination.open("wb") as handle:
        handle.write(await file.read())

    mapping = None
    if column_mapping:
        try:
            mapping = json.loads(column_mapping)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="Column mapping must be valid JSON.") from exc

    try:
        parsed = parse_statement(destination, column_mapping=mapping, has_header=has_header)
    except StatementParseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    with Session(engine) as session:
        statement = Statement(
            filename=original_filename,
            uploaded_at=datetime.now(UTC).isoformat(),
            parsed_format=parsed["format"],
            status="imported",
        )
        session.add(statement)
        session.commit()
        session.refresh(statement)
        statement_id = statement.id

        for transaction in parsed.get("transactions", []):
            session.add(
                Transaction(
                    date=transaction["date"],
                    description=transaction["description"],
                    amount=transaction["amount"],
                    category=transaction.get("category", "uncategorized"),
                    account=transaction.get("account", "unknown"),
                )
            )
        session.commit()

    return StatementUploadResponse(
        id=str(statement_id),
        filename=original_filename,
        status="imported",
        parsed_format=parsed["format"],
        summary=parsed["summary"],
    )


@app.get("/api/analytics/monthly", response_model=MonthlySummaryResponse)
def monthly_summary() -> MonthlySummaryResponse:
    with Session(engine) as session:
        transactions = session.query(Transaction).all()

    normalized_transactions = [
        {
            "date": transaction.date,
            "description": transaction.description,
            "amount": transaction.amount,
            "category": transaction.category,
        }
        for transaction in transactions
    ]

    return MonthlySummaryResponse(**summarize_transactions(normalized_transactions))


@app.get("/api/transactions/categorization-suggestions", response_model=CategorizationSuggestionsResponse)
def categorization_suggestions(
    limit: int = 10,
    offset: int = 0,
) -> CategorizationSuggestionsResponse:
    limit = max(1, min(limit, 100))
    offset = max(offset, 0)

    with Session(engine) as session:
        transactions = session.query(Transaction).all()

    uncategorized_spending = [
        {
            "description": transaction.description,
            "amount": transaction.amount,
        }
        for transaction in transactions
        if transaction.amount > 0 and transaction.category == "uncategorized"
    ]

    groups = build_merchant_groups(uncategorized_spending)
    paged_groups = groups[offset:offset + limit]

    return CategorizationSuggestionsResponse(
        groups=paged_groups,
        limit=limit,
        offset=offset,
        total=len(groups),
        has_more=offset + limit < len(groups),
    )


@app.get("/api/transactions/categories", response_model=CategoriesResponse)
def transaction_categories() -> CategoriesResponse:
    with Session(engine) as session:
        transactions = session.query(Transaction).all()

    categories = sorted(
        {
            transaction.category
            for transaction in transactions
            if transaction.category and transaction.category != "uncategorized"
        },
        key=str.lower,
    )

    return CategoriesResponse(categories=categories)


@app.get("/api/transactions/category-summary", response_model=CategorySummaryResponse)
def transaction_category_summary() -> CategorySummaryResponse:
    with Session(engine) as session:
        transactions = session.query(Transaction).all()

    counts: dict[str, int] = {}
    for transaction in transactions:
        if transaction.category and transaction.category != "uncategorized":
            counts[transaction.category] = counts.get(transaction.category, 0) + 1

    categories = [
        CategorySummaryItem(name=name, transaction_count=count)
        for name, count in sorted(counts.items(), key=lambda item: item[0].lower())
    ]

    return CategorySummaryResponse(categories=categories)


@app.get("/api/transactions/category-details", response_model=CategoryDetailsResponse)
def transaction_category_details(
    uncategorized_limit: int = 10,
    uncategorized_offset: int = 0,
) -> CategoryDetailsResponse:
    uncategorized_limit = max(1, min(uncategorized_limit, 100))
    uncategorized_offset = max(uncategorized_offset, 0)

    with Session(engine) as session:
        transactions = session.query(Transaction).all()

    category_transactions: dict[str, list[dict]] = {}
    uncategorized_spending = []

    for transaction in transactions:
        transaction_item = {
            "description": transaction.description,
            "amount": transaction.amount,
        }
        if transaction.amount <= 0:
            continue
        if transaction.category and transaction.category != "uncategorized":
            category_transactions.setdefault(transaction.category, []).append(transaction_item)
        elif transaction.category == "uncategorized":
            uncategorized_spending.append(transaction_item)

    categories = [
        CategoryDetailItem(
            name=name,
            transaction_count=len(items),
            merchant_groups=build_merchant_groups(items),
        )
        for name, items in sorted(category_transactions.items(), key=lambda item: item[0].lower())
    ]

    uncategorized_groups = build_merchant_groups(uncategorized_spending)
    paged_uncategorized_groups = uncategorized_groups[
        uncategorized_offset:uncategorized_offset + uncategorized_limit
    ]

    return CategoryDetailsResponse(
        categories=categories,
        uncategorized_groups=paged_uncategorized_groups,
        uncategorized_limit=uncategorized_limit,
        uncategorized_offset=uncategorized_offset,
        uncategorized_total=len(uncategorized_groups),
        uncategorized_has_more=uncategorized_offset + uncategorized_limit < len(uncategorized_groups),
    )


@app.patch("/api/transactions/categories", response_model=RenameCategoryResponse)
def rename_category(request: RenameCategoryRequest) -> RenameCategoryResponse:
    current_category = request.current_category.strip()
    new_category = request.new_category.strip()

    if not current_category or not new_category:
        raise HTTPException(status_code=400, detail="Both current and new category names are required.")
    if current_category == "uncategorized" or new_category == "uncategorized":
        raise HTTPException(status_code=400, detail="The uncategorized category cannot be renamed or reused.")

    with Session(engine) as session:
        transactions = session.query(Transaction).all()
        updated_transactions = 0

        for transaction in transactions:
            if transaction.category == current_category:
                transaction.category = new_category
                session.add(transaction)
                updated_transactions += 1

        session.commit()

    return RenameCategoryResponse(
        status="renamed",
        current_category=current_category,
        new_category=new_category,
        updated_transactions=updated_transactions,
    )


@app.post("/api/transactions/categorize", response_model=CategorizeMerchantResponse)
def categorize_merchant(request: CategorizeMerchantRequest) -> CategorizeMerchantResponse:
    category = request.category.strip()
    if not category:
        raise HTTPException(status_code=400, detail="Category is required.")

    excluded_merchants = {merchant.strip() for merchant in request.excluded_merchants if merchant.strip()}

    with Session(engine) as session:
        transactions = session.query(Transaction).all()
        updated_transactions = 0

        for transaction in transactions:
            if (
                transaction.amount > 0
                and transaction.category == "uncategorized"
                and merchant_key(transaction.description) == request.merchant_key
                and transaction.description not in excluded_merchants
            ):
                transaction.category = category
                session.add(transaction)
                updated_transactions += 1

        session.commit()

    return CategorizeMerchantResponse(
        status="categorized",
        merchant_key=request.merchant_key,
        category=category,
        updated_transactions=updated_transactions,
    )


@app.post("/api/transactions/categories/remove-merchant", response_model=RemoveMerchantCategoryResponse)
def remove_merchant_from_category(request: RemoveMerchantCategoryRequest) -> RemoveMerchantCategoryResponse:
    merchant = request.merchant.strip()
    category = request.category.strip()
    if not merchant or not category:
        raise HTTPException(status_code=400, detail="Merchant and category are required.")
    if category == "uncategorized":
        raise HTTPException(status_code=400, detail="Use a mapped category when removing a merchant.")

    with Session(engine) as session:
        transactions = session.query(Transaction).all()
        updated_transactions = 0

        for transaction in transactions:
            if (
                transaction.amount > 0
                and transaction.category == category
                and transaction.description == merchant
            ):
                transaction.category = "uncategorized"
                session.add(transaction)
                updated_transactions += 1

        session.commit()

    return RemoveMerchantCategoryResponse(
        status="removed",
        merchant=merchant,
        category=category,
        updated_transactions=updated_transactions,
    )


@app.get("/api/account-values", response_model=AccountValuesResponse)
def account_values() -> AccountValuesResponse:
    with Session(engine) as session:
        return AccountValuesResponse(snapshots=_all_account_value_snapshots(session))


@app.post("/api/account-values", response_model=AccountValueSnapshotResponse)
def create_account_value_snapshot(request: AccountValueSnapshotPayload) -> AccountValueSnapshotResponse:
    month_end = request.month_end.strip()
    if not month_end:
        raise HTTPException(status_code=400, detail="Month End is required.")

    now = datetime.now(UTC).isoformat()
    with Session(engine) as session:
        snapshot = AccountValueSnapshot(
            year=request.year,
            month_end=month_end,
            projected=round(request.projected, 2),
            recorded_date=request.recorded_date.strip(),
            notes=request.notes.strip(),
            created_at=now,
            updated_at=now,
        )
        session.add(snapshot)
        session.commit()
        session.refresh(snapshot)
        _replace_snapshot_entries(session, snapshot, [
            *[account.model_copy(update={"account_type": "account"}) for account in request.accounts],
            *[contribution.model_copy(update={"account_type": "contribution"}) for contribution in request.contributions],
        ])
        session.commit()

        entries = [entry for entry in session.query(AccountValueEntry).all() if entry.snapshot_id == snapshot.id]
        return _snapshot_response(snapshot, entries)


@app.patch("/api/account-values/{snapshot_id}", response_model=AccountValueSnapshotResponse)
def update_account_value_snapshot(
    snapshot_id: int,
    request: AccountValueSnapshotPayload,
) -> AccountValueSnapshotResponse:
    month_end = request.month_end.strip()
    if not month_end:
        raise HTTPException(status_code=400, detail="Month End is required.")

    with Session(engine) as session:
        snapshot = session.get(AccountValueSnapshot, snapshot_id)
        if snapshot is None:
            raise HTTPException(status_code=404, detail="Account value snapshot was not found.")

        snapshot.year = request.year
        snapshot.month_end = month_end
        snapshot.projected = round(request.projected, 2)
        snapshot.recorded_date = request.recorded_date.strip()
        snapshot.notes = request.notes.strip()
        snapshot.updated_at = datetime.now(UTC).isoformat()
        session.add(snapshot)
        session.commit()
        session.refresh(snapshot)
        _replace_snapshot_entries(session, snapshot, [
            *[account.model_copy(update={"account_type": "account"}) for account in request.accounts],
            *[contribution.model_copy(update={"account_type": "contribution"}) for contribution in request.contributions],
        ])
        session.commit()

        entries = [entry for entry in session.query(AccountValueEntry).all() if entry.snapshot_id == snapshot.id]
        return _snapshot_response(snapshot, entries)


@app.delete("/api/account-values/{snapshot_id}")
def delete_account_value_snapshot(snapshot_id: int) -> dict:
    with Session(engine) as session:
        snapshot = session.get(AccountValueSnapshot, snapshot_id)
        if snapshot is None:
            raise HTTPException(status_code=404, detail="Account value snapshot was not found.")

        deleted_entries = 0
        for entry in session.query(AccountValueEntry).all():
            if entry.snapshot_id == snapshot_id:
                session.delete(entry)
                deleted_entries += 1
        session.delete(snapshot)
        session.commit()

    return {"status": "deleted", "deleted_entries": deleted_entries}


@app.post("/api/account-values/import", response_model=AccountValuesImportResponse)
async def import_account_values(
    year: Annotated[int, Form()],
    file: UploadFile = File(...),
    column_mapping: Annotated[str | None, Form()] = None,
) -> AccountValuesImportResponse:
    original_filename = Path(file.filename or "account-values.csv").name
    if Path(original_filename).suffix.lower() != ".csv":
        raise HTTPException(status_code=415, detail="CSV upload is currently supported. Please choose a .csv file.")

    content = (await file.read()).decode("utf-8-sig")
    rows = list(csv.reader(io.StringIO(content)))
    rows = [row for row in rows if any(cell.strip() for cell in row)]
    if not rows:
        raise HTTPException(status_code=400, detail="CSV file is missing a header row.")

    headers = [header.strip() for header in rows[0]]
    lowered_headers = {header.lower(): header for header in headers}
    parsed_mapping = None
    if column_mapping:
        try:
            parsed_mapping = json.loads(column_mapping)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="Column mapping must be valid JSON.") from exc

    if parsed_mapping:
        month_end_column = parsed_mapping.get("monthEnd")
        projected_column = parsed_mapping.get("projected")
        actual_column = parsed_mapping.get("actual")
        diff_column = parsed_mapping.get("diff")
        date_column = parsed_mapping.get("date")
        notes_column = parsed_mapping.get("notes")
        account_columns = parsed_mapping.get("accounts", [])
        contribution_columns = parsed_mapping.get("contributions", [])
        if not isinstance(month_end_column, int):
            raise HTTPException(status_code=400, detail="Map the Month End column before importing account values.")
        mapped_base_columns = {
            column_index
            for column_index in [
                month_end_column,
                projected_column,
                actual_column,
                diff_column,
                date_column,
                notes_column,
            ]
            if isinstance(column_index, int)
        }
        if not isinstance(contribution_columns, list):
            contribution_columns = []
        contribution_column_set = {
            column_index for column_index in contribution_columns if isinstance(column_index, int)
        }
        if not isinstance(account_columns, list):
            account_columns = []
        if not account_columns:
            account_columns = [
                column_index
                for column_index in range(len(headers))
                if column_index not in mapped_base_columns and column_index not in contribution_column_set
            ]

        account_headers = [
            (column_index, headers[column_index] if column_index < len(headers) and headers[column_index] else f"Column {column_index + 1}")
            for column_index in account_columns
            if isinstance(column_index, int) and column_index not in mapped_base_columns
        ]
        contribution_headers = [
            (column_index, headers[column_index] if column_index < len(headers) and headers[column_index] else f"Column {column_index + 1}")
            for column_index in contribution_columns
            if isinstance(column_index, int) and column_index not in mapped_base_columns
        ]
        data_rows = rows[1:]
    else:
        if "month end" not in lowered_headers:
            raise HTTPException(status_code=400, detail="CSV file must include a Month End column.")

        month_end_column = headers.index(lowered_headers["month end"])
        projected_column = headers.index(lowered_headers["projected"]) if "projected" in lowered_headers else None
        date_column = headers.index(lowered_headers["date"]) if "date" in lowered_headers else None
        notes_column = headers.index(lowered_headers["notes"]) if "notes" in lowered_headers else None
        contribution_headers = [
            (index, header)
            for index, header in enumerate(headers)
            if header.lower().endswith(" contribution") and header.strip()
        ]
        contribution_column_set = {index for index, _ in contribution_headers}
        account_headers = [
            (index, header)
            for index, header in enumerate(headers)
            if header.lower() not in ACCOUNT_VALUE_BASE_COLUMNS and index not in contribution_column_set and header.strip()
        ]
        data_rows = rows[1:]

    if not account_headers:
        raise HTTPException(status_code=400, detail="CSV file must include at least one account column.")

    now = datetime.now(UTC).isoformat()
    imported_snapshots = 0
    imported_entries = 0

    with Session(engine) as session:
        for snapshot in session.query(AccountValueSnapshot).all():
            if snapshot.year == year:
                for entry in session.query(AccountValueEntry).all():
                    if entry.snapshot_id == snapshot.id:
                        session.delete(entry)
                session.delete(snapshot)
        session.commit()

        for row in data_rows:
            month_end = _normalize_month_end(_mapped_csv_value(row, month_end_column), year)
            if not month_end:
                continue

            snapshot = AccountValueSnapshot(
                year=year,
                month_end=month_end,
                projected=_parse_money(_mapped_csv_value(row, projected_column)),
                recorded_date=_normalize_account_value_date(_mapped_csv_value(row, date_column)),
                notes=_mapped_csv_value(row, notes_column).strip(),
                created_at=now,
                updated_at=now,
            )
            session.add(snapshot)
            session.commit()
            session.refresh(snapshot)
            imported_snapshots += 1

            for index, (column_index, header) in enumerate(account_headers):
                raw_value = _mapped_csv_value(row, column_index)
                value = _parse_money(raw_value)
                session.add(
                    AccountValueEntry(
                        snapshot_id=snapshot.id or 0,
                        account_name=header,
                        account_type="account",
                        value=value,
                        display_order=index,
                    )
                )
                imported_entries += 1

            for index, (column_index, header) in enumerate(contribution_headers):
                value = _parse_money(_mapped_csv_value(row, column_index))
                session.add(
                    AccountValueEntry(
                        snapshot_id=snapshot.id or 0,
                        account_name=header.removesuffix(" Contribution").strip(),
                        account_type="contribution",
                        value=value,
                        display_order=index,
                    )
                )
                imported_entries += 1

        session.commit()

    return AccountValuesImportResponse(
        status="imported",
        year=year,
        imported_snapshots=imported_snapshots,
        imported_entries=imported_entries,
    )


@app.delete("/api/database", response_model=ClearDatabaseResponse)
def clear_database() -> ClearDatabaseResponse:
    with Session(engine) as session:
        transactions = session.query(Transaction).all()
        statements = session.query(Statement).all()
        deleted_transactions = len(transactions)
        deleted_statements = len(statements)

        for transaction in transactions:
            session.delete(transaction)
        for statement in statements:
            session.delete(statement)
        session.commit()

    return ClearDatabaseResponse(
        status="cleared",
        deleted_statements=deleted_statements,
        deleted_transactions=deleted_transactions,
    )


@app.delete("/api/transactions", response_model=ClearTransactionsResponse)
def clear_transactions() -> ClearTransactionsResponse:
    with Session(engine) as session:
        transactions = session.query(Transaction).all()
        deleted_transactions = len(transactions)

        for transaction in transactions:
            session.delete(transaction)
        session.commit()

    return ClearTransactionsResponse(
        status="cleared",
        deleted_transactions=deleted_transactions,
    )


@app.delete("/api/transactions/categories", response_model=ClearCategoriesResponse)
def clear_transaction_categories() -> ClearCategoriesResponse:
    with Session(engine) as session:
        transactions = session.query(Transaction).all()
        updated_transactions = 0

        for transaction in transactions:
            if transaction.category != "uncategorized":
                transaction.category = "uncategorized"
                session.add(transaction)
                updated_transactions += 1

        session.commit()

    return ClearCategoriesResponse(
        status="cleared",
        updated_transactions=updated_transactions,
    )


@app.post("/api/statements/download")
def download_statements() -> dict:
    result = start_download_flow()
    return result


@app.post("/api/statements/download/{job_id}/continue")
def continue_statement_download(job_id: str) -> dict:
    result = continue_download_flow(job_id)
    return result
