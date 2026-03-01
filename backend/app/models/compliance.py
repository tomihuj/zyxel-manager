from typing import Optional
from datetime import datetime, timezone
import uuid

from sqlmodel import SQLModel, Field, Column
import sqlalchemy as sa


class ComplianceRule(SQLModel, table=True):
    __tablename__ = "compliance_rules"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(max_length=128)
    section: str = Field(max_length=64)
    key_path: str = Field(max_length=255)  # dot-notation: "dns.primary"
    operator: str = Field(max_length=16)   # "eq" | "neq" | "contains" | "regex"
    expected_value: str = Field(max_length=512)
    enabled: bool = Field(default=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(sa.DateTime(timezone=True)),
    )


class ComplianceResult(SQLModel, table=True):
    __tablename__ = "compliance_results"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    rule_id: uuid.UUID = Field(foreign_key="compliance_rules.id", index=True)
    device_id: uuid.UUID = Field(foreign_key="devices.id", index=True)
    passed: bool
    actual_value: Optional[str] = Field(default=None, max_length=512)
    checked_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(sa.DateTime(timezone=True)),
    )
