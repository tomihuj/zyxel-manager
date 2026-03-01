"""
Celery tasks: manual/scheduled device config backups.
"""
import json
import hashlib
import logging
from datetime import datetime, timezone

from app.tasks.celery_app import celery_app
from app.db.session import get_engine
from sqlmodel import Session, select

from app.models.device import Device
from app.models.config import ConfigSnapshot
from app.models.backup import DeviceBackupSettings
from app.adapters.registry import get_adapter
from app.services.crypto import decrypt_credentials

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, name="backup.backup_device")
def backup_device(self, device_id: str, triggered_by: str = "manual"):
    engine = get_engine()
    with Session(engine) as session:
        import uuid as _uuid
        device = session.get(Device, _uuid.UUID(device_id))
        if not device:
            logger.error("backup_device: device %s not found", device_id)
            return {"error": "Device not found"}

        creds = decrypt_credentials(device.encrypted_credentials) if device.encrypted_credentials else {}
        config = get_adapter(device.adapter).fetch_config(device, creds, section="full")
        data_str = json.dumps(config)
        checksum = hashlib.sha256(data_str.encode()).hexdigest()

        latest = session.exec(
            select(ConfigSnapshot)
            .where(ConfigSnapshot.device_id == device.id)
            .order_by(ConfigSnapshot.version.desc())
        ).first()
        version = (latest.version + 1) if latest else 1

        snapshot = ConfigSnapshot(
            device_id=device.id,
            data_json=data_str,
            checksum=checksum,
            version=version,
            triggered_by=triggered_by,
        )
        session.add(snapshot)
        session.flush()
        snapshot_id = str(snapshot.id)
        snapshot_created_at = snapshot.created_at

        # Enforce retention
        settings = session.get(DeviceBackupSettings, device.id)
        if settings and settings.retention is not None:
            all_snaps = session.exec(
                select(ConfigSnapshot)
                .where(ConfigSnapshot.device_id == device.id)
                .order_by(ConfigSnapshot.created_at.asc())
            ).all()
            excess = len(all_snaps) - settings.retention
            if excess > 0:
                for old in all_snaps[:excess]:
                    session.delete(old)

        # Update last_auto_backup
        if not settings:
            settings = DeviceBackupSettings(device_id=device.id)
        settings.last_auto_backup = datetime.now(timezone.utc)
        session.add(settings)
        session.commit()

        return {
            "id": snapshot_id,
            "version": version,
            "checksum": checksum,
            "triggered_by": triggered_by,
            "created_at": snapshot_created_at.isoformat() if snapshot_created_at else None,
        }


@celery_app.task(name="backup.scheduled_backup_check")
def scheduled_backup_check():
    engine = get_engine()
    with Session(engine) as session:
        all_settings = session.exec(
            select(DeviceBackupSettings).where(DeviceBackupSettings.auto_backup_enabled == True)
        ).all()
        now = datetime.now(timezone.utc)
        dispatched = 0
        for s in all_settings:
            if s.last_auto_backup is None:
                should_run = True
            else:
                last = s.last_auto_backup
                if last.tzinfo is None:
                    last = last.replace(tzinfo=timezone.utc)
                elapsed_hours = (now - last).total_seconds() / 3600
                should_run = elapsed_hours >= s.interval_hours
            if should_run:
                backup_device.delay(str(s.device_id), "schedule")
                dispatched += 1
        return {"dispatched": dispatched}
