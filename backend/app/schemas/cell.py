import uuid
from datetime import datetime
from pydantic import BaseModel
from app.models.cell import CellType


class CellFormat(BaseModel):
    bold: bool = False
    italic: bool = False
    underline: bool = False
    font_size: int = 12
    font_color: str = "#000000"
    background_color: str = "#ffffff"
    text_align: str = "left"
    number_format: str | None = None


class CellCreate(BaseModel):
    row: int
    col: int
    raw_value: str | None = None
    cell_type: CellType = CellType.empty
    format: CellFormat | None = None


class CellRead(BaseModel):
    id: uuid.UUID
    sheet_id: uuid.UUID
    row: int
    col: int
    raw_value: str | None
    computed_value: str | None
    cell_type: CellType
    format_json: str | None
    updated_at: datetime

    model_config = {"from_attributes": True}


class CellUpdate(BaseModel):
    raw_value: str | None = None
    cell_type: CellType | None = None
    format: CellFormat | None = None


class CellBatchUpdate(BaseModel):
    cells: list[CellCreate]
