import json
import unittest
from io import BytesIO

from fastapi import UploadFile
from sqlmodel import Session

from app.main import (
    AccountValueEntryPayload,
    AccountValueSnapshotPayload,
    account_values,
    create_account_value_snapshot,
    delete_account_value_snapshot,
    import_account_values,
    update_account_value_snapshot,
)
from app.models import AccountValueEntry, AccountValueSnapshot, engine


class AccountValueTests(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        with Session(engine) as session:
            cls._saved_snapshots = [
                snapshot.model_dump()
                for snapshot in session.query(AccountValueSnapshot).all()
            ]
            cls._saved_entries = [
                entry.model_dump()
                for entry in session.query(AccountValueEntry).all()
            ]

    @classmethod
    def tearDownClass(cls):
        with Session(engine) as session:
            for entry in session.query(AccountValueEntry).all():
                session.delete(entry)
            for snapshot in session.query(AccountValueSnapshot).all():
                session.delete(snapshot)
            session.commit()

            for snapshot_data in cls._saved_snapshots:
                session.add(AccountValueSnapshot(**snapshot_data))
            for entry_data in cls._saved_entries:
                session.add(AccountValueEntry(**entry_data))
            session.commit()

    def setUp(self):
        with Session(engine) as session:
            for entry in session.query(AccountValueEntry).all():
                session.delete(entry)
            for snapshot in session.query(AccountValueSnapshot).all():
                session.delete(snapshot)
            session.commit()

    def test_creates_updates_and_deletes_account_value_snapshot(self):
        created = create_account_value_snapshot(
            AccountValueSnapshotPayload(
                year=2026,
                month_end="2026-01-31",
                projected=1000,
                recorded_date="2026-02-01",
                accounts=[
                    AccountValueEntryPayload(account_name="CIBC- Cash", value=400),
                    AccountValueEntryPayload(account_name="RBC- Cash", value=700),
                ],
            )
        )

        self.assertEqual(created.actual, 1100)
        self.assertEqual(created.diff, 100)

        updated = update_account_value_snapshot(
            created.id,
            AccountValueSnapshotPayload(
                year=2026,
                month_end="2026-01-31",
                projected=1200,
                recorded_date="2026-02-02",
                accounts=[
                    AccountValueEntryPayload(account_name="CIBC- Cash", value=500),
                    AccountValueEntryPayload(account_name="RBC- Cash", value=900),
                ],
            ),
        )

        self.assertEqual(updated.actual, 1400)
        self.assertEqual(updated.diff, 200)
        self.assertEqual(len(account_values().snapshots), 1)

        response = delete_account_value_snapshot(created.id)

        self.assertEqual(response["status"], "deleted")
        self.assertEqual(account_values().snapshots, [])

    async def test_imports_account_values_from_csv_for_year(self):
        file = UploadFile(
            filename="accounts.csv",
            file=BytesIO(
                b"Month End,Projected,Actual,Date,CIBC- Cash,RBC- Cash\n"
                b"2026-01-31,1000,ignored,2026-02-01,400,700\n"
                b"2026-02-28,1500,,2026-03-01,600,800\n"
            ),
        )

        response = await import_account_values(year=2026, file=file)

        self.assertEqual(response.status, "imported")
        self.assertEqual(response.imported_snapshots, 2)
        self.assertEqual(response.imported_entries, 4)

        snapshots = account_values().snapshots
        self.assertEqual(len(snapshots), 2)
        self.assertEqual(snapshots[0].actual, 1400)
        self.assertEqual(snapshots[1].actual, 1100)

    async def test_imports_account_values_with_column_mapping(self):
        file = UploadFile(
            filename="accounts.csv",
            file=BytesIO(
                b"EOM (2021),Projected,Actual,Date,Diff,TFSA Contribution,RRSP Contribution,Unregistered Contribution,Notes,CIBC- Cash,RBC- Cash\n"
                b"January,\"$64,739.16\",-,-,-,-,-,-,Opening month,-,-\n"
                b"March,\"$71,061.53\",\"$70,859.85\",03/28/2021,-$201.68,100,200,300,Contributed,\"$10,926.81\",\"$10,274.46\"\n"
            ),
        )

        response = await import_account_values(
            year=2021,
            file=file,
            column_mapping=json.dumps({
                "monthEnd": 0,
                "projected": 1,
                "actual": 2,
                "date": 3,
                "diff": 4,
                "notes": 8,
                "contributions": [5, 6, 7],
            }),
        )

        self.assertEqual(response.status, "imported")
        self.assertEqual(response.imported_snapshots, 2)
        self.assertEqual(response.imported_entries, 10)

        snapshots = account_values().snapshots
        self.assertEqual(snapshots[0].month_end, "2021-03-31")
        self.assertEqual(snapshots[0].recorded_date, "2021-03-28")
        self.assertEqual(snapshots[0].notes, "Contributed")
        self.assertEqual(snapshots[0].actual, 21201.27)
        self.assertEqual(
            {contribution.account_name: contribution.value for contribution in snapshots[0].contributions},
            {"RRSP": 200, "TFSA": 100, "Unregistered": 300},
        )
        self.assertEqual(snapshots[1].month_end, "2021-01-31")
        self.assertEqual(snapshots[1].recorded_date, "")
        self.assertEqual(snapshots[1].actual, 0)

    def test_treats_legacy_contribution_account_entries_as_contributions(self):
        created = create_account_value_snapshot(
            AccountValueSnapshotPayload(
                year=2023,
                month_end="2023-01-31",
                projected=1000,
                accounts=[
                    AccountValueEntryPayload(account_name="TFSA Contribution", value=100),
                    AccountValueEntryPayload(account_name="CIBC- Cash", value=500),
                ],
            )
        )

        self.assertEqual(created.actual, 500)
        self.assertEqual(
            {contribution.account_name: contribution.value for contribution in created.contributions},
            {"TFSA": 100},
        )
        self.assertEqual(
            {account.account_name: account.value for account in created.accounts},
            {"CIBC- Cash": 500},
        )


if __name__ == "__main__":
    unittest.main()
