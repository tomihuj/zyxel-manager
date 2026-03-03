import uuid
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlmodel import select

from app.core.deps import CurrentUser, DBSession
from app.models.device import Device
from app.services.crypto import encrypt_credentials
from app.services.audit import write_audit

router = APIRouter()


class CloneDeviceBody(BaseModel):
    name: str
    mgmt_ip: str
    port: int = 443
    protocol: str = "https"
    username: str = ""
    password: str = ""


class BulkProvisionDevice(BaseModel):
    name: str
    mgmt_ip: str
    port: int = 443
    protocol: str = "https"
    username: str = ""
    password: str = ""


class BulkProvisionBody(BaseModel):
    template_device_id: uuid.UUID
    devices: List[BulkProvisionDevice]


@router.post("/{source_id}/clone", status_code=202)
def clone_device(source_id: uuid.UUID, body: CloneDeviceBody,
                 current: CurrentUser, session: DBSession):
    source = session.get(Device, source_id)
    if not source or source.deleted_at:
        raise HTTPException(status_code=404, detail="Source device not found")

    creds = {"username": body.username, "password": body.password}
    new_device = Device(
        name=body.name,
        mgmt_ip=body.mgmt_ip,
        port=body.port,
        protocol=body.protocol,
        adapter=source.adapter,
        model=source.model,
        encrypted_credentials=encrypt_credentials(creds),
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    session.add(new_device)
    session.commit()
    session.refresh(new_device)

    from app.tasks.provisioning import clone_device as clone_task
    task = clone_task.delay(str(source_id), str(new_device.id), str(current.id))

    write_audit(session, "clone_device", current, "device", str(new_device.id),
                {"source_id": str(source_id), "name": body.name})
    return {"task_id": task.id, "device_id": str(new_device.id)}


@router.post("/provision", status_code=202)
def bulk_provision(body: BulkProvisionBody, current: CurrentUser, session: DBSession):
    template = session.get(Device, body.template_device_id)
    if not template or template.deleted_at:
        raise HTTPException(status_code=404, detail="Template device not found")

    results = []
    for dev_spec in body.devices:
        creds = {"username": dev_spec.username, "password": dev_spec.password}
        new_device = Device(
            name=dev_spec.name,
            mgmt_ip=dev_spec.mgmt_ip,
            port=dev_spec.port,
            protocol=dev_spec.protocol,
            adapter=template.adapter,
            model=template.model,
            encrypted_credentials=encrypt_credentials(creds),
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        session.add(new_device)
        session.flush()

        from app.tasks.provisioning import clone_device as clone_task
        task = clone_task.delay(str(body.template_device_id), str(new_device.id), str(current.id))
        results.append({"task_id": task.id, "device_id": str(new_device.id), "name": dev_spec.name})

    session.commit()
    write_audit(session, "bulk_provision", current, "device", "*",
                {"template_id": str(body.template_device_id), "count": len(results)})
    return {"provisioned": results}
