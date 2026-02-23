from typing import Optional
from datetime import datetime, timezone
import uuid

from sqlmodel import SQLModel, Field, Relationship, Column
import sqlalchemy as sa


class BulkJob(SQLModel, table=True):
    __tablename__ = "bulk_jobs"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(max_length=128)
    section: str = Field(max_length=64)
    patch_json: str = Field(default="{}")
    status: str = Field(default="pending", max_length=16)
    created_by: uuid.UUID = Field(foreign_key="users.id")
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(sa.DateTime(timezone=True)),
    )
    started_at: Optional[datetime] = Field(
        default=None, sa_column=Column(sa.DateTime(timezone=True), nullable=True)
    )
    completed_at: Optional[datetime] = Field(
        default=None, sa_column=Column(sa.DateTime(timezone=True), nullable=True)
    )
    celery_task_id: Optional[str] = Field(default=None, max_length=128)
    targets: list["BulkJobTarget"] = Relationship(back_populates="job")
    logs: list["BulkJobLog"] = Relationship(back_populates="job")


class BulkJobTarget(SQLModel, table=True):
    __tablename__ = "bulk_job_targets"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    job_id: uuid.UUID = Field(foreign_key="bulk_jobs.id", index=True)
    device_id: uuid.UUID = Field(foreign_key="devices.id")
    status: str = Field(default="pending", max_length=16)
    before_json: Optional[str] = Field(default=None)
    after_json: Optional[str] = Field(default=None)
    diff_json: Optional[str] = Field(default=None)
    error: Optional[str] = Field(default=None, max_length=2048)
    executed_at: Optional[datetime] = Field(
        default=None, sa_column=Column(sa.DateTime(timezone=True), nullable=True)
    )
    job: Optional[BulkJob] = Relationship(back_populates="targets")


class BulkJobLog(SQLModel, table=True):
    __tablename__ = "bulk_job_logs"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    job_id: uuid.UUID = Field(foreign_key="bulk_jobs.id", index=True)
    level: str = Field(default="info", max_length=8)
    message: str = Field(max_length=4096)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(sa.DateTime(timezone=True)),
    )
    job: Optional[BulkJob] = Relationship(back_populates="logs")
