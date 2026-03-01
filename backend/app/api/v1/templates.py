import json
import uuid
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, HTTPException
from sqlmodel import select
from pydantic import BaseModel

from app.core.deps import CurrentUser, DBSession
from app.models.template import ConfigTemplate
from app.models.device import Device
from app.services.crypto import decrypt_credentials
from app.services.audit import write_audit
from app.adapters.registry import get_adapter

router = APIRouter()


class TemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    section: str
    data_json: str = "{}"


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    section: Optional[str] = None
    data_json: Optional[str] = None


class ApplyRequest(BaseModel):
    device_ids: List[str]


def _tmpl_dict(t: ConfigTemplate) -> dict:
    return {
        "id": str(t.id),
        "name": t.name,
        "description": t.description,
        "section": t.section,
        "data_json": t.data_json,
        "created_by": str(t.created_by),
        "created_at": t.created_at,
        "updated_at": t.updated_at,
    }


@router.get("")
def list_templates(session: DBSession, current: CurrentUser):
    templates = session.exec(select(ConfigTemplate)).all()
    return [_tmpl_dict(t) for t in templates]


@router.post("", status_code=201)
def create_template(body: TemplateCreate, session: DBSession, current: CurrentUser):
    try:
        json.loads(body.data_json)
    except json.JSONDecodeError:
        raise HTTPException(status_code=422, detail="data_json must be valid JSON")

    t = ConfigTemplate(
        name=body.name,
        description=body.description,
        section=body.section,
        data_json=body.data_json,
        created_by=current.id,
    )
    session.add(t)
    session.commit()
    session.refresh(t)
    resp = _tmpl_dict(t)
    write_audit(session, "create_template", current, "template", str(t.id),
                {"name": t.name, "section": t.section})
    return resp


@router.get("/{template_id}")
def get_template(template_id: uuid.UUID, session: DBSession, current: CurrentUser):
    t = session.get(ConfigTemplate, template_id)
    if not t:
        raise HTTPException(status_code=404)
    return _tmpl_dict(t)


@router.put("/{template_id}")
def update_template(template_id: uuid.UUID, body: TemplateUpdate,
                    session: DBSession, current: CurrentUser):
    t = session.get(ConfigTemplate, template_id)
    if not t:
        raise HTTPException(status_code=404)
    if body.name is not None:
        t.name = body.name
    if body.description is not None:
        t.description = body.description
    if body.section is not None:
        t.section = body.section
    if body.data_json is not None:
        try:
            json.loads(body.data_json)
        except json.JSONDecodeError:
            raise HTTPException(status_code=422, detail="data_json must be valid JSON")
        t.data_json = body.data_json
    t.updated_at = datetime.now(timezone.utc)
    session.add(t)
    session.commit()
    session.refresh(t)
    write_audit(session, "update_template", current, "template", str(t.id),
                {"name": t.name})
    return _tmpl_dict(t)


@router.delete("/{template_id}", status_code=204)
def delete_template(template_id: uuid.UUID, session: DBSession, current: CurrentUser):
    t = session.get(ConfigTemplate, template_id)
    if not t:
        raise HTTPException(status_code=404)
    write_audit(session, "delete_template", current, "template", str(template_id),
                {"name": t.name})
    session.delete(t)
    session.commit()


@router.post("/{template_id}/apply")
def apply_template(template_id: uuid.UUID, body: ApplyRequest,
                   session: DBSession, current: CurrentUser):
    t = session.get(ConfigTemplate, template_id)
    if not t:
        raise HTTPException(status_code=404)

    patch = json.loads(t.data_json)
    success = []
    failed = []

    for device_id_str in body.device_ids:
        try:
            device_id = uuid.UUID(device_id_str)
        except ValueError:
            failed.append({"device_id": device_id_str, "error": "Invalid device ID"})
            continue

        device = session.get(Device, device_id)
        if not device:
            failed.append({"device_id": device_id_str, "error": "Device not found"})
            continue

        try:
            creds = decrypt_credentials(device.encrypted_credentials)
            adapter = get_adapter(device.adapter)
            result = adapter.apply_patch(device, creds, t.section, patch)
            if result.get("success"):
                success.append({"device_id": device_id_str, "device_name": device.name})
            else:
                failed.append({
                    "device_id": device_id_str,
                    "device_name": device.name,
                    "error": result.get("message", "Unknown error"),
                })
        except Exception as e:
            failed.append({
                "device_id": device_id_str,
                "device_name": device.name,
                "error": str(e),
            })

    write_audit(session, "apply_template", current, "template", str(template_id),
                {"name": t.name, "section": t.section,
                 "success_count": len(success), "failed_count": len(failed)})

    return {"success": success, "failed": failed}
