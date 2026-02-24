import uuid
from datetime import datetime
from sqlalchemy import String, Integer, DateTime, ForeignKey, Text, Enum, func, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base
import enum


class CellType(str, enum.Enum):
    text = "text"
    number = "number"
    formula = "formula"
    boolean = "boolean"
    date = "date"
    empty = "empty"


class Cell(Base):
    __tablename__ = "cells"
    __table_args__ = (
        UniqueConstraint("sheet_id", "row", "col", name="uq_cell_position"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    sheet_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sheets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    row: Mapped[int] = mapped_column(Integer, nullable=False)
    col: Mapped[int] = mapped_column(Integer, nullable=False)

    # Raw value or formula string (e.g. "=SUM(A1:A10)")
    raw_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Computed / display value (result of formula evaluation)
    computed_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    cell_type: Mapped[CellType] = mapped_column(
        Enum(CellType), nullable=False, default=CellType.empty
    )

    # Formatting stored as JSON string (font, color, alignment, etc.)
    format_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    sheet: Mapped["Sheet"] = relationship("Sheet", back_populates="cells")  # noqa: F821
