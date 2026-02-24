import json
import uuid
import hashlib
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import JSONResponse
from sqlmodel import select
from pydantic import BaseModel

from app.core.deps import CurrentUser, DBSession, RBAC
from app.models.device import Device
from app.models.config import ConfigSnapshot
from app.models.backup import DeviceBackupSettings
from app.services.crypto import decrypt_credentials
from app.services.audit import write_audit
from app.adapters.registry import get_adapter

router = APIRouter()


def _snap_dict(s: ConfigSnapshot, device: Optional[Device] = None) -> dict:
    return {
        "id": str(s.id),
        "device_id": str(s.device_id),
        "section": s.section,
        "version": s.version,
        "checksum": s.checksum,
        "is_baseline": s.is_baseline,
        "triggered_by": s.triggered_by,
        "label": s.label,
        "created_at": s.created_at,
        "size": len(s.data_json),
        "device_name": device.name if device else None,
    }


def _store_snapshot(
    session,
    device_id,
    config: dict,
    triggered_by: str,
    label: Optional[str] = None,
) -> ConfigSnapshot:
    data_str = json.dumps(config)
    checksum = hashlib.sha256(data_str.encode()).hexdigest()
    latest = session.exec(
        select(ConfigSnapshot)
        .where(ConfigSnapshot.device_id == device_id)
        .order_by(ConfigSnapshot.version.desc())
    ).first()
    version = (latest.version + 1) if latest else 1
    snapshot = ConfigSnapshot(
        device_id=device_id,
        data_json=data_str,
        checksum=checksum,
        version=version,
        triggered_by=triggered_by,
        label=label,
    )
    session.add(snapshot)
    return snapshot


def _settings_dict(s: DeviceBackupSettings) -> dict:
    return {
        "auto_backup_enabled": s.auto_backup_enabled,
        "interval_hours": s.interval_hours,
        "retention": s.retention,
        "last_auto_backup": s.last_auto_backup,
    }


class BackupSettingsUpdate(BaseModel):
    auto_backup_enabled: bool
    interval_hours: int
    retention: Optional[int] = None


class CompareRequest(BaseModel):
    snapshot_ids: List[str]


class RestoreRequest(BaseModel):
    device_id: Optional[str] = None


class UploadRestoreRequest(BaseModel):
    config: dict
    label: Optional[str] = None


@router.post("/{device_id}/trigger")
def trigger_backup(device_id: uuid.UUID, session: DBSession, rbac: RBAC, current: CurrentUser):
    rbac.require("view_devices")
    device = session.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    creds = decrypt_credentials(device.encrypted_credentials) if device.encrypted_credentials else {}
    try:
        config = get_adapter(device.adapter).fetch_config(device, creds, section="full")
    except Exception as exc:
        write_audit(None, "trigger_backup_failed", current, "device", str(device_id),
                    response_body={"error": str(exc), "phase": "fetch_config"})
        raise HTTPException(status_code=502, detail=str(exc))

    data_str = json.dumps(config)
    checksum = hashlib.sha256(data_str.encode()).hexdigest()

    latest = session.exec(
        select(ConfigSnapshot)
        .where(ConfigSnapshot.device_id == device_id)
        .order_by(ConfigSnapshot.version.desc())
    ).first()
    version = (latest.version + 1) if latest else 1

    snapshot = ConfigSnapshot(
        device_id=device_id,
        data_json=data_str,
        checksum=checksum,
        version=version,
        triggered_by="manual",
    )
    session.add(snapshot)

    # Enforce retention
    settings = session.get(DeviceBackupSettings, device_id)
    if settings and settings.retention is not None:
        all_snaps = session.exec(
            select(ConfigSnapshot)
            .where(ConfigSnapshot.device_id == device_id)
            .order_by(ConfigSnapshot.created_at.asc())
        ).all()
        excess = len(all_snaps) - settings.retention + 1
        if excess > 0:
            for old in all_snaps[:excess]:
                session.delete(old)

    try:
        session.commit()
        session.refresh(snapshot)
    except Exception as exc:
        session.rollback()
        write_audit(None, "trigger_backup_failed", current, "device", str(device_id),
                    response_body={"error": str(exc), "phase": "save_snapshot"})
        raise HTTPException(status_code=500, detail=f"Failed to save snapshot: {exc}")

    resp = _snap_dict(snapshot, device)
    write_audit(None, "trigger_backup", current, "device", str(device_id),
                response_body={"snapshot_id": resp["id"], "version": resp["version"],
                               "checksum": resp["checksum"]})
    return resp


