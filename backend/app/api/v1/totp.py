"""TOTP 2FA management endpoints."""
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException

from app.core.deps import CurrentUser, DBSession

router = APIRouter()


class TOTPCodeBody(BaseModel):
    code: str


@router.get("/setup")
def totp_setup(current: CurrentUser, session: DBSession):
    """Generate a new TOTP secret and provisioning URI. Does not enable 2FA yet."""
    try:
        import pyotp
    except ImportError:
        raise HTTPException(status_code=500, detail="pyotp not installed")

    if current.totp_enabled:
        raise HTTPException(status_code=400, detail="TOTP already enabled")

    secret = pyotp.random_base32()
    totp = pyotp.TOTP(secret)
    uri = totp.provisioning_uri(name=current.email, issuer_name="ZyxelManager")

    # Store secret (not yet activated — enabled only after verify)
    current.totp_secret = secret
    session.add(current)
    session.commit()

    return {"secret": secret, "uri": uri}


@router.post("/verify")
def totp_verify(body: TOTPCodeBody, current: CurrentUser, session: DBSession):
    """Verify the TOTP code and activate 2FA for the account."""
    try:
        import pyotp
    except ImportError:
        raise HTTPException(status_code=500, detail="pyotp not installed")

    if not current.totp_secret:
        raise HTTPException(status_code=400, detail="No TOTP secret set up. Call /auth/totp/setup first.")

    totp = pyotp.TOTP(current.totp_secret)
    if not totp.verify(body.code, valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid TOTP code")

    current.totp_enabled = True
    session.add(current)
    session.commit()
    return {"enabled": True}


@router.delete("/disable")
def totp_disable(body: TOTPCodeBody, current: CurrentUser, session: DBSession):
    """Disable TOTP after verifying the current code."""
    try:
        import pyotp
    except ImportError:
        raise HTTPException(status_code=500, detail="pyotp not installed")

    if not current.totp_enabled:
        raise HTTPException(status_code=400, detail="TOTP is not enabled")

    totp = pyotp.TOTP(current.totp_secret)
    if not totp.verify(body.code, valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid TOTP code")

    current.totp_enabled = False
    current.totp_secret = None
    session.add(current)
    session.commit()
    return {"enabled": False}
