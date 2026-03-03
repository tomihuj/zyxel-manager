"""Celery task: run scheduled reports that are due."""
import csv
import io
import json
import logging
import smtplib
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email.mime.text import MIMEText
from email import encoders
from typing import List, Optional
import uuid

from croniter import croniter
from sqlmodel import Session, select

from app.tasks.celery_app import celery_app
from app.db.session import get_engine
from app.models.scheduled_report import ScheduledReport
from app.models.device import Device, GroupMembership
from app.models.config import ConfigSnapshot
from app.core.config import get_settings

logger = logging.getLogger(__name__)

SECTIONS = ["interfaces", "routing", "nat", "firewall_rules", "vpn",
            "users", "dns", "ntp", "address_objects", "service_objects", "system"]


@celery_app.task(bind=True, name="scheduled_reports.run_due_reports")
def run_due_reports(self):
    engine = get_engine()
    now = datetime.now(timezone.utc)
    with Session(engine) as session:
        reports = session.exec(
            select(ScheduledReport).where(
                ScheduledReport.enabled == True,  # noqa: E712
                ScheduledReport.next_run <= now,
            )
        ).all()
        for report in reports:
            try:
                _run_report(session, report)
            except Exception as exc:
                logger.error("Failed to run scheduled report %s: %s", report.id, exc)


@celery_app.task(bind=True, name="scheduled_reports.run_report_now")
def run_report_now(self, report_id: str):
    engine = get_engine()
    with Session(engine) as session:
        report = session.get(ScheduledReport, uuid.UUID(report_id))
        if not report:
            logger.warning("Scheduled report %s not found", report_id)
            return
        _run_report(session, report, update_next_run=False)
    return {"status": "completed", "report_id": report_id}


def _run_report(session: Session, report: ScheduledReport, update_next_run: bool = True):
    settings = get_settings()
    device_ids: set = set()

    saved_device_ids = json.loads(report.device_ids or "[]")
    for did in saved_device_ids:
        device_ids.add(uuid.UUID(did))

    saved_group_ids = json.loads(report.group_ids or "[]")
    for gid in saved_group_ids:
        for m in session.exec(
            select(GroupMembership).where(GroupMembership.group_id == uuid.UUID(gid))
        ).all():
            device_ids.add(m.device_id)

    if not device_ids:
        device_ids = {d.id for d in session.exec(select(Device).where(Device.deleted_at == None)).all()}  # noqa: E711

    tags = json.loads(report.tags or "[]")
    sections = json.loads(report.sections or "[]") or SECTIONS

    rows = []
    for did in device_ids:
        device = session.get(Device, did)
        if not device or device.deleted_at:
            continue
        if tags:
            dev_tags = json.loads(device.tags or "[]")
            if not any(t in dev_tags for t in tags):
                continue
        row = {
            "device_id": str(device.id), "device_name": device.name,
            "model": device.model, "mgmt_ip": device.mgmt_ip,
            "status": device.status, "firmware_version": device.firmware_version,
        }
        for section in sections:
            snap = session.exec(
                select(ConfigSnapshot)
                .where(ConfigSnapshot.device_id == did, ConfigSnapshot.section == section)
                .order_by(ConfigSnapshot.version.desc())
            ).first()
            row[f"config_{section}"] = json.loads(snap.data_json) if snap else None
        rows.append(row)

    if report.format == "csv":
        buf = io.StringIO()
        if rows:
            flat = [{k: json.dumps(v) if isinstance(v, (dict, list)) else v for k, v in r.items()} for r in rows]
            writer = csv.DictWriter(buf, fieldnames=flat[0].keys())
            writer.writeheader()
            writer.writerows(flat)
        content = buf.getvalue().encode()
        filename = f"report_{report.name}_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.csv"
        mime_type = "text/csv"
    else:
        content = json.dumps({"generated_at": datetime.now(timezone.utc).isoformat(),
                              "device_count": len(rows), "data": rows}, indent=2).encode()
        filename = f"report_{report.name}_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.json"
        mime_type = "application/json"

    # Send email
    if settings.smtp_host:
        _send_report_email(settings, report.delivery_email, report.name, content, filename, mime_type)
    else:
        logger.info("SMTP not configured — report '%s' generated but not emailed (%d bytes)", report.name, len(content))

    # Update timestamps
    now = datetime.now(timezone.utc)
    report.last_run = now
    if update_next_run:
        try:
            cron = croniter(report.cron_expression, now)
            report.next_run = cron.get_next(datetime)
        except Exception:
            report.next_run = None
    session.add(report)
    session.commit()
    logger.info("Scheduled report '%s' completed: %d devices", report.name, len(rows))


def _send_report_email(settings, to_email: str, report_name: str, content: bytes, filename: str, mime_type: str):
    msg = MIMEMultipart()
    msg["From"] = settings.smtp_from
    msg["To"] = to_email
    msg["Subject"] = f"[ZyxelManager] Scheduled Report: {report_name}"
    msg.attach(MIMEText(f"Please find the scheduled report '{report_name}' attached.", "plain"))

    part = MIMEBase("application", "octet-stream")
    part.set_payload(content)
    encoders.encode_base64(part)
    part.add_header("Content-Disposition", f'attachment; filename="{filename}"')
    msg.attach(part)

    if settings.smtp_use_tls:
        with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port) as server:
            if settings.smtp_user:
                server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(msg)
    else:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            if settings.smtp_use_starttls:
                server.starttls()
            if settings.smtp_user:
                server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(msg)
