# Erbsenzahler

Erbsenzahler is a local monthly finance tracker MVP. It combines a FastAPI backend for CSV ingestion, merchant categorization, account value tracking, and analytics with a React/Vite frontend for importing statements, managing spend categories, reviewing spend trends, and tracking account balances.

## Features

- CSV statement import with column preview and manual mapping.
- Duplicate transaction review during import.
- Merchant grouping and saved merchant-to-category rules.
- Category management, including rename, merchant removal, and uncategorized merchant assignment.
- Spend analytics with monthly totals, last-30-day summaries, weekly spend bars, and category/merchant transaction tooltips.
- Account value tracking by year, including accounts, investment contributions, projected/actual/diff values, and CSV import.
- Local SQLite persistence.

## Project Structure

- `backend/`: FastAPI app, SQLModel models, CSV parsing, categorization, analytics, account value import, and unittest tests.
- `frontend/`: React + Vite app for import, category management, analytics, and account tracking.

## Backend Setup

Run backend commands from `backend/`.

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The API runs at `http://localhost:8000` by default and allows the frontend dev origin `http://localhost:5173`.

## Frontend Setup

Run frontend commands from `frontend/`.

```powershell
cd frontend
npm install
npm run dev
```

The frontend dev server runs at `http://localhost:5173` by default and calls the backend at `http://localhost:8000`.

## CSV Imports

Statement imports currently support CSV files. In the Import tab, manual column mapping supports:

- `Date`
- `Description`
- `Amount`
- `Account`

`Date`, `Description`, and `Amount` are required for manual mapping. `Account` is optional and defaults to `bank` when omitted.

For headered CSVs without manual mapping, the backend can still auto-detect common headers including `Date`, `Description`, `Amount`, `Debit`, `Credit`, `Category`, and `Account`.

Uploaded statement files are stored under `backend/storage/uploads/`.

## API Overview

Core backend routes include:

- `POST /api/statements/upload`
- `POST /api/statements/upload/duplicates/{batch_id}`
- `GET /api/analytics/monthly`
- `GET /api/transactions/categorization-suggestions`
- `GET /api/transactions/category-dashboard`
- `GET /api/transactions/category-details`
- `POST /api/transactions/categorize`
- `PATCH /api/transactions/categories`
- `POST /api/transactions/categories/remove-merchant`
- `GET /api/account-values`
- `POST /api/account-values`
- `PATCH /api/account-values/{snapshot_id}`
- `DELETE /api/account-values/{snapshot_id}`
- `POST /api/account-values/import`

Maintenance routes:

- `DELETE /api/transactions`
- `DELETE /api/transactions/categories`
- `DELETE /api/database`

## Testing And Verification

Backend tests use Python `unittest`:

```powershell
cd backend
python -m unittest discover -s tests
```

Frontend verification:

```powershell
cd frontend
npm run build
```

On Windows PowerShell, if `npm run build` is blocked by script execution policy, use:

```powershell
npm.cmd run build
```

## Data And Runtime Files

Runtime data is local and should not be committed:

- `backend/finance_tracker.db`
- `backend/storage/uploads/`
- `backend/storage/downloads/`
- virtual environments
- dependency folders such as `node_modules/`

## Notes

- Browser-assisted bank automation has been removed.
- The app does not store banking credentials.
- PDF statement parsing is stubbed; CSV is the supported import format.
