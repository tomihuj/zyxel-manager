import uuid
from typing import Optional

from fastapi import APIRouter, Query
from sqlmodel import select

from app.core.deps import CurrentUser, DBSession
from app.models.vpn import VpnTunnel
from app.models.device import Device

router = APIRouter()


def _tunnel_dict(t: VpnTunnel, device_name: Optional[str] = None) -> dict:
    return {
        "id": str(t.id),
        "device_id": str(t.device_id),
        "device_name": device_name,
        "tunnel_name": t.tunnel_name,
        "tunnel_type": t.tunnel_type,
        "remote_gateway": t.remote_gateway,
        "status": t.status,
        "local_subnet": t.local_subnet,
        "remote_subnet": t.remote_subnet,
        "collected_at": t.collected_at,
    }


@router.get("/tunnels")
def list_tunnels(
    current: CurrentUser,
    session: DBSession,
    device_id: Optional[uuid.UUID] = Query(default=None),
    status: Optional[str] = Query(default=None),
):
    stmt = select(VpnTunnel)
    if device_id:
        stmt = stmt.where(VpnTunnel.device_id == device_id)
    if status:
        stmt = stmt.where(VpnTunnel.status == status)
    tunnels = session.exec(stmt.order_by(VpnTunnel.collected_at.desc())).all()

    # Build device name map
    device_ids = {t.device_id for t in tunnels}
    name_map = {}
    for did in device_ids:
        d = session.get(Device, did)
        if d:
            name_map[did] = d.name

    return [_tunnel_dict(t, name_map.get(t.device_id)) for t in tunnels]


@router.get("/summary")
def get_vpn_summary(current: CurrentUser, session: DBSession):
    tunnels = session.exec(select(VpnTunnel)).all()
    total = len(tunnels)
    up = sum(1 for t in tunnels if t.status == "up")
    down = sum(1 for t in tunnels if t.status == "down")
    unknown = sum(1 for t in tunnels if t.status == "unknown")
    return {"total": total, "up": up, "down": down, "unknown": unknown}
