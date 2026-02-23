import uuid
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, HTTPException, status
from sqlmodel import select
from pydantic import BaseModel

from app.core.deps import CurrentUser, SuperUser, DBSession
from app.models.user import User, Role, Permission, UserRole
from app.core.security import hash_password
from app.services.audit import write_audit

router = APIRouter()


class UserCreate(BaseModel):
    email: str
    username: str
    full_name: Optional[str] = None
    password: str
    is_superuser: bool = False


class UserUpdate(BaseModel):
    email: Optional[str] = None
    full_name: Optional[str] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None
    is_superuser: Optional[bool] = None


class RoleCreate(BaseModel):
    name: str
    description: Optional[str] = None


class PermissionSchema(BaseModel):
    feature: str
    resource_type: str = "*"
    resource_id: str = "*"
    access_level: str = "read"


@router.get("", response_model=List[dict])
def list_users(session: DBSession, current: SuperUser):
    users = session.exec(select(User)).all()
    return [{"id": str(u.id), "email": u.email, "username": u.username,
             "full_name": u.full_name, "is_active": u.is_active,
             "is_superuser": u.is_superuser, "created_at": u.created_at} for u in users]


@router.post("", status_code=201)
def create_user(body: UserCreate, session: DBSession, current: SuperUser):
    if session.exec(select(User).where(User.email == body.email)).first():
        raise HTTPException(status_code=409, detail="Email already in use")
    if session.exec(select(User).where(User.username == body.username)).first():
        raise HTTPException(status_code=409, detail="Username already in use")
    user = User(email=body.email, username=body.username, full_name=body.full_name,
                hashed_password=hash_password(body.password), is_superuser=body.is_superuser)
    session.add(user)
    session.commit()
    session.refresh(user)
    write_audit(session, "create_user", current, "user", str(user.id))
    return {"id": str(user.id), "email": user.email, "username": user.username,
            "full_name": user.full_name, "is_active": user.is_active,
            "is_superuser": user.is_superuser, "created_at": user.created_at}


@router.get("/{user_id}")
def get_user(user_id: uuid.UUID, session: DBSession, current: SuperUser):
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404)
    return {"id": str(user.id), "email": user.email, "username": user.username,
            "full_name": user.full_name, "is_active": user.is_active,
            "is_superuser": user.is_superuser, "created_at": user.created_at}


@router.put("/{user_id}")
def update_user(user_id: uuid.UUID, body: UserUpdate, session: DBSession, current: SuperUser):
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404)
    if body.email is not None:
        user.email = body.email
    if body.full_name is not None:
        user.full_name = body.full_name
    if body.password is not None:
        user.hashed_password = hash_password(body.password)
    if body.is_active is not None:
        user.is_active = body.is_active
    if body.is_superuser is not None:
        user.is_superuser = body.is_superuser
    user.updated_at = datetime.now(timezone.utc)
    session.add(user)
    session.commit()
    session.refresh(user)
    return {"id": str(user.id), "email": user.email, "username": user.username,
            "full_name": user.full_name, "is_active": user.is_active,
            "is_superuser": user.is_superuser, "created_at": user.created_at}


@router.delete("/{user_id}", status_code=204)
def delete_user(user_id: uuid.UUID, session: DBSession, current: SuperUser):
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404)
    session.delete(user)
    session.commit()


@router.get("/{user_id}/roles")
def get_user_roles(user_id: uuid.UUID, session: DBSession, current: SuperUser):
    roles = session.exec(
        select(Role).join(UserRole, UserRole.role_id == Role.id)
        .where(UserRole.user_id == user_id)
    ).all()
    return [{"id": str(r.id), "name": r.name, "description": r.description,
             "created_at": r.created_at} for r in roles]


@router.post("/{user_id}/roles/{role_id}", status_code=204)
def assign_role(user_id: uuid.UUID, role_id: uuid.UUID, session: DBSession, current: SuperUser):
    if not session.get(UserRole, {"user_id": user_id, "role_id": role_id}):
        session.add(UserRole(user_id=user_id, role_id=role_id))
        session.commit()


@router.delete("/{user_id}/roles/{role_id}", status_code=204)
def remove_role(user_id: uuid.UUID, role_id: uuid.UUID, session: DBSession, current: SuperUser):
    link = session.get(UserRole, {"user_id": user_id, "role_id": role_id})
    if link:
        session.delete(link)
        session.commit()


# ── Roles (nested under /users for routing simplicity) ────────────────────────

@router.get("/roles/all")
def list_roles(session: DBSession, current: CurrentUser):
    roles = session.exec(select(Role)).all()
    return [{"id": str(r.id), "name": r.name, "description": r.description,
             "created_at": r.created_at} for r in roles]


@router.post("/roles", status_code=201)
def create_role(body: RoleCreate, session: DBSession, current: SuperUser):
    role = Role(name=body.name, description=body.description)
    session.add(role)
    session.commit()
    session.refresh(role)
    return {"id": str(role.id), "name": role.name, "description": role.description,
            "created_at": role.created_at}


@router.get("/roles/{role_id}/permissions")
def get_permissions(role_id: uuid.UUID, session: DBSession, current: CurrentUser):
    perms = session.exec(select(Permission).where(Permission.role_id == role_id)).all()
    return [{"feature": p.feature, "resource_type": p.resource_type,
             "resource_id": p.resource_id, "access_level": p.access_level} for p in perms]


@router.put("/roles/{role_id}/permissions", status_code=204)
def set_permissions(role_id: uuid.UUID, perms: List[PermissionSchema],
                    session: DBSession, current: SuperUser):
    for p in session.exec(select(Permission).where(Permission.role_id == role_id)).all():
        session.delete(p)
    for p in perms:
        session.add(Permission(role_id=role_id, **p.dict()))
    session.commit()
