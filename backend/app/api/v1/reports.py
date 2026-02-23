import csv
import io
import json
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from sqlmodel import select
from pydantic import BaseModel

from app.core.deps import CurrentUser, DBSession, RBAC
from app.models.device import Device, GroupMembership
from app.models.config import ConfigSnapshot
from app.services.audit import write_audit

router = APIRouter()

SECTIONS = ["interfaces", "routing", "nat", "firewall_rules", "vpn",
            "users", "dns", "ntp", "address_objects", "service_objects", "system"]


class ReportRequest(BaseModel):
    device_ids: Optional[List[uuid.UUID]] = None
    group_ids: Optional[List[uuid.UUID]] = None
    sections: List[str] = SECTIONS
    format: str = "json"
    tags: Optional[List[str]] = None


@router.post("/generate")
def generate_report(body: ReportRequest, session: DBSession, rbac: RBAC, current: CurrentUser):
    rbac.require("export_reports")
    write_audit(session, "generate_report", current,
                details={"sections": body.sections, "format": body.format})

    device_ids: set[uuid.UUID] = set()
    if body.device_ids:
        device_ids.update(body.device_ids)
    if body.group_ids:
        for gid in body.group_ids:
            for m in session.exec(select(GroupMembership).where(GroupMembership.group_id == gid)).all():
                device_ids.add(m.device_id)
    if not device_ids:
        device_ids = {d.id for d in session.exec(select(Device)).all()}

    rows = []
    for did in device_ids:
        device = session.get(Device, did)
        if not device:
            continue
        if body.tags:
            dev_tags = json.loads(device.tags or "[]")
            if not any(t in dev_tags for t in body.tags):
                continue
        row: dict = {
            "device_id": str(device.id), "device_name": device.name,
            "model": device.model, "mgmt_ip": device.mgmt_ip,
            "status": device.status, "firmware_version": device.firmware_version,
            "last_seen": device.last_seen.isoformat() if device.last_seen else None,
        }
        for section in body.sections:
            snap = session.exec(
                select(ConfigSnapshot)
                .where(ConfigSnapshot.device_id == did, ConfigSnapshot.section == section)
                .order_by(ConfigSnapshot.version.desc())
            ).first()
            row[f"config_{section}"] = json.loads(snap.data_json) if snap else None
        rows.append(row)

    if body.format == "csv":
        buf = io.StringIO()
        if rows:
            flat = [{k: json.dumps(v) if isinstance(v, (dict, list)) else v
                     for k, v in r.items()} for r in rows]
            writer = csv.DictWriter(buf, fieldnames=flat[0].keys())
            writer.writeheader()
            writer.writerows(flat)
        return StreamingResponse(
            io.BytesIO(buf.getvalue().encode()),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=report.csv"},
        )

    return {"generated_at": datetime.utcnow().isoformat(), "device_count": len(rows), "data": rows}
