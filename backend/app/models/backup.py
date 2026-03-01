from typing import Optional
from datetime import datetime
import uuid

from sqlmodel import SQLModel, Field, Column
import sqlalchemy as sa


class DeviceBackupSettings(SQLModel, table=True):
    __tablename__ = "device_backup_settings"
    device_id: uuid.UUID = Field(foreign_key="devices.id", primary_key=True)
    auto_backup_enabled: bool = Field(default=False)
    interval_hours: int = Field(default=24)
    retention: Optional[int] = Field(default=10)
    last_auto_backup: Optional[datetime] = Field(
        default=None, sa_column=Column(sa.DateTime(timezone=True))
    )
