from typing import Optional
from sqlmodel import Field, SQLModel, Session, create_engine


class Transaction(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    date: str = Field(...)
    description: str = Field(...)
    amount: float = Field(...)
    category: str = Field(default="uncategorized")
    account: str = Field(default="unknown")
    fingerprint: str = Field(default="", index=True)
    statement_id: Optional[int] = Field(default=None, index=True, foreign_key="statement.id")
    category_override: bool = Field(default=False)


class MerchantCategoryRule(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    merchant_key: str = Field(index=True, unique=True)
    category: str = Field(index=True)
    created_at: str = Field(default="")
    updated_at: str = Field(default="")


class Statement(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    filename: str = Field(...)
    uploaded_at: str = Field(...)
    parsed_format: str = Field(...)
    status: str = Field(default="received")


class AccountValueSnapshot(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    year: int = Field(index=True)
    month_end: str = Field(index=True)
    projected: float = Field(default=0.0)
    recorded_date: str = Field(default="")
    notes: str = Field(default="")
    created_at: str = Field(default="")
    updated_at: str = Field(default="")


class AccountValueEntry(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    snapshot_id: int = Field(index=True, foreign_key="accountvaluesnapshot.id")
    account_name: str = Field(index=True)
    account_type: str = Field(default="account")
    value: float = Field(default=0.0)
    display_order: int = Field(default=0)


sqlite_file_name = "finance_tracker.db"
sqlite_url = f"sqlite:///{sqlite_file_name}"
engine = create_engine(sqlite_url, echo=False)


def create_db_and_tables() -> None:
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        connection = session.connection()
        transaction_columns = {row[1] for row in connection.exec_driver_sql('PRAGMA table_info("transaction")').all()}
        if "statement_id" not in transaction_columns:
            connection.exec_driver_sql('ALTER TABLE "transaction" ADD COLUMN statement_id INTEGER REFERENCES statement(id)')
        connection.exec_driver_sql('CREATE INDEX IF NOT EXISTS ix_transaction_statement_id ON "transaction" (statement_id)')
        if "category_override" not in transaction_columns:
            connection.exec_driver_sql('ALTER TABLE "transaction" ADD COLUMN category_override BOOLEAN NOT NULL DEFAULT 0')
        if "fingerprint" not in transaction_columns:
            connection.exec_driver_sql('ALTER TABLE "transaction" ADD COLUMN fingerprint TEXT DEFAULT ""')
            rows = connection.exec_driver_sql('SELECT id, date, description, amount, account FROM "transaction"').all()
            for row_id, transaction_date, description, amount, account in rows:
                normalized_description = " ".join(str(description or "").strip().lower().split())
                normalized_account = str(account or "unknown").strip().lower()
                fingerprint = f"{transaction_date}|{normalized_description}|{float(amount or 0):.2f}|{normalized_account}"
                connection.exec_driver_sql(
                    'UPDATE "transaction" SET fingerprint = ? WHERE id = ?',
                    (fingerprint, row_id),
                )
        columns = {row[1] for row in connection.exec_driver_sql("PRAGMA table_info(accountvaluesnapshot)").all()}
        for column_name, column_type, default_value in [
            ("notes", "TEXT", "''"),
        ]:
            if column_name not in columns:
                connection.exec_driver_sql(
                    f"ALTER TABLE accountvaluesnapshot ADD COLUMN {column_name} {column_type} DEFAULT {default_value}"
                )
        legacy_contribution_columns = [
            ("tfsa_contribution", "TFSA", 0),
            ("rrsp_contribution", "RRSP", 1),
            ("unregistered_contribution", "Unregistered", 2),
        ]
        if all(column_name in columns for column_name, _contribution_name, _display_order in legacy_contribution_columns):
            snapshots = connection.exec_driver_sql(
                "SELECT id, tfsa_contribution, rrsp_contribution, unregistered_contribution "
                "FROM accountvaluesnapshot"
            ).all()
            for snapshot in snapshots:
                snapshot_id = snapshot[0]
                for column_index, (_column_name, contribution_name, display_order) in enumerate(legacy_contribution_columns, start=1):
                    value = snapshot[column_index]
                    if not value:
                        continue
                    existing = connection.exec_driver_sql(
                        "SELECT id FROM accountvalueentry "
                        "WHERE snapshot_id = ? AND account_type = 'contribution' AND account_name = ?",
                        (snapshot_id, contribution_name),
                    ).first()
                    if existing is None:
                        connection.exec_driver_sql(
                            "INSERT INTO accountvalueentry "
                            "(snapshot_id, account_name, account_type, value, display_order) "
                            "VALUES (?, ?, 'contribution', ?, ?)",
                            (snapshot_id, contribution_name, value, display_order),
                        )
        account_contribution_entries = connection.exec_driver_sql(
            "SELECT id, account_name FROM accountvalueentry "
            "WHERE account_type = 'account' AND lower(account_name) LIKE '% contribution'"
        ).all()
        for entry_id, account_name in account_contribution_entries:
            contribution_name = account_name[:-len(" Contribution")].strip()
            if contribution_name:
                connection.exec_driver_sql(
                    "UPDATE accountvalueentry SET account_type = 'contribution', account_name = ? WHERE id = ?",
                    (contribution_name, entry_id),
                )
        session.commit()
