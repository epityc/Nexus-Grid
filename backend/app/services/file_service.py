"""
File service — handles parsing and storage of uploaded files.
Supported formats: PDF, CSV, XLSX, XLS, TXT
"""
import csv
import io
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.file import UploadedFile

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
ALLOWED_EXTENSIONS = {"pdf", "csv", "xlsx", "xls", "txt"}


def _extension(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


def _parse_txt(content: bytes) -> str:
    return content.decode("utf-8", errors="replace")


def _parse_csv(content: bytes) -> str:
    text = content.decode("utf-8", errors="replace")
    reader = csv.reader(io.StringIO(text))
    return "\n".join(",".join(row) for row in reader)


def _parse_pdf(content: bytes) -> str:
    import pypdf

    reader = pypdf.PdfReader(io.BytesIO(content))
    pages = []
    for page in reader.pages:
        text = page.extract_text()
        if text:
            pages.append(text.strip())
    return "\n\n".join(pages)


def _parse_xlsx(content: bytes) -> str:
    import openpyxl

    wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    lines = []
    for ws in wb.worksheets:
        lines.append(f"[Feuille: {ws.title}]")
        for row in ws.iter_rows(values_only=True):
            lines.append(",".join("" if c is None else str(c) for c in row))
    wb.close()
    return "\n".join(lines)


def _parse_xls(content: bytes) -> str:
    import xlrd

    wb = xlrd.open_workbook(file_contents=content)
    lines = []
    for sheet in wb.sheets():
        lines.append(f"[Feuille: {sheet.name}]")
        for row_idx in range(sheet.nrows):
            lines.append(
                ",".join(str(sheet.cell_value(row_idx, col)) for col in range(sheet.ncols))
            )
    return "\n".join(lines)


def extract_text(content: bytes, filename: str) -> str:
    """Parse a file and return its text content."""
    ext = _extension(filename)
    if ext == "pdf":
        return _parse_pdf(content)
    if ext == "csv":
        return _parse_csv(content)
    if ext == "xlsx":
        return _parse_xlsx(content)
    if ext == "xls":
        return _parse_xls(content)
    if ext == "txt":
        return _parse_txt(content)
    return ""


# ── DB operations ────────────────────────────────────────────────────────────

async def create_file(
    db: AsyncSession,
    user_id: uuid.UUID,
    original_name: str,
    file_type: str,
    file_size: int,
    extracted_text: str,
) -> UploadedFile:
    f = UploadedFile(
        user_id=user_id,
        original_name=original_name,
        file_type=file_type,
        file_size=file_size,
        extracted_text=extracted_text,
    )
    db.add(f)
    await db.commit()
    await db.refresh(f)
    return f


async def list_files(db: AsyncSession, user_id: uuid.UUID) -> list[UploadedFile]:
    result = await db.execute(
        select(UploadedFile)
        .where(UploadedFile.user_id == user_id)
        .order_by(UploadedFile.created_at.desc())
    )
    return list(result.scalars().all())


async def get_file(
    db: AsyncSession, file_id: uuid.UUID, user_id: uuid.UUID
) -> UploadedFile | None:
    result = await db.execute(
        select(UploadedFile).where(
            UploadedFile.id == file_id,
            UploadedFile.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def delete_file(db: AsyncSession, file_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    f = await get_file(db, file_id, user_id)
    if not f:
        return False
    await db.delete(f)
    await db.commit()
    return True
