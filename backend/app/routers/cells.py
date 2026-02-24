import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.user import User
from app.schemas.cell import CellCreate, CellRead, CellBatchUpdate
from app.services import spreadsheet_service

router = APIRouter(prefix="/sheets/{sheet_id}/cells", tags=["cells"])


async def _get_sheet_or_404(sheet_id: uuid.UUID, db: AsyncSession, user: User):
    sheet = await spreadsheet_service.get_sheet(db, sheet_id)
    if not sheet:
        raise HTTPException(status_code=404, detail="Sheet not found")
    workbook = await spreadsheet_service.get_workbook(db, sheet.workbook_id)
    if not workbook or workbook.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    return sheet


@router.get("", response_model=list[CellRead])
async def get_cells(
    sheet_id: uuid.UUID,
    row_start: int = Query(0, ge=0),
    row_end: int = Query(999, ge=0),
    col_start: int = Query(0, ge=0),
    col_end: int = Query(25, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_sheet_or_404(sheet_id, db, current_user)
    return await spreadsheet_service.get_cells(db, sheet_id, row_start, row_end, col_start, col_end)


@router.put("", response_model=list[CellRead])
async def batch_update_cells(
    sheet_id: uuid.UUID,
    payload: CellBatchUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_sheet_or_404(sheet_id, db, current_user)
    return await spreadsheet_service.batch_upsert_cells(db, sheet_id, payload)


@router.put("/{row}/{col}", response_model=CellRead)
async def upsert_cell(
    sheet_id: uuid.UUID,
    row: int,
    col: int,
    payload: CellCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_sheet_or_404(sheet_id, db, current_user)
    payload.row = row
    payload.col = col
    return await spreadsheet_service.upsert_cell(db, sheet_id, payload)


@router.delete("/{row}/{col}", status_code=204)
async def delete_cell(
    sheet_id: uuid.UUID,
    row: int,
    col: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_sheet_or_404(sheet_id, db, current_user)
    deleted = await spreadsheet_service.delete_cell(db, sheet_id, row, col)
    if not deleted:
        raise HTTPException(status_code=404, detail="Cell not found")


@router.delete("", status_code=204)
async def clear_range(
    sheet_id: uuid.UUID,
    row_start: int = Query(..., ge=0),
    row_end: int = Query(..., ge=0),
    col_start: int = Query(..., ge=0),
    col_end: int = Query(..., ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_sheet_or_404(sheet_id, db, current_user)
    await spreadsheet_service.clear_range(db, sheet_id, row_start, row_end, col_start, col_end)
