import tempfile
import unittest
from pathlib import Path

from app.services.parser import StatementParseError, parse_statement


class ParserTests(unittest.TestCase):
    def write_csv(self, contents: str) -> Path:
        handle = tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False, newline="", encoding="utf-8")
        with handle:
            handle.write(contents)
        return Path(handle.name)

    def test_parses_amount_statement_csv(self):
        path = self.write_csv("Date,Description,Amount,Category,Account\n2026-07-01,Coffee,4.25,Food,Checking\n")

        parsed = parse_statement(path)

        self.assertEqual(parsed["format"], "csv")
        self.assertEqual(parsed["summary"]["rows"], 1)
        self.assertEqual(
            parsed["transactions"][0],
            {
                "date": "2026-07-01",
                "description": "Coffee",
                "amount": 4.25,
                "category": "Food",
                "account": "Checking",
            },
        )

    def test_parses_debit_credit_statement_csv(self):
        path = self.write_csv(
            "Transaction Date,Details,Debit,Credit\n"
            "07/02/2026,Groceries,31.10,\n"
            "07/03/2026,Paycheque,,1000.00\n"
        )

        parsed = parse_statement(path)

        self.assertEqual([item["amount"] for item in parsed["transactions"]], [31.10, -1000.00])
        self.assertEqual([item["date"] for item in parsed["transactions"]], ["2026-07-02", "2026-07-03"])

    def test_rejects_missing_required_headers(self):
        path = self.write_csv("When,What,Value\n2026-07-01,Coffee,4.25\n")

        with self.assertRaisesRegex(StatementParseError, "Date and Description"):
            parse_statement(path)

    def test_parses_headerless_csv_with_column_mapping(self):
        path = self.write_csv("2026-07-01,Coffee,4.25,Food\n2026-07-02,Groceries,31.10,Food\n")

        parsed = parse_statement(
            path,
            column_mapping={"date": 0, "description": 1, "amount": 2, "category": 3},
            has_header=False,
        )

        self.assertEqual(parsed["summary"]["rows"], 2)
        self.assertEqual(parsed["transactions"][0]["description"], "Coffee")
        self.assertEqual(parsed["transactions"][1]["amount"], 31.10)

    def test_parses_headerless_debit_credit_csv_with_column_mapping(self):
        path = self.write_csv("07/02/2026,Groceries,31.10,\n07/03/2026,Paycheque,,1000.00\n")

        parsed = parse_statement(
            path,
            column_mapping={"date": 0, "description": 1, "debit": 2, "credit": 3},
            has_header=False,
        )

        self.assertEqual([item["amount"] for item in parsed["transactions"]], [31.10, -1000.00])


if __name__ == "__main__":
    unittest.main()
