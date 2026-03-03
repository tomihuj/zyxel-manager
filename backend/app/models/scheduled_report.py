from typing import Optional
from datetime import datetime, timezone
import uuid

from sqlmodel import SQLModel, Field, Column
import sqlalchemy as sa


class ScheduledReport(SQLModel, table=True):
    __tablename__ = "scheduled_reports"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(max_length=128)
    device_ids: str = Field(default="[]")   # JSON list of UUIDs
    group_ids: str = Field(default="[]")    # JSON list of UUIDs
    tags: str = Field(default="[]")         # JSON list of tag strings
    sections: str = Field(default="[]")     # JSON list of section names
    format: str = Field(default="json", max_length=8)  # json|csv
    cron_expression: str = Field(max_length=64)
    delivery_email: str = Field(max_length=255)
    enabled: bool = Field(default=True)
    last_run: Optional[datetime] = Field(
        default=None,
        sa_column=Column(sa.DateTime(timezone=True), nullable=True),
    )
    next_run: Optional[datetime] = Field(
        default=None,
        sa_column=Column(sa.DateTime(timezone=True), nullable=True),
    )
    created_by: uuid.UUID = Field(foreign_key="users.id")
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(sa.DateTime(timezone=True)),
    )
