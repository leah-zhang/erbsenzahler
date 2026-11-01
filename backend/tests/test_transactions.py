import unittest
from datetime import date
from io import BytesIO
from unittest.mock import patch
from fastapi import HTTPException, UploadFile
from sqlmodel import SQLModel, Session, create_engine
from sqlalchemy.pool import StaticPool
from app import main
from app.models import Statement, Transaction, MerchantCategoryRule


class TransactionTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        SQLModel.metadata.create_all(self.engine)
        self.patch = patch.object(main, 'engine', self.engine)
        self.patch.start()
        with Session(self.engine) as session:
            session.add(Statement(id=1, filename='visa.csv', uploaded_at='2026-10-01', parsed_format='csv', status='imported'))
            session.add(Transaction(id=1, date='2026-10-01', description='Coffee', amount=5, category='Food', account='Visa', statement_id=1))
            session.add(Transaction(id=2, date='2026-10-02', description='Groceries', amount=20, category='Food', account='bank'))
            session.add(Transaction(id=3, date='2026-10-03', description='Payment', amount=-100, category='uncategorized', account='Visa', statement_id=1))
            session.commit()

    def tearDown(self):
        self.patch.stop()
        self.engine.dispose()

    def test_filters_and_pagination(self):
        self.assertEqual(main.list_transactions()['total'], 3)
        self.assertEqual(main.list_transactions(search='COFFEE')['total'], 1)
        self.assertEqual(main.list_transactions(account='Visa', source='1')['total'], 2)
        self.assertEqual(main.list_transactions(source='unknown')['transactions'][0]['description'], 'Groceries')
        self.assertEqual(main.list_transactions(category='Food', date_from=date(2026, 10, 2))['total'], 1)
        self.assertEqual(main.list_transactions(date_to=date(2026, 10, 1))['total'], 1)
        result = main.list_transactions(limit=1, offset=1)
        self.assertEqual(result['transactions'][0]['id'], 2)
        self.assertTrue(result['has_more'])
        self.assertEqual(main.list_transactions(source='1')['transactions'][0]['source_file'], 'visa.csv')
        with self.assertRaises(HTTPException):
            main.list_transactions(date_from=date(2026, 11, 1), date_to=date(2026, 10, 1))

    def test_edit_only_changes_target_and_keeps_source(self):
        request = main.TransactionEditRequest(date='2026-10-04', description=' Cafe ', amount=6.25, category='Dining', account='Mastercard')
        result = main.update_transaction(1, request)
        self.assertEqual(result['category'], 'Dining')
        self.assertEqual(result['source_file'], 'visa.csv')
        with Session(self.engine) as session:
            item = session.get(Transaction, 1)
            self.assertEqual(item.fingerprint, main._transaction_fingerprint(item.model_dump()))
            self.assertEqual(session.get(Transaction, 2).category, 'Food')
        with self.assertRaises(HTTPException):
            main.update_transaction(999, request)
        with self.assertRaises(HTTPException):
            main.update_transaction(1, request.model_copy(update={'description':' '}))
        with self.assertRaises(HTTPException):
            main.update_transaction(1, request.model_copy(update={'amount':float('inf')}))

    def test_uncategorized_override_is_not_replaced_by_merchant_rule(self):
        with Session(self.engine) as session:
            session.add(MerchantCategoryRule(merchant_key='COFFEE', category='Food'))
            session.commit()
        result = main.update_transaction(1, main.TransactionEditRequest(date='2026-10-01', description='Coffee', amount=5, category='uncategorized', account='Visa'))
        self.assertEqual(result['category'], 'uncategorized')
        self.assertEqual(main.list_transactions(search='Coffee')['transactions'][0]['category'], 'uncategorized')

    async def test_upload_default_account_and_suggestions(self):
        file = UploadFile(filename='default.csv', file=BytesIO(b'Date,Description,Amount\n2026-10-10,Shop,12\n'))
        result = await main.upload_statement(file, default_account='My card')
        items = main.list_transactions(source=result.id)['transactions']
        self.assertEqual(items[0]['account'], 'My card')
        self.assertIn('My card', main.transaction_accounts()['accounts'])

    async def test_new_imports_and_kept_duplicates_track_source(self):
        content = b'Date,Description,Amount,Account\n2026-10-10,Shop,12,Visa\n2026-10-10,Shop,12,Visa\n'
        result = await main.upload_statement(UploadFile(filename='new.csv', file=BytesIO(content)))
        self.assertEqual(result.summary['imported'], 1)
        main.resolve_duplicate_statement_rows(result.duplicate_batch_id, main.DuplicateImportResolutionRequest(keep_duplicate_ids=[result.duplicates[0]['id']]))
        items = main.list_transactions(source=result.id)['transactions']
        self.assertEqual(len(items), 2)
        self.assertTrue(all(item['source_file'] == 'new.csv' for item in items))


if __name__ == '__main__':
    unittest.main()
