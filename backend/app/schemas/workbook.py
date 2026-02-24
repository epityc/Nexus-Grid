import uuid
from datetime import datetime
from pydantic import BaseModel
from app.schemas.sheet import SheetRead


class WorkbookCreate(BaseModel):
    name: str
    description: str | None = None
    is_public: bool = False


class WorkbookRead(BaseModel):
    id: uuid.UUID
    owner_id: uuid.UUID
    name: str
    description: str | None
    is_public: bool
    created_at: datetime
    updated_at: datetime
    sheets: list[SheetRead] = []

    model_config = {"from_attributes": True}


class WorkbookUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    is_public: bool | None = None
