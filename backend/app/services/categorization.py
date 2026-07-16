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


def build_merchant_groups(transactions: list[dict]) -> list[dict]:
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
            }
        )

    return sorted(groups, key=lambda group: (-group["count"], group["display_name"].lower()))
