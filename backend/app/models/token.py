from typing import Optional
from datetime import datetime, timezone
import uuid

from sqlmodel import SQLModel, Field, Column
import sqlalchemy as sa


class ApiToken(SQLModel, table=True):
    __tablename__ = "api_tokens"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    name: str = Field(max_length=128)
    token_hash: str = Field(max_length=64)  # SHA256 hex of the raw token
    prefix: str = Field(max_length=8)       # first 8 chars of raw token for display
    expires_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(sa.DateTime(timezone=True), nullable=True),
    )
    last_used_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(sa.DateTime(timezone=True), nullable=True),
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(sa.DateTime(timezone=True)),
    )
    revoked: bool = Field(default=False)
    ip_allowlist: Optional[str] = Field(default=None, max_length=1024)  # comma-separated CIDRs
