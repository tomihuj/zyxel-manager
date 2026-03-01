import uuid
from typing import List, Optional
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import delete as sql_delete
from sqlmodel import select
from pydantic import BaseModel

from app.core.deps import CurrentUser, SuperUser, DBSession
from app.models.device import DeviceGroup, GroupMembership, Device
from app.services.audit import write_audit

router = APIRouter()


class GroupCreate(BaseModel):
    name: str
    description: Optional[str] = None


def _group_dict(g: DeviceGroup, count: int) -> dict:
    return {"id": str(g.id), "name": g.name, "description": g.description,
            "created_at": g.created_at, "device_count": count}


@router.get("")
def list_groups(session: DBSession, current: CurrentUser):
    groups = session.exec(select(DeviceGroup)).all()
    return [_group_dict(g, len(session.exec(
        select(GroupMembership).where(GroupMembership.group_id == g.id)).all())) for g in groups]


@router.post("", status_code=201)
def create_group(body: GroupCreate, session: DBSession, current: SuperUser):
    group = DeviceGroup(name=body.name, description=body.description)
    session.add(group)
    session.commit()
    session.refresh(group)
    resp = _group_dict(group, 0)
    write_audit(session, "create_group", current, "group", str(group.id),
                request_body={"name": body.name, "description": body.description},
                response_body=resp)
    return resp


@router.get("/{group_id}")
def get_group(group_id: uuid.UUID, session: DBSession, current: CurrentUser):
    group = session.get(DeviceGroup, group_id)
    if not group:
        raise HTTPException(status_code=404)
    count = len(session.exec(select(GroupMembership).where(GroupMembership.group_id == group_id)).all())
    return _group_dict(group, count)


@router.put("/{group_id}")
def update_group(group_id: uuid.UUID, body: GroupCreate, session: DBSession, current: SuperUser):
    group = session.get(DeviceGroup, group_id)
    if not group:
        raise HTTPException(status_code=404)
    group.name = body.name
    group.description = body.description
    session.add(group)
    session.commit()
    session.refresh(group)
    count = len(session.exec(select(GroupMembership).where(GroupMembership.group_id == group_id)).all())
    resp = _group_dict(group, count)
    write_audit(session, "update_group", current, "group", str(group_id),
                request_body={"name": body.name, "description": body.description},
                response_body=resp)
    return resp


@router.delete("/{group_id}", status_code=204)
def delete_group(group_id: uuid.UUID, session: DBSession, current: SuperUser):
    group = session.get(DeviceGroup, group_id)
    if not group:
        raise HTTPException(status_code=404)
    write_audit(session, "delete_group", current, "group", str(group_id),
                request_body={"group_id": str(group_id), "name": group.name})
    session.execute(sql_delete(GroupMembership).where(GroupMembership.group_id == group_id))
    session.flush()
    session.delete(group)
    session.commit()


@router.get("/{group_id}/devices")
def get_group_devices(group_id: uuid.UUID, session: DBSession, current: CurrentUser):
    memberships = session.exec(select(GroupMembership).where(GroupMembership.group_id == group_id)).all()
    devices = [session.get(Device, m.device_id) for m in memberships]
    return [{"id": str(d.id), "name": d.name, "model": d.model, "status": d.status}
            for d in devices if d]


@router.post("/{group_id}/devices/{device_id}", status_code=204)
def add_device(group_id: uuid.UUID, device_id: uuid.UUID, session: DBSession, current: SuperUser):
    if not session.get(GroupMembership, {"device_id": device_id, "group_id": group_id}):
        session.add(GroupMembership(device_id=device_id, group_id=group_id))
        session.commit()


@router.delete("/{group_id}/devices/{device_id}", status_code=204)
def remove_device(group_id: uuid.UUID, device_id: uuid.UUID, session: DBSession, current: SuperUser):
    link = session.get(GroupMembership, {"device_id": device_id, "group_id": group_id})
    if link:
        session.delete(link)
        session.commit()
