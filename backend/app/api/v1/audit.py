import uuid
from typing import Optional
from fastapi import APIRouter, Query
from sqlmodel import select

from app.core.deps import SuperUser, DBSession
from app.models.audit import AuditLog

router = APIRouter()


@router.get("/logs")
def get_audit_logs(
    session: DBSession,
    current: SuperUser,
    limit: int = Query(default=100, le=1000),
    offset: int = 0,
    action: Optional[str] = None,
):
    stmt = select(AuditLog).order_by(AuditLog.created_at.desc()).offset(offset).limit(limit)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    logs = session.exec(stmt).all()
    return [{"id": str(l.id), "username": l.username, "action": l.action,
             "resource_type": l.resource_type, "resource_id": l.resource_id,
             "ip_address": l.ip_address, "created_at": l.created_at} for l in logs]
