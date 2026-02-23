"""
Security utilities: password hashing (argon2), JWT, and Fernet credential encryption.
"""
import base64
import hashlib
from datetime import datetime, timedelta, timezone

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError, InvalidHashError
from cryptography.fernet import Fernet
from jose import jwt

from app.core.config import get_settings

_ph = PasswordHasher()


# ── Password ──────────────────────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    return _ph.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return _ph.verify(hashed, plain)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def password_needs_rehash(hashed: str) -> bool:
    return _ph.check_needs_rehash(hashed)


# ── JWT ───────────────────────────────────────────────────────────────────────

def create_access_token(subject: str) -> str:
    settings = get_settings()
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    return jwt.encode({"sub": subject, "exp": expire, "type": "access"},
                      settings.secret_key, algorithm=settings.algorithm)


def create_refresh_token(subject: str) -> str:
    settings = get_settings()
    expire = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    return jwt.encode({"sub": subject, "exp": expire, "type": "refresh"},
                      settings.secret_key, algorithm=settings.algorithm)


def decode_token(token: str) -> dict:
    settings = get_settings()
    return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])


# ── Credential encryption ──────────────────────────────────────────────────────

def _fernet() -> Fernet:
    key = get_settings().encryption_key
    try:
        return Fernet(key.encode())
    except Exception:
        raw = hashlib.sha256(key.encode()).digest()
        return Fernet(base64.urlsafe_b64encode(raw))


def encrypt_secret(plain: str) -> str:
    return _fernet().encrypt(plain.encode()).decode()


def decrypt_secret(cipher: str) -> str:
    return _fernet().decrypt(cipher.encode()).decode()
