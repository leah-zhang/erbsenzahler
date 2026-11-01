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

    def test_parses_negative_spend_amount_statement_csv(self):
        path = self.write_csv("Date,Description,Amount\n2026-07-01,Coffee,-4.25\n2026-07-02,Payment,100.00\n")

        parsed = parse_statement(path, amount_sign="spend_negative")

        self.assertEqual([item["amount"] for item in parsed["transactions"]], [4.25, -100.00])

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

    def test_row_errors_identify_csv_record_and_original_cells(self):
        for bad_row, message in [
            ('bad-date,Coffee,4.25', 'Invalid date'),
            ('2026-07-01,Coffee,nope', 'Invalid amount'),
            ('2026-07-01,,4.25', 'Missing description'),
        ]:
            with self.subTest(bad_row=bad_row):
                path = self.write_csv('Date,Description,Amount\n\n2026-07-01,"Multi\nline",1\n' + bad_row + '\n')
                with self.assertRaises(StatementParseError) as raised:
                    parse_statement(path)
                self.assertEqual(raised.exception.row_number, 4)
                self.assertEqual(raised.exception.row, bad_row.split(','))
                self.assertIn(message, str(raised.exception))

    def test_headerless_row_error_uses_first_record(self):
        path = self.write_csv('bad,Coffee,4.25\n')
        with self.assertRaises(StatementParseError) as raised:
            parse_statement(path, column_mapping={'date': 0, 'description': 1, 'amount': 2}, has_header=False)
        self.assertEqual(raised.exception.row_number, 1)

    def test_default_account_fills_only_missing_accounts(self):
        path = self.write_csv('Date,Description,Amount,Account\n2026-07-01,Coffee,5,\n2026-07-02,Shop,10,Other card\n')
        result = parse_statement(path, default_account=' My Visa ')
        self.assertEqual([item['account'] for item in result['transactions']], ['My Visa', 'Other card'])
        path = self.write_csv('2026-07-01,Coffee,-5\n')
        result = parse_statement(path, column_mapping={'date':0,'description':1,'amount':2}, has_header=False, amount_sign='spend_negative', default_account='My Visa')
        self.assertEqual(result['transactions'][0]['account'], 'My Visa')
        self.assertEqual(result['transactions'][0]['amount'], 5)
        self.assertEqual(parse_statement(path, column_mapping={'date':0,'description':1,'amount':2}, has_header=False, default_account='  ')['transactions'][0]['account'], 'bank')

    def test_rejects_invalid_amount_sign(self):
        path = self.write_csv("Date,Description,Amount\n2026-07-01,Coffee,4.25\n")

        with self.assertRaisesRegex(StatementParseError, "Amount sign"):
            parse_statement(path, amount_sign="sometimes")

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
