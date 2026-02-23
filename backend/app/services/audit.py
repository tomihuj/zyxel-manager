import json
from typing import Optional
from sqlmodel import Session
from app.models.audit import AuditLog
from app.models.user import User


def write_audit(
    session: Session,
    action: str,
    user: Optional[User] = None,
    resource_type: Optional[str] = None,
    resource_id=None,
    details: Optional[dict] = None,
    ip_address: Optional[str] = None,
):
    log = AuditLog(
        user_id=user.id if user else None,
        username=user.username if user else None,
        action=action,
        resource_type=resource_type,
        resource_id=str(resource_id) if resource_id else None,
        details=json.dumps(details) if details else None,
        ip_address=ip_address,
    )
    session.add(log)
    session.commit()
