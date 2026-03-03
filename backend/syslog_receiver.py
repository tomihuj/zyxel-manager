#!/usr/bin/env python3
"""
Standalone UDP syslog receiver.
Binds on 0.0.0.0:5514 (Docker maps host 514 → 5514).
Parses RFC 3164 syslog messages and writes them to the database.
Resolves device_id by matching source IP against devices.mgmt_ip.
Prunes entries older than 30 days once per hour.
"""
import os
import re
import socket
import logging
from datetime import datetime, timezone, timedelta

from sqlmodel import Session, select, create_engine
import sqlalchemy as sa

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("syslog_receiver")

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://zyxel:changeme@db:5432/zyxelmanager",
)
engine = create_engine(DATABASE_URL)

# RFC 3164 syslog regex
# <priority>Mon DD HH:MM:SS hostname program: message
_SYSLOG_RE = re.compile(
    r"^<(\d+)>"
    r"(?:(\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+)?"
    r"(?:(\S+)\s+)?"
    r"(?:(\S+?)(?:\[\d+\])?:\s*)?"
    r"(.*)",
    re.DOTALL,
)

SEVERITY_MASK = 0x07
FACILITY_SHIFT = 3


def _parse(raw: str):
    m = _SYSLOG_RE.match(raw)
    if not m:
        return None
    priority_str, ts_str, hostname, program, message = m.groups()
    priority = int(priority_str)
    severity = priority & SEVERITY_MASK
    facility = priority >> FACILITY_SHIFT
    return {
        "facility": facility,
        "severity": severity,
        "program": (program or "").strip()[:128] or None,
        "message": (message or "").strip(),
    }


_last_prune = datetime.now(timezone.utc)
_ip_cache: dict = {}  # source_ip -> device_id or None


def _resolve_device(session: Session, source_ip: str):
    if source_ip in _ip_cache:
        return _ip_cache[source_ip]
    try:
        from app.models.device import Device
        dev = session.exec(
            select(Device).where(Device.mgmt_ip == source_ip, Device.deleted_at == None)  # noqa: E711
        ).first()
        result = dev.id if dev else None
    except Exception:
        result = None
    _ip_cache[source_ip] = result
    return result


def _prune_old(session: Session):
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    try:
        from app.models.syslog import SyslogEntry
        session.execute(sa.delete(SyslogEntry).where(SyslogEntry.received_at < cutoff))
        session.commit()
        logger.info("Pruned syslog entries older than 30 days")
    except Exception as e:
        logger.warning("Prune failed: %s", e)


def main():
    global _last_prune
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind(("0.0.0.0", 5514))
    logger.info("Syslog receiver listening on UDP 0.0.0.0:5514")

    from app.models.syslog import SyslogEntry

    while True:
        try:
            data, addr = sock.recvfrom(65535)
            source_ip = addr[0]
            raw = data.decode("utf-8", errors="replace").strip()
            parsed = _parse(raw)
            if not parsed:
                logger.debug("Could not parse syslog from %s: %r", source_ip, raw[:80])
                continue

            with Session(engine) as session:
                device_id = _resolve_device(session, source_ip)
                entry = SyslogEntry(
                    source_ip=source_ip,
                    device_id=device_id,
                    facility=parsed["facility"],
                    severity=parsed["severity"],
                    program=parsed["program"],
                    message=parsed["message"][:4096],
                    raw=raw[:8192],
                    received_at=datetime.now(timezone.utc),
                )
                session.add(entry)
                session.commit()

            # Hourly prune
            now = datetime.now(timezone.utc)
            if (now - _last_prune).total_seconds() >= 3600:
                with Session(engine) as session:
                    _prune_old(session)
                _last_prune = now
                _ip_cache.clear()  # refresh device cache hourly

        except KeyboardInterrupt:
            logger.info("Syslog receiver shutting down")
            break
        except Exception as exc:
            logger.error("Error processing syslog packet: %s", exc)


if __name__ == "__main__":
    main()
