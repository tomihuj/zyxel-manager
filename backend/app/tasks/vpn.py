"""Celery task: collect VPN tunnel status from all devices periodically."""
import logging
from datetime import datetime, timezone

from sqlmodel import Session, select

from app.tasks.celery_app import celery_app
from app.db.session import get_engine
from app.models.device import Device
from app.models.vpn import VpnTunnel
from app.adapters.registry import get_adapter
from app.services.crypto import decrypt_credentials

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, name="vpn.collect_vpn_status")
def collect_vpn_status(self):
    engine = get_engine()
    with Session(engine) as session:
        devices = session.exec(
            select(Device).where(Device.deleted_at == None, Device.status == "online")  # noqa: E711
        ).all()
        for device in devices:
            try:
                _collect_device_vpn(session, device)
            except Exception as exc:
                logger.warning("VPN collection failed for device %s: %s", device.id, exc)


def _collect_device_vpn(session: Session, device: Device):
    creds = decrypt_credentials(device.encrypted_credentials) if device.encrypted_credentials else {}
    adapter = get_adapter(device.adapter)
    vpn_data = adapter.fetch_config(device, creds, section="vpn")

    tunnels_raw = []
    if isinstance(vpn_data, dict):
        for t in vpn_data.get("ipsec_tunnels", []):
            tunnels_raw.append({
                "tunnel_name": t.get("name", "unnamed"),
                "tunnel_type": "ipsec",
                "remote_gateway": t.get("remote_gateway"),
                "status": t.get("status", "unknown"),
                "local_subnet": t.get("local_subnet"),
                "remote_subnet": t.get("remote_subnet"),
            })
        if vpn_data.get("ssl_tunnels"):
            for t in vpn_data["ssl_tunnels"]:
                tunnels_raw.append({
                    "tunnel_name": t.get("name", "ssl-vpn"),
                    "tunnel_type": "ssl",
                    "remote_gateway": t.get("remote_gateway"),
                    "status": t.get("status", "unknown"),
                    "local_subnet": t.get("local_subnet"),
                    "remote_subnet": t.get("remote_subnet"),
                })

    now = datetime.now(timezone.utc)
    for t in tunnels_raw:
        existing = session.exec(
            select(VpnTunnel).where(
                VpnTunnel.device_id == device.id,
                VpnTunnel.tunnel_name == t["tunnel_name"],
            )
        ).first()

        prev_status = existing.status if existing else None

        if existing:
            existing.tunnel_type = t["tunnel_type"]
            existing.remote_gateway = t["remote_gateway"]
            existing.status = t["status"]
            existing.local_subnet = t["local_subnet"]
            existing.remote_subnet = t["remote_subnet"]
            existing.collected_at = now
            session.add(existing)
        else:
            tunnel = VpnTunnel(
                device_id=device.id,
                tunnel_name=t["tunnel_name"],
                tunnel_type=t["tunnel_type"],
                remote_gateway=t["remote_gateway"],
                status=t["status"],
                local_subnet=t["local_subnet"],
                remote_subnet=t["remote_subnet"],
                collected_at=now,
            )
            session.add(tunnel)

        # Fire alert if tunnel newly went down
        if prev_status and prev_status != "down" and t["status"] == "down":
            from app.tasks.alerts import fire_alert
            fire_alert.delay("vpn_tunnel_down", {
                "device_id": str(device.id),
                "device_name": device.name,
                "tunnel_name": t["tunnel_name"],
                "tunnel_type": t["tunnel_type"],
            })

    session.commit()
    logger.debug("Collected VPN status for device %s: %d tunnels", device.id, len(tunnels_raw))