@router.get("/{device_id}")
def list_backups(
    device_id: uuid.UUID,
    session: DBSession,
    rbac: RBAC,
    current: CurrentUser,
    limit: int = 50,
    offset: int = 0,
):
    rbac.require("view_devices")
    device = session.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    snaps = session.exec(
        select(ConfigSnapshot)
        .where(ConfigSnapshot.device_id == device_id)
        .order_by(ConfigSnapshot.version.desc())
        .offset(offset)
        .limit(limit)
    ).all()
    return [_snap_dict(s, device) for s in snaps]


@router.get("/{snapshot_id}/data")
def get_backup_data(snapshot_id: uuid.UUID, session: DBSession, rbac: RBAC, current: CurrentUser):
    rbac.require("view_devices")
    snap = session.get(ConfigSnapshot, snapshot_id)
    if not snap:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return json.loads(snap.data_json)


@router.delete("/{snapshot_id}", status_code=204)
def delete_backup(snapshot_id: uuid.UUID, session: DBSession, rbac: RBAC, current: CurrentUser):
    rbac.require("edit_devices", "write")
    snap = session.get(ConfigSnapshot, snapshot_id)
    if not snap:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    device = session.get(Device, snap.device_id)
    write_audit(session, "delete_backup", current, "device", str(snap.device_id),
                request_body={"snapshot_id": str(snapshot_id), "version": snap.version,
                              "device_name": device.name if device else None})
    session.delete(snap)
    session.commit()
    return Response(status_code=204)


