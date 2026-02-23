"""
Celery task: execute a BulkJob across all target devices.
"""
import json
import logging
from datetime import datetime, timezone

from app.tasks.celery_app import celery_app
from app.db.session import get_engine
from sqlmodel import Session, select

from app.models.job import BulkJob, BulkJobTarget, BulkJobLog
from app.models.device import Device
from app.models.config import ConfigSnapshot
from app.adapters.registry import get_adapter
from app.services.crypto import decrypt_credentials
from app.services.diff import compute_diff, apply_patch as do_patch
import hashlib

logger = logging.getLogger(__name__)


def _log(session: Session, job_id, level: str, message: str):
    session.add(BulkJobLog(job_id=job_id, level=level, message=message))
    session.commit()


@celery_app.task(bind=True, name="bulk.run_bulk_job")
def run_bulk_job(self, job_id: str):
    engine = get_engine()
    with Session(engine) as session:
        job = session.get(BulkJob, job_id)
        if not job:
            return

        job.status = "running"
        job.started_at = datetime.now(timezone.utc)
        session.add(job)
        session.commit()
        _log(session, job_id, "info", f"Starting '{job.name}' (section: {job.section})")

        patch = json.loads(job.patch_json)
        targets = session.exec(select(BulkJobTarget).where(BulkJobTarget.job_id == job_id)).all()
        success_count = fail_count = 0

        for target in targets:
            device = session.get(Device, target.device_id)
            if not device:
                target.status = "failed"
                target.error = "Device not found"
                session.add(target)
                session.commit()
                fail_count += 1
                continue

            _log(session, job_id, "info", f"Processing: {device.name}")
            try:
                adapter = get_adapter(device.adapter)
                creds = decrypt_credentials(device.encrypted_credentials) if device.encrypted_credentials else {}

                before = adapter.fetch_config(device, creds, section=job.section)
                after = do_patch(before, patch)
                diff = compute_diff(before, after)

                target.before_json = json.dumps(before)
                target.after_json = json.dumps(after)
                target.diff_json = json.dumps(diff)

                result = adapter.apply_patch(device, creds, section=job.section, patch=patch)

                if result.get("success"):
                    target.status = "success"
                    success_count += 1
                    _log(session, job_id, "info", f"✓ {device.name}: applied")

                    data_str = json.dumps(after)
                    checksum = hashlib.sha256(data_str.encode()).hexdigest()
                    latest = session.exec(
                        select(ConfigSnapshot)
                        .where(ConfigSnapshot.device_id == device.id,
                               ConfigSnapshot.section == job.section)
                        .order_by(ConfigSnapshot.version.desc())
                    ).first()
                    version = (latest.version + 1) if latest else 1
                    session.add(ConfigSnapshot(
                        device_id=device.id, section=job.section,
                        data_json=data_str, checksum=checksum, version=version,
                    ))
                else:
                    target.status = "failed"
                    target.error = result.get("message", "Unknown error")
                    fail_count += 1
                    _log(session, job_id, "error", f"✗ {device.name}: {target.error}")

            except Exception as e:
                target.status = "failed"
                target.error = str(e)
                fail_count += 1
                _log(session, job_id, "error", f"✗ {device.name}: {e}")
                logger.exception("Error in job %s device %s", job_id, target.device_id)

            target.executed_at = datetime.now(timezone.utc)
            session.add(target)
            session.commit()

        job.status = "completed" if fail_count == 0 else "partial"
        job.completed_at = datetime.now(timezone.utc)
        session.add(job)
        session.commit()
        _log(session, job_id, "info", f"Done: {success_count} ok, {fail_count} failed")
