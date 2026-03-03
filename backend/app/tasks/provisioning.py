"""Celery task: clone a device (copy config from source to new device)."""
import logging
from datetime import datetime, timezone
import json

from sqlmodel import Session

from app.tasks.celery_app import celery_app
from app.db.session import get_engine
from app.models.device import Device
from app.models.config import ConfigSnapshot
from app.adapters.registry import get_adapter
from app.services.crypto import decrypt_credentials, encrypt_credentials
from app.services.audit import write_audit

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, name="provisioning.clone_device")
def clone_device(self, source_device_id: str, new_device_id: str, triggered_by_id: str):
    import uuid
    engine = get_engine()
    with Session(engine) as session:
        source = session.get(Device, uuid.UUID(source_device_id))
        target = session.get(Device, uuid.UUID(new_device_id))

        if not source or not target:
            logger.error("Clone task: source or target device not found")
            return {"success": False, "error": "Device not found"}

        try:
            src_creds = decrypt_credentials(source.encrypted_credentials) if source.encrypted_credentials else {}
            src_adapter = get_adapter(source.adapter)

            # Fetch full config from source
            config = src_adapter.fetch_config(source, src_creds, section="full")

            # Store as snapshot on target
            import hashlib
            data_json = json.dumps(config)
            checksum = hashlib.sha256(data_json.encode()).hexdigest()

            snap = ConfigSnapshot(
                device_id=target.id,
                section="full",
                data_json=data_json,
                checksum=checksum,
                version=1,
                is_baseline=True,
                created_at=datetime.now(timezone.utc),
            )
            session.add(snap)

            # Apply config to target if target is online
            if target.adapter == source.adapter:
                tgt_creds = decrypt_credentials(target.encrypted_credentials) if target.encrypted_credentials else {}
                tgt_adapter = get_adapter(target.adapter)
                for section_name, section_data in config.items():
                    if isinstance(section_data, (dict, list)):
                        try:
                            tgt_adapter.apply_patch(target, tgt_creds, section_name, section_data)
                        except Exception as e:
                            logger.warning("Could not apply section '%s' to target: %s", section_name, e)

            session.commit()
            logger.info("Device clone completed: %s -> %s", source_device_id, new_device_id)
            return {"success": True, "device_id": new_device_id}

        except Exception as exc:
            logger.error("Device clone failed: %s", exc)
            return {"success": False, "error": str(exc)}
