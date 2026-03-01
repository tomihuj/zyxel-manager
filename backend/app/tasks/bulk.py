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

        if fail_count > 0:
            try:
                from app.tasks.alerts import fire_alert
                fire_alert.delay("job_failed", {
                    "job_id": str(job.id),
                    "job_name": job.name,
                    "fail_count": fail_count,
                    "success_count": success_count,
                })
            except Exception:
                pass

            # Rollback on failure: restore before_json to every device that succeeded
            if job.rollback_on_failure and success_count > 0:
                _log(session, job_id, "info", "Rolling back successful targets due to failures...")
                targets_fresh = session.exec(
                    select(BulkJobTarget).where(BulkJobTarget.job_id == job_id)
                ).all()
                for t in targets_fresh:
                    if t.status == "success" and t.before_json:
                        device = session.get(Device, t.device_id)
                        if not device:
                            continue
                        try:
                            before = json.loads(t.before_json)
                            creds = decrypt_credentials(device.encrypted_credentials) if device.encrypted_credentials else {}
                            adapter = get_adapter(device.adapter)
                            adapter.restore_config(device, creds, before)
                            _log(session, job_id, "info", f"Rolled back {device.name}")
                        except Exception as exc:
                            _log(session, job_id, "error", f"Rollback failed for {device.name}: {exc}")


@celery_app.task(bind=True, name="bulk.run_scheduled_jobs")
def run_scheduled_jobs(self):
    """Beat task: clone and dispatch any BulkJob whose cron expression matches now."""
    try:
        from croniter import croniter
    except ImportError:
        logger.warning("croniter not installed; scheduled jobs disabled")
        return

    engine = get_engine()
    now = datetime.now(timezone.utc)

    with Session(engine) as session:
        jobs = session.exec(
            select(BulkJob).where(
                BulkJob.schedule_enabled == True,
                BulkJob.cron_expression.isnot(None),
            )
        ).all()

        for template_job in jobs:
            try:
                cron = croniter(template_job.cron_expression, now)
                prev = cron.get_prev(datetime)
                # Fire if the previous cron tick was within the last 60 seconds
                delta = (now - prev.replace(tzinfo=timezone.utc)).total_seconds()
                if delta > 60:
                    continue
            except Exception as exc:
                logger.warning("Invalid cron for job %s: %s", template_job.id, exc)
                continue

            # Clone the job
            targets = session.exec(
                select(BulkJobTarget).where(BulkJobTarget.job_id == template_job.id)
            ).all()

            new_job = BulkJob(
                name=f"{template_job.name} (scheduled)",
                section=template_job.section,
                patch_json=template_job.patch_json,
                status="pending",
                created_by=template_job.created_by,
            )
            session.add(new_job)
            session.commit()
            session.refresh(new_job)

            for t in targets:
                session.add(BulkJobTarget(job_id=new_job.id, device_id=t.device_id))
            session.commit()

            run_bulk_job.delay(str(new_job.id))
            logger.info("Dispatched scheduled job clone %s from template %s",
                        new_job.id, template_job.id)
