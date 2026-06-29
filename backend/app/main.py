import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.routers import admin, auth, chat, clubs, health, messages, notifications, posts, qa, upload, users

app = FastAPI(title="IUSConnect API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(admin.router)
app.include_router(health.router)
app.include_router(auth.router)
app.include_router(upload.router)
app.include_router(posts.router)
app.include_router(qa.router)
app.include_router(clubs.router)
app.include_router(chat.router)
app.include_router(messages.router)
app.include_router(notifications.router)
app.include_router(users.router)

os.makedirs("/app/uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="/app/uploads"), name="uploads")
