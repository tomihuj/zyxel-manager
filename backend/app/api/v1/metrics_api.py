"""Device metrics, health score, and interface status endpoints."""
import json
import uuid
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, HTTPException, Query
from sqlmodel import select

from app.core.deps import CurrentUser, DBSession, RBAC
from app.models.device import Device
from app.models.metric import DeviceMetric
from app.models.config import ConfigSnapshot
from app.models.compliance import ComplianceResult

router = APIRouter()


@router.get("/{device_id}/metrics")
def get_device_metrics(
    device_id: uuid.UUID,
    session: DBSession,
    rbac: RBAC,
    current: CurrentUser,
    hours: int = Query(default=24, ge=1, le=168),
    limit: int = Query(default=288, le=2000),
):
    rbac.require("view_devices")
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    metrics = session.exec(
        select(DeviceMetric)
        .where(DeviceMetric.device_id == device_id, DeviceMetric.collected_at >= since)
        .order_by(DeviceMetric.collected_at.desc())
        .limit(limit)
    ).all()
    return [
        {
            "id": str(m.id),
            "cpu_pct": m.cpu_pct,
            "memory_pct": m.memory_pct,
            "uptime_seconds": m.uptime_seconds,
            "collected_at": m.collected_at,
        }
        for m in reversed(metrics)  # oldest first for charting
    ]


@router.get("/{device_id}/health")
def get_device_health(device_id: uuid.UUID, session: DBSession, rbac: RBAC, current: CurrentUser):
    rbac.require("view_devices")
    device = session.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=404)

    score = 0

    # 25 pts: device is online
    if device.status == "online":
        score += 25

    # 25 pts: no config drift
    if not device.drift_detected:
        score += 25

    # 25 pts: synced within the last 24 h
    if device.last_seen:
        age = (datetime.now(timezone.utc) - device.last_seen).total_seconds()
        if age < 86400:
            score += 25

    # 25 pts: compliance pass rate ≥ 80 %
    results = session.exec(
        select(ComplianceResult).where(ComplianceResult.device_id == device_id)
    ).all()
    if results:
        pass_rate = sum(1 for r in results if r.passed) / len(results)
        if pass_rate >= 0.8:
            score += 25
    else:
        score += 25  # no rules → full compliance points

    grade = "A" if score >= 90 else "B" if score >= 70 else "C" if score >= 50 else "D"
    return {
        "device_id": str(device_id),
        "score": score,
        "grade": grade,
        "online": device.status == "online",
        "drift_detected": device.drift_detected,
        "last_seen": device.last_seen,
    }


@router.get("/{device_id}/interfaces")
def get_device_interfaces(
    device_id: uuid.UUID,
    session: DBSession,
    rbac: RBAC,
    current: CurrentUser,
):
    rbac.require("view_devices")
    # Try "full" section first, then any latest snapshot
    snap = session.exec(
        select(ConfigSnapshot)
        .where(ConfigSnapshot.device_id == device_id, ConfigSnapshot.section == "full")
        .order_by(ConfigSnapshot.version.desc())
    ).first()

    if not snap:
        snap = session.exec(
            select(ConfigSnapshot)
            .where(ConfigSnapshot.device_id == device_id)
            .order_by(ConfigSnapshot.version.desc())
        ).first()

    if not snap:
        return []

    try:
        data = json.loads(snap.data_json)
        return data.get("interfaces", [])
    except Exception:
        return []
