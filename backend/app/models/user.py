from typing import Optional, List
from datetime import datetime, timezone
import uuid

from sqlmodel import SQLModel, Field, Relationship, Column
import sqlalchemy as sa


class UserRole(SQLModel, table=True):
    __tablename__ = "user_roles"
    user_id: uuid.UUID = Field(foreign_key="users.id", primary_key=True)
    role_id: uuid.UUID = Field(foreign_key="roles.id", primary_key=True)
    assigned_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(sa.DateTime(timezone=True)),
    )


class Role(SQLModel, table=True):
    __tablename__ = "roles"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(unique=True, index=True, max_length=64)
    description: Optional[str] = Field(default=None, max_length=255)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(sa.DateTime(timezone=True)),
    )
    users: List["User"] = Relationship(back_populates="roles", link_model=UserRole)
    permissions: List["Permission"] = Relationship(back_populates="role")


class Permission(SQLModel, table=True):
    __tablename__ = "permissions"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    role_id: uuid.UUID = Field(foreign_key="roles.id", index=True)
    # e.g. "view_devices", "edit_devices", "bulk_actions", "export_reports", "manage_users"
    feature: str = Field(max_length=64)
    # "device", "group", "section", or "*"
    resource_type: str = Field(default="*", max_length=32)
    # specific UUID, section name, or "*" for all
    resource_id: str = Field(default="*", max_length=128)
    # "read" or "write"
    access_level: str = Field(default="read", max_length=16)
    role: Optional[Role] = Relationship(back_populates="permissions")


class User(SQLModel, table=True):
    __tablename__ = "users"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    email: str = Field(unique=True, index=True, max_length=255)
    username: str = Field(unique=True, index=True, max_length=64)
    full_name: Optional[str] = Field(default=None, max_length=128)
    hashed_password: str
    is_active: bool = Field(default=True)
    is_superuser: bool = Field(default=False)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(sa.DateTime(timezone=True)),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(sa.DateTime(timezone=True)),
    )
    roles: List[Role] = Relationship(back_populates="users", link_model=UserRole)
