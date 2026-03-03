import json
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from croniter import croniter
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlmodel import select

from app.core.deps import CurrentUser, DBSession
from app.models.scheduled_report import ScheduledReport
from app.services.audit import write_audit

router = APIRouter()

SECTIONS = ["interfaces", "routing", "nat", "firewall_rules", "vpn",
            "users", "dns", "ntp", "address_objects", "service_objects", "system"]


class ScheduledReportCreate(BaseModel):
    name: str
    device_ids: List[str] = []
    group_ids: List[str] = []
    tags: List[str] = []
    sections: List[str] = SECTIONS
    format: str = "json"
    cron_expression: str
    delivery_email: str
    enabled: bool = True


class ScheduledReportUpdate(BaseModel):
    name: Optional[str] = None
    device_ids: Optional[List[str]] = None
    group_ids: Optional[List[str]] = None
    tags: Optional[List[str]] = None
    sections: Optional[List[str]] = None
    format: Optional[str] = None
    cron_expression: Optional[str] = None
    delivery_email: Optional[str] = None
    enabled: Optional[bool] = None


def _report_dict(r: ScheduledReport) -> dict:
    return {
        "id": str(r.id),
        "name": r.name,
        "device_ids": json.loads(r.device_ids or "[]"),
        "group_ids": json.loads(r.group_ids or "[]"),
        "tags": json.loads(r.tags or "[]"),
        "sections": json.loads(r.sections or "[]"),
        "format": r.format,
        "cron_expression": r.cron_expression,
        "delivery_email": r.delivery_email,
        "enabled": r.enabled,
        "last_run": r.last_run,
        "next_run": r.next_run,
        "created_at": r.created_at,
    }


def _compute_next_run(cron_expr: str) -> Optional[datetime]:
    try:
        cron = croniter(cron_expr, datetime.now(timezone.utc))
        return cron.get_next(datetime)
    except Exception:
        return None


@router.get("")
def list_reports(current: CurrentUser, session: DBSession):
    reports = session.exec(select(ScheduledReport).order_by(ScheduledReport.created_at.desc())).all()
    return [_report_dict(r) for r in reports]


@router.post("", status_code=201)
def create_report(body: ScheduledReportCreate, current: CurrentUser, session: DBSession):
    report = ScheduledReport(
        name=body.name,
        device_ids=json.dumps(body.device_ids),
        group_ids=json.dumps(body.group_ids),
        tags=json.dumps(body.tags),
        sections=json.dumps(body.sections),
        format=body.format,
        cron_expression=body.cron_expression,
        delivery_email=body.delivery_email,
        enabled=body.enabled,
        next_run=_compute_next_run(body.cron_expression),
        created_by=current.id,
        created_at=datetime.now(timezone.utc),
    )
    session.add(report)
    session.commit()
    session.refresh(report)
    write_audit(session, "create_scheduled_report", current, "scheduled_report", str(report.id),
                {"name": body.name, "cron": body.cron_expression})
    return _report_dict(report)


@router.put("/{report_id}")
def update_report(report_id: uuid.UUID, body: ScheduledReportUpdate,
                  current: CurrentUser, session: DBSession):
    report = session.get(ScheduledReport, report_id)
    if not report:
        raise HTTPException(status_code=404)
    if body.name is not None:
        report.name = body.name
    if body.device_ids is not None:
        report.device_ids = json.dumps(body.device_ids)
    if body.group_ids is not None:
        report.group_ids = json.dumps(body.group_ids)
    if body.tags is not None:
        report.tags = json.dumps(body.tags)
    if body.sections is not None:
        report.sections = json.dumps(body.sections)
    if body.format is not None:
        report.format = body.format
    if body.cron_expression is not None:
        report.cron_expression = body.cron_expression
        report.next_run = _compute_next_run(body.cron_expression)
    if body.delivery_email is not None:
        report.delivery_email = body.delivery_email
    if body.enabled is not None:
        report.enabled = body.enabled
    session.add(report)
    session.commit()
    session.refresh(report)
    write_audit(session, "update_scheduled_report", current, "scheduled_report", str(report_id), {})
    return _report_dict(report)


@router.delete("/{report_id}", status_code=204)
def delete_report(report_id: uuid.UUID, current: CurrentUser, session: DBSession):
    report = session.get(ScheduledReport, report_id)
    if not report:
        raise HTTPException(status_code=404)
    session.delete(report)
    session.commit()
    write_audit(session, "delete_scheduled_report", current, "scheduled_report", str(report_id), {})


@router.post("/{report_id}/run", status_code=202)
def run_report_now(report_id: uuid.UUID, current: CurrentUser, session: DBSession):
    report = session.get(ScheduledReport, report_id)
    if not report:
        raise HTTPException(status_code=404)
    from app.tasks.scheduled_reports import run_report_now as task_run
    result = task_run.delay(str(report_id))
    write_audit(session, "run_scheduled_report", current, "scheduled_report", str(report_id), {})
    return {"task_id": result.id, "report_id": str(report_id)}
