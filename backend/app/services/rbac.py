"""
Role-Based Access Control service.

Superusers bypass all checks.
Permission scoping: feature + resource_type + resource_id + access_level.
"""
from typing import Optional
from sqlmodel import Session, select

from app.models.user import User, UserRole, Role, Permission


class RBACService:
    def __init__(self, session: Session, user: User):
        self.session = session
        self.user = user

    def _get_permissions(self) -> list[Permission]:
        stmt = (
            select(Permission)
            .join(Role, Permission.role_id == Role.id)
            .join(UserRole, UserRole.role_id == Role.id)
            .where(UserRole.user_id == self.user.id)
        )
        return self.session.exec(stmt).all()

    def can(
        self,
        feature: str,
        access_level: str = "read",
        resource_type: str = "*",
        resource_id: str = "*",
    ) -> bool:
        if self.user.is_superuser:
            return True
        for p in self._get_permissions():
            if p.feature not in (feature, "*"):
                continue
            if p.access_level == "read" and access_level == "write":
                continue
            if p.resource_type not in ("*", resource_type):
                continue
            if p.resource_id not in ("*", resource_id):
                continue
            return True
        return False

    def require(
        self,
        feature: str,
        access_level: str = "read",
        resource_type: str = "*",
        resource_id: str = "*",
    ):
        from fastapi import HTTPException, status
        if not self.can(feature, access_level, resource_type, resource_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: {feature}/{access_level}",
            )

    def accessible_device_ids(self) -> Optional[list[str]]:
        """Return list of accessible device IDs, or None meaning 'all'."""
        if self.user.is_superuser:
            return None
        ids = set()
        for p in self._get_permissions():
            if p.feature in ("view_devices", "edit_devices") and p.resource_type == "*":
                return None
            if p.resource_type == "device" and p.resource_id != "*":
                ids.add(p.resource_id)
        return list(ids)
