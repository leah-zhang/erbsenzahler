import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from sqlmodel import create_engine, Session
from app import models


class TransactionMigrationTests(unittest.TestCase):
    def test_existing_rows_are_preserved_and_migration_is_repeatable(self):
        with tempfile.TemporaryDirectory() as directory:
            engine = create_engine(f"sqlite:///{Path(directory) / 'legacy.db'}")
            with engine.begin() as connection:
                connection.exec_driver_sql('CREATE TABLE "transaction" (id INTEGER PRIMARY KEY, date TEXT, description TEXT, amount FLOAT, category TEXT, account TEXT, fingerprint TEXT)')
                connection.exec_driver_sql("INSERT INTO 'transaction' VALUES (1, '2026-10-01', 'Coffee', 5, 'Food', 'Visa', 'existing')")
            with patch.object(models, 'engine', engine):
                models.create_db_and_tables()
                models.create_db_and_tables()
            with Session(engine) as session:
                transaction = session.get(models.Transaction, 1)
                self.assertEqual(transaction.description, 'Coffee')
                self.assertEqual(transaction.fingerprint, 'existing')
                self.assertIsNone(transaction.statement_id)
                self.assertFalse(transaction.category_override)
            engine.dispose()
