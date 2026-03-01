from datetime import datetime, timezone
from typing import Optional
import uuid
from sqlmodel import SQLModel, Field, Column
import sqlalchemy as sa


class RefreshToken(SQLModel, table=True):
    __tablename__ = "refresh_tokens"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    token_hash: str = Field(max_length=64, unique=True)
    user_agent: Optional[str] = Field(default=None, max_length=512)
    ip_address: Optional[str] = Field(default=None, max_length=64)
    expires_at: datetime = Field(sa_column=Column(sa.DateTime(timezone=True)))
    revoked: bool = Field(default=False)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(sa.DateTime(timezone=True)),
    )
    last_used_at: Optional[datetime] = Field(
        default=None, sa_column=Column(sa.DateTime(timezone=True), nullable=True)
    )
