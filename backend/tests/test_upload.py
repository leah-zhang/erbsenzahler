import unittest
import json
from io import BytesIO

from fastapi import HTTPException, UploadFile
from sqlmodel import Session

from app.models import MerchantCategoryRule, Statement, Transaction, engine
from app.main import categorize_merchant, categorization_suggestions, clear_database, clear_transaction_categories
from app.main import clear_transactions, rename_category, recent_statements
from app.main import monthly_summary, remove_merchant_from_category, transaction_categories, transaction_category_details
from app.main import transaction_category_dashboard, transaction_category_summary, upload_statement
from app.main import (
    CategorizeMerchantRequest,
    DuplicateImportResolutionRequest,
    RemoveMerchantCategoryRequest,
    RenameCategoryRequest,
    resolve_duplicate_statement_rows,
)


class UploadTests(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        with Session(engine) as session:
            cls._saved_statements = [
                statement.model_dump()
                for statement in session.query(Statement).all()
            ]
            cls._saved_transactions = [
                transaction.model_dump()
                for transaction in session.query(Transaction).all()
            ]
            cls._saved_category_rules = [
                rule.model_dump()
                for rule in session.query(MerchantCategoryRule).all()
            ]

    @classmethod
    def tearDownClass(cls):
        with Session(engine) as session:
            for transaction in session.query(Transaction).all():
                session.delete(transaction)
            for statement in session.query(Statement).all():
                session.delete(statement)
            for rule in session.query(MerchantCategoryRule).all():
                session.delete(rule)
            session.commit()

            for statement_data in cls._saved_statements:
                session.add(Statement(**statement_data))
            for transaction_data in cls._saved_transactions:
                session.add(Transaction(**transaction_data))
            for rule_data in cls._saved_category_rules:
                session.add(MerchantCategoryRule(**rule_data))
            session.commit()

    async def test_invalid_row_returns_editor_details_without_partial_import(self):
        with Session(engine) as session:
            before = len(session.query(Transaction).all())
        file = UploadFile(filename="invalid-row.csv", file=BytesIO(
            b"Date,Description,Amount\n2026-07-01,Coffee,4.25\nbad,Shop,10\n"
        ))
        with self.assertRaises(HTTPException) as raised:
            await upload_statement(file)
        self.assertEqual(raised.exception.status_code, 400)
        self.assertEqual(raised.exception.detail["row_number"], 3)
        self.assertEqual(raised.exception.detail["row"], ["bad", "Shop", "10"])
        with Session(engine) as session:
            self.assertEqual(len(session.query(Transaction).all()), before)

    async def test_recent_statements_are_limited_and_newest_first(self):
        clear_database()
        with Session(engine) as session:
            for index in range(12):
                session.add(Statement(filename=f"statement-{index}.csv", uploaded_at=f"2026-07-{index + 1:02d}T12:00:00+00:00", parsed_format="csv", status="imported"))
            session.add(Statement(filename="failed.csv", uploaded_at="2026-08-01T12:00:00+00:00", parsed_format="csv", status="failed"))
            session.commit()
        statements = recent_statements()["statements"]
        self.assertEqual(len(statements), 10)
        self.assertEqual(statements[0]["filename"], "statement-11.csv")
        self.assertEqual(statements[-1]["filename"], "statement-2.csv")
        clear_database()
        self.assertEqual(recent_statements()["statements"], [])

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

    async def test_upload_normalizes_negative_spend_amounts(self):
        clear_database()
        file = UploadFile(filename="statement.csv", file=BytesIO(b"Date,Description,Amount\n2026-07-01,Coffee,-4.25\n"))

        await upload_statement(file, amount_sign="spend_negative")

        suggestions = categorization_suggestions()
        self.assertEqual(suggestions.total, 1)
        self.assertEqual(suggestions.groups[0].merchant_key, "COFFEE")

    async def test_upload_detects_duplicate_transactions_for_review(self):
        clear_database()
        file = UploadFile(filename="statement.csv", file=BytesIO(b"Date,Description,Amount,Account\n2026-07-01,Coffee,4.25,Visa\n"))
        await upload_statement(file)

        file = UploadFile(filename="statement.csv", file=BytesIO(b"Date,Description,Amount,Account\n2026-07-01, Coffee  ,4.25,Visa\n"))
        response = await upload_statement(file)

        self.assertEqual(response.summary["imported"], 0)
        self.assertEqual(response.summary["duplicate_rows"], 1)
        self.assertIsNotNone(response.duplicate_batch_id)
        self.assertEqual(response.duplicates[0]["description"], "Coffee")

    async def test_can_keep_selected_duplicate_transactions(self):
        clear_database()
        file = UploadFile(filename="statement.csv", file=BytesIO(b"Date,Description,Amount,Account\n2026-07-01,Coffee,4.25,Visa\n"))
        await upload_statement(file)

        file = UploadFile(filename="statement.csv", file=BytesIO(b"Date,Description,Amount,Account\n2026-07-01,Coffee,4.25,Visa\n"))
        response = await upload_statement(file)
        duplicate_id = response.duplicates[0]["id"]

        resolution = resolve_duplicate_statement_rows(
            response.duplicate_batch_id,
            DuplicateImportResolutionRequest(keep_duplicate_ids=[duplicate_id]),
        )

        self.assertEqual(resolution.imported_duplicates, 1)
        with Session(engine) as session:
            self.assertEqual(len(session.query(Transaction).all()), 2)

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
        categorize_merchant(CategorizeMerchantRequest(merchant_key="COFFEE", category="Coffee"))

        response = clear_transactions()

        self.assertEqual(response.status, "cleared")
        self.assertEqual(response.deleted_transactions, 1)
        self.assertEqual(transaction_categories().categories, ["Coffee"])

    async def test_merchant_category_rules_persist_after_clearing_transactions(self):
        clear_database()
        file = UploadFile(
            filename="statement.csv",
            file=BytesIO(b"Date,Description,Amount\n2026-07-01,POS STARBUCKS 123,4.25\n"),
        )
        await upload_statement(file)
        categorize_merchant(CategorizeMerchantRequest(merchant_key="STARBUCKS", category="Coffee"))

        clear_transactions()
        self.assertEqual(transaction_categories().categories, ["Coffee"])
        details = transaction_category_details()
        self.assertEqual(details.categories[0].name, "Coffee")
        self.assertEqual(details.categories[0].merchant_groups, [])

        file = UploadFile(
            filename="statement.csv",
            file=BytesIO(b"Date,Description,Amount\n2026-07-02,STARBUCKS 456,5.00\n"),
        )
        await upload_statement(file)

        self.assertEqual(categorization_suggestions().total, 0)
        summary = transaction_category_summary()
        self.assertEqual(summary.categories[0].name, "Coffee")
        self.assertEqual(summary.categories[0].transaction_count, 1)

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
        self.assertEqual(transaction_categories().categories, ["Coffee"])
        self.assertEqual(categorization_suggestions().total, 1)

    async def test_monthly_analytics_applies_saved_merchant_rules(self):
        clear_database()
        file = UploadFile(filename="statement.csv", file=BytesIO(b"Date,Description,Amount\n2026-07-01,POS STARBUCKS 123,4.25\n"))
        await upload_statement(file)
        categorize_merchant(CategorizeMerchantRequest(merchant_key="STARBUCKS", category="Coffee"))
        clear_transaction_categories()

        summary = monthly_summary(weekly_days=90)

        self.assertEqual(summary.top_categories[0]["name"], "Coffee")
        self.assertEqual(summary.last_30_days["category_spend"], [])

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

    async def test_category_details_orders_merchant_groups_by_transaction_count(self):
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

        categorize_merchant(CategorizeMerchantRequest(merchant_key="STARBUCKS", category="Food"))
        categorize_merchant(CategorizeMerchantRequest(merchant_key="GROCERY MART", category="Food"))

        details = transaction_category_details()
        food_category = next(category for category in details.categories if category.name == "Food")

        self.assertEqual(
            [group.merchant_key for group in food_category.merchant_groups],
            ["STARBUCKS", "GROCERY MART"],
        )

    async def test_category_dashboard_combines_category_data(self):
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
        categorize_merchant(CategorizeMerchantRequest(merchant_key="STARBUCKS", category="Coffee"))

        dashboard = transaction_category_dashboard()

        self.assertEqual(dashboard.categories, ["Coffee"])
        self.assertEqual(dashboard.category_summary[0].transaction_count, 2)
        self.assertEqual(dashboard.category_details[0].merchant_groups[0].merchant_key, "STARBUCKS")
        self.assertEqual(dashboard.uncategorized_groups[0].merchant_key, "GROCERY MART")

    async def test_uncategorized_details_order_groups_by_count_then_recency(self):
        clear_database()
        file = UploadFile(
            filename="statement.csv",
            file=BytesIO(
                b"Date,Description,Amount\n"
                b"2026-07-01,OLDER SINGLE,4.25\n"
                b"2026-07-20,RECENT SINGLE,5.00\n"
                b"2026-06-01,FREQUENT SHOP,6.00\n"
                b"2026-06-02,FREQUENT SHOP,7.00\n"
            ),
        )
        await upload_statement(file)

        details = transaction_category_details()

        self.assertEqual(
            [group.merchant_key for group in details.uncategorized_groups],
            ["FREQUENT SHOP", "RECENT SINGLE", "OLDER SINGLE"],
        )


if __name__ == "__main__":
    unittest.main()
