import re
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from app.dependencies import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/files", tags=["files"])

from app.config import settings

FILESTORE_DIR = Path(settings.data_dir) / "filestore"

# ── MIME map for document types ───────────────────────────────────────────────

DOC_EXT_TO_MIME: dict[str, str] = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}

# Text/code files — all served as text/plain regardless of source extension.
# This ensures even .html or .xml cannot be rendered as markup by the browser.
TEXT_EXTENSIONS: frozenset[str] = frozenset({
    ".txt", ".md", ".csv",
    ".py", ".js", ".ts", ".jsx", ".tsx",
    ".java", ".c", ".cpp", ".h", ".cs",
    ".go", ".rs", ".rb", ".php",
    ".json", ".yaml", ".yml", ".toml", ".xml",
    ".sh", ".sql", ".r", ".ipynb",
})

ALLOWED_EXTENSIONS: frozenset[str] = frozenset(DOC_EXT_TO_MIME) | TEXT_EXTENSIONS

# PDFs and all text/code files are rendered inline in the browser.
# Office files are force-downloaded (Content-Disposition: attachment).
INLINE_EXTENSIONS: frozenset[str] = frozenset({".pdf"}) | TEXT_EXTENSIONS

# Stored filenames are always UUID + allowed extension — no path components possible.
_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


def _validate_filename(filename: str) -> tuple[bool, str]:
    """Return (valid, ext). Splits on the FIRST dot to handle extensions cleanly."""
    parts = filename.split(".", 1)
    if len(parts) != 2:
        return False, ""
    stem, raw_ext = parts[0], f".{parts[1]}"
    if not _UUID.match(stem):
        return False, ""
    if raw_ext not in ALLOWED_EXTENSIONS:
        return False, ""
    return True, raw_ext


@router.get("/{filename}")
async def serve_file(
    filename: str,
    current_user: User = Depends(get_current_user),
):
    valid, ext = _validate_filename(filename)
    if not valid:
        raise HTTPException(status_code=400, detail="Invalid filename.")

    path = FILESTORE_DIR / filename
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="File not found.")

    is_text = ext in TEXT_EXTENSIONS
    is_inline = ext in INLINE_EXTENSIONS

    if is_text:
        media_type = "text/plain; charset=utf-8"
    else:
        media_type = DOC_EXT_TO_MIME.get(ext, "application/octet-stream")

    disposition = "inline" if is_inline else "attachment"

    return FileResponse(
        path=path,
        media_type=media_type,
        headers={
            "Content-Disposition": f'{disposition}; filename="{filename}"',
            # Prevent MIME sniffing — browser must honour the declared Content-Type.
            "X-Content-Type-Options": "nosniff",
            # No caching of potentially sensitive academic files.
            "Cache-Control": "private, no-store",
            # Sandbox inline content so it cannot run scripts or access the parent page.
            "Content-Security-Policy": "sandbox",
        },
    )
