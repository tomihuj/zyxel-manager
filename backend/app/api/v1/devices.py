import csv
import io
import json
import uuid
import hashlib
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, HTTPException, UploadFile, File, Query
from sqlalchemy import delete as sql_delete
from sqlmodel import select
from pydantic import BaseModel

from app.core.deps import CurrentUser, DBSession, RBAC
from app.models.device import Device
from app.models.config import ConfigSnapshot
from app.models.compliance import ComplianceResult
from app.models.backup import DeviceBackupSettings
from app.models.job import BulkJobTarget
from app.models.metric import DeviceMetric
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
    notes: Optional[str] = None
    label_color: Optional[str] = None


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
    notes: Optional[str] = None
    label_color: Optional[str] = None


def _device_dict(d: Device) -> dict:
    return {
        "id": str(d.id), "name": d.name, "model": d.model, "mgmt_ip": d.mgmt_ip,
        "port": d.port, "protocol": d.protocol, "adapter": d.adapter,
        "tags": json.loads(d.tags or "[]"), "status": d.status,
        "last_seen": d.last_seen, "firmware_version": d.firmware_version,
        "created_at": d.created_at,
        "group_ids": [str(g.id) for g in d.groups],
        "drift_detected": d.drift_detected,
        "drift_detected_at": d.drift_detected_at,
        "notes": d.notes,
        "label_color": d.label_color,
        "credentials_updated_at": d.credentials_updated_at,
        "deleted_at": d.deleted_at,
    }


@router.get("")
def list_devices(session: DBSession, rbac: RBAC, current: CurrentUser):
    rbac.require("view_devices")
    devices = session.exec(select(Device).where(Device.deleted_at == None)).all()  # noqa: E711
    allowed = rbac.accessible_device_ids()
    if allowed is not None:
        devices = [d for d in devices if str(d.id) in allowed]
    return [_device_dict(d) for d in devices]


@router.get("/deleted")
def list_deleted_devices(session: DBSession, rbac: RBAC, current: CurrentUser):
    rbac.require("view_devices")
    devices = session.exec(select(Device).where(Device.deleted_at != None)).all()  # noqa: E711
    return [_device_dict(d) for d in devices]


@router.post("", status_code=201)
def create_device(body: DeviceCreate, session: DBSession, rbac: RBAC, current: CurrentUser):
    rbac.require("edit_devices", "write")
    device = Device(
        name=body.name, model=body.model, mgmt_ip=body.mgmt_ip,
        port=body.port, protocol=body.protocol, adapter=body.adapter,
        encrypted_credentials=encrypt_credentials(body.username, body.password),
        tags=json.dumps(body.tags),
        notes=body.notes,
        label_color=body.label_color,
        credentials_updated_at=datetime.now(timezone.utc),
    )
    session.add(device)
    session.commit()
    session.refresh(device)
    # Try to get firmware version immediately (non-critical, best-effort)
    try:
        creds_dict = {"username": body.username, "password": body.password}
        info = get_adapter(body.adapter).get_device_info(device, creds_dict)
        if info.get("firmware_version"):
            device.firmware_version = info["firmware_version"]
            session.add(device)
            session.commit()
            session.refresh(device)
    except Exception:
        pass
    resp = _device_dict(device)
    write_audit(session, "create_device", current, "device", str(device.id), {"name": device.name},
                request_body={"name": body.name, "model": body.model, "mgmt_ip": body.mgmt_ip,
                              "port": body.port, "protocol": body.protocol, "adapter": body.adapter,
                              "tags": body.tags, "username": body.username, "password": body.password},
                response_body=resp)
    return resp


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
        device.credentials_updated_at = datetime.now(timezone.utc)
    if body.notes is not None:
        device.notes = body.notes
    if body.label_color is not None:
        device.label_color = body.label_color
    device.updated_at = datetime.now(timezone.utc)
    session.add(device)
    session.commit()
    session.refresh(device)
    resp = _device_dict(device)
    write_audit(session, "update_device", current, "device", str(device_id),
                request_body=body.model_dump(exclude_none=True),
                response_body=resp)
    return resp


