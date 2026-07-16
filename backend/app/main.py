import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated
from uuid import uuid4

from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlmodel import Session

from app.models import Statement, Transaction, create_db_and_tables, engine
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


class CategorizeMerchantResponse(BaseModel):
    status: str
    merchant_key: str
    category: str
    updated_transactions: int


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

    with Session(engine) as session:
        transactions = session.query(Transaction).all()
        updated_transactions = 0

        for transaction in transactions:
            if (
                transaction.amount > 0
                and transaction.category == "uncategorized"
                and merchant_key(transaction.description) == request.merchant_key
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
