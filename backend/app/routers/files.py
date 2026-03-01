"""
File memory endpoints.

POST   /files/upload          Upload a file (PDF, CSV, XLSX, XLS, TXT)
GET    /files                 List user's uploaded files
GET    /files/{id}/parse      Parse a tabular file → 2D grid + separator info
DELETE /files/{file_id}       Delete a file
"""
import uuid
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.middleware.security import limiter
from app.models.user import User
from app.schemas.file import FileRead
from app.services import file_service

router = APIRouter(prefix="/files", tags=["files"])


class ParseResponse(BaseModel):
    separator: str | None
    rows: int
    cols: int
    data: list[list[str]]


@router.post("/upload", response_model=FileRead, status_code=201)
@limiter.limit("10/minute")
async def upload_file(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    filename = file.filename or "fichier"
    ext = file_service._extension(filename)

    if ext not in file_service.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Format non supporté. Formats acceptés : {', '.join(sorted(file_service.ALLOWED_EXTENSIONS))}",
        )

    content = await file.read()

    if len(content) > file_service.MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="Fichier trop volumineux (max 10 Mo)")

    # Validate file signature (magic bytes) to prevent extension spoofing
    if not file_service.validate_file_signature(content, ext):
        raise HTTPException(status_code=400, detail="Le contenu du fichier ne correspond pas à son extension")

    try:
        extracted_text = file_service.extract_text(content, filename)
        structured_data = file_service.extract_structured(content, filename)
    except Exception:
        raise HTTPException(status_code=422, detail="Impossible de lire ce fichier")

    uploaded = await file_service.create_file(
        db,
        user_id=current_user.id,
        original_name=filename,
        file_type=ext,
        file_size=len(content),
        extracted_text=extracted_text,
        structured_data=structured_data,
    )
    return uploaded


@router.get("", response_model=list[FileRead])
async def list_files(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await file_service.list_files(db, current_user.id)


@router.get("/{file_id}/parse", response_model=ParseResponse)
async def parse_file(
    file_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the parsed 2D grid for a tabular file (CSV, XLSX, XLS)."""
    f = await file_service.get_file(db, file_id, current_user.id)
    if not f:
        raise HTTPException(status_code=404, detail="Fichier introuvable")
    if f.file_type not in file_service.TABULAR_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Ce format ne peut pas être importé en tableau")

    sep, rows = file_service.get_grid_from_file(f)
    if not rows:
        raise HTTPException(status_code=422, detail="Impossible de lire les données de ce fichier")

    max_cols = max((len(r) for r in rows), default=0)
    return ParseResponse(
        separator=sep,
        rows=len(rows),
        cols=max_cols,
        data=rows[:1000],  # cap at 1000 rows for preview/import
    )


@router.delete("/{file_id}", status_code=204)
async def delete_file(
    file_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    deleted = await file_service.delete_file(db, file_id, current_user.id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Fichier introuvable")
