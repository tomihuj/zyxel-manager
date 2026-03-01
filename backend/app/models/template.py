from typing import Optional
from datetime import datetime, timezone
import uuid

import sqlalchemy as sa
from sqlmodel import SQLModel, Field, Column


class ConfigTemplate(SQLModel, table=True):
    __tablename__ = "config_templates"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(unique=True, index=True, max_length=128)
    description: Optional[str] = Field(default=None, max_length=512)
    section: str = Field(max_length=64)
    data_json: str = Field(
        default="{}",
        sa_column=Column(sa.Text, nullable=False, server_default="{}"),
    )
    created_by: uuid.UUID = Field(foreign_key="users.id")
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(sa.DateTime(timezone=True)),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(sa.DateTime(timezone=True)),
    )
