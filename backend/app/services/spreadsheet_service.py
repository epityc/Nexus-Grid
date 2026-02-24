import json
import uuid
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.workbook import Workbook
from app.models.sheet import Sheet
from app.models.cell import Cell, CellType
from app.schemas.workbook import WorkbookCreate, WorkbookUpdate
from app.schemas.sheet import SheetCreate, SheetUpdate
from app.schemas.cell import CellCreate, CellUpdate, CellBatchUpdate


# ── Workbooks ──────────────────────────────────────────────────────────────────

async def list_workbooks(db: AsyncSession, owner_id: uuid.UUID) -> list[Workbook]:
    result = await db.execute(
        select(Workbook)
        .where(Workbook.owner_id == owner_id)
        .options(selectinload(Workbook.sheets))
        .order_by(Workbook.updated_at.desc())
    )
    return list(result.scalars().all())


async def get_workbook(db: AsyncSession, workbook_id: uuid.UUID) -> Workbook | None:
    result = await db.execute(
        select(Workbook)
        .where(Workbook.id == workbook_id)
        .options(selectinload(Workbook.sheets))
    )
    return result.scalar_one_or_none()


async def create_workbook(db: AsyncSession, owner_id: uuid.UUID, payload: WorkbookCreate) -> Workbook:
    workbook = Workbook(owner_id=owner_id, **payload.model_dump())
    db.add(workbook)
    await db.flush()

    # Create a default "Sheet1"
    sheet = Sheet(workbook_id=workbook.id, name="Sheet1", position=0)
    db.add(sheet)
    await db.flush()
    await db.refresh(workbook)
    return workbook


async def update_workbook(
    db: AsyncSession, workbook: Workbook, payload: WorkbookUpdate
) -> Workbook:
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(workbook, field, value)
    await db.flush()
    await db.refresh(workbook)
    return workbook


async def delete_workbook(db: AsyncSession, workbook: Workbook) -> None:
    await db.delete(workbook)
    await db.flush()


# ── Sheets ─────────────────────────────────────────────────────────────────────

async def list_sheets(db: AsyncSession, workbook_id: uuid.UUID) -> list[Sheet]:
    result = await db.execute(
        select(Sheet)
        .where(Sheet.workbook_id == workbook_id)
        .order_by(Sheet.position)
    )
    return list(result.scalars().all())


async def get_sheet(db: AsyncSession, sheet_id: uuid.UUID) -> Sheet | None:
    result = await db.execute(select(Sheet).where(Sheet.id == sheet_id))
    return result.scalar_one_or_none()


async def create_sheet(db: AsyncSession, workbook_id: uuid.UUID, payload: SheetCreate) -> Sheet:
    sheet = Sheet(workbook_id=workbook_id, **payload.model_dump())
    db.add(sheet)
    await db.flush()
    await db.refresh(sheet)
    return sheet


async def update_sheet(db: AsyncSession, sheet: Sheet, payload: SheetUpdate) -> Sheet:
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(sheet, field, value)
    await db.flush()
    await db.refresh(sheet)
    return sheet


async def delete_sheet(db: AsyncSession, sheet: Sheet) -> None:
    await db.delete(sheet)
    await db.flush()


# ── Cells ──────────────────────────────────────────────────────────────────────

async def get_cells(
    db: AsyncSession,
    sheet_id: uuid.UUID,
    row_start: int = 0,
    row_end: int = 999,
    col_start: int = 0,
    col_end: int = 25,
) -> list[Cell]:
    result = await db.execute(
        select(Cell)
        .where(
            Cell.sheet_id == sheet_id,
            Cell.row >= row_start,
            Cell.row <= row_end,
            Cell.col >= col_start,
            Cell.col <= col_end,
        )
        .order_by(Cell.row, Cell.col)
    )
    return list(result.scalars().all())


async def get_cell(db: AsyncSession, sheet_id: uuid.UUID, row: int, col: int) -> Cell | None:
    result = await db.execute(
        select(Cell).where(Cell.sheet_id == sheet_id, Cell.row == row, Cell.col == col)
    )
    return result.scalar_one_or_none()


def _infer_cell_type(raw_value: str | None) -> CellType:
    if not raw_value:
        return CellType.empty
    if raw_value.startswith("="):
        return CellType.formula
    if raw_value.lower() in ("true", "false"):
        return CellType.boolean
    try:
        float(raw_value)
        return CellType.number
    except ValueError:
        pass
    return CellType.text


async def upsert_cell(db: AsyncSession, sheet_id: uuid.UUID, payload: CellCreate) -> Cell:
    cell = await get_cell(db, sheet_id, payload.row, payload.col)
    cell_type = payload.cell_type if payload.cell_type != CellType.empty else _infer_cell_type(payload.raw_value)
    format_json = payload.format.model_dump_json() if payload.format else None

    if cell is None:
        cell = Cell(
            sheet_id=sheet_id,
            row=payload.row,
            col=payload.col,
            raw_value=payload.raw_value,
            computed_value=payload.raw_value,  # formula eval handled separately
            cell_type=cell_type,
            format_json=format_json,
        )
        db.add(cell)
    else:
        cell.raw_value = payload.raw_value
        cell.computed_value = payload.raw_value
        cell.cell_type = cell_type
        if format_json is not None:
            cell.format_json = format_json

    await db.flush()
    await db.refresh(cell)
    return cell


async def batch_upsert_cells(
    db: AsyncSession, sheet_id: uuid.UUID, payload: CellBatchUpdate
) -> list[Cell]:
    return [await upsert_cell(db, sheet_id, c) for c in payload.cells]


async def delete_cell(db: AsyncSession, sheet_id: uuid.UUID, row: int, col: int) -> bool:
    result = await db.execute(
        delete(Cell).where(Cell.sheet_id == sheet_id, Cell.row == row, Cell.col == col)
    )
    return result.rowcount > 0


async def clear_range(
    db: AsyncSession,
    sheet_id: uuid.UUID,
    row_start: int,
    row_end: int,
    col_start: int,
    col_end: int,
) -> int:
    result = await db.execute(
        delete(Cell).where(
            Cell.sheet_id == sheet_id,
            Cell.row >= row_start,
            Cell.row <= row_end,
            Cell.col >= col_start,
            Cell.col <= col_end,
        )
    )
    return result.rowcount
