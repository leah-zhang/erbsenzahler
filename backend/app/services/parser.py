import csv
from datetime import datetime
from pathlib import Path
from typing import Any


class StatementParseError(ValueError):
    pass


HEADER_ALIASES = {
    "date": ("date", "transaction date", "posted date", "posting date"),
    "description": ("description", "memo", "name", "details", "transaction description"),
    "amount": ("amount", "transaction amount"),
    "debit": ("debit", "withdrawal", "withdrawals", "money out"),
    "credit": ("credit", "deposit", "deposits", "money in"),
    "category": ("category", "type"),
    "account": ("account", "account name"),
}


def _clean(value: object) -> str:
    return str(value or "").strip()


def _normalize_headers(fieldnames: list[str] | None) -> dict[str, int]:
    if not fieldnames:
        raise StatementParseError("CSV file is missing a header row.")

    lowered = {_clean(name).lower(): index for index, name in enumerate(fieldnames) if _clean(name)}
    normalized = {}
    for target, aliases in HEADER_ALIASES.items():
        for alias in aliases:
            if alias in lowered:
                normalized[target] = lowered[alias]
                break

    if "date" not in normalized or "description" not in normalized:
        raise StatementParseError("CSV file must include Date and Description columns.")

    if "amount" not in normalized and ("debit" not in normalized and "credit" not in normalized):
        raise StatementParseError("CSV file must include Amount, Debit, or Credit columns.")

    return normalized


def _normalize_mapping(mapping: dict[str, Any] | None) -> dict[str, int] | None:
    if not mapping:
        return None

    normalized = {}
    for key in ("date", "description", "amount", "debit", "credit", "category", "account"):
        value = mapping.get(key)
        if value in (None, ""):
            continue
        try:
            column_index = int(value)
        except (TypeError, ValueError) as exc:
            raise StatementParseError(f"Column mapping for {key} must be a column number.") from exc
        if column_index < 0:
            raise StatementParseError(f"Column mapping for {key} must be 0 or greater.")
        normalized[key] = column_index

    if "date" not in normalized or "description" not in normalized:
        raise StatementParseError("Column mapping must include Date and Description.")

    if "amount" not in normalized and ("debit" not in normalized and "credit" not in normalized):
        raise StatementParseError("Column mapping must include Amount, Debit, or Credit.")

    return normalized


def _row_value(row: list[str], column_index: int | None) -> str:
    if column_index is None or column_index >= len(row):
        return ""
    return _clean(row[column_index])


def _parse_amount(row: list[str], headers: dict[str, int], amount_sign: str = "spend_positive") -> float:
    if "amount" in headers:
        raw_amount = _row_value(row, headers["amount"])
        if not raw_amount:
            return 0.0
        amount = _to_float(raw_amount)
        if amount_sign == "spend_negative":
            return round(-amount, 2)
        return amount

    debit = _row_value(row, headers.get("debit"))
    credit = _row_value(row, headers.get("credit"))
    if debit:
        return _to_float(debit)
    if credit:
        return -_to_float(credit)
    return 0.0


def _to_float(value: str) -> float:
    normalized = value.replace("$", "").replace(",", "").replace("(", "-").replace(")", "")
    try:
        return round(float(normalized), 2)
    except ValueError as exc:
        raise StatementParseError(f"Invalid amount value: {value}") from exc


def _normalize_date(value: str) -> str:
    raw_date = _clean(value)
    for date_format in ("%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y", "%Y/%m/%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(raw_date, date_format).strftime("%Y-%m-%d")
        except ValueError:
            continue
    raise StatementParseError(f"Invalid date value: {value}")


def parse_statement(
    path: Path,
    column_mapping: dict[str, Any] | None = None,
    has_header: bool = True,
    amount_sign: str = "spend_positive",
) -> dict:
    if amount_sign not in {"spend_positive", "spend_negative"}:
        raise StatementParseError("Amount sign must be spend_positive or spend_negative.")

    extension = path.suffix.lower()

    if extension == ".csv":
        with path.open(newline="", encoding="utf-8-sig") as handle:
            reader = csv.reader(handle)
            mapping = _normalize_mapping(column_mapping)
            first_row = next(reader, None)
            if first_row is None:
                raise StatementParseError("CSV file did not contain any transactions.")

            if mapping:
                headers = mapping
                data_rows = reader if has_header else iter([first_row, *reader])
                first_data_row_number = 2 if has_header else 1
            else:
                headers = _normalize_headers(first_row)
                data_rows = reader
                first_data_row_number = 2

            transactions = []
            for row_number, row in enumerate(data_rows, start=first_data_row_number):
                if not any(_clean(value) for value in row):
                    continue

                description = _row_value(row, headers["description"])
                if not description:
                    raise StatementParseError(f"Missing description on row {row_number}.")

                transactions.append(
                    {
                        "date": _normalize_date(_row_value(row, headers["date"])),
                        "description": description,
                        "amount": _parse_amount(row, headers, amount_sign=amount_sign),
                        "category": _row_value(row, headers.get("category")) or "uncategorized",
                        "account": _row_value(row, headers.get("account")) or "bank",
                    }
                )

        if not transactions:
            raise StatementParseError("CSV file did not contain any transactions.")

        return {
            "format": "csv",
            "transactions": transactions,
            "summary": {
                "rows": len(transactions),
                "note": "CSV statement parsed into normalized transaction records.",
            },
        }

    if extension == ".pdf":
        return {
            "format": "pdf",
            "transactions": [],
            "summary": {
                "rows": 0,
                "note": "PDF parsing will be implemented with a dedicated parser.",
            },
        }

    return {
        "format": "unknown",
        "transactions": [],
        "summary": {
            "rows": 0,
            "note": "Unsupported statement format. Add a parser adapter for this file type.",
        },
    }
