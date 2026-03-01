import uuid
from datetime import datetime
from pydantic import BaseModel


class FileRead(BaseModel):
    id: uuid.UUID
    original_name: str
    file_type: str
    file_size: int
    created_at: datetime

    model_config = {"from_attributes": True}
