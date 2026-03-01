"""Session (refresh token) management endpoints."""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from sqlmodel import select

from app.core.deps import CurrentUser, DBSession
from app.models.refresh_token import RefreshToken

router = APIRouter()


def _session_dict(rt: RefreshToken) -> dict:
    return {
        "id": str(rt.id),
        "user_agent": rt.user_agent,
        "ip_address": rt.ip_address,
        "created_at": rt.created_at,
        "last_used_at": rt.last_used_at,
        "expires_at": rt.expires_at,
        "revoked": rt.revoked,
    }


@router.get("")
def list_sessions(current: CurrentUser, session: DBSession):
    """List all active (non-revoked, non-expired) sessions for the current user."""
    tokens = session.exec(
        select(RefreshToken)
        .where(
            RefreshToken.user_id == current.id,
            RefreshToken.revoked == False,
            RefreshToken.expires_at > datetime.now(timezone.utc),
        )
        .order_by(RefreshToken.created_at.desc())
    ).all()
    return [_session_dict(t) for t in tokens]


@router.delete("/{session_id}", status_code=204)
def revoke_session(session_id: uuid.UUID, current: CurrentUser, session: DBSession):
    """Revoke a specific session."""
    token = session.get(RefreshToken, session_id)
    if not token or token.user_id != current.id:
        raise HTTPException(status_code=404)
    token.revoked = True
    session.add(token)
    session.commit()


@router.delete("", status_code=204)
def revoke_all_sessions(current: CurrentUser, session: DBSession):
    """Revoke all active sessions for the current user."""
    tokens = session.exec(
        select(RefreshToken).where(
            RefreshToken.user_id == current.id,
            RefreshToken.revoked == False,
        )
    ).all()
    for token in tokens:
        token.revoked = True
        session.add(token)
    session.commit()