@router.delete("/{device_id}", status_code=204)
def delete_device(device_id: uuid.UUID, session: DBSession, rbac: RBAC, current: CurrentUser):
    """Soft-delete: marks deleted_at, hides from normal listing."""
    rbac.require("edit_devices", "write")
    device = session.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=404)
    if device.deleted_at is not None:
        raise HTTPException(status_code=409, detail="Device is already deleted")
    device.deleted_at = datetime.now(timezone.utc)
    session.add(device)
    session.commit()
    write_audit(session, "delete_device", current, "device", str(device_id),
                request_body={"device_id": str(device_id), "name": device.name})


@router.post("/{device_id}/restore", status_code=200)
def restore_device(device_id: uuid.UUID, session: DBSession, rbac: RBAC, current: CurrentUser):
    """Restore a soft-deleted device back to active."""
    rbac.require("edit_devices", "write")
    device = session.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=404)
    if device.deleted_at is None:
        raise HTTPException(status_code=409, detail="Device is not deleted")
    device.deleted_at = None
    session.add(device)
    session.commit()
    write_audit(session, "restore_device", current, "device", str(device_id),
                request_body={"device_id": str(device_id), "name": device.name})
    return _device_dict(device)


@router.delete("/{device_id}/permanent", status_code=204)
def permanent_delete_device(device_id: uuid.UUID, session: DBSession, rbac: RBAC, current: CurrentUser):
    """Permanently delete a (soft-deleted) device and all its data."""
    rbac.require("edit_devices", "write")
    device = session.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=404)
    session.execute(sql_delete(ConfigSnapshot).where(ConfigSnapshot.device_id == device_id))
    session.execute(sql_delete(ComplianceResult).where(ComplianceResult.device_id == device_id))
    session.execute(sql_delete(BulkJobTarget).where(BulkJobTarget.device_id == device_id))
    session.execute(sql_delete(DeviceMetric).where(DeviceMetric.device_id == device_id))
    session.execute(sql_delete(DeviceBackupSettings).where(DeviceBackupSettings.device_id == device_id))
    session.flush()
    session.delete(device)
    session.commit()
    write_audit(session, "permanent_delete_device", current, "device", str(device_id),
                request_body={"device_id": str(device_id)})


@router.post("/{device_id}/diagnostics")
def run_diagnostics(device_id: uuid.UUID, session: DBSession, rbac: RBAC, current: CurrentUser):
    """Run three sequential diagnostic steps: TCP connect, login, data transfer."""
    import socket, time
    rbac.require("view_devices")
    device = session.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=404)
    creds = decrypt_credentials(device.encrypted_credentials) if device.encrypted_credentials else {}

    steps = []

    # ── Step 1: TCP / TLS connect ────────────────────────────────────────────
    t0 = time.monotonic()
    try:
        import ssl
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        with socket.create_connection((device.mgmt_ip, device.port), timeout=5) as sock:
            with ctx.wrap_socket(sock, server_hostname=device.mgmt_ip):
                pass
        steps.append({"step": "TCP/TLS connect", "ok": True,
                       "detail": f"Reached {device.mgmt_ip}:{device.port}",
                       "latency_ms": round((time.monotonic() - t0) * 1000, 1)})
    except Exception as exc:
        steps.append({"step": "TCP/TLS connect", "ok": False,
                       "detail": str(exc), "latency_ms": None})
        return {"steps": steps}   # no point continuing

    # ── Step 2: Login / authentication ──────────────────────────────────────
    adapter = get_adapter(device.adapter)
    login_attempts: list = []
    t0 = time.monotonic()
    try:
        if hasattr(adapter, "diagnose_auth"):
            login_attempts = adapter.diagnose_auth(device, creds)
            success = any(a.get("success") for a in login_attempts)
            detail = next((f"{a['method']} {a['url']}" for a in login_attempts if a.get("success")), "All strategies failed")
        else:
            result = adapter.test_connection(device, creds)
            success = result.get("success", False)
            detail = result.get("message", "")
        steps.append({"step": "Login", "ok": success, "detail": detail,
                       "latency_ms": round((time.monotonic() - t0) * 1000, 1),
                       "login_attempts": login_attempts})
    except Exception as exc:
        steps.append({"step": "Login", "ok": False, "detail": str(exc),
                       "latency_ms": None, "login_attempts": login_attempts})
        return {"steps": steps}

    if not steps[-1]["ok"]:
        return {"steps": steps}

    # ── Step 3: Data transfer (fetch NTP section) ───────────────────────────
    t0 = time.monotonic()
    try:
        data = adapter.fetch_config(device, creds, section="ntp")
        steps.append({"step": "Data transfer (ntp)", "ok": True,
                       "detail": f"Received {len(str(data))} bytes",
                       "latency_ms": round((time.monotonic() - t0) * 1000, 1)})
    except Exception as exc:
        steps.append({"step": "Data transfer (ntp)", "ok": False,
                       "detail": str(exc), "latency_ms": None})

    return {"steps": steps}


