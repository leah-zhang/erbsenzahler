# AGENTS.md

## Project Overview

Erbsenzahler is a monthly finance tracker MVP. It has a FastAPI backend for statement upload, parsing, analytics, and browser-assisted statement download, plus a Vite/React frontend for the dashboard.

## Repository Layout

- `backend/` contains the FastAPI app, SQLModel models, statement parsing, analytics, automation services, tests, and the local SQLite database.
- `frontend/` contains the React + Vite app.
- `README.md` has setup instructions for both apps.

## Backend Notes

- Run backend commands from `backend/`.
- Install dependencies with `pip install -r requirements.txt`.
- Start the API with `uvicorn app.main:app --reload`.
- The API is configured for the frontend dev origin `http://localhost:5173`.
- Uploaded files are written under `storage/uploads`; automated downloads target `storage/downloads`.
- `backend/app/main.py` defines the public API routes.
- `backend/app/services/parser.py` currently supports CSV and stubs PDF parsing.
- `backend/app/services/analysis.py` creates monthly spend summaries.
- `backend/app/services/statement_automation.py` starts a browser-assisted CIBC workflow and intentionally keeps login manual.

## Frontend Notes

- Run frontend commands from `frontend/`.
- Install dependencies with `npm install`.
- Start the frontend with `npm run dev`.
- Build with `npm run build`.
- The app calls the backend at `http://localhost:8000`; keep route changes coordinated with `backend/app/main.py`.

## Testing And Verification

- Backend tests use Python `unittest`; run them from `backend/`.
- Frontend verification should at minimum include `npm run build`.
- When changing backend responses, update the frontend data handling in `frontend/src/App.jsx`.

## Working Guidelines

- Preserve the small, direct architecture unless a feature clearly needs more structure.
- Keep browser automation user-assisted; do not add credential storage or automated login.
- Avoid committing local runtime data such as SQLite databases, uploads, downloads, virtual environments, or dependency folders.
- Be careful with existing user changes in this repo; check `git status --short` before making broad edits.
