import unittest
import json
from io import BytesIO

from fastapi import HTTPException, UploadFile
from sqlmodel import Session

from app.models import Statement, Transaction, engine
from app.main import categorize_merchant, categorization_suggestions, clear_database, clear_transaction_categories
from app.main import clear_transactions, rename_category
from app.main import remove_merchant_from_category, transaction_categories, transaction_category_details
from app.main import transaction_category_summary, upload_statement
from app.main import CategorizeMerchantRequest, RemoveMerchantCategoryRequest, RenameCategoryRequest


class UploadTests(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        with Session(engine) as session:
            cls._saved_statements = [
                statement.model_dump(exclude={"id"})
                for statement in session.query(Statement).all()
            ]
            cls._saved_transactions = [
                transaction.model_dump(exclude={"id"})
                for transaction in session.query(Transaction).all()
            ]

    @classmethod
    def tearDownClass(cls):
        with Session(engine) as session:
            for transaction in session.query(Transaction).all():
                session.delete(transaction)
            for statement in session.query(Statement).all():
                session.delete(statement)
            session.commit()

            for statement_data in cls._saved_statements:
                session.add(Statement(**statement_data))
            for transaction_data in cls._saved_transactions:
                session.add(Transaction(**transaction_data))
            session.commit()

    async def test_upload_imports_csv_transactions(self):
        file = UploadFile(filename="statement.csv", file=BytesIO(b"Date,Description,Amount\n2026-07-01,Coffee,4.25\n"))

        response = await upload_statement(file)

        self.assertEqual(response.filename, "statement.csv")
        self.assertEqual(response.status, "imported")
        self.assertEqual(response.parsed_format, "csv")
        self.assertEqual(response.summary["rows"], 1)

    async def test_upload_imports_headerless_csv_with_mapping(self):
        file = UploadFile(filename="statement.csv", file=BytesIO(b"2026-07-01,Coffee,4.25\n"))

        response = await upload_statement(
            file,
            column_mapping=json.dumps({"date": 0, "description": 1, "amount": 2}),
            has_header=False,
        )

        self.assertEqual(response.status, "imported")
        self.assertEqual(response.summary["rows"], 1)

    async def test_upload_rejects_pdf_for_now(self):
        file = UploadFile(filename="statement.pdf", file=BytesIO(b"%PDF"))

        with self.assertRaises(HTTPException) as error:
            await upload_statement(file)
        self.assertEqual(error.exception.status_code, 415)

    async def test_clear_database_deletes_imported_rows(self):
        file = UploadFile(filename="statement.csv", file=BytesIO(b"Date,Description,Amount\n2026-07-01,Coffee,4.25\n"))
        await upload_statement(file)

        response = clear_database()

        self.assertEqual(response.status, "cleared")
        self.assertGreaterEqual(response.deleted_statements, 1)
        self.assertGreaterEqual(response.deleted_transactions, 1)

    async def test_clear_transactions_deletes_only_transaction_rows(self):
        clear_database()
        file = UploadFile(filename="statement.csv", file=BytesIO(b"Date,Description,Amount\n2026-07-01,Coffee,4.25\n"))
        await upload_statement(file)

        response = clear_transactions()

        self.assertEqual(response.status, "cleared")
        self.assertEqual(response.deleted_transactions, 1)
        self.assertEqual(transaction_categories().categories, [])

    async def test_clear_transaction_categories_resets_categories_without_deleting_transactions(self):
        clear_database()
        file = UploadFile(filename="statement.csv", file=BytesIO(b"Date,Description,Amount\n2026-07-01,POS STARBUCKS 123,4.25\n"))
        await upload_statement(file)
        suggestions = categorization_suggestions()
        categorize_merchant(
            CategorizeMerchantRequest(
                merchant_key=suggestions.groups[0].merchant_key,
                category="Coffee",
            )
        )

        response = clear_transaction_categories()

        self.assertEqual(response.status, "cleared")
        self.assertEqual(response.updated_transactions, 1)
        self.assertEqual(transaction_categories().categories, [])
        self.assertEqual(categorization_suggestions().total, 1)

    async def test_categorizes_suggested_merchant_group(self):
        clear_database()
        file = UploadFile(
            filename="statement.csv",
            file=BytesIO(
                b"Date,Description,Amount\n"
                b"2026-07-01,POS STARBUCKS 123,4.25\n"
                b"2026-07-02,STARBUCKS 456,5.00\n"
            ),
        )
        await upload_statement(file)

        suggestions = categorization_suggestions()
        self.assertEqual(suggestions.groups[0].merchant_key, "STARBUCKS")
        self.assertEqual(suggestions.limit, 10)
        self.assertEqual(suggestions.offset, 0)
        self.assertEqual(suggestions.total, 1)
        self.assertFalse(suggestions.has_more)

        response = categorize_merchant(
            CategorizeMerchantRequest(
                merchant_key=suggestions.groups[0].merchant_key,
                category="Coffee",
            )
        )

        self.assertEqual(response.status, "categorized")
        self.assertEqual(response.updated_transactions, 2)

        categories = transaction_categories()
        self.assertIn("Coffee", categories.categories)

        summary = transaction_category_summary()
        self.assertEqual(summary.categories[0].name, "Coffee")
        self.assertEqual(summary.categories[0].transaction_count, 2)

        rename_response = rename_category(
            RenameCategoryRequest(
                current_category="Coffee",
                new_category="Cafe",
            )
        )
        self.assertEqual(rename_response.status, "renamed")
        self.assertEqual(rename_response.updated_transactions, 2)

        renamed_categories = transaction_categories()
        self.assertIn("Cafe", renamed_categories.categories)
        self.assertNotIn("Coffee", renamed_categories.categories)

    async def test_category_details_and_remove_merchant(self):
        clear_database()
        file = UploadFile(
            filename="statement.csv",
            file=BytesIO(
                b"Date,Description,Amount\n"
                b"2026-07-01,POS STARBUCKS 123,4.25\n"
                b"2026-07-02,STARBUCKS 456,5.00\n"
                b"2026-07-03,GROCERY MART,18.00\n"
            ),
        )
        await upload_statement(file)

        categorize_merchant(
            CategorizeMerchantRequest(
                merchant_key="STARBUCKS",
                category="Coffee",
                excluded_merchants=["STARBUCKS 456"],
            )
        )

        details = transaction_category_details()
        self.assertEqual(details.categories[0].name, "Coffee")
        self.assertEqual(details.categories[0].merchant_groups[0].merchants, ["POS STARBUCKS 123"])
        self.assertEqual(details.uncategorized_groups[0].merchant_key, "GROCERY MART")

        response = remove_merchant_from_category(
            RemoveMerchantCategoryRequest(
                category="Coffee",
                merchant="POS STARBUCKS 123",
            )
        )

        self.assertEqual(response.status, "removed")
        self.assertEqual(response.updated_transactions, 1)
        self.assertEqual(transaction_categories().categories, [])


if __name__ == "__main__":
    unittest.main()
