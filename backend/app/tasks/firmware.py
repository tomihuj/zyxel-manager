"""Celery task: run firmware upgrade on a device."""
import logging
import os
from datetime import datetime, timezone

from sqlmodel import Session

from app.tasks.celery_app import celery_app
from app.db.session import get_engine
from app.models.firmware import FirmwareUpgrade
from app.models.device import Device
from app.adapters.registry import get_adapter
from app.services.crypto import decrypt_credentials

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, name="firmware.run_upgrade")
def run_upgrade(self, upgrade_id: str):
    engine = get_engine()
    import uuid
    with Session(engine) as session:
        upgrade = session.get(FirmwareUpgrade, uuid.UUID(upgrade_id))
        if not upgrade:
            logger.error("FirmwareUpgrade %s not found", upgrade_id)
            return

        device = session.get(Device, upgrade.device_id)
        if not device:
            upgrade.status = "failed"
            upgrade.error = "Device not found"
            upgrade.completed_at = datetime.now(timezone.utc)
            session.add(upgrade)
            session.commit()
            return

        upgrade.status = "running"
        upgrade.started_at = datetime.now(timezone.utc)
        session.add(upgrade)
        session.commit()

        try:
            creds = decrypt_credentials(device.encrypted_credentials) if device.encrypted_credentials else {}
            adapter = get_adapter(device.adapter)
            result = adapter.upgrade_firmware(
                device, creds, upgrade.target_version,
                file_path=upgrade.firmware_file_path,
            )

            if result.get("success"):
                device.firmware_version = upgrade.target_version
                device.updated_at = datetime.now(timezone.utc)
                session.add(device)
                upgrade.status = "completed"
                logger.info("Firmware upgrade completed for device %s: %s -> %s",
                            device.id, upgrade.previous_version, upgrade.target_version)
            else:
                upgrade.status = "failed"
                upgrade.error = result.get("message", "Unknown error")
                logger.warning("Firmware upgrade failed for device %s: %s", device.id, upgrade.error)

        except Exception as exc:
            upgrade.status = "failed"
            upgrade.error = str(exc)
            logger.error("Firmware upgrade exception for device %s: %s", device.id, exc)

        upgrade.completed_at = datetime.now(timezone.utc)
        session.add(upgrade)
        session.commit()

        # Clean up uploaded file
        if upgrade.firmware_file_path and os.path.exists(upgrade.firmware_file_path):
            try:
                os.remove(upgrade.firmware_file_path)
            except OSError:
                pass
