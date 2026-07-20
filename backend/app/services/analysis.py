from collections import Counter
from datetime import date, datetime, timedelta
from typing import List

from app.services.categorization import merchant_key


def _empty_summary() -> dict:
    return {
        "total_spend": 0.0,
        "top_categories": [],
        "monthly_breakdown": [],
        "last_30_days": {
            "total_spend": 0.0,
            "top_merchants": [],
            "largest_transactions": [],
            "top_categories": [],
            "category_spend": [],
            "percent_difference_vs_last_month": None,
            "previous_total_spend": 0.0,
        },
        "weekly_breakdown": [],
    }


def _format_short_date(value: date) -> str:
    return f"{value.strftime('%b')} {value.day}"


def summarize_transactions(transactions: List[dict], as_of: date | None = None) -> dict:
    spending_transactions = [
        item for item in transactions
        if item["amount"] > 0
    ]

    if not spending_transactions:
        return _empty_summary()

    total_spend = round(sum(item["amount"] for item in spending_transactions), 2)
    category_counts = Counter(item["category"] for item in spending_transactions)
    top_categories = [
        {"name": name, "count": count}
        for name, count in category_counts.most_common(5)
    ]

    monthly_breakdown = []
    by_month: dict[str, float] = {}
    for item in spending_transactions:
        month = datetime.strptime(item["date"], "%Y-%m-%d").strftime("%Y-%m")
        by_month[month] = by_month.get(month, 0.0) + item["amount"]

    for month, amount in sorted(by_month.items()):
        monthly_breakdown.append({"month": month, "total": round(amount, 2)})

    if as_of is None:
        as_of = date.today()

    current_start = as_of - timedelta(days=29)
    previous_start = current_start - timedelta(days=30)
    previous_end = current_start - timedelta(days=1)

    current_window = []
    previous_window = []
    for item in spending_transactions:
        transaction_date = datetime.strptime(item["date"], "%Y-%m-%d").date()
        if current_start <= transaction_date <= as_of:
            current_window.append(item)
        elif previous_start <= transaction_date <= previous_end:
            previous_window.append(item)

    last_30_total = round(sum(item["amount"] for item in current_window), 2)
    previous_total = round(sum(item["amount"] for item in previous_window), 2)
    merchant_counts = Counter(merchant_key(item["description"]) for item in current_window)
    top_merchants = [
        {"name": name, "count": count}
        for name, count in merchant_counts.most_common(3)
    ]
    largest_transactions = [
        {
            "description": item["description"],
            "amount": round(item["amount"], 2),
            "date": item["date"],
        }
        for item in sorted(current_window, key=lambda transaction: transaction["amount"], reverse=True)[:3]
    ]
    percent_difference = None
    if previous_total > 0:
        percent_difference = round(((last_30_total - previous_total) / previous_total) * 100, 1)

    category_groups: dict[str, list[dict]] = {}
    for item in current_window:
        category_groups.setdefault(item["category"], []).append(item)

    category_spend = []
    for name, items in category_groups.items():
        transactions = [
            {
                "date": item["date"],
                "description": item["description"],
                "amount": round(item["amount"], 2),
            }
            for item in sorted(items, key=lambda transaction: transaction["amount"], reverse=True)
        ]
        category_spend.append(
            {
                "name": name,
                "total": round(sum(item["amount"] for item in items), 2),
                "count": len(items),
                "transactions": transactions,
            }
        )

    category_spend.sort(key=lambda category: category["total"], reverse=True)
    top_last_30_categories = [
        {
            "name": category["name"],
            "total": category["total"],
            "count": category["count"],
        }
        for category in category_spend[:5]
    ]

    weekly_start = as_of - timedelta(days=89)
    weekly_groups: dict[date, list[dict]] = {}
    for item in spending_transactions:
        transaction_date = datetime.strptime(item["date"], "%Y-%m-%d").date()
        if weekly_start <= transaction_date <= as_of:
            week_start = transaction_date - timedelta(days=transaction_date.weekday())
            weekly_groups.setdefault(week_start, []).append(item)

    weekly_breakdown = []
    first_week_start = weekly_start - timedelta(days=weekly_start.weekday())
    week_start = first_week_start
    while week_start <= as_of:
        items = weekly_groups.get(week_start, [])
        merchant_groups: dict[str, list[dict]] = {}
        for item in items:
            merchant_groups.setdefault(merchant_key(item["description"]), []).append(item)

        grouped_merchants = []
        for name, merchant_items in merchant_groups.items():
            transactions = [
                {
                    "date": item["date"],
                    "description": item["description"],
                    "amount": round(item["amount"], 2),
                }
                for item in sorted(merchant_items, key=lambda transaction: transaction["amount"], reverse=True)
            ]
            grouped_merchants.append(
                {
                    "name": name,
                    "total": round(sum(item["amount"] for item in merchant_items), 2),
                    "transactions": transactions,
                }
            )

        grouped_merchants.sort(key=lambda group: group["total"], reverse=True)
        week_end = min(week_start + timedelta(days=6), as_of)
        weekly_breakdown.append(
            {
                "week": week_start.strftime("%Y-%m-%d"),
                "label": f"{_format_short_date(week_start)} - {_format_short_date(week_end)}",
                "total": round(sum(item["amount"] for item in items), 2),
                "merchant_groups": grouped_merchants,
            }
        )
        week_start += timedelta(days=7)

    return {
        "total_spend": total_spend,
        "top_categories": top_categories,
        "monthly_breakdown": monthly_breakdown,
        "weekly_breakdown": weekly_breakdown,
        "last_30_days": {
            "total_spend": last_30_total,
            "top_merchants": top_merchants,
            "largest_transactions": largest_transactions,
            "top_categories": top_last_30_categories,
            "category_spend": category_spend,
            "percent_difference_vs_last_month": percent_difference,
            "previous_total_spend": previous_total,
        },
    }