@router.get("/{snapshot_id}/download")
def download_backup(snapshot_id: uuid.UUID, session: DBSession, rbac: RBAC, current: CurrentUser):
    rbac.require("view_devices")
    snap = session.get(ConfigSnapshot, snapshot_id)
    if not snap:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    device = session.get(Device, snap.device_id)
    device_name = device.name.replace(" ", "_") if device else "device"
    date_str = snap.created_at.strftime("%Y-%m-%d") if snap.created_at else "unknown"
    filename = f"{device_name}-config-v{snap.version}-{date_str}.json"
    return JSONResponse(
        content=json.loads(snap.data_json),
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/{device_id}/settings")
def get_backup_settings(device_id: uuid.UUID, session: DBSession, rbac: RBAC, current: CurrentUser):
    rbac.require("view_devices")
    settings = session.get(DeviceBackupSettings, device_id)
    if not settings:
        return {"auto_backup_enabled": False, "interval_hours": 24, "retention": 10, "last_auto_backup": None}
    return _settings_dict(settings)


@router.put("/{device_id}/settings")
def update_backup_settings(
    device_id: uuid.UUID,
    body: BackupSettingsUpdate,
    session: DBSession,
    rbac: RBAC,
    current: CurrentUser,
):
    rbac.require("edit_devices", "write")
    device = session.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    settings = session.get(DeviceBackupSettings, device_id)
    if not settings:
        settings = DeviceBackupSettings(device_id=device_id)
    settings.auto_backup_enabled = body.auto_backup_enabled
    settings.interval_hours = body.interval_hours
    settings.retention = body.retention
    session.add(settings)
    session.commit()
    session.refresh(settings)
    resp = _settings_dict(settings)
    write_audit(session, "update_backup_settings", current, "device", str(device_id),
                request_body={"auto_backup_enabled": body.auto_backup_enabled,
                              "interval_hours": body.interval_hours,
                              "retention": body.retention},
                response_body=resp)
    return resp


@router.post("/{snapshot_id}/restore")
def restore_backup(
    snapshot_id: uuid.UUID,
    body: RestoreRequest,
    session: DBSession,
    rbac: RBAC,
    current: CurrentUser,
):
    rbac.require("edit_devices", "write")
    snap = session.get(ConfigSnapshot, snapshot_id)
    if not snap:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    config = json.loads(snap.data_json)

    target_device_id = uuid.UUID(body.device_id) if body.device_id else snap.device_id
    device = session.get(Device, target_device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Target device not found")

    creds = decrypt_credentials(device.encrypted_credentials) if device.encrypted_credentials else {}

    # Pre-restore safety backup
    try:
        current_config = get_adapter(device.adapter).fetch_config(device, creds, section="full")
        pre_snap = _store_snapshot(session, device.id, current_config, triggered_by="pre_restore")
        session.commit()
        session.refresh(pre_snap)
    except Exception as exc:
        session.rollback()
        write_audit(None, "restore_backup_failed", current, "device", str(device.id),
                    response_body={"error": str(exc), "phase": "pre_restore_backup",
                                   "snapshot_id": str(snapshot_id)})
        raise HTTPException(status_code=502, detail=f"Failed to create pre-restore backup: {exc}")

    # Restore
    try:
        result = get_adapter(device.adapter).restore_config(device, creds, config)
    except NotImplementedError as exc:
        write_audit(None, "restore_backup_failed", current, "device", str(device.id),
                    response_body={"error": str(exc), "snapshot_id": str(snapshot_id)})
        raise HTTPException(status_code=501, detail=str(exc))
    except Exception as exc:
        write_audit(None, "restore_backup_failed", current, "device", str(device.id),
                    response_body={"error": str(exc), "snapshot_id": str(snapshot_id)})
        raise HTTPException(status_code=502, detail=str(exc))

    if not result.get("success"):
        write_audit(None, "restore_backup_failed", current, "device", str(device.id),
                    response_body={"message": result.get("message"), "snapshot_id": str(snapshot_id)})
        raise HTTPException(status_code=502, detail=result.get("message", "Restore failed"))

    write_audit(None, "restore_backup", current, "device", str(device.id),
                request_body={"snapshot_id": str(snapshot_id), "version": snap.version,
                              "device_name": device.name},
                response_body={"pre_restore_snapshot_id": str(pre_snap.id)})
    return {
        "success": True,
        "message": result.get("message", "Configuration restored successfully"),
        "pre_restore_snapshot_id": str(pre_snap.id),
    }


@router.post("/{device_id}/upload-restore")
def upload_restore(
    device_id: uuid.UUID,
    body: UploadRestoreRequest,
    session: DBSession,
    rbac: RBAC,
    current: CurrentUser,
):
    rbac.require("edit_devices", "write")
    device = session.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    creds = decrypt_credentials(device.encrypted_credentials) if device.encrypted_credentials else {}

    # Pre-restore safety backup
    try:
        current_config = get_adapter(device.adapter).fetch_config(device, creds, section="full")
        pre_snap = _store_snapshot(session, device_id, current_config, triggered_by="pre_restore")
        session.commit()
        session.refresh(pre_snap)
    except Exception as exc:
        session.rollback()
        write_audit(None, "upload_restore_failed", current, "device", str(device_id),
                    response_body={"error": str(exc), "phase": "pre_restore_backup"})
        raise HTTPException(status_code=502, detail=f"Failed to create pre-restore backup: {exc}")

    # Restore
    try:
        result = get_adapter(device.adapter).restore_config(device, creds, body.config)
    except NotImplementedError as exc:
        write_audit(None, "upload_restore_failed", current, "device", str(device_id),
                    response_body={"error": str(exc)})
        raise HTTPException(status_code=501, detail=str(exc))
    except Exception as exc:
        write_audit(None, "upload_restore_failed", current, "device", str(device_id),
                    response_body={"error": str(exc)})
        raise HTTPException(status_code=502, detail=str(exc))

    if not result.get("success"):
        write_audit(None, "upload_restore_failed", current, "device", str(device_id),
                    response_body={"message": result.get("message")})
        raise HTTPException(status_code=502, detail=result.get("message", "Restore failed"))

    # Store uploaded config as a new snapshot
    try:
        snap = _store_snapshot(session, device_id, body.config, triggered_by="upload", label=body.label)
        session.commit()
        session.refresh(snap)
    except Exception as exc:
        session.rollback()
        write_audit(None, "upload_restore", current, "device", str(device_id),
                    response_body={"warning": f"Restore succeeded but snapshot save failed: {exc}",
                                   "pre_restore_snapshot_id": str(pre_snap.id)})
        return {
            "success": True,
            "message": result.get("message", "Configuration restored successfully"),
            "snapshot_id": None,
            "pre_restore_snapshot_id": str(pre_snap.id),
        }

    write_audit(None, "upload_restore", current, "device", str(device_id),
                request_body={"label": body.label},
                response_body={"snapshot_id": str(snap.id), "version": snap.version,
                               "pre_restore_snapshot_id": str(pre_snap.id)})
    return {
        "success": True,
        "message": result.get("message", "Configuration restored successfully"),
        "snapshot_id": str(snap.id),
        "pre_restore_snapshot_id": str(pre_snap.id),
    }


@router.post("/compare")
def compare_backups(body: CompareRequest, session: DBSession, rbac: RBAC, current: CurrentUser):
    rbac.require("view_devices")
    if len(body.snapshot_ids) < 2:
        raise HTTPException(status_code=422, detail="Need at least 2 snapshot IDs")
    snapshots = []
    data: dict = {}
    for sid in body.snapshot_ids:
        try:
            uid = uuid.UUID(sid)
        except ValueError:
            raise HTTPException(status_code=422, detail=f"Invalid UUID: {sid}")
        snap = session.get(ConfigSnapshot, uid)
        if not snap:
            raise HTTPException(status_code=404, detail=f"Snapshot {sid} not found")
        device = session.get(Device, snap.device_id)
        snapshots.append(_snap_dict(snap, device))
        data[sid] = json.loads(snap.data_json)
    return {"snapshots": snapshots, "data": data}
