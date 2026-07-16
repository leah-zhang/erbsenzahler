from typing import Optional
from sqlmodel import Field, SQLModel, Session, create_engine


class Transaction(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    date: str = Field(...)
    description: str = Field(...)
    amount: float = Field(...)
    category: str = Field(default="uncategorized")
    account: str = Field(default="unknown")


class Statement(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    filename: str = Field(...)
    uploaded_at: str = Field(...)
    parsed_format: str = Field(...)
    status: str = Field(default="received")


sqlite_file_name = "finance_tracker.db"
sqlite_url = f"sqlite:///{sqlite_file_name}"
engine = create_engine(sqlite_url, echo=False)


def create_db_and_tables() -> None:
    SQLModel.metadata.create_all(engine)
