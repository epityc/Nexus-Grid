"""
File memory endpoints.

POST   /files/upload     Upload a file (PDF, CSV, XLSX, XLS, TXT)
GET    /files            List user's uploaded files
DELETE /files/{file_id}  Delete a file
"""
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.user import User
from app.schemas.file import FileRead
from app.services import file_service

router = APIRouter(prefix="/files", tags=["files"])


@router.post("/upload", response_model=FileRead, status_code=201)
async def upload_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    filename = file.filename or "fichier"
    ext = file_service._extension(filename)

    if ext not in file_service.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Format non supporté. Formats acceptés : {', '.join(file_service.ALLOWED_EXTENSIONS)}",
        )

    content = await file.read()

    if len(content) > file_service.MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="Fichier trop volumineux (max 10 Mo)")

    try:
        extracted_text = file_service.extract_text(content, filename)
    except Exception:
        raise HTTPException(status_code=422, detail="Impossible de lire ce fichier")

    uploaded = await file_service.create_file(
        db,
        user_id=current_user.id,
        original_name=filename,
        file_type=ext,
        file_size=len(content),
        extracted_text=extracted_text,
    )
    return uploaded


@router.get("", response_model=list[FileRead])
async def list_files(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await file_service.list_files(db, current_user.id)


@router.delete("/{file_id}", status_code=204)
async def delete_file(
    file_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    deleted = await file_service.delete_file(db, file_id, current_user.id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Fichier introuvable")
