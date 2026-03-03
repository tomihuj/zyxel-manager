from typing import Optional
from datetime import datetime, timezone
import uuid

from sqlmodel import SQLModel, Field, Column
import sqlalchemy as sa


class SyslogEntry(SQLModel, table=True):
    __tablename__ = "syslog_entries"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    source_ip: str = Field(max_length=45, index=True)
    device_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(sa.UUID(as_uuid=True), sa.ForeignKey("devices.id"), nullable=True, index=True),
    )
    facility: int = Field(default=1)
    severity: int = Field(default=6)   # 0=emerg ... 7=debug
    program: Optional[str] = Field(default=None, max_length=128)
    message: str = Field(sa_column=Column(sa.Text))
    raw: Optional[str] = Field(default=None, sa_column=Column(sa.Text, nullable=True))
    received_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(sa.DateTime(timezone=True), index=True),
    )
