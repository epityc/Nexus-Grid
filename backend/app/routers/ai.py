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
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.middleware.security import limiter
from app.models.user import User
from app.services import ai_service, spreadsheet_service, file_service

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


class ChatRequest(BaseModel):
    message: str
    file_ids: list[uuid.UUID] = []


class ChatResponse(BaseModel):
    answer: str


class ImportRequest(BaseModel):
    file_id: uuid.UUID
    instruction: str


class ImportResponse(BaseModel):
    data: list[list[str]]
    summary: str
    rows: int
    cols: int


class ComputeRequest(BaseModel):
    instruction: str
    spreadsheet_csv: str = ""
    selected_cell: str = ""


class ComputeResponse(BaseModel):
    type: str  # "formula" | "value" | "explanation"
    content: str
    explanation: str


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
@limiter.limit("30/minute")
async def generate_formula(
    request: Request,
    payload: FormulaRequest,
    current_user: User = Depends(get_current_user),
):
    formula = await ai_service.generate_formula(payload.description, payload.context)
    return FormulaResponse(formula=formula)


@router.post("/explain", response_model=ExplainResponse)
@limiter.limit("30/minute")
async def explain_formula(
    request: Request,
    payload: ExplainRequest,
    current_user: User = Depends(get_current_user),
):
    explanation = await ai_service.explain_formula(payload.formula)
    return ExplainResponse(explanation=explanation)


@router.post("/analyze", response_model=AnalyzeResponse)
@limiter.limit("20/minute")
async def analyze_data(
    request: Request,
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
@limiter.limit("30/minute")
async def suggest_values(
    request: Request,
    payload: SuggestRequest,
    current_user: User = Depends(get_current_user),
):
    suggestions = await ai_service.suggest_values(
        payload.column_name, payload.existing_values, payload.count
    )
    return SuggestResponse(suggestions=suggestions)


@router.post("/import", response_model=ImportResponse)
@limiter.limit("10/minute")
async def ai_import(
    request: Request,
    payload: ImportRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """AI-assisted tabular import: cleans/transforms a file according to user instruction."""
    f = await file_service.get_file(db, payload.file_id, current_user.id)
    if not f:
        raise HTTPException(status_code=404, detail="Fichier introuvable")
    if f.file_type not in file_service.TABULAR_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Ce format ne peut pas être importé en tableau")

    _, rows = file_service.get_grid_from_file(f)
    if not rows:
        raise HTTPException(status_code=422, detail="Impossible de lire les données de ce fichier")

    # Build a CSV preview to send to the AI (limit to 500 rows to stay within token budget)
    import csv, io
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerows(rows[:500])
    csv_text = buf.getvalue()

    data, summary = await ai_service.clean_and_import_csv(csv_text, payload.instruction)
    max_cols = max((len(r) for r in data), default=0)
    return ImportResponse(data=data, summary=summary, rows=len(data), cols=max_cols)


@router.post("/chat", response_model=ChatResponse)
@limiter.limit("20/minute")
async def chat(
    request: Request,
    payload: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    file_contexts: list[str] = []
    for fid in payload.file_ids:
        f = await file_service.get_file(db, fid, current_user.id)
        if f and f.extracted_text:
            file_contexts.append(f"{f.original_name}:\n{f.extracted_text}")

    answer = await ai_service.chat_with_files(payload.message, file_contexts)
    return ChatResponse(answer=answer)


@router.post("/query", response_model=QueryResponse)
@limiter.limit("20/minute")
async def natural_language_query(
    request: Request,
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


@router.post("/compute", response_model=ComputeResponse)
@limiter.limit("30/minute")
async def compute(
    request: Request,
    payload: ComputeRequest,
    current_user: User = Depends(get_current_user),
):
    """Generate a formula or value with full spreadsheet context."""
    result = await ai_service.compute_with_spreadsheet(
        payload.instruction,
        payload.spreadsheet_csv,
        payload.selected_cell,
    )
    return ComputeResponse(**result)
