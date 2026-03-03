from typing import Optional
from datetime import datetime, timezone
import uuid

from sqlmodel import SQLModel, Field, Column
import sqlalchemy as sa


class FirmwareUpgrade(SQLModel, table=True):
    __tablename__ = "firmware_upgrades"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    device_id: uuid.UUID = Field(foreign_key="devices.id", index=True)
    previous_version: Optional[str] = Field(default=None, max_length=64)
    target_version: str = Field(max_length=64)
    # pending|running|completed|failed|cancelled
    status: str = Field(default="pending", max_length=16)
    celery_task_id: Optional[str] = Field(default=None, max_length=255)
    triggered_by: uuid.UUID = Field(foreign_key="users.id")
    started_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(sa.DateTime(timezone=True), nullable=True),
    )
    completed_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(sa.DateTime(timezone=True), nullable=True),
    )
    error: Optional[str] = Field(default=None, sa_column=Column(sa.Text, nullable=True))
    firmware_file_path: Optional[str] = Field(default=None, sa_column=Column(sa.Text, nullable=True))
    firmware_file_name: Optional[str] = Field(default=None, max_length=255)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(sa.DateTime(timezone=True)),
    )
