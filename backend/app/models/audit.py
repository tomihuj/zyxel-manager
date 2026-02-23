from typing import Optional
from datetime import datetime, timezone
import uuid

from sqlmodel import SQLModel, Field, Column
import sqlalchemy as sa


class AuditLog(SQLModel, table=True):
    __tablename__ = "audit_logs"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id", index=True)
    username: Optional[str] = Field(default=None, max_length=64)
    action: str = Field(max_length=64, index=True)
    resource_type: Optional[str] = Field(default=None, max_length=32)
    resource_id: Optional[str] = Field(default=None, max_length=128)
    details: Optional[str] = Field(default=None)
    ip_address: Optional[str] = Field(default=None, max_length=45)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(sa.DateTime(timezone=True), index=True),
    )
