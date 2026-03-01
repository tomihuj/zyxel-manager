"""Celery task: collect device metrics (CPU, memory, uptime) periodically."""
import hashlib
import logging
import random
from datetime import datetime, timezone

from sqlmodel import Session, select

from app.tasks.celery_app import celery_app
from app.db.session import get_engine
from app.models.device import Device
from app.models.metric import DeviceMetric
from app.adapters.registry import get_adapter
from app.services.crypto import decrypt_credentials

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, name="metrics.collect_all_metrics")
def collect_all_metrics(self):
    engine = get_engine()
    with Session(engine) as session:
        devices = session.exec(select(Device).where(Device.deleted_at == None)).all()  # noqa: E711
        for device in devices:
            try:
                _collect_device_metrics(session, device)
            except Exception as exc:
                logger.warning("Metrics collection failed for device %s: %s", device.id, exc)


def _collect_device_metrics(session: Session, device: Device):
    creds = decrypt_credentials(device.encrypted_credentials) if device.encrypted_credentials else {}
    adapter = get_adapter(device.adapter)

    if device.adapter == "mock":
        # Simulate metrics with deterministic seed that shifts every 5 minutes
        seed = int(hashlib.md5(str(device.id).encode()).hexdigest(), 16) % 10000
        bucket = int(datetime.now(timezone.utc).timestamp() / 300)
        rng = random.Random(seed + bucket)
        cpu_pct = round(rng.uniform(10, 80), 1)
        memory_pct = round(rng.uniform(20, 75), 1)
        info = adapter.get_device_info(device, creds)
        uptime_seconds = info.get("uptime_seconds", 0)
    else:
        info = adapter.get_device_info(device, creds)
        uptime_seconds = info.get("uptime_seconds", 0)
        cpu_pct = info.get("cpu_pct", 0.0)
        memory_pct = info.get("memory_pct", 0.0)

    metric = DeviceMetric(
        device_id=device.id,
        cpu_pct=cpu_pct,
        memory_pct=memory_pct,
        uptime_seconds=uptime_seconds,
        collected_at=datetime.now(timezone.utc),
    )
    session.add(metric)
    session.commit()
    logger.debug("Collected metrics for device %s: cpu=%.1f%% mem=%.1f%%",
                 device.id, cpu_pct, memory_pct)
