import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    username: str = Field(
        min_length=3,
        max_length=50,
        pattern=r"^[a-zA-Z0-9_]+$",
        description="Letters, numbers, and underscores only.",
    )
    display_name: str = Field(min_length=1, max_length=100)
    # bcrypt silently truncates or errors above 72 bytes — cap it here so the
    # user gets a clear message rather than a 500.
    password: str = Field(min_length=8, max_length=72)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=72)


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    username: str
    display_name: str
    bio: str | None = None
    faculty: str | None = None
    program: str | None = None
    is_email_verified: bool
    is_admin: bool
    created_at: datetime

    model_config = {"from_attributes": True}
