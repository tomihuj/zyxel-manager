"""
Celery task: detect config drift across all devices.
Compares latest 'full' snapshot against the baseline snapshot.
"""
import logging
from datetime import datetime, timezone

from sqlmodel import Session, select

from app.tasks.celery_app import celery_app
from app.db.session import get_engine
from app.models.device import Device
from app.models.config import ConfigSnapshot

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, name="drift.check_drift_all")
def check_drift_all(self):
    engine = get_engine()
    with Session(engine) as session:
        devices = session.exec(select(Device)).all()
        for device in devices:
            try:
                _check_device_drift(session, device)
            except Exception as exc:
                logger.exception("Drift check failed for device %s: %s", device.id, exc)


def _check_device_drift(session: Session, device: Device):
    baseline = session.exec(
        select(ConfigSnapshot)
        .where(ConfigSnapshot.device_id == device.id,
               ConfigSnapshot.is_baseline == True,
               ConfigSnapshot.section == "full")
        .order_by(ConfigSnapshot.version.desc())
    ).first()

    if not baseline:
        return

    latest = session.exec(
        select(ConfigSnapshot)
        .where(ConfigSnapshot.device_id == device.id,
               ConfigSnapshot.section == "full")
        .order_by(ConfigSnapshot.version.desc())
    ).first()

    if not latest or latest.id == baseline.id:
        return

    drift = latest.checksum != baseline.checksum
    if drift and not device.drift_detected:
        device.drift_detected = True
        device.drift_detected_at = datetime.now(timezone.utc)
        session.add(device)
        session.commit()
        logger.info("Drift detected on device %s", device.name)
        # Fire alert
        try:
            from app.tasks.alerts import fire_alert
            fire_alert.delay("drift_detected", {
                "device_id": str(device.id),
                "device_name": device.name,
                "baseline_checksum": baseline.checksum,
                "latest_checksum": latest.checksum,
                "detected_at": datetime.now(timezone.utc).isoformat(),
            })
        except Exception as exc:
            logger.warning("Could not fire drift alert: %s", exc)
    elif not drift and device.drift_detected:
        device.drift_detected = False
        device.drift_detected_at = None
        session.add(device)
        session.commit()
        logger.info("Drift cleared on device %s", device.name)
