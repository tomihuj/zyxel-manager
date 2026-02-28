import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlmodel import select

from app.core.deps import CurrentUser, DBSession
from app.models.security import SecurityFinding, SecurityScan, DeviceRiskScore
from app.models.device import Device
from app.models.user import User
from app.services.audit import write_audit

router = APIRouter()


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class SuppressBody(BaseModel):
    reason: str


class TriggerScanBody(BaseModel):
    device_id: Optional[str] = None


# ---------------------------------------------------------------------------
# Helper serialisers
# ---------------------------------------------------------------------------

def _finding_dict(f: SecurityFinding, device_name: Optional[str] = None) -> dict:
    return {
        "id": str(f.id),
        "device_id": str(f.device_id),
        "scan_id": str(f.scan_id) if f.scan_id else None,
        "category": f.category,
        "severity": f.severity,
        "title": f.title,
        "description": f.description,
        "recommendation": f.recommendation,
        "remediation_patch": json.loads(f.remediation_patch) if f.remediation_patch else None,
        "config_path": f.config_path,
        "status": f.status,
        "suppressed_reason": f.suppressed_reason,
        "compliance_refs": json.loads(f.compliance_refs) if f.compliance_refs else [],
        "first_seen": f.first_seen,
        "last_seen": f.last_seen,
        "resolved_at": f.resolved_at,
        "device_name": device_name,
    }


def _scan_dict(
    s: SecurityScan,
    device_name: Optional[str] = None,
    triggered_by_username: Optional[str] = None,
) -> dict:
    return {
        "id": str(s.id),
        "device_id": str(s.device_id) if s.device_id else None,
        "device_name": device_name,
        "triggered_by": s.triggered_by,
        "triggered_by_user": str(s.triggered_by_user) if s.triggered_by_user else None,
        "triggered_by_username": triggered_by_username,
        "status": s.status,
        "findings_count": s.findings_count,
        "critical_count": s.critical_count,
        "high_count": s.high_count,
        "medium_count": s.medium_count,
        "low_count": s.low_count,
        "info_count": s.info_count,
        "risk_score": s.risk_score,
        "started_at": s.started_at,
        "completed_at": s.completed_at,
        "error": s.error,
    }


def _score_dict(s: DeviceRiskScore, device_name: Optional[str] = None) -> dict:
    return {
        "id": str(s.id),
        "device_id": str(s.device_id),
        "device_name": device_name or str(s.device_id),
        "score": s.score,
        "grade": s.grade,
        "critical_findings": s.critical_findings,
        "high_findings": s.high_findings,
        "medium_findings": s.medium_findings,
        "low_findings": s.low_findings,
        "open_findings": s.open_findings,
        "calculated_at": s.calculated_at,
    }


# ---------------------------------------------------------------------------
# Findings endpoints
# ---------------------------------------------------------------------------

@router.get("/findings")
def list_findings(
    current: CurrentUser,
    session: DBSession,
    device_id: Optional[str] = None,
    severity: Optional[str] = None,
    status: Optional[str] = None,
    category: Optional[str] = None,
    scan_id: Optional[str] = None,
):
    q = select(SecurityFinding)
    if device_id:
        q = q.where(SecurityFinding.device_id == uuid.UUID(device_id))
    if severity:
        q = q.where(SecurityFinding.severity == severity)
    if status:
        q = q.where(SecurityFinding.status == status)
    if category:
        q = q.where(SecurityFinding.category == category)
    if scan_id:
        q = q.where(SecurityFinding.scan_id == uuid.UUID(scan_id))
    q = q.order_by(SecurityFinding.severity, SecurityFinding.title)

    findings = session.exec(q).all()
    devices = {str(d.id): d.name for d in session.exec(select(Device)).all()}
    return [_finding_dict(f, devices.get(str(f.device_id))) for f in findings]


@router.get("/findings/{finding_id}")
def get_finding(finding_id: uuid.UUID, current: CurrentUser, session: DBSession):
    f = session.get(SecurityFinding, finding_id)
    if not f:
        raise HTTPException(status_code=404)
    device = session.get(Device, f.device_id)
    return _finding_dict(f, device.name if device else None)


@router.put("/findings/{finding_id}/suppress")
def suppress_finding(
    finding_id: uuid.UUID,
    body: SuppressBody,
    current: CurrentUser,
    session: DBSession,
):
    f = session.get(SecurityFinding, finding_id)
    if not f:
        raise HTTPException(status_code=404)
    f.status = "suppressed"
    f.suppressed_by = current.id
    f.suppressed_at = datetime.now(timezone.utc)
    f.suppressed_reason = body.reason
    session.add(f)
    session.commit()
    session.refresh(f)
    write_audit(session, "suppress_security_finding", current, "security_finding",
                str(finding_id), {"reason": body.reason})
    device = session.get(Device, f.device_id)
    return _finding_dict(f, device.name if device else None)


@router.put("/findings/{finding_id}/reopen")
def reopen_finding(finding_id: uuid.UUID, current: CurrentUser, session: DBSession):
    f = session.get(SecurityFinding, finding_id)
    if not f:
        raise HTTPException(status_code=404)
    f.status = "open"
    f.suppressed_by = None
    f.suppressed_at = None
    f.suppressed_reason = None
    session.add(f)
    session.commit()
    session.refresh(f)
    write_audit(session, "reopen_security_finding", current, "security_finding", str(finding_id), {})
    device = session.get(Device, f.device_id)
    return _finding_dict(f, device.name if device else None)


