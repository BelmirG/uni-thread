import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.dependencies import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/upload", tags=["upload"])

UPLOAD_DIR = Path("/app/uploads")
FILES_DIR = Path("/app/uploads/files")

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
IMAGE_MAX_BYTES = 10 * 1024 * 1024  # 10 MB
IMAGE_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
}

ALLOWED_FILE_TYPES = {
    "application/pdf": ".pdf",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.ms-excel": ".xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/vnd.ms-powerpoint": ".ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
}
FILE_MAX_BYTES = 20 * 1024 * 1024  # 20 MB

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
FILES_DIR.mkdir(parents=True, exist_ok=True)


@router.post("")
async def upload_image(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=422,
            detail="Only JPEG, PNG, GIF, and WebP images are allowed.",
        )

    data = await file.read()
    if len(data) > IMAGE_MAX_BYTES:
        raise HTTPException(status_code=413, detail="Image must be under 10 MB.")

    ext = IMAGE_EXTENSIONS[file.content_type]
    filename = f"{uuid.uuid4()}{ext}"
    (UPLOAD_DIR / filename).write_bytes(data)

    return {"url": f"/uploads/{filename}"}


@router.post("/file")
async def upload_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    if file.content_type not in ALLOWED_FILE_TYPES:
        raise HTTPException(
            status_code=422,
            detail="Only PDF, Word, Excel, and PowerPoint files are allowed.",
        )

    data = await file.read()
    if len(data) > FILE_MAX_BYTES:
        raise HTTPException(status_code=413, detail="File must be under 20 MB.")

    ext = ALLOWED_FILE_TYPES[file.content_type]
    filename = f"{uuid.uuid4()}{ext}"
    (FILES_DIR / filename).write_bytes(data)

    original_name = file.filename or filename

    return {
        "url": f"/uploads/files/{filename}",
        "name": original_name,
        "size": len(data),
        "mime_type": file.content_type,
    }
