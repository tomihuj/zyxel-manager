"""Cross-snapshot configuration search endpoint."""
import json
import uuid
from typing import Optional

from fastapi import APIRouter, Query
from sqlmodel import select

from app.core.deps import CurrentUser, DBSession, RBAC
from app.models.config import ConfigSnapshot
from app.models.device import Device

router = APIRouter()


def _flatten(data, prefix: str = "") -> dict:
    """Recursively flatten nested dict/list to dot-notation keys."""
    items = {}
    if isinstance(data, dict):
        for k, v in data.items():
            full_key = f"{prefix}.{k}" if prefix else k
            if isinstance(v, (dict, list)):
                items.update(_flatten(v, full_key))
            else:
                items[full_key] = v
    elif isinstance(data, list):
        for i, v in enumerate(data):
            full_key = f"{prefix}[{i}]"
            if isinstance(v, (dict, list)):
                items.update(_flatten(v, full_key))
            else:
                items[full_key] = v
    return items


@router.get("")
def search_config(
    session: DBSession,
    rbac: RBAC,
    current: CurrentUser,
    q: str = Query(..., min_length=1, description="Search term for key paths and values"),
    section: Optional[str] = None,
    device_id: Optional[uuid.UUID] = None,
    limit: int = Query(default=100, le=500),
):
    rbac.require("view_devices")
    q_lower = q.lower()

    stmt = select(ConfigSnapshot).order_by(ConfigSnapshot.created_at.desc())
    if section:
        stmt = stmt.where(ConfigSnapshot.section == section)
    if device_id:
        stmt = stmt.where(ConfigSnapshot.device_id == device_id)

    # Only examine latest snapshot per (device, section) pair
    seen: set = set()
    snapshots = []
    for snap in session.exec(stmt).all():
        key = (snap.device_id, snap.section)
        if key not in seen:
            seen.add(key)
            snapshots.append(snap)

    results = []
    for snap in snapshots:
        try:
            data = json.loads(snap.data_json)
        except Exception:
            continue

        flat = _flatten(data)
        matches = [
            {"key": k, "value": str(v)}
            for k, v in flat.items()
            if q_lower in k.lower() or q_lower in str(v).lower()
        ]

        if matches:
            device = session.get(Device, snap.device_id)
            results.append({
                "device_id": str(snap.device_id),
                "device_name": device.name if device else "Unknown",
                "section": snap.section,
                "snapshot_id": str(snap.id),
                "snapshot_version": snap.version,
                "matches": matches[:50],
            })

        if len(results) >= limit:
            break

    return results
