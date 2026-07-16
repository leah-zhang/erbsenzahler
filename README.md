# Erbsenzahler

A monthly finance tracker MVP with:
- a FastAPI backend for statement ingestion and analysis,
- a React frontend for dashboards and monthly reporting,
- a Playwright-based workflow for browser-driven statement downloads after manual login.

## Project structure
- backend/: FastAPI application and statement processing services
- frontend/: React + Vite frontend

## Backend setup
1. cd backend
2. python -m venv .venv
3. .venv\Scripts\activate
4. pip install -r requirements.txt
5. uvicorn app.main:app --reload

## Frontend setup
1. cd frontend
2. npm install
3. npm run dev

## Notes
- The automation flow is intentionally paused for manual login to keep the process secure.
- The initial implementation focuses on file intake and a clean project scaffold.
