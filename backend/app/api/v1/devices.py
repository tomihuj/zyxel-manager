import json
import uuid
import hashlib
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, HTTPException
from sqlmodel import select
from pydantic import BaseModel

from app.core.deps import CurrentUser, DBSession, RBAC
from app.models.device import Device
from app.models.config import ConfigSnapshot
from app.services.crypto import encrypt_credentials, decrypt_credentials
from app.services.audit import write_audit
from app.adapters.registry import get_adapter

router = APIRouter()


class DeviceCreate(BaseModel):
    name: str
    model: str = "USG FLEX 100"
    mgmt_ip: str
    port: int = 443
    protocol: str = "https"
    adapter: str = "mock"
    username: str
    password: str
    tags: List[str] = []


class DeviceUpdate(BaseModel):
    name: Optional[str] = None
    model: Optional[str] = None
    mgmt_ip: Optional[str] = None
    port: Optional[int] = None
    protocol: Optional[str] = None
    adapter: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    tags: Optional[List[str]] = None


def _device_dict(d: Device) -> dict:
    return {
        "id": str(d.id), "name": d.name, "model": d.model, "mgmt_ip": d.mgmt_ip,
        "port": d.port, "protocol": d.protocol, "adapter": d.adapter,
        "tags": json.loads(d.tags or "[]"), "status": d.status,
        "last_seen": d.last_seen, "firmware_version": d.firmware_version,
        "created_at": d.created_at,
    }


@router.get("")
def list_devices(session: DBSession, rbac: RBAC, current: CurrentUser):
    rbac.require("view_devices")
    devices = session.exec(select(Device)).all()
    allowed = rbac.accessible_device_ids()
    if allowed is not None:
        devices = [d for d in devices if str(d.id) in allowed]
    return [_device_dict(d) for d in devices]


@router.post("", status_code=201)
def create_device(body: DeviceCreate, session: DBSession, rbac: RBAC, current: CurrentUser):
    rbac.require("edit_devices", "write")
    device = Device(
        name=body.name, model=body.model, mgmt_ip=body.mgmt_ip,
        port=body.port, protocol=body.protocol, adapter=body.adapter,
        encrypted_credentials=encrypt_credentials(body.username, body.password),
        tags=json.dumps(body.tags),
    )
    session.add(device)
    session.commit()
    session.refresh(device)
    write_audit(session, "create_device", current, "device", str(device.id), {"name": device.name})
    return _device_dict(device)


@router.get("/{device_id}")
def get_device(device_id: uuid.UUID, session: DBSession, rbac: RBAC, current: CurrentUser):
    rbac.require("view_devices")
    device = session.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=404)
    return _device_dict(device)


@router.put("/{device_id}")
def update_device(device_id: uuid.UUID, body: DeviceUpdate, session: DBSession,
                  rbac: RBAC, current: CurrentUser):
    rbac.require("edit_devices", "write")
    device = session.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=404)
    for field in ("name", "model", "mgmt_ip", "port", "protocol", "adapter"):
        v = getattr(body, field)
        if v is not None:
            setattr(device, field, v)
    if body.tags is not None:
        device.tags = json.dumps(body.tags)
    if body.username or body.password:
        creds = decrypt_credentials(device.encrypted_credentials) if device.encrypted_credentials else {}
        device.encrypted_credentials = encrypt_credentials(
            body.username or creds.get("username", ""),
            body.password or creds.get("password", ""),
        )
    device.updated_at = datetime.now(timezone.utc)
    session.add(device)
    session.commit()
    session.refresh(device)
    write_audit(session, "update_device", current, "device", str(device_id))
    return _device_dict(device)


@router.delete("/{device_id}", status_code=204)
def delete_device(device_id: uuid.UUID, session: DBSession, rbac: RBAC, current: CurrentUser):
    rbac.require("edit_devices", "write")
    device = session.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=404)
    session.delete(device)
    session.commit()
    write_audit(session, "delete_device", current, "device", str(device_id))


@router.post("/{device_id}/test-connection")
def test_connection(device_id: uuid.UUID, session: DBSession, rbac: RBAC, current: CurrentUser):
    rbac.require("view_devices")
    device = session.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=404)
    creds = decrypt_credentials(device.encrypted_credentials) if device.encrypted_credentials else {}
    result = get_adapter(device.adapter).test_connection(device, creds)
    device.status = "online" if result.get("success") else "offline"
    if result.get("success"):
        device.last_seen = datetime.now(timezone.utc)
    session.add(device)
    session.commit()
    return result


@router.post("/{device_id}/sync")
def sync_device(device_id: uuid.UUID, session: DBSession, rbac: RBAC, current: CurrentUser):
    rbac.require("view_devices")
    device = session.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=404)
    creds = decrypt_credentials(device.encrypted_credentials) if device.encrypted_credentials else {}
    config = get_adapter(device.adapter).fetch_config(device, creds)
    data_str = json.dumps(config)
    checksum = hashlib.sha256(data_str.encode()).hexdigest()
    latest = session.exec(
        select(ConfigSnapshot)
        .where(ConfigSnapshot.device_id == device_id)
        .order_by(ConfigSnapshot.version.desc())
    ).first()
    version = (latest.version + 1) if latest else 1
    session.add(ConfigSnapshot(device_id=device_id, data_json=data_str,
                               checksum=checksum, version=version))
    device.status = "online"
    device.last_seen = datetime.now(timezone.utc)
    if isinstance(config, dict) and config.get("system", {}).get("firmware"):
        device.firmware_version = config["system"]["firmware"]
    session.add(device)
    session.commit()
    write_audit(session, "sync_device", current, "device", str(device_id))
    return {"version": version, "checksum": checksum}


@router.get("/{device_id}/snapshots")
def list_snapshots(device_id: uuid.UUID, session: DBSession, rbac: RBAC, current: CurrentUser):
    rbac.require("view_devices")
    snaps = session.exec(
        select(ConfigSnapshot)
        .where(ConfigSnapshot.device_id == device_id)
        .order_by(ConfigSnapshot.version.desc())
    ).all()
    return [{"id": str(s.id), "version": s.version, "checksum": s.checksum,
             "section": s.section, "created_at": s.created_at} for s in snaps]
