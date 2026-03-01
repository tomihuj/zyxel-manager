from datetime import datetime, timezone
from typing import Optional
import uuid
from sqlmodel import SQLModel, Field, Column
import sqlalchemy as sa


class DeviceMetric(SQLModel, table=True):
    __tablename__ = "device_metrics"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    device_id: uuid.UUID = Field(foreign_key="devices.id", index=True)
    cpu_pct: Optional[float] = Field(default=None)
    memory_pct: Optional[float] = Field(default=None)
    uptime_seconds: Optional[int] = Field(default=None)
    collected_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(sa.DateTime(timezone=True)),
    )
