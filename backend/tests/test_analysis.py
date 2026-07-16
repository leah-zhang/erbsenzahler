import unittest

from app.services.analysis import summarize_transactions


class AnalysisTests(unittest.TestCase):
    def test_summarizes_spending_only(self):
        summary = summarize_transactions(
            [
                {"date": "2026-07-01", "amount": 25.50, "category": "food"},
                {"date": "2026-07-02", "amount": -1000.00, "category": "income"},
                {"date": "2026-08-01", "amount": 10.00, "category": "transport"},
            ]
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

    def test_returns_empty_summary_when_there_is_no_spending(self):
        summary = summarize_transactions(
            [
                {"date": "2026-07-02", "amount": -1000.00, "category": "income"},
                {"date": "2026-07-03", "amount": 0.00, "category": "transfer"},
            ]
        )

        self.assertEqual(summary, {"total_spend": 0.0, "top_categories": [], "monthly_breakdown": []})


if __name__ == "__main__":
    unittest.main()
