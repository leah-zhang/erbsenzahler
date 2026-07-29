import unittest
from datetime import date

from app.services.analysis import summarize_transactions


class AnalysisTests(unittest.TestCase):
    def test_summarizes_spending_only(self):
        summary = summarize_transactions(
            [
                {"date": "2026-07-01", "description": "Coffee Shop", "amount": 25.50, "category": "food"},
                {"date": "2026-07-02", "description": "Payroll", "amount": -1000.00, "category": "income"},
                {"date": "2026-08-01", "description": "Bus Pass", "amount": 10.00, "category": "transport"},
            ],
            as_of=date(2026, 8, 1),
        )

        self.assertEqual(summary["total_spend"], 35.50)
        self.assertEqual(
            summary["monthly_breakdown"],
            [
                {"month": "2026-07", "total": 25.50},
                {"month": "2026-08", "total": 10.00},
            ],
        )
        self.assertEqual(
            summary["top_categories"],
            [
                {"name": "food", "count": 1},
                {"name": "transport", "count": 1},
            ],
        )
        self.assertEqual(summary["last_30_days"]["total_spend"], 10.00)
        self.assertEqual(summary["last_30_days"]["top_merchants"], [{"name": "BUS PASS", "count": 1}])
        self.assertEqual(
            summary["last_30_days"]["largest_transactions"],
            [{"date": "2026-08-01", "description": "Bus Pass", "amount": 10.00}],
        )
        self.assertEqual(summary["last_30_days"]["previous_total_spend"], 25.50)
        self.assertEqual(summary["last_30_days"]["percent_difference_vs_last_month"], -60.8)
        self.assertEqual(
            summary["last_30_days"]["top_categories"],
            [{"name": "transport", "total": 10.00, "count": 1}],
        )
        self.assertEqual(
            summary["last_30_days"]["category_spend"],
            [
                {
                    "name": "transport",
                    "total": 10.00,
                    "count": 1,
                    "transactions": [{"date": "2026-08-01", "description": "Bus Pass", "amount": 10.00}],
                }
            ],
        )
        self.assertEqual(summary["weekly_breakdown"][0]["week"], "2026-05-04")
        self.assertEqual(summary["weekly_breakdown"][0]["total"], 0)
        self.assertEqual(summary["weekly_breakdown"][8]["week"], "2026-06-29")
        self.assertEqual(summary["weekly_breakdown"][8]["total"], 25.50)
        self.assertEqual(summary["weekly_breakdown"][12]["week"], "2026-07-27")
        self.assertEqual(summary["weekly_breakdown"][12]["total"], 10.00)
        self.assertEqual(summary["weekly_breakdown"][12]["merchant_groups"][0]["name"], "BUS PASS")

    def test_summarizes_last_30_day_cards(self):
        summary = summarize_transactions(
            [
                {"date": "2026-07-15", "description": "Coffee Shop", "amount": 5.00, "category": "coffee"},
                {"date": "2026-07-14", "description": "Coffee Shop #2", "amount": 6.00, "category": "coffee"},
                {"date": "2026-07-13", "description": "Grocery Mart", "amount": 40.00, "category": "groceries"},
                {"date": "2026-06-15", "description": "Old Grocery", "amount": 20.00, "category": "groceries"},
                {"date": "2026-06-10", "description": "Previous Month", "amount": 50.00, "category": "bills"},
            ],
            as_of=date(2026, 7, 15),
        )

        self.assertEqual(summary["last_30_days"]["total_spend"], 51.00)
        self.assertEqual(
            summary["last_30_days"]["top_merchants"],
            [
                {"name": "COFFEE SHOP", "count": 2},
                {"name": "GROCERY MART", "count": 1},
            ],
        )
        self.assertEqual(
            [item["description"] for item in summary["last_30_days"]["largest_transactions"]],
            ["Grocery Mart", "Coffee Shop #2", "Coffee Shop"],
        )
        self.assertEqual(summary["last_30_days"]["previous_total_spend"], 70.00)
        self.assertEqual(summary["last_30_days"]["percent_difference_vs_last_month"], -27.1)
        self.assertEqual(
            summary["last_30_days"]["top_categories"],
            [
                {"name": "groceries", "total": 40.00, "count": 1},
                {"name": "coffee", "total": 11.00, "count": 2},
            ],
        )

    def test_filters_weekly_breakdown_by_category(self):
        summary = summarize_transactions(
            [
                {"date": "2026-07-01", "description": "Coffee Shop", "amount": 5.00, "category": "coffee"},
                {"date": "2026-07-01", "description": "Grocery Mart", "amount": 40.00, "category": "groceries"},
            ],
            as_of=date(2026, 7, 7),
            weekly_days=14,
            weekly_category="coffee",
        )

        week_totals = [week["total"] for week in summary["weekly_breakdown"]]
        self.assertIn(5.00, week_totals)
        self.assertNotIn(40.00, week_totals)

    def test_adjusts_weekly_breakdown_timeframe(self):
        summary = summarize_transactions(
            [
                {"date": "2026-01-15", "description": "Older Spend", "amount": 20.00, "category": "bills"},
                {"date": "2026-07-01", "description": "Recent Spend", "amount": 10.00, "category": "food"},
            ],
            as_of=date(2026, 7, 7),
            weekly_days=210,
        )

        self.assertLessEqual(summary["weekly_breakdown"][0]["week"], "2026-01-12")
        self.assertIn(20.00, [week["total"] for week in summary["weekly_breakdown"]])

    def test_returns_empty_summary_when_there_is_no_spending(self):
        summary = summarize_transactions(
            [
                {"date": "2026-07-02", "description": "Payroll", "amount": -1000.00, "category": "income"},
                {"date": "2026-07-03", "description": "Transfer", "amount": 0.00, "category": "transfer"},
            ]
        )

        self.assertEqual(
            summary,
            {
                "total_spend": 0.0,
                "top_categories": [],
                "monthly_breakdown": [],
                "weekly_breakdown": [],
                "last_30_days": {
                    "total_spend": 0.0,
                    "top_merchants": [],
                    "largest_transactions": [],
                    "top_categories": [],
                    "category_spend": [],
                    "percent_difference_vs_last_month": None,
                    "previous_total_spend": 0.0,
                },
            },
        )


if __name__ == "__main__":
    unittest.main()
