from typing import Optional
from datetime import datetime, timezone
import uuid

from sqlmodel import SQLModel, Field, Column
import sqlalchemy as sa


class SecurityScan(SQLModel, table=True):
    __tablename__ = "security_scans"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    device_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
    )
    triggered_by: str = Field(max_length=32)  # scheduled | manual | snapshot
    triggered_by_user: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
    )
    status: str = Field(default="running", max_length=16)  # running | completed | failed | cancelled
    celery_task_id: Optional[str] = Field(default=None, max_length=256)
    findings_count: int = Field(default=0)
    critical_count: int = Field(default=0)
    high_count: int = Field(default=0)
    medium_count: int = Field(default=0)
    low_count: int = Field(default=0)
    info_count: int = Field(default=0)
    risk_score: int = Field(default=100)
    started_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(sa.DateTime(timezone=True)),
    )
    completed_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(sa.DateTime(timezone=True), nullable=True),
    )
    error: Optional[str] = Field(default=None, max_length=1024)


class SecurityFinding(SQLModel, table=True):
    __tablename__ = "security_findings"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    device_id: uuid.UUID = Field(
        sa_column=Column(
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("devices.id", ondelete="CASCADE"),
            index=True,
            nullable=False,
        )
    )
    scan_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("security_scans.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    category: str = Field(max_length=64)
    # exposed_service | permissive_rule | weak_protocol | missing_hardening | firmware | authentication
    severity: str = Field(max_length=16)  # critical | high | medium | low | info
    title: str = Field(max_length=256)
    description: str = Field(max_length=1024)
    recommendation: str = Field(max_length=1024)
    remediation_patch: Optional[str] = Field(default=None)  # JSON {section, patch}
    config_path: Optional[str] = Field(default=None, max_length=256)
    status: str = Field(default="open", max_length=16)  # open | suppressed | resolved
    suppressed_by: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    suppressed_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(sa.DateTime(timezone=True), nullable=True),
    )
    suppressed_reason: Optional[str] = Field(default=None, max_length=512)
    compliance_refs: Optional[str] = Field(default=None, max_length=512)  # JSON list
    first_seen: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(sa.DateTime(timezone=True)),
    )
    last_seen: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(sa.DateTime(timezone=True)),
    )
    resolved_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(sa.DateTime(timezone=True), nullable=True),
    )


class SecurityFindingExclusion(SQLModel, table=True):
    __tablename__ = "security_finding_exclusions"
    __table_args__ = (
        sa.UniqueConstraint("device_id", "finding_title", name="uq_exclusion_device_title"),
    )
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    device_id: uuid.UUID = Field(
        sa_column=Column(
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("devices.id", ondelete="CASCADE"),
            index=True,
            nullable=False,
        )
    )
    finding_title: str = Field(max_length=256)
    reason: str = Field(max_length=1024)
    created_by: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(sa.DateTime(timezone=True)),
    )


class DeviceRiskScore(SQLModel, table=True):
    __tablename__ = "device_risk_scores"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    device_id: uuid.UUID = Field(
        sa_column=Column(
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("devices.id", ondelete="CASCADE"),
            index=True,
            nullable=False,
        )
    )
    score: int = Field(default=100)
    grade: str = Field(default="A", max_length=1)
    critical_findings: int = Field(default=0)
    high_findings: int = Field(default=0)
    medium_findings: int = Field(default=0)
    low_findings: int = Field(default=0)
    open_findings: int = Field(default=0)
    calculated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(sa.DateTime(timezone=True)),
    )
