from typing import Optional
from datetime import datetime, timezone
import uuid

from sqlmodel import SQLModel, Field, Column
import sqlalchemy as sa


class AlertRule(SQLModel, table=True):
    __tablename__ = "alert_rules"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(max_length=128)
    # "device_offline" | "drift_detected" | "job_failed" | "compliance_fail"
    event_type: str = Field(max_length=64)
    enabled: bool = Field(default=True)
    webhook_url: Optional[str] = Field(default=None, max_length=2048)
    webhook_secret: Optional[str] = Field(default=None, max_length=256)
    # "webhook" | "email" | "slack"
    delivery_type: str = Field(default="webhook", max_length=16)
    email_to: Optional[str] = Field(default=None, max_length=255)
    slack_webhook_url: Optional[str] = Field(default=None, max_length=2048)
    created_by: uuid.UUID = Field(foreign_key="users.id")
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(sa.DateTime(timezone=True)),
    )


class AlertDelivery(SQLModel, table=True):
    __tablename__ = "alert_deliveries"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    rule_id: uuid.UUID = Field(foreign_key="alert_rules.id", index=True)
    event_type: str = Field(max_length=64)
    payload_json: str = Field(default="{}")
    status: str = Field(max_length=16)  # "sent" | "failed"
    http_status: Optional[int] = Field(default=None)
    error: Optional[str] = Field(default=None, max_length=2048)
    delivered_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(sa.DateTime(timezone=True)),
    )
    retry_count: int = Field(default=0)
    next_retry_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(sa.DateTime(timezone=True), nullable=True),
    )
