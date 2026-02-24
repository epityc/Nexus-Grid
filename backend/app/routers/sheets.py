import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.user import User
from app.schemas.sheet import SheetCreate, SheetRead, SheetUpdate
from app.services import spreadsheet_service

router = APIRouter(prefix="/workbooks/{workbook_id}/sheets", tags=["sheets"])


async def _get_workbook_or_404(workbook_id: uuid.UUID, db: AsyncSession, user: User):
    workbook = await spreadsheet_service.get_workbook(db, workbook_id)
    if not workbook:
        raise HTTPException(status_code=404, detail="Workbook not found")
    if workbook.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Not your workbook")
    return workbook


@router.get("", response_model=list[SheetRead])
async def list_sheets(
    workbook_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_workbook_or_404(workbook_id, db, current_user)
    return await spreadsheet_service.list_sheets(db, workbook_id)


@router.post("", response_model=SheetRead, status_code=status.HTTP_201_CREATED)
async def create_sheet(
    workbook_id: uuid.UUID,
    payload: SheetCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_workbook_or_404(workbook_id, db, current_user)
    return await spreadsheet_service.create_sheet(db, workbook_id, payload)


@router.get("/{sheet_id}", response_model=SheetRead)
async def get_sheet(
    workbook_id: uuid.UUID,
    sheet_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_workbook_or_404(workbook_id, db, current_user)
    sheet = await spreadsheet_service.get_sheet(db, sheet_id)
    if not sheet or sheet.workbook_id != workbook_id:
        raise HTTPException(status_code=404, detail="Sheet not found")
    return sheet


@router.patch("/{sheet_id}", response_model=SheetRead)
async def update_sheet(
    workbook_id: uuid.UUID,
    sheet_id: uuid.UUID,
    payload: SheetUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_workbook_or_404(workbook_id, db, current_user)
    sheet = await spreadsheet_service.get_sheet(db, sheet_id)
    if not sheet or sheet.workbook_id != workbook_id:
        raise HTTPException(status_code=404, detail="Sheet not found")
    return await spreadsheet_service.update_sheet(db, sheet, payload)


@router.delete("/{sheet_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sheet(
    workbook_id: uuid.UUID,
    sheet_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_workbook_or_404(workbook_id, db, current_user)
    sheet = await spreadsheet_service.get_sheet(db, sheet_id)
    if not sheet or sheet.workbook_id != workbook_id:
        raise HTTPException(status_code=404, detail="Sheet not found")
    await spreadsheet_service.delete_sheet(db, sheet)
