import re
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.dependencies import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/upload", tags=["upload"])

from app.config import settings

UPLOAD_DIR = Path(settings.data_dir) / "uploads"
FILESTORE_DIR = Path(settings.data_dir) / "filestore"

# ── images ────────────────────────────────────────────────────────────────────

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
IMAGE_MAX_BYTES = 10 * 1024 * 1024  # 10 MB
IMAGE_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
}

IMAGE_MAGIC: dict[str, bytes] = {
    "image/jpeg": b"\xff\xd8\xff",
    "image/png": b"\x89PNG\r\n\x1a\n",
    "image/gif": b"GIF",
    "image/webp": b"RIFF",
}

# ── documents (MIME-validated) ────────────────────────────────────────────────

# Old binary Office formats (.doc, .xls, .ppt) support VBA macros — excluded.
# Open XML formats (.docx, .xlsx, .pptx) are ZIP-based and macro-free by spec.
ALLOWED_FILE_TYPES: dict[str, str] = {
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
}
FILE_MAX_BYTES = 20 * 1024 * 1024  # 20 MB

# All Open XML formats are ZIP archives; PDFs start with %PDF.
FILE_MAGIC: dict[str, bytes] = {
    "application/pdf": b"%PDF",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": b"PK\x03\x04",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": b"PK\x03\x04",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": b"PK\x03\x04",
}

# ── text / code files (extension-validated) ───────────────────────────────────

# MIME types for code files are unreliable across browsers and OSes
# (e.g. .ts is reported as video/mp2t on some platforms), so we validate
# by extension instead. All are served as text/plain; charset=utf-8 which
# forces the browser to display them as text regardless of content,
# eliminating any risk of script execution.
TEXT_EXTENSIONS: frozenset[str] = frozenset({
    ".txt", ".md", ".csv",
    ".py", ".js", ".ts", ".jsx", ".tsx",
    ".java", ".c", ".cpp", ".h", ".cs",
    ".go", ".rs", ".rb", ".php",
    ".json", ".yaml", ".yml", ".toml", ".xml",
    ".sh", ".sql", ".r", ".ipynb",
})
TEXT_MAX_BYTES = 1 * 1024 * 1024  # 1 MB

_UNSAFE_CHARS = re.compile(r'[^\w\s\-.]', re.UNICODE)

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
FILESTORE_DIR.mkdir(parents=True, exist_ok=True)


# ── helpers ───────────────────────────────────────────────────────────────────

def _check_magic(data: bytes, mime: str, magic_table: dict[str, bytes]) -> bool:
    expected = magic_table.get(mime)
    if not expected:
        return False
    return data[: len(expected)] == expected


def _is_text(data: bytes) -> bool:
    """Return True if the file appears to be plain text.

    Null bytes appear in virtually every binary/executable format but never
    in valid text files, making this a fast and reliable heuristic.
    """
    return b"\x00" not in data[:8192]


def _sanitize_filename(raw: str, expected_ext: str) -> str:
    """Return a safe display name, always ending with expected_ext.

    Stripping all but the final extension defeats double-extension tricks
    (e.g. "malware.exe.py") that trick OS file managers that hide extensions.
    """
    raw = raw.replace("\x00", "").replace("/", "").replace("\\", "")
    raw = _UNSAFE_CHARS.sub("", raw).strip()
    stem = Path(raw).stem or "file"
    return f"{stem[:180]}{expected_ext}"


# ── endpoints ─────────────────────────────────────────────────────────────────

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

    if not _check_magic(data, file.content_type, IMAGE_MAGIC):
        raise HTTPException(
            status_code=422,
            detail="File content does not match the declared image type.",
        )

    ext = IMAGE_EXTENSIONS[file.content_type]
    filename = f"{uuid.uuid4()}{ext}"
    (UPLOAD_DIR / filename).write_bytes(data)

    return {"url": f"/uploads/{filename}"}


@router.post("/file")
async def upload_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    ext = Path(file.filename or "").suffix.lower()

    # ── path 1: document (PDF / Open XML) — validated by MIME + magic bytes ──
    if file.content_type in ALLOWED_FILE_TYPES:
        data = await file.read()

        if len(data) > FILE_MAX_BYTES:
            raise HTTPException(status_code=413, detail="File must be under 20 MB.")

        if not _check_magic(data, file.content_type, FILE_MAGIC):
            raise HTTPException(
                status_code=422,
                detail="File content does not match the declared document type.",
            )

        stored_ext = ALLOWED_FILE_TYPES[file.content_type]
        stored_name = f"{uuid.uuid4()}{stored_ext}"
        (FILESTORE_DIR / stored_name).write_bytes(data)

        return {
            "url": f"/api/files/{stored_name}",
            "name": _sanitize_filename(file.filename or "file", stored_ext),
            "size": len(data),
            "mime_type": file.content_type,
        }

    # ── path 2: text / code — validated by extension + null-byte check ────────
    if ext in TEXT_EXTENSIONS:
        data = await file.read()

        if len(data) > TEXT_MAX_BYTES:
            raise HTTPException(status_code=413, detail="Text/code files must be under 1 MB.")

        if not _is_text(data):
            raise HTTPException(
                status_code=422,
                detail="File appears to be binary. Only plain text and source code files are accepted.",
            )

        stored_name = f"{uuid.uuid4()}{ext}"
        (FILESTORE_DIR / stored_name).write_bytes(data)

        return {
            "url": f"/api/files/{stored_name}",
            "name": _sanitize_filename(file.filename or "file", ext),
            "size": len(data),
            "mime_type": "text/plain",
        }

    raise HTTPException(
        status_code=422,
        detail=(
            "Unsupported file type. Allowed: PDF, Word (.docx), Excel (.xlsx), "
            "PowerPoint (.pptx), and common text/code files."
        ),
    )
