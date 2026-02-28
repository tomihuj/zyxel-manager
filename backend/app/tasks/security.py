"""
Celery task: run security scans across devices.
"""
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Session, select

from app.tasks.celery_app import celery_app
from app.db.session import get_engine
from app.models.device import Device
from app.models.security import SecurityFinding, SecurityScan, DeviceRiskScore
from app.adapters.registry import get_adapter
from app.services.crypto import decrypt_credentials
from app.services.security_analyzer import analyze_config, calculate_score

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, name="security.run_security_scan")
def run_security_scan(
    self,
    device_ids: Optional[list] = None,
    triggered_by: str = "scheduled",
    triggered_by_user: Optional[str] = None,
):
    engine = get_engine()
    with Session(engine) as session:
        # Create scan record
        scan = SecurityScan(
            device_id=uuid.UUID(device_ids[0]) if device_ids and len(device_ids) == 1 else None,
            triggered_by=triggered_by,
            triggered_by_user=uuid.UUID(triggered_by_user) if triggered_by_user else None,
            status="running",
            started_at=datetime.now(timezone.utc),
        )
        session.add(scan)
        session.commit()
        session.refresh(scan)

        # Fetch devices
        q = select(Device).where(Device.deleted_at == None)  # noqa: E711
        if device_ids:
            q = q.where(Device.id.in_([uuid.UUID(d) for d in device_ids]))
        devices = session.exec(q).all()

        if not devices:
            scan.status = "completed"
            scan.completed_at = datetime.now(timezone.utc)
            session.add(scan)
            session.commit()
            return

        total_scores: list[int] = []
        failed_count = 0
        new_critical_alerts: list[dict] = []

        for device in devices:
            try:
                _scan_device(session, device, scan, total_scores, new_critical_alerts)
            except Exception as exc:
                logger.exception("Security scan failed for device %s: %s", device.id, exc)
                failed_count += 1

        # Update scan summary
        all_open = session.exec(
            select(SecurityFinding)
            .where(
                SecurityFinding.scan_id == scan.id,
                SecurityFinding.status == "open",
            )
        ).all()

        scan.findings_count = len(all_open)
        scan.critical_count = sum(1 for f in all_open if f.severity == "critical")
        scan.high_count = sum(1 for f in all_open if f.severity == "high")
        scan.medium_count = sum(1 for f in all_open if f.severity == "medium")
        scan.low_count = sum(1 for f in all_open if f.severity == "low")
        scan.info_count = sum(1 for f in all_open if f.severity == "info")
        scan.risk_score = round(sum(total_scores) / len(total_scores)) if total_scores else 100
        scan.status = "failed" if failed_count == len(devices) else "completed"
        scan.completed_at = datetime.now(timezone.utc)
        session.add(scan)
        session.commit()

        # Fire alerts for new critical findings
        for alert_data in new_critical_alerts:
            try:
                from app.tasks.alerts import fire_alert
                fire_alert.delay("security_critical", alert_data)
            except Exception as exc:
                logger.warning("Could not fire security alert: %s", exc)


def _scan_device(
    session: Session,
    device: Device,
    scan: SecurityScan,
    total_scores: list,
    new_critical_alerts: list,
):
    creds = decrypt_credentials(device.encrypted_credentials) if device.encrypted_credentials else {}
    adapter = get_adapter(device.adapter)

    config = adapter.fetch_config(device, creds, section="full")
    findings = analyze_config(config)

    now = datetime.now(timezone.utc)

    # Load existing open/suppressed findings for this device (keyed by title)
    existing_map: dict[str, SecurityFinding] = {
        f.title: f
        for f in session.exec(
            select(SecurityFinding)
            .where(
                SecurityFinding.device_id == device.id,
                SecurityFinding.status.in_(["open", "suppressed"]),
            )
        ).all()
    }

    seen_titles: set[str] = set()

    for fd in findings:
        title = fd["title"]
        seen_titles.add(title)

        if title in existing_map:
            # Update last_seen for existing finding
            existing = existing_map[title]
            existing.last_seen = now
            existing.scan_id = scan.id
            session.add(existing)
        else:
            # New finding
            new_f = SecurityFinding(
                device_id=device.id,
                scan_id=scan.id,
                category=fd["category"],
                severity=fd["severity"],
                title=title,
                description=fd["description"],
                recommendation=fd["recommendation"],
                remediation_patch=fd.get("remediation_patch"),
                config_path=fd.get("config_path"),
                status="open",
                compliance_refs=fd.get("compliance_refs"),
                first_seen=now,
                last_seen=now,
            )
            session.add(new_f)

            if fd["severity"] == "critical":
                new_critical_alerts.append({
                    "device_id": str(device.id),
                    "device_name": device.name,
                    "finding_title": title,
                    "severity": fd["severity"],
                    "detected_at": now.isoformat(),
                })

    # Resolve findings that were not present in this scan
    for title, existing in existing_map.items():
        if title not in seen_titles and existing.status == "open":
            existing.status = "resolved"
            existing.resolved_at = now
            session.add(existing)

    session.commit()

    # Calculate and upsert device risk score
    open_findings = session.exec(
        select(SecurityFinding)
        .where(
            SecurityFinding.device_id == device.id,
            SecurityFinding.status == "open",
        )
    ).all()

    score, grade = calculate_score([{"severity": f.severity} for f in open_findings])

    existing_score = session.exec(
        select(DeviceRiskScore)
        .where(DeviceRiskScore.device_id == device.id)
        .order_by(DeviceRiskScore.calculated_at.desc())
    ).first()

    risk_score = DeviceRiskScore(
        device_id=device.id,
        score=score,
        grade=grade,
        critical_findings=sum(1 for f in open_findings if f.severity == "critical"),
        high_findings=sum(1 for f in open_findings if f.severity == "high"),
        medium_findings=sum(1 for f in open_findings if f.severity == "medium"),
        low_findings=sum(1 for f in open_findings if f.severity == "low"),
        open_findings=len(open_findings),
        calculated_at=now,
    )
    session.add(risk_score)
    session.commit()

    total_scores.append(score)
    logger.info(
        "Security scan complete for device %s: score=%d grade=%s findings=%d",
        device.name, score, grade, len(open_findings),
    )
