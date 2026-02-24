import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.user import User
from app.schemas.workbook import WorkbookCreate, WorkbookRead, WorkbookUpdate
from app.services import spreadsheet_service

router = APIRouter(prefix="/workbooks", tags=["workbooks"])


def _check_ownership(workbook, user: User) -> None:
    if workbook.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your workbook")


@router.get("", response_model=list[WorkbookRead])
async def list_workbooks(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await spreadsheet_service.list_workbooks(db, current_user.id)


@router.post("", response_model=WorkbookRead, status_code=status.HTTP_201_CREATED)
async def create_workbook(
    payload: WorkbookCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await spreadsheet_service.create_workbook(db, current_user.id, payload)


@router.get("/{workbook_id}", response_model=WorkbookRead)
async def get_workbook(
    workbook_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    workbook = await spreadsheet_service.get_workbook(db, workbook_id)
    if not workbook:
        raise HTTPException(status_code=404, detail="Workbook not found")
    if not workbook.is_public:
        _check_ownership(workbook, current_user)
    return workbook


@router.patch("/{workbook_id}", response_model=WorkbookRead)
async def update_workbook(
    workbook_id: uuid.UUID,
    payload: WorkbookUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    workbook = await spreadsheet_service.get_workbook(db, workbook_id)
    if not workbook:
        raise HTTPException(status_code=404, detail="Workbook not found")
    _check_ownership(workbook, current_user)
    return await spreadsheet_service.update_workbook(db, workbook, payload)


@router.delete("/{workbook_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workbook(
    workbook_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    workbook = await spreadsheet_service.get_workbook(db, workbook_id)
    if not workbook:
        raise HTTPException(status_code=404, detail="Workbook not found")
    _check_ownership(workbook, current_user)
    await spreadsheet_service.delete_workbook(db, workbook)
