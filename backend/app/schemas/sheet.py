import uuid
from datetime import datetime
from pydantic import BaseModel


class SheetCreate(BaseModel):
    name: str
    position: int = 0
    row_count: int = 1000
    col_count: int = 26


class SheetRead(BaseModel):
    id: uuid.UUID
    workbook_id: uuid.UUID
    name: str
    position: int
    row_count: int
    col_count: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SheetUpdate(BaseModel):
    name: str | None = None
    position: int | None = None
    row_count: int | None = None
    col_count: int | None = None
