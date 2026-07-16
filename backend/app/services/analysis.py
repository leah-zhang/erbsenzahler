from collections import Counter
from datetime import datetime
from typing import List


def summarize_transactions(transactions: List[dict]) -> dict:
    spending_transactions = [
        item for item in transactions
        if item["amount"] > 0
    ]

    if not spending_transactions:
        return {"total_spend": 0.0, "top_categories": [], "monthly_breakdown": []}

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

    return {
        "total_spend": total_spend,
        "top_categories": top_categories,
        "monthly_breakdown": monthly_breakdown,
    }
