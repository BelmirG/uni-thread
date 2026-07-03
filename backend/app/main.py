import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.routers import admin, auth, chat, clubs, files, health, messages, notifications, posts, qa, upload, users

app = FastAPI(title="UniConnect API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(admin.router)
app.include_router(health.router)
app.include_router(auth.router)
app.include_router(upload.router)
app.include_router(files.router)
app.include_router(posts.router)
app.include_router(qa.router)
app.include_router(clubs.router)
app.include_router(chat.router)
app.include_router(messages.router)
app.include_router(notifications.router)
app.include_router(users.router)

_uploads_dir = os.path.join(settings.data_dir, "uploads")
os.makedirs(_uploads_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=_uploads_dir), name="uploads")
