"""
AI endpoints — powered by Anthropic Claude.

POST /ai/formula          Generate a formula from natural language
POST /ai/explain          Explain an existing formula
POST /ai/analyze          Analyze sheet data and answer questions
POST /ai/suggest          Suggest column values
POST /ai/query            Natural language query over sheet data
"""
import uuid
from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.user import User
from app.services import ai_service, spreadsheet_service

router = APIRouter(prefix="/ai", tags=["ai"])


class FormulaRequest(BaseModel):
    description: str
    context: str | None = None


class FormulaResponse(BaseModel):
    formula: str


class ExplainRequest(BaseModel):
    formula: str


class ExplainResponse(BaseModel):
    explanation: str


class AnalyzeRequest(BaseModel):
    sheet_id: uuid.UUID
    question: str | None = None
    row_start: int = 0
    row_end: int = 199
    col_start: int = 0
    col_end: int = 25


class AnalyzeResponse(BaseModel):
    insight: str


class SuggestRequest(BaseModel):
    column_name: str
    existing_values: list[str]
    count: int = 5


class SuggestResponse(BaseModel):
    suggestions: list[str]


class QueryRequest(BaseModel):
    sheet_id: uuid.UUID
    query: str
    row_start: int = 0
    row_end: int = 499
    col_start: int = 0
    col_end: int = 25


class QueryResponse(BaseModel):
    answer: str


def _cells_to_grid(cells, row_start: int, col_start: int) -> list[list[Any]]:
    if not cells:
        return []
    max_row = max(c.row for c in cells)
    max_col = max(c.col for c in cells)
    grid: list[list[Any]] = [
        ["" for _ in range(max_col - col_start + 1)] for _ in range(max_row - row_start + 1)
    ]
    for cell in cells:
        r = cell.row - row_start
        c = cell.col - col_start
        grid[r][c] = cell.computed_value or cell.raw_value or ""
    return grid


@router.post("/formula", response_model=FormulaResponse)
async def generate_formula(
    payload: FormulaRequest,
    current_user: User = Depends(get_current_user),
):
    formula = await ai_service.generate_formula(payload.description, payload.context)
    return FormulaResponse(formula=formula)


@router.post("/explain", response_model=ExplainResponse)
async def explain_formula(
    payload: ExplainRequest,
    current_user: User = Depends(get_current_user),
):
    explanation = await ai_service.explain_formula(payload.formula)
    return ExplainResponse(explanation=explanation)


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_data(
    payload: AnalyzeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sheet = await spreadsheet_service.get_sheet(db, payload.sheet_id)
    if not sheet:
        raise HTTPException(status_code=404, detail="Sheet not found")
    workbook = await spreadsheet_service.get_workbook(db, sheet.workbook_id)
    if not workbook or workbook.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    cells = await spreadsheet_service.get_cells(
        db, payload.sheet_id, payload.row_start, payload.row_end, payload.col_start, payload.col_end
    )
    grid = _cells_to_grid(cells, payload.row_start, payload.col_start)
    insight = await ai_service.analyze_data(grid, payload.question)
    return AnalyzeResponse(insight=insight)


@router.post("/suggest", response_model=SuggestResponse)
async def suggest_values(
    payload: SuggestRequest,
    current_user: User = Depends(get_current_user),
):
    suggestions = await ai_service.suggest_values(
        payload.column_name, payload.existing_values, payload.count
    )
    return SuggestResponse(suggestions=suggestions)


@router.post("/query", response_model=QueryResponse)
async def natural_language_query(
    payload: QueryRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sheet = await spreadsheet_service.get_sheet(db, payload.sheet_id)
    if not sheet:
        raise HTTPException(status_code=404, detail="Sheet not found")
    workbook = await spreadsheet_service.get_workbook(db, sheet.workbook_id)
    if not workbook or workbook.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    cells = await spreadsheet_service.get_cells(
        db, payload.sheet_id, payload.row_start, payload.row_end, payload.col_start, payload.col_end
    )
    grid = _cells_to_grid(cells, payload.row_start, payload.col_start)
    answer = await ai_service.natural_language_query(grid, payload.query)
    return QueryResponse(answer=answer)
