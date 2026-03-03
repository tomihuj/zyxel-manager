import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Query, HTTPException
from sqlmodel import select
import sqlalchemy as sa

from app.core.deps import CurrentUser, DBSession
from app.models.syslog import SyslogEntry
from app.models.device import Device

router = APIRouter()

SEVERITY_NAMES = {0: "emergency", 1: "alert", 2: "critical", 3: "error",
                  4: "warning", 5: "notice", 6: "info", 7: "debug"}

FACILITY_NAMES = {
    0: "kern", 1: "user", 2: "mail", 3: "daemon", 4: "auth",
    5: "syslog", 6: "lpr", 7: "news", 8: "uucp", 9: "cron",
    10: "authpriv", 11: "ftp",
    16: "local0", 17: "local1", 18: "local2", 19: "local3",
    20: "local4", 21: "local5", 22: "local6", 23: "local7",
}


def _entry_dict(e: SyslogEntry, device_name: Optional[str] = None) -> dict:
    return {
        "id": str(e.id),
        "source_ip": e.source_ip,
        "device_id": str(e.device_id) if e.device_id else None,
        "device_name": device_name,
        "facility": e.facility,
        "facility_name": FACILITY_NAMES.get(e.facility, f"fac{e.facility}"),
        "severity": e.severity,
        "severity_name": SEVERITY_NAMES.get(e.severity, "unknown"),
        "program": e.program,
        "message": e.message,
        "raw": e.raw,
        "received_at": e.received_at,
    }


@router.get("/entries")
def list_entries(
    current: CurrentUser,
    session: DBSession,
    device_id: Optional[uuid.UUID] = Query(default=None),
    severity: Optional[int] = Query(default=None),
    severity_max: Optional[int] = Query(default=None, ge=0, le=7),
    facility: Optional[int] = Query(default=None),
    program: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    hours: int = Query(default=24, ge=1, le=720),
    limit: int = Query(default=500, ge=1, le=5000),
    source_ip: Optional[str] = Query(default=None),
):
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    stmt = (
        select(SyslogEntry)
        .where(SyslogEntry.received_at >= cutoff)
        .order_by(SyslogEntry.received_at.desc())
        .limit(limit)
    )
    if device_id:
        stmt = stmt.where(SyslogEntry.device_id == device_id)
    if severity is not None:
        stmt = stmt.where(SyslogEntry.severity == severity)
    if severity_max is not None:
        stmt = stmt.where(SyslogEntry.severity <= severity_max)
    if facility is not None:
        stmt = stmt.where(SyslogEntry.facility == facility)
    if program:
        stmt = stmt.where(SyslogEntry.program.ilike(f"%{program}%"))
    if search:
        stmt = stmt.where(SyslogEntry.message.ilike(f"%{search}%"))
    if source_ip:
        stmt = stmt.where(SyslogEntry.source_ip == source_ip)

    entries = session.exec(stmt).all()

    device_ids = {e.device_id for e in entries if e.device_id}
    name_map = {}
    for did in device_ids:
        d = session.get(Device, did)
        if d:
            name_map[did] = d.name

    return [_entry_dict(e, name_map.get(e.device_id)) for e in entries]


@router.get("/summary")
def get_syslog_summary(current: CurrentUser, session: DBSession):
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    entries = session.exec(
        select(SyslogEntry).where(SyslogEntry.received_at >= cutoff)
    ).all()

    total = len(entries)
    by_severity = {}
    for e in entries:
        name = SEVERITY_NAMES.get(e.severity, "unknown")
        by_severity[name] = by_severity.get(name, 0) + 1

    device_ids = {e.device_id for e in entries if e.device_id}
    return {
        "total_24h": total,
        "devices_sending": len(device_ids),
        "by_severity": by_severity,
    }


@router.delete("/entries", status_code=204)
def clear_entries(current: CurrentUser, session: DBSession):
    if not current.is_superuser:
        raise HTTPException(status_code=403, detail="Admin only")
    session.execute(sa.delete(SyslogEntry))
    session.commit()
