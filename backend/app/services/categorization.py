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


def _normalized_variants(description: str) -> set[str]:
    normalized = re.sub(r"[^A-Z0-9]+", " ", description).strip()
    compact = re.sub(r"[^A-Z0-9]+", "", description)
    variants = {description, normalized, compact}

    cleaned = normalized
    for _ in range(4):
        cleaned = re.sub(r"^(?:SQ|TST|SP|RITUAL)\s+", "", cleaned).strip()
        cleaned = re.sub(r"^RITUAL\s+", "", cleaned).strip()
        variants.add(cleaned)
    return {variant for variant in variants if variant}


def _matches(variants: set[str], pattern: str) -> bool:
    return any(re.search(pattern, variant) for variant in variants)


def merchant_key(description: str) -> str:
    uppercase_description = description.upper()
    compact_description = re.sub(r"[^A-Z0-9]+", "", uppercase_description)
    variants = _normalized_variants(uppercase_description)
    if re.search(r"\bAMZN\s+MKTP\b", uppercase_description):
        return "AMAZON"
    if re.search(r"\bAMAZON(?:\.CA)?\b", uppercase_description):
        return "AMAZON"
    if "STARBUCKS" in compact_description:
        return "STARBUCKS"
    if "TIMHORTONS" in compact_description:
        return "TIM HORTONS"
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
    if compact_description == "GRAB":
        return "Grab"
    if (
        re.search(r"\bGRAB[^A-Z0-9]+(?:[A-Z][^A-Z0-9]+)?[A-Z0-9]{6,}\b", uppercase_description)
        or re.search(r"\bGRAB\s+\d+\b", uppercase_description)
    ):
        return "Grab"
    if re.search(r"\bWAL\s*-?\s*MART\b", uppercase_description) or "WALMART" in compact_description:
        return "Walmart"
    if "HEALTHYPLANET" in compact_description or "HEALTHLYPLANET" in compact_description:
        return "Healthy Planet"
    if "NOFRILLS" in compact_description:
                return "No Frills"
    if re.search(r"\bMC\s*DONALD'?S\b", uppercase_description) or "MCDONALDS" in compact_description:
        return "Mcdonalds"
    if "SHOPPERSDRUGMART" in compact_description:
        return "Shoppers drug mart"
    if _matches(variants, r"\bDARK\s+HORSE\b"):
        return "Dark Horse"
    if _matches(variants, r"\bPRIMMUM\s+INSURANCE\b"):
        return "Primmum Insurance"
    if _matches(variants, r"\bGALLERIA\s+(?:FRESH\s+)?EXPRESS\b"):
        return "Galleria Express"
    if _matches(variants, r"\bKAI\s+WEI\s+SUPERMARKET\b"):
        return "Kai Wei Supermarket"
    if _matches(variants, r"\bKRISPY\s+KREME\b"):
        return "Krispy Kreme"
    if _matches(variants, r"\bPOPEYES\b"):
        return "Popeyes"
    if _matches(variants, r"\bJIMMY\s+S\s+COFFEE\b"):
        return "Jimmy's Coffee"
    if _matches(variants, r"\bAROMA\s+(?:ESPRESSO|BAY)\b"):
        return "Aroma Espresso Bar"
    if _matches(variants, r"\bPETSMART\b"):
        return "PetSmart"
    if _matches(variants, r"\bROGERS\b"):
        return "ROGERS"
    if _matches(variants, r"\b(?:CANADIAN|CDN)\s+TIRE\b"):
        return "Canadian Tire"
    if _matches(variants, r"\bUBER(?:\s+CANADA)?\s+UBEREATS\b") or _matches(variants, r"\bUBER\s+EATS\b"):
        return "Uber Eats"
    if "TEMU" in compact_description:
        return "Temu"
    if _matches(variants, r"\bNATIONS\s+FRESH\s+FOODS?\b"):
        return "Nations Fresh Food"
    if _matches(variants, r"\bREXALL\s+PHARMACY\b"):
        return "Rexall Pharmacy"
    if _matches(variants, r"\b(?:THE\s+)?HOME\s+DEPOT\b"):
        return "The Home Depot"
    if _matches(variants, r"\bWOODBINE\s+STEELES\s+DENTAL\b"):
        return "Woodbine-Steeles Dental"
    if _matches(variants, r"\bSNAKES\s+LATTES\b"):
        return "Snakes & Lattes"
    if _matches(variants, r"\bWENDY\s+S\b"):
        return "Wendy's"
    if "WINNERS" in compact_description:
        return "Winners"
    if _matches(variants, r"\bMICHAELS\b"):
        return "Michaels"
    if _matches(variants, r"\bBEST\s+BUY\b"):
        return "Best Buy"
    if _matches(variants, r"\bDECIEM\b"):
        return "Deciem"
    if _matches(variants, r"\bTRE\s+MARI\s+BAKERY\b"):
        return "Tre Mari Bakery"
    if _matches(variants, r"\bSTEREO\s+COFFEE\s+ROAS(?:TER)?\b"):
        return "Stereo Coffee Roasters"
    if _matches(variants, r"\bBANH\s+MI\s+BOYS\b") or _matches(variants, r"\bBANH\s+M\b"):
        return "Banh Mi Boys"
    if _matches(variants, r"\bOH\s+MY\s+GYRO\b"):
        return "Oh My Gyro"
    if _matches(variants, r"\bSIZZLER\s+KABAB\b"):
        return "Sizzler Kabab"
    if _matches(variants, r"\bTHAI\s+EXPRESS\b"):
        return "Thai Express"
    if _matches(variants, r"\bFAT\s+BASTARD\s+BUR"):
        return "Fat Bastard Burrito"
    if _matches(variants, r"\bSUBWAY\b"):
        return "Subway"
    if _matches(variants, r"\bSECOND\s+CUP\b"):
        return "Second Cup"
    if _matches(variants, r"\bGONG\s+CHA\b"):
        return "Gong Cha"
    if _matches(variants, r"\bNORA\s+S"):
        return "Nora Shawarma Kabab"
    if _matches(variants, r"\bSCOTTY\s+BONS\b"):
        return "Scotty Bons"
    if _matches(variants, r"\bFOUND\s+COFFEE\b"):
        return "Found Coffee"
    if _matches(variants, r"\bPILOT\s+COFFEE\b"):
        return "Pilot Coffee"
    if _matches(variants, r"\bTRINITY\s+COMMON\b"):
        return "Trinity Common"
    if _matches(variants, r"\bCHICK\s+FIL\s+A\b"):
        return "Chick-fil-A"
    if _matches(variants, r"\bCHUNGCHUN\s+RICE\s+DOG\b"):
        return "Chungchun Rice Dog"
    if _matches(variants, r"\bUNCLE\s+TETSU\b"):
        return "Uncle Tetsu"
    if _matches(variants, r"\bHAZUKIDO\b"):
        return "Hazukido"
    if _matches(variants, r"\bAMSTERDAM\s+BREW(?:ERY|HOUSE)\b"):
        return "Amsterdam Brewhouse"
    if _matches(variants, r"\bBALZAC\s+S\b") or "BALZACS" in compact_description:
        return "Balzac's Coffee"
    if _matches(variants, r"\bSCADDABUSH\b"):
        return "Scaddabush"
    if _matches(variants, r"\bRAMEN\s+ISSHIN\b"):
        return "Ramen Isshin"
    if "WONDERLAND" in compact_description:
        return "Canada's Wonderland"
    if _matches(variants, r"\b(?:CITY\s+(?:TOR|OF)\s+)?FERRY\s+DOC"):
        return "Toronto Ferry"

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
