from typing import Optional
from datetime import datetime, timezone
import uuid

from sqlmodel import SQLModel, Field, Relationship, Column
import sqlalchemy as sa


class ConfigSnapshot(SQLModel, table=True):
    __tablename__ = "config_snapshots"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    device_id: uuid.UUID = Field(foreign_key="devices.id", index=True)
    section: str = Field(default="full", max_length=64)
    data_json: str = Field(default="{}")
    version: int = Field(default=1)
    checksum: str = Field(max_length=64)
    is_baseline: bool = Field(default=False)
    triggered_by: str = Field(default="sync", max_length=16)
    label: Optional[str] = Field(default=None, max_length=255)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(sa.DateTime(timezone=True)),
    )
    device: Optional["Device"] = Relationship(back_populates="snapshots")
