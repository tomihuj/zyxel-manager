import json
import logging
from typing import Optional
from sqlmodel import Session

from app.models.audit import AuditLog
from app.models.audit_config import AuditActionConfig
from app.models.user import User

logger = logging.getLogger(__name__)

_SENSITIVE = {"password", "hashed_password", "token", "access_token", "refresh_token", "secret"}


def _sanitize(obj: dict) -> dict:
    return {k: ("***" if k in _SENSITIVE else v) for k, v in obj.items()}


def write_audit(
    session,                              # kept for backwards compat — not used internally
    action: str,
    user: Optional[User] = None,
    resource_type: Optional[str] = None,
    resource_id=None,
    details: Optional[dict] = None,
    ip_address: Optional[str] = None,
    request_body: Optional[dict] = None,
    response_body: Optional[dict] = None,
):
    """
    Write an audit log entry using its own independent DB session so that
    a rolled-back or failed caller session never silently swallows the log.
    All exceptions are caught and logged — audit failures never crash endpoints.
    """
    try:
        from app.db.session import get_engine
        with Session(get_engine()) as audit_session:
            cfg = audit_session.get(AuditActionConfig, action)
            if cfg is not None and not cfg.enabled:
                return

            merged: dict = dict(details or {})
            if cfg is not None and cfg.log_payload:
                if request_body:
                    merged["request"] = _sanitize(request_body)
                if response_body:
                    merged["response"] = _sanitize(response_body)

            log = AuditLog(
                user_id=user.id if user else None,
                username=user.username if user else None,
                action=action,
                resource_type=resource_type,
                resource_id=str(resource_id) if resource_id else None,
                details=json.dumps(merged) if merged else None,
                ip_address=ip_address,
            )
            audit_session.add(log)
            audit_session.commit()
    except Exception:
        logger.exception("write_audit failed for action=%s", action)
