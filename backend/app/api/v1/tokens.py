import hashlib
import secrets
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.deps import CurrentUser, DBSession
from app.models.token import ApiToken
from app.services.audit import write_audit
from sqlmodel import select

router = APIRouter()


class TokenCreate(BaseModel):
    name: str
    expires_at: Optional[datetime] = None


@router.get("")
def list_tokens(current: CurrentUser, session: DBSession):
    tokens = session.exec(
        select(ApiToken).where(ApiToken.user_id == current.id)
    ).all()
    return [_token_dict(t) for t in tokens]


@router.post("", status_code=201)
def create_token(body: TokenCreate, current: CurrentUser, session: DBSession):
    raw = "ztm_" + secrets.token_urlsafe(32)
    prefix = raw[:8]
    token_hash = hashlib.sha256(raw.encode()).hexdigest()

    token = ApiToken(
        user_id=current.id,
        name=body.name,
        token_hash=token_hash,
        prefix=prefix,
        expires_at=body.expires_at,
        created_at=datetime.now(timezone.utc),
    )
    session.add(token)
    session.commit()
    session.refresh(token)

    write_audit(session, "create_api_token", current, "api_token", str(token.id),
                {"name": body.name})

    result = _token_dict(token)
    result["token"] = raw  # returned once, never stored in plaintext
    return result


@router.delete("/{token_id}", status_code=204)
def revoke_token(token_id: uuid.UUID, current: CurrentUser, session: DBSession):
    token = session.exec(
        select(ApiToken).where(ApiToken.id == token_id, ApiToken.user_id == current.id)
    ).first()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")
    token.revoked = True
    session.add(token)
    session.commit()
    write_audit(session, "revoke_api_token", current, "api_token", str(token_id), {})


def _token_dict(t: ApiToken) -> dict:
    return {
        "id": str(t.id),
        "name": t.name,
        "prefix": t.prefix,
        "expires_at": t.expires_at,
        "last_used_at": t.last_used_at,
        "revoked": t.revoked,
        "created_at": t.created_at,
    }