@router.post("/findings/{finding_id}/remediate", status_code=202)
def remediate_finding(finding_id: uuid.UUID, current: CurrentUser, session: DBSession):
    f = session.get(SecurityFinding, finding_id)
    if not f:
        raise HTTPException(status_code=404)
    if not f.remediation_patch:
        raise HTTPException(status_code=400, detail="No remediation patch available for this finding")

    try:
        patch_data = json.loads(f.remediation_patch)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid remediation patch JSON")

    from app.models.job import BulkJob, BulkJobTarget
    job = BulkJob(
        name=f"Remediate: {f.title[:80]}",
        section=patch_data.get("section", "firewall_rules"),
        patch_json=json.dumps(patch_data.get("patch", {})),
        status="pending",
        created_by=current.id,
    )
    session.add(job)
    session.flush()

    target = BulkJobTarget(job_id=job.id, device_id=f.device_id)
    session.add(target)
    session.commit()
    session.refresh(job)

    write_audit(session, "remediate_security_finding", current, "security_finding",
                str(finding_id), {"job_id": str(job.id)})
    return {"job_id": str(job.id)}


# ---------------------------------------------------------------------------
# Scans endpoints
# ---------------------------------------------------------------------------

@router.get("/scans")
def list_scans(current: CurrentUser, session: DBSession):
    scans = session.exec(
        select(SecurityScan).order_by(SecurityScan.started_at.desc()).limit(50)
    ).all()
    devices = {str(d.id): d.name for d in session.exec(select(Device)).all()}
    users = {str(u.id): u.username for u in session.exec(select(User)).all()}
    return [
        _scan_dict(
            s,
            device_name=devices.get(str(s.device_id)) if s.device_id else None,
            triggered_by_username=users.get(str(s.triggered_by_user)) if s.triggered_by_user else None,
        )
        for s in scans
    ]


@router.get("/scans/{scan_id}")
def get_scan(scan_id: uuid.UUID, current: CurrentUser, session: DBSession):
    s = session.get(SecurityScan, scan_id)
    if not s:
        raise HTTPException(status_code=404)
    devices = {str(d.id): d.name for d in session.exec(select(Device)).all()}
    users = {str(u.id): u.username for u in session.exec(select(User)).all()}
    return _scan_dict(
        s,
        device_name=devices.get(str(s.device_id)) if s.device_id else None,
        triggered_by_username=users.get(str(s.triggered_by_user)) if s.triggered_by_user else None,
    )


@router.post("/scans", status_code=202)
def trigger_scan(body: TriggerScanBody, current: CurrentUser, session: DBSession):
    from app.tasks.security import run_security_scan
    device_ids = [body.device_id] if body.device_id else None
    task = run_security_scan.delay(
        device_ids=device_ids,
        triggered_by="manual",
        triggered_by_user=str(current.id),
    )
    write_audit(session, "trigger_security_scan", current, None, None,
                {"device_id": body.device_id})
    return {"task_id": task.id}


# ---------------------------------------------------------------------------
# Scores endpoints
# ---------------------------------------------------------------------------

@router.get("/scores")
def list_scores(current: CurrentUser, session: DBSession):
    devices = {str(d.id): d.name for d in session.exec(select(Device)).all()}
    # Latest score per device
    seen: set[str] = set()
    results = []
    for s in session.exec(
        select(DeviceRiskScore).order_by(DeviceRiskScore.calculated_at.desc())
    ).all():
        did = str(s.device_id)
        if did not in seen:
            seen.add(did)
            results.append(_score_dict(s, devices.get(did)))
    return results


@router.get("/scores/{device_id}")
def get_device_scores(device_id: uuid.UUID, current: CurrentUser, session: DBSession):
    device = session.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=404)
    scores = session.exec(
        select(DeviceRiskScore)
        .where(DeviceRiskScore.device_id == device_id)
        .order_by(DeviceRiskScore.calculated_at.desc())
        .limit(30)
    ).all()
    return [_score_dict(s, device.name) for s in scores]


# ---------------------------------------------------------------------------
# Summary endpoint
# ---------------------------------------------------------------------------

@router.get("/summary")
def get_summary(current: CurrentUser, session: DBSession):
    # All open findings
    open_findings = session.exec(
        select(SecurityFinding).where(SecurityFinding.status == "open")
    ).all()

    by_severity: dict[str, int] = {}
    by_category: dict[str, int] = {}
    for f in open_findings:
        by_severity[f.severity] = by_severity.get(f.severity, 0) + 1
        by_category[f.category] = by_category.get(f.category, 0) + 1

    # Fleet score = average of latest score per device
    devices = session.exec(select(Device).where(Device.deleted_at == None)).all()  # noqa: E711
    seen_devices: set[str] = set()
    scores: list[int] = []
    for s in session.exec(
        select(DeviceRiskScore).order_by(DeviceRiskScore.calculated_at.desc())
    ).all():
        did = str(s.device_id)
        if did not in seen_devices:
            seen_devices.add(did)
            scores.append(s.score)

    fleet_score = round(sum(scores) / len(scores)) if scores else 100
    fleet_grade = (
        "A" if fleet_score >= 90 else
        "B" if fleet_score >= 75 else
        "C" if fleet_score >= 50 else
        "D" if fleet_score >= 25 else "F"
    )

    return {
        "fleet_score": fleet_score,
        "fleet_grade": fleet_grade,
        "total_open": len(open_findings),
        "device_count": len(devices),
        "by_severity": by_severity,
        "by_category": by_category,
    }