@router.post("/{device_id}/test-connection")
def test_connection(device_id: uuid.UUID, session: DBSession, rbac: RBAC, current: CurrentUser,
                    timeout: int = Query(default=5, ge=1, le=60)):
    rbac.require("view_devices")
    device = session.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=404)
    creds = decrypt_credentials(device.encrypted_credentials) if device.encrypted_credentials else {}
    try:
        result = get_adapter(device.adapter).test_connection(device, creds, timeout=timeout)
    except Exception as exc:
        write_audit(None, "test_connection_failed", current, "device", str(device_id),
                    request_body={"device_id": str(device_id), "adapter": device.adapter},
                    response_body={"error": str(exc)})
        raise HTTPException(status_code=502, detail=str(exc))
    device.status = "online" if result.get("success") else "offline"
    if result.get("success"):
        device.last_seen = datetime.now(timezone.utc)
        if not device.firmware_version:
            try:
                from app.adapters.zyxel import _extract_system_info
                info = get_adapter(device.adapter).get_device_info(device, creds)
                fw = info.get("firmware_version") or _extract_system_info(info.get("system")).get("firmware_version")
                if fw:
                    device.firmware_version = fw
            except Exception:
                pass
    session.add(device)
    session.commit()
    action = "test_connection" if result.get("success") else "test_connection_failed"
    write_audit(None, action, current, "device", str(device_id),
                request_body={"device_id": str(device_id), "adapter": device.adapter},
                response_body=result)
    return result


@router.post("/{device_id}/sync")
def sync_device(device_id: uuid.UUID, session: DBSession, rbac: RBAC, current: CurrentUser):
    rbac.require("view_devices")
    device = session.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=404)
    creds = decrypt_credentials(device.encrypted_credentials) if device.encrypted_credentials else {}
    try:
        config = get_adapter(device.adapter).fetch_config(device, creds)
    except Exception as exc:
        write_audit(None, "sync_device_failed", current, "device", str(device_id),
                    response_body={"error": str(exc)})
        raise HTTPException(status_code=502, detail=str(exc))
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
    if isinstance(config, dict):
        from app.adapters.zyxel import _extract_system_info
        info = _extract_system_info(config.get("system"))
        if info.get("firmware_version"):
            device.firmware_version = info["firmware_version"]
    session.add(device)
    session.commit()
    resp = {"version": version, "checksum": checksum}
    write_audit(session, "sync_device", current, "device", str(device_id),
                response_body=resp)
    return resp


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


