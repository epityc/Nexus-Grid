# Nexus Grid

AI-powered spreadsheet — an intelligent alternative to Excel, built with FastAPI and Claude.

## Stack

| Layer | Technology |
|-------|-----------|
| API | FastAPI (Python 3.12, async) |
| ORM | SQLAlchemy 2 + Alembic |
| Database | PostgreSQL 16 |
| Cache | Redis 7 |
| Auth | JWT (access + refresh tokens) |
| AI | Anthropic Claude (claude-sonnet-4-6) |

## Features

- **Workbooks & Sheets** — full CRUD, multi-sheet workbooks
- **Cells** — upsert individual cells or batch-update ranges; auto-detects type (text / number / formula / boolean)
- **AI Formula Generation** — describe what you want → get an Excel-compatible formula
- **AI Formula Explanation** — understand any formula in plain language
- **AI Data Analysis** — ask questions about your data in natural language
- **AI Value Suggestions** — autocomplete column values based on patterns
- **Natural Language Queries** — query sheet data conversationally

## Quick Start

```bash
# 1. Clone & configure
cp backend/.env.example backend/.env
# Edit backend/.env — set ANTHROPIC_API_KEY and SECRET_KEY

# 2. Start services
docker compose up --build

# API available at http://localhost:8000
# Interactive docs at http://localhost:8000/docs
```

## API Overview

```
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh

GET    /api/v1/workbooks
POST   /api/v1/workbooks
GET    /api/v1/workbooks/{id}
PATCH  /api/v1/workbooks/{id}
DELETE /api/v1/workbooks/{id}

GET    /api/v1/workbooks/{id}/sheets
POST   /api/v1/workbooks/{id}/sheets
PATCH  /api/v1/workbooks/{id}/sheets/{sheet_id}
DELETE /api/v1/workbooks/{id}/sheets/{sheet_id}

GET    /api/v1/sheets/{sheet_id}/cells          # range query
PUT    /api/v1/sheets/{sheet_id}/cells          # batch upsert
PUT    /api/v1/sheets/{sheet_id}/cells/{r}/{c}  # single cell upsert
DELETE /api/v1/sheets/{sheet_id}/cells/{r}/{c}
DELETE /api/v1/sheets/{sheet_id}/cells          # clear range

POST   /api/v1/ai/formula    # natural language → formula
POST   /api/v1/ai/explain    # formula → explanation
POST   /api/v1/ai/analyze    # data analysis / insights
POST   /api/v1/ai/suggest    # column value suggestions
POST   /api/v1/ai/query      # natural language data query
```

## Development

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Run migrations
alembic upgrade head

# Start dev server
uvicorn app.main:app --reload

# Run tests
pytest tests/ -v --cov=app
```

## Project Structure

```
backend/
├── app/
│   ├── main.py              # FastAPI app + lifespan
│   ├── config.py            # Settings (pydantic-settings)
│   ├── database.py          # Async SQLAlchemy engine + session
│   ├── models/              # SQLAlchemy ORM models
│   ├── schemas/             # Pydantic request/response schemas
│   ├── routers/             # API route handlers
│   ├── services/            # Business logic
│   └── middleware/          # Auth dependency
├── migrations/              # Alembic migrations
└── tests/                   # pytest-asyncio test suite
```
