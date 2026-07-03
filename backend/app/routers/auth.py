import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.email import send_reset_email, send_verification_email
from app.core.rate_limit import rate_limit
from app.core.security import create_access_token, hash_password, verify_password
from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.auth import ForgotPasswordRequest, LoginRequest, RegisterRequest, ResetPasswordRequest, UserResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _enforce_university_email(email: str) -> None:
    domains = settings.allowed_email_domain_list
    if not any(email.lower().endswith(f"@{d}") for d in domains):
        allowed = ", ".join(f"@{d}" for d in domains)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Only {allowed} email addresses are accepted.",
        )


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, request: Request, db: AsyncSession = Depends(get_db)):
    await rate_limit(request, key="register", limit=5, window_seconds=3600)
    _enforce_university_email(body.email)

    # Reject duplicates with separate messages so the user knows which field conflicts.
    existing_email = await db.execute(
        select(User).where(User.email == body.email.lower())
    )
    if existing_email.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered.")

    existing_username = await db.execute(
        select(User).where(User.username == body.username)
    )
    if existing_username.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Username already taken.")

    token = secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + timedelta(hours=24)

    user = User(
        email=body.email.lower(),
        username=body.username,
        display_name=body.display_name,
        password_hash=hash_password(body.password),
        email_verification_token=token,
        email_verification_expires_at=expires,
    )
    db.add(user)
    await db.commit()

    send_verification_email(body.email, token)

    return {"message": "Account created. Check your email to verify before logging in."}


@router.get("/verify-email")
async def verify_email(token: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User).where(User.email_verification_token == token)
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=400, detail="Invalid verification token.")

    expires = user.email_verification_expires_at
    # Normalize to timezone-aware for comparison regardless of DB driver behavior
    if expires is not None and expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)

    if expires is None or expires < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=400,
            detail="Verification token has expired. Please register again or request a new link.",
        )

    user.is_email_verified = True
    user.email_verification_token = None
    user.email_verification_expires_at = None
    await db.commit()

    return {"message": "Email verified. You can now log in."}


@router.post("/login")
async def login(
    body: LoginRequest, request: Request, response: Response, db: AsyncSession = Depends(get_db)
):
    await rate_limit(request, key="login", limit=10, window_seconds=300)
    result = await db.execute(select(User).where(User.email == body.email.lower()))
    user = result.scalar_one_or_none()

    # Use the same error for "not found" and "wrong password" — don't leak which is true.
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    if not user.is_email_verified:
        raise HTTPException(
            status_code=403,
            detail="Please verify your email before logging in.",
        )

    if not user.is_active:
        detail = "Your account has been banned."
        if user.ban_reason:
            detail = f"Your account has been banned: {user.ban_reason}"
        raise HTTPException(status_code=403, detail=detail)

    token = create_access_token(str(user.id))

    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,                     # JS cannot read this — prevents XSS token theft
        samesite="lax",                    # safe against CSRF for same-site navigations
        max_age=settings.access_token_expire_minutes * 60,
        secure=settings.cookie_secure,     # HTTPS-only in production; plain HTTP in dev
        domain=settings.cookie_domain or None,  # shared across app/api subdomains in prod
    )

    return UserResponse.model_validate(user)


@router.post("/logout")
async def logout(response: Response):
    # Match the attributes the cookie was set with so the browser reliably clears it.
    response.delete_cookie(
        key="access_token",
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        domain=settings.cookie_domain or None,
    )
    return {"message": "Logged out."}


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/forgot-password")
async def forgot_password(body: ForgotPasswordRequest, request: Request, db: AsyncSession = Depends(get_db)):
    await rate_limit(request, key="forgot", limit=5, window_seconds=3600)
    user = (await db.execute(
        select(User).where(User.email == body.email.lower())
    )).scalar_one_or_none()

    # Always return the same response — don't reveal whether the email exists
    if user and user.is_email_verified:
        token = secrets.token_urlsafe(32)
        user.password_reset_token = token
        user.password_reset_expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
        await db.commit()
        send_reset_email(body.email, token)

    return {"message": "If that email is registered you will receive a reset link shortly."}


@router.post("/reset-password")
async def reset_password(body: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    user = (await db.execute(
        select(User).where(User.password_reset_token == body.token)
    )).scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link.")

    expires = user.password_reset_expires_at
    if expires is not None and expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)

    if expires is None or expires < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Reset link has expired. Please request a new one.")

    user.password_hash = hash_password(body.new_password)
    user.password_reset_token = None
    user.password_reset_expires_at = None
    await db.commit()

    return {"message": "Password updated. You can now log in."}