@router.get("/{device_id}/config")
def get_device_config(device_id: uuid.UUID, session: DBSession, rbac: RBAC, current: CurrentUser,
                      section: str = "full"):
    rbac.require("view_devices")
    device = session.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=404)
    creds = decrypt_credentials(device.encrypted_credentials) if device.encrypted_credentials else {}
    return get_adapter(device.adapter).fetch_config(device, creds, section)


@router.patch("/{device_id}/config/{section}")
def patch_device_config(device_id: uuid.UUID, section: str, patch: dict,
                        session: DBSession, rbac: RBAC, current: CurrentUser):
    rbac.require("edit_devices", "write")
    device = session.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=404)
    creds = decrypt_credentials(device.encrypted_credentials) if device.encrypted_credentials else {}
    try:
        result = get_adapter(device.adapter).apply_patch(device, creds, section, patch)
    except Exception as exc:
        write_audit(None, "patch_config_failed", current, "device", str(device_id),
                    {"section": section},
                    request_body=patch,
                    response_body={"error": str(exc)})
        raise HTTPException(status_code=502, detail=str(exc))
    write_audit(session, "patch_config", current, "device", str(device_id), {"section": section},
                request_body=patch,
                response_body=result if isinstance(result, dict) else None)
    session.commit()
    return result


@router.post("/{device_id}/snapshots/{snapshot_id}/restore")
def restore_snapshot(device_id: uuid.UUID, snapshot_id: uuid.UUID,
                     session: DBSession, rbac: RBAC, current: CurrentUser):
    """Restore a device's configuration from a stored snapshot."""
    rbac.require("edit_devices", "write")
    device = session.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    snap = session.get(ConfigSnapshot, snapshot_id)
    if not snap or snap.device_id != device_id:
        raise HTTPException(status_code=404, detail="Snapshot not found")

    creds = decrypt_credentials(device.encrypted_credentials) if device.encrypted_credentials else {}
    config = json.loads(snap.data_json)

    try:
        result = get_adapter(device.adapter).restore_config(device, creds, config)
    except Exception as exc:
        write_audit(session, "restore_backup_failed", current, "device", str(device_id),
                    {"snapshot_id": str(snapshot_id)}, response_body={"error": str(exc)})
        raise HTTPException(status_code=502, detail=str(exc))

    write_audit(session, "restore_backup", current, "device", str(device_id),
                {"snapshot_id": str(snapshot_id), "version": snap.version},
                response_body=result)
    return result


@router.post("/import")
async def import_devices_csv(
    session: DBSession,
    rbac: RBAC,
    current: CurrentUser,
    file: UploadFile = File(...),
):
    rbac.require("edit_devices", "write")
    content = await file.read()
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))

    created = 0
    errors = []

    for row_num, row in enumerate(reader, start=2):
        try:
            name = row.get("name", "").strip()
            mgmt_ip = row.get("mgmt_ip", "").strip()
            if not name or not mgmt_ip:
                errors.append({"row": row_num, "error": "name and mgmt_ip are required"})
                continue

            model = row.get("model", "USG FLEX 100").strip() or "USG FLEX 100"
            adapter = row.get("adapter", "mock").strip() or "mock"
            port = int(row.get("port", 443) or 443)
            protocol = row.get("protocol", "https").strip() or "https"
            username = row.get("username", "admin").strip() or "admin"
            password = row.get("password", "").strip()

            device = Device(
                name=name,
                model=model,
                mgmt_ip=mgmt_ip,
                port=port,
                protocol=protocol,
                adapter=adapter,
                encrypted_credentials=encrypt_credentials(username, password),
                tags=json.dumps([]),
            )
            session.add(device)
            session.commit()
            created += 1
        except Exception as exc:
            errors.append({"row": row_num, "error": str(exc)})

    write_audit(session, "import_devices_csv", current, None, None,
                {"created": created, "errors": len(errors)})
    return {"created": created, "errors": errors}
