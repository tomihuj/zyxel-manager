from typing import Optional, List
from datetime import datetime, timezone
import uuid

from sqlmodel import SQLModel, Field, Relationship, Column
import sqlalchemy as sa


class GroupMembership(SQLModel, table=True):
    __tablename__ = "group_memberships"
    device_id: uuid.UUID = Field(foreign_key="devices.id", primary_key=True)
    group_id: uuid.UUID = Field(foreign_key="device_groups.id", primary_key=True)


class DeviceGroup(SQLModel, table=True):
    __tablename__ = "device_groups"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(unique=True, index=True, max_length=128)
    description: Optional[str] = Field(default=None, max_length=512)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(sa.DateTime(timezone=True)),
    )
    devices: List["Device"] = Relationship(back_populates="groups", link_model=GroupMembership)


class Device(SQLModel, table=True):
    __tablename__ = "devices"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(index=True, max_length=128)
    model: str = Field(default="USG FLEX 100", max_length=64)
    mgmt_ip: str = Field(max_length=255)
    port: int = Field(default=443)
    protocol: str = Field(default="https", max_length=8)
    # "mock" or "zyxel"
    adapter: str = Field(default="mock", max_length=32)
    # Encrypted JSON: {"username": "...", "password": "..."}
    encrypted_credentials: Optional[str] = Field(default=None)
    # JSON array string of tags
    tags: Optional[str] = Field(default="[]", max_length=1024)
    status: str = Field(default="unknown", max_length=16)
    last_seen: Optional[datetime] = Field(
        default=None,
        sa_column=Column(sa.DateTime(timezone=True), nullable=True),
    )
    firmware_version: Optional[str] = Field(default=None, max_length=64)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(sa.DateTime(timezone=True)),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(sa.DateTime(timezone=True)),
    )
    drift_detected: bool = Field(default=False)
    drift_detected_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(sa.DateTime(timezone=True), nullable=True),
    )
    notes: Optional[str] = Field(default=None, sa_column=Column(sa.Text, nullable=True))
    label_color: Optional[str] = Field(default=None, max_length=16)
    credentials_updated_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(sa.DateTime(timezone=True), nullable=True),
    )
    deleted_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(sa.DateTime(timezone=True), nullable=True),
    )
    groups: List[DeviceGroup] = Relationship(back_populates="devices", link_model=GroupMembership)
    snapshots: List["ConfigSnapshot"] = Relationship(back_populates="device")
