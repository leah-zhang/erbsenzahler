import re
from collections import defaultdict


STOP_WORDS = {
    "ACH",
    "AUTH",
    "CARD",
    "CHECKCARD",
    "CREDIT",
    "DEBIT",
    "ECOM",
    "ONLINE",
    "POS",
    "PURCHASE",
    "RECURRING",
    "TRANSFER",
    "VISA",
}

LOCATION_WORDS = {
    "AB",
    "ALBERTA",
    "BC",
    "BRAMPTON",
    "BURLINGTON",
    "CALGARY",
    "CANADA",
    "EDMONTON",
    "HALIFAX",
    "HAMILTON",
    "LONDON",
    "MARKHAM",
    "MISSISSAUGA",
    "MONTREAL",
    "NS",
    "O",
    "ON",
    "ONT",
    "ONTARIO",
    "OTTAWA",
    "QC",
    "QUEBEC",
    "SCARBOROUGH",
    "TORONTO",
    "VANCOUVER",
    "VAUGHAN",
    "VICTORIA",
    "WATERLOO",
    "WINNIPEG",
}


def _trim_location_tokens(tokens: list[str], has_store_number: bool) -> list[str]:
    trimmed = list(tokens)
    if has_store_number:
        while len(trimmed) > 1 and trimmed[-1] in LOCATION_WORDS:
            trimmed.pop()
    return trimmed


def merchant_key(description: str) -> str:
    uppercase_description = description.upper()
    compact_description = re.sub(r"[^A-Z0-9]+", "", uppercase_description)
    if re.search(r"\bAMZN\s+MKTP\b", uppercase_description):
        return "AMAZON"
    if re.search(r"\bAMAZON(?:\.CA)?\b", uppercase_description):
        return "AMAZON"
    if "STARBUCKS" in compact_description:
        return "Starbucks"
    if "TIMHORTONS" in compact_description:
        return "Tim Hortons"
    if re.search(r"^\s*PRESTO\b", uppercase_description):
        return "PRESTO"
    if re.search(r"^\s*SEPHORA\b", uppercase_description):
        return "Sephora"
    if re.search(r"\bDOLLARAMA\b", uppercase_description):
        return "Dollarama"
    if "CHATIME" in compact_description or re.search(r"\bCHA\s+TIME\b", uppercase_description):
        return "ChaTime"
    if (
        re.search(r"\bTGTG\s+[A-Z0-9]{6,}\b", uppercase_description)
        or re.search(r"\bTOOGOODT\s+[A-Z0-9]{6,}\b", uppercase_description)
        or re.search(r"\bTOOGOODTOG\s+[A-Z0-9]{6,}\b", uppercase_description)
        or re.search(r"\bTOO\s+GOOD\s+TO\s+GO\b", uppercase_description)
    ):
        return "Too Good to Go"
    if re.search(r"\bFOOD\s+BASICS\b", uppercase_description):
        return "Food basics"
    if (
        re.search(r"\bGRAB[^A-Z0-9]+(?:[A-Z][^A-Z0-9]+)?[A-Z0-9]{6,}\b", uppercase_description)
        or re.search(r"\bGRAB\s+\d+\b", uppercase_description)
    ):
        return "Grab"
    if re.search(r"\bWAL\s*-?\s*MART\b", uppercase_description) or "WALMART" in compact_description:
        return "Walmart"
    if "HEALTHYPLANET" in compact_description:
            return "Healthly Planet"
    if "NOFRILLS" in compact_description:
                return "No Frills"
    if re.search(r"\bMC\s*DONALD'?S\b", uppercase_description) or "MCDONALDS" in compact_description:
        return "Mcdonalds"
    if "SHOPPERSDRUGMART" in compact_description:
        return "Shoppers drug mart"

    has_store_number = bool(re.search(r"#\s*\d+", uppercase_description))
    normalized = re.sub(r"#\s*\d+", " ", uppercase_description)
    normalized = re.sub(r"[^A-Z0-9 ]+", " ", normalized)
    tokens = [
        token
        for token in normalized.split()
        if token not in STOP_WORDS and token not in LOCATION_WORDS and not token.isdigit()
    ]
    tokens = _trim_location_tokens(tokens, has_store_number)
    if not tokens:
        return "UNKNOWN"
    return " ".join(tokens[:4])


def _latest_date(items: list[dict]) -> str:
    dates = [str(item.get("date") or "") for item in items if item.get("date")]
    return max(dates) if dates else ""


def _date_rank(value: str) -> int:
    return int(value.replace("-", "")) if value else 0


def build_merchant_groups(transactions: list[dict], sort_mode: str = "frequency") -> list[dict]:
    grouped = defaultdict(list)
    for transaction in transactions:
        key = merchant_key(transaction["description"])
        grouped[key].append(transaction)

    groups = []
    for key, items in grouped.items():
        examples = []
        for item in items:
            if item["description"] not in examples:
                examples.append(item["description"])
            if len(examples) == 3:
                break

        groups.append(
            {
                "merchant_key": key,
                "display_name": examples[0],
                "count": len(items),
                "examples": examples,
                "merchants": sorted(
                    {item["description"] for item in items},
                    key=str.lower,
                ),
                "latest_date": _latest_date(items),
            }
        )

    if sort_mode == "uncategorized_priority":
        return sorted(
            groups,
            key=lambda group: (-group["count"], -_date_rank(group["latest_date"]), group["display_name"].lower()),
        )

    return sorted(groups, key=lambda group: (-group["count"], group["display_name"].lower()))
