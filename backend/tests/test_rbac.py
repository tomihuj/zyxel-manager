"""Tests for the RBAC service."""
import uuid
import pytest
from sqlmodel import Session

from app.models.user import User, Role, Permission, UserRole
from app.services.rbac import RBACService
from app.core.security import hash_password


def _make_user(session, superuser=False):
    user = User(
        email=f"{uuid.uuid4()}@test.com",
        username=f"u-{uuid.uuid4().hex[:8]}",
        hashed_password=hash_password("pw"),
        is_superuser=superuser,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _make_role(session, feature, access="read", rtype="*", rid="*"):
    role = Role(name=f"r-{uuid.uuid4().hex[:8]}")
    session.add(role)
    session.commit()
    session.refresh(role)
    session.add(Permission(role_id=role.id, feature=feature,
                           access_level=access, resource_type=rtype, resource_id=rid))
    session.commit()
    return role


def test_superuser_bypasses_all(session):
    rbac = RBACService(session, _make_user(session, superuser=True))
    assert rbac.can("manage_users", "write") is True
    assert rbac.can("nonexistent") is True


def test_no_roles_denies_all(session):
    rbac = RBACService(session, _make_user(session))
    assert rbac.can("view_devices") is False


def test_read_role_grants_read_denies_write(session):
    user = _make_user(session)
    role = _make_role(session, "view_devices", "read")
    session.add(UserRole(user_id=user.id, role_id=role.id))
    session.commit()
    rbac = RBACService(session, user)
    assert rbac.can("view_devices", "read") is True
    assert rbac.can("view_devices", "write") is False


def test_write_role_grants_write(session):
    user = _make_user(session)
    role = _make_role(session, "edit_devices", "write")
    session.add(UserRole(user_id=user.id, role_id=role.id))
    session.commit()
    assert RBACService(session, user).can("edit_devices", "write") is True


def test_resource_scoped_permission(session):
    user = _make_user(session)
    dev_id = str(uuid.uuid4())
    role = _make_role(session, "edit_devices", "write", "device", dev_id)
    session.add(UserRole(user_id=user.id, role_id=role.id))
    session.commit()
    rbac = RBACService(session, user)
    assert rbac.can("edit_devices", "write", "device", dev_id) is True
    assert rbac.can("edit_devices", "write", "device", str(uuid.uuid4())) is False


def test_require_raises_403(session):
    from fastapi import HTTPException
    rbac = RBACService(session, _make_user(session))
    with pytest.raises(HTTPException) as exc:
        rbac.require("manage_users", "write")
    assert exc.value.status_code == 403
