import secrets
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import select
from pydantic import BaseModel

from app.db.session import get_session
from app.models.user import User
from app.core.security import verify_password, create_access_token, create_refresh_token, decode_token, hash_password, password_needs_rehash
from app.core.deps import CurrentUser, DBSession
from app.services.audit import write_audit

router = APIRouter()

_MAX_FAILURES = 5
_LOCK_SECONDS = 900      # 15 min lock
_WINDOW_SECONDS = 600    # 10 min window


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class UnlockRequestBody(BaseModel):
    username: str


class UnlockConfirmBody(BaseModel):
    token: str


@router.post("/login", response_model=TokenResponse)
def login(
    request: Request,
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    session: DBSession,
):
    import redis as redis_lib
    from app.core.config import get_settings
    r = redis_lib.from_url(get_settings().redis_url, decode_responses=True)
    lock_key = f"ztm:login:lock:{form_data.username}"
    fail_key = f"ztm:login:fail:{form_data.username}"

    if r.exists(lock_key):
        ttl = r.ttl(lock_key)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Account temporarily locked due to too many failed attempts. Try again in {ttl} seconds.",
        )

    user = session.exec(select(User).where(User.username == form_data.username)).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        fails = r.incr(fail_key)
        r.expire(fail_key, _WINDOW_SECONDS)
        if fails >= _MAX_FAILURES:
            r.setex(lock_key, _LOCK_SECONDS, "1")
            r.delete(fail_key)
        write_audit(session, "login_failed",
                    details={"username": form_data.username},
                    ip_address=request.client.host if request.client else None,
                    request_body={"username": form_data.username})
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")

    # Clear failure counters on successful login
    r.delete(fail_key, lock_key)

    if password_needs_rehash(user.hashed_password):
        user.hashed_password = hash_password(form_data.password)
        user.updated_at = datetime.now(timezone.utc)
        session.add(user)
        session.commit()
    tokens = TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )
    write_audit(session, "login", user,
                ip_address=request.client.host if request.client else None,
                request_body={"username": form_data.username},
                response_body={"token_type": "bearer"})
    return tokens


@router.post("/refresh", response_model=TokenResponse)
def refresh(body: RefreshRequest, session: DBSession):
    from jose import JWTError
    try:
        payload = decode_token(body.refresh_token)
        if payload.get("type") != "refresh":
            raise JWTError()
        user_id = payload["sub"]
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    user = session.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found")
    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.get("/me")
def me(current_user: CurrentUser):
    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "username": current_user.username,
        "full_name": current_user.full_name,
        "is_active": current_user.is_active,
        "is_superuser": current_user.is_superuser,
        "created_at": current_user.created_at,
    }


@router.post("/unlock-request")
def unlock_request(body: UnlockRequestBody, request: Request, session: DBSession):
    """Send an account-unlock email to the user."""
    import redis as redis_lib
    from app.core.config import get_settings
    from app.services.email import send_email

    settings = get_settings()
    r = redis_lib.from_url(settings.redis_url, decode_responses=True)

    lock_key = f"ztm:login:lock:{body.username}"
    if not r.exists(lock_key):
        # Not locked — nothing to do (don't reveal whether username exists)
        return {"sent": True}

    user = session.exec(select(User).where(User.username == body.username)).first()
    if not user or not user.email:
        raise HTTPException(status_code=400, detail="No email address on file for this account.")

    token = secrets.token_urlsafe(32)
    r.setex(f"ztm:unlock:{token}", 900, body.username)

    host = request.headers.get("origin") or request.base_url.rstrip("/")
    unlock_url = f"{host}/login?unlock_token={token}"

    try:
        send_email(
            to=user.email,
            subject="Zyxel Manager — Account Unlock",
            body=(
                f"Hi {user.full_name or user.username},\n\n"
                f"Your account was temporarily locked due to too many failed login attempts.\n\n"
                f"Click the link below to unlock your account (valid for 15 minutes):\n\n"
                f"{unlock_url}\n\n"
                f"If you did not request this, you can safely ignore this email.\n"
            ),
            html_body=(
                f"<p>Hi {user.full_name or user.username},</p>"
                f"<p>Your account was temporarily locked due to too many failed login attempts.</p>"
                f"<p><a href='{unlock_url}'>Click here to unlock your account</a> (valid for 15 minutes).</p>"
                f"<p>If you did not request this, you can safely ignore this email.</p>"
            ),
        )
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to send email. Check SMTP configuration.")

    write_audit(session, "unlock_requested", user,
                ip_address=request.client.host if request.client else None)
    return {"sent": True}


@router.post("/unlock")
def unlock_confirm(body: UnlockConfirmBody, session: DBSession):
    """Confirm an unlock token and clear the account lock."""
    import redis as redis_lib
    from app.core.config import get_settings

    settings = get_settings()
    r = redis_lib.from_url(settings.redis_url, decode_responses=True)

    token_key = f"ztm:unlock:{body.token}"
    username = r.get(token_key)
    if not username:
        raise HTTPException(status_code=400, detail="Invalid or expired unlock token.")

    r.delete(token_key)
    r.delete(f"ztm:login:lock:{username}", f"ztm:login:fail:{username}")

    user = session.exec(select(User).where(User.username == username)).first()
    write_audit(session, "unlock_confirmed", user)
    return {"unlocked": True, "username": username}
