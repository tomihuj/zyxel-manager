from typing import Optional
from datetime import datetime, timezone
import uuid

from sqlmodel import SQLModel, Field, Column
import sqlalchemy as sa


class VpnTunnel(SQLModel, table=True):
    __tablename__ = "vpn_tunnels"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    device_id: uuid.UUID = Field(foreign_key="devices.id", index=True)
    tunnel_name: str = Field(max_length=128)
    tunnel_type: str = Field(default="ipsec", max_length=16)  # ipsec|ssl|l2tp
    remote_gateway: Optional[str] = Field(default=None, max_length=255)
    status: str = Field(default="unknown", max_length=16)  # up|down|unknown
    local_subnet: Optional[str] = Field(default=None, max_length=128)
    remote_subnet: Optional[str] = Field(default=None, max_length=128)
    collected_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(sa.DateTime(timezone=True)),
    )

    __table_args__ = (
        sa.UniqueConstraint("device_id", "tunnel_name", name="uq_vpn_device_tunnel"),
    )
