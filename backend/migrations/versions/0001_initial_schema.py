"""Initial schema

Revision ID: 0001
Revises:
Create Date: 2026-02-24
"""
from typing import Sequence, Union
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("username", sa.String(50), nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("is_verified", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
        sa.UniqueConstraint("username"),
    )
    op.create_index("ix_users_email", "users", ["email"])
    op.create_index("ix_users_username", "users", ["username"])

    op.create_table(
        "workbooks",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_public", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_workbooks_owner_id", "workbooks", ["owner_id"])

    op.create_table(
        "sheets",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("workbook_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("row_count", sa.Integer(), nullable=False, server_default="1000"),
        sa.Column("col_count", sa.Integer(), nullable=False, server_default="26"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["workbook_id"], ["workbooks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_sheets_workbook_id", "sheets", ["workbook_id"])

    cell_type_enum = postgresql.ENUM(
        "text", "number", "formula", "boolean", "date", "empty",
        name="celltype",
    )
    cell_type_enum.create(op.get_bind())

    op.create_table(
        "cells",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("sheet_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("row", sa.Integer(), nullable=False),
        sa.Column("col", sa.Integer(), nullable=False),
        sa.Column("raw_value", sa.Text(), nullable=True),
        sa.Column("computed_value", sa.Text(), nullable=True),
        sa.Column("cell_type", sa.Enum("text", "number", "formula", "boolean", "date", "empty", name="celltype"), nullable=False),
        sa.Column("format_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["sheet_id"], ["sheets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("sheet_id", "row", "col", name="uq_cell_position"),
    )
    op.create_index("ix_cells_sheet_id", "cells", ["sheet_id"])


def downgrade() -> None:
    op.drop_table("cells")
    op.execute("DROP TYPE IF EXISTS celltype")
    op.drop_table("sheets")
    op.drop_table("workbooks")
    op.drop_table("users")
