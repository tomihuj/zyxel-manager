import os
import shutil
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from sqlmodel import select

from app.core.deps import CurrentUser, DBSession
from app.models.firmware import FirmwareUpgrade
from app.models.device import Device
from app.services.audit import write_audit

router = APIRouter()

UPLOAD_DIR = "/app/firmware_uploads"


def _upgrade_dict(u: FirmwareUpgrade, device_name: Optional[str] = None) -> dict:
    return {
        "id": str(u.id),
        "device_id": str(u.device_id),
        "device_name": device_name,
        "previous_version": u.previous_version,
        "target_version": u.target_version,
        "status": u.status,
        "celery_task_id": u.celery_task_id,
        "firmware_file_name": u.firmware_file_name,
        "started_at": u.started_at,
        "completed_at": u.completed_at,
        "error": u.error,
        "created_at": u.created_at,
    }


@router.get("")
def list_firmware(current: CurrentUser, session: DBSession):
    """List all devices with their firmware info."""
    devices = session.exec(select(Device).where(Device.deleted_at == None)).all()  # noqa: E711
    return [
        {
            "device_id": str(d.id),
            "device_name": d.name,
            "model": d.model,
            "mgmt_ip": d.mgmt_ip,
            "firmware_version": d.firmware_version,
            "status": d.status,
            "last_seen": d.last_seen,
        }
        for d in devices
    ]


@router.get("/upgrades")
def list_upgrades(current: CurrentUser, session: DBSession):
    upgrades = session.exec(
        select(FirmwareUpgrade).order_by(FirmwareUpgrade.created_at.desc())
    ).all()
    device_ids = {u.device_id for u in upgrades}
    name_map = {}
    for did in device_ids:
        d = session.get(Device, did)
        if d:
            name_map[did] = d.name
    return [_upgrade_dict(u, name_map.get(u.device_id)) for u in upgrades]


@router.get("/upgrades/{device_id}")
def list_device_upgrades(device_id: uuid.UUID, current: CurrentUser, session: DBSession):
    device = session.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=404)
    upgrades = session.exec(
        select(FirmwareUpgrade)
        .where(FirmwareUpgrade.device_id == device_id)
        .order_by(FirmwareUpgrade.created_at.desc())
    ).all()
    return [_upgrade_dict(u, device.name) for u in upgrades]


@router.post("/upgrades", status_code=202)
async def create_upgrade(
    current: CurrentUser,
    session: DBSession,
    device_id: uuid.UUID = Form(...),
    target_version: str = Form(...),
    firmware_file: Optional[UploadFile] = File(default=None),
):
    device = session.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    # Save uploaded file if provided
    file_path = None
    file_name = None
    if firmware_file and firmware_file.filename:
        os.makedirs(UPLOAD_DIR, exist_ok=True)
        file_name = firmware_file.filename
        safe_name = f"{uuid.uuid4()}_{file_name}"
        file_path = os.path.join(UPLOAD_DIR, safe_name)
        with open(file_path, "wb") as f:
            shutil.copyfileobj(firmware_file.file, f)

    upgrade = FirmwareUpgrade(
        device_id=device_id,
        previous_version=device.firmware_version,
        target_version=target_version,
        status="pending",
        triggered_by=current.id,
        firmware_file_path=file_path,
        firmware_file_name=file_name,
        created_at=datetime.now(timezone.utc),
    )
    session.add(upgrade)
    session.commit()
    session.refresh(upgrade)

    from app.tasks.firmware import run_upgrade
    task = run_upgrade.delay(str(upgrade.id))
    upgrade.celery_task_id = task.id
    session.add(upgrade)
    session.commit()

    write_audit(session, "create_firmware_upgrade", current, "firmware_upgrade", str(upgrade.id),
                {"device_id": str(device_id), "target_version": target_version,
                 "file": file_name or "none"})
    return _upgrade_dict(upgrade, device.name)


@router.delete("/upgrades/{upgrade_id}", status_code=204)
def cancel_upgrade(upgrade_id: uuid.UUID, current: CurrentUser, session: DBSession):
    upgrade = session.get(FirmwareUpgrade, upgrade_id)
    if not upgrade:
        raise HTTPException(status_code=404)
    if upgrade.status != "pending":
        raise HTTPException(status_code=400, detail="Can only cancel pending upgrades")
    upgrade.status = "cancelled"
    upgrade.completed_at = datetime.now(timezone.utc)
    session.add(upgrade)
    session.commit()
    write_audit(session, "cancel_firmware_upgrade", current, "firmware_upgrade", str(upgrade_id), {})
