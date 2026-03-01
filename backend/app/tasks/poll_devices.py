"""
Background device polling.
Runs every 30 s via Celery beat but self-throttles based on the
`auto_poll_interval` Redis setting (0 = disabled).
For each device:
  - test_connection  → update status + last_seen
  - if online and firmware_version is NULL → get_device_info to populate it
"""
import logging
import time
from datetime import datetime, timezone

from celery import shared_task

logger = logging.getLogger(__name__)

_LAST_RUN_KEY = "ztm:auto_poll_last_run"
_INTERVAL_KEY = "ztm:setting:auto_poll_interval"


@shared_task(name="poll_devices.poll_all_devices")
def poll_all_devices():
    import redis as redis_lib
    from app.core.config import get_settings

    r = redis_lib.from_url(get_settings().redis_url, decode_responses=True)

    interval = int(r.get(_INTERVAL_KEY) or 0)
    if interval <= 0:
        return {"skipped": True, "reason": "disabled"}

    now = time.time()
    last_run = float(r.get(_LAST_RUN_KEY) or 0)
    if now - last_run < interval - 5:          # 5 s tolerance for beat jitter
        return {"skipped": True, "reason": "too_soon",
                "next_in": int(interval - (now - last_run))}

    r.set(_LAST_RUN_KEY, str(now))

    from sqlmodel import Session, select
    from app.db.session import get_engine
    from app.models.device import Device
    from app.adapters.registry import get_adapter
    from app.services.crypto import decrypt_credentials

    counts = {"online": 0, "offline": 0, "error": 0, "firmware_updated": 0}

    with Session(get_engine()) as session:
        devices = session.exec(select(Device).where(Device.deleted_at == None)).all()  # noqa: E711
        for device in devices:
            try:
                creds = (decrypt_credentials(device.encrypted_credentials)
                         if device.encrypted_credentials else {})
                result = get_adapter(device.adapter).test_connection(
                    device, creds, timeout=5)
                if result.get("success"):
                    device.status = "online"
                    device.last_seen = datetime.now(timezone.utc)
                    if not device.firmware_version:
                        try:
                            info = get_adapter(device.adapter).get_device_info(
                                device, creds)
                            if info.get("firmware_version"):
                                device.firmware_version = info["firmware_version"]
                                counts["firmware_updated"] += 1
                        except Exception:
                            pass
                    counts["online"] += 1
                else:
                    device.status = "offline"
                    counts["offline"] += 1
                session.add(device)
            except Exception as exc:
                logger.warning("poll_all_devices: device %s — %s", device.name, exc)
                counts["error"] += 1

        session.commit()

    logger.info("poll_all_devices: %s", counts)
    return {"polled": len(devices), **counts}
