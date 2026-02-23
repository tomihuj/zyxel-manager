import json
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from sqlmodel import select
from pydantic import BaseModel

from app.core.deps import CurrentUser, DBSession, RBAC
from app.models.job import BulkJob, BulkJobTarget, BulkJobLog
from app.models.device import Device
from app.models.config import ConfigSnapshot
from app.services.diff import compute_diff, apply_patch as do_patch
from app.services.audit import write_audit

router = APIRouter()


class BulkJobCreate(BaseModel):
    name: str
    section: str
    patch: dict
    device_ids: List[uuid.UUID]


def _job_dict(job: BulkJob, session) -> dict:
    targets = session.exec(select(BulkJobTarget).where(BulkJobTarget.job_id == job.id)).all()
    return {
        "id": str(job.id), "name": job.name, "section": job.section,
        "status": job.status, "created_at": job.created_at, "completed_at": job.completed_at,
        "target_count": len(targets),
        "success_count": sum(1 for t in targets if t.status == "success"),
        "failed_count": sum(1 for t in targets if t.status == "failed"),
    }


@router.post("/jobs", status_code=201)
def create_bulk_job(body: BulkJobCreate, session: DBSession, rbac: RBAC, current: CurrentUser):
    rbac.require("bulk_actions", "write")
    job = BulkJob(name=body.name, section=body.section,
                  patch_json=json.dumps(body.patch), created_by=current.id)
    session.add(job)
    session.flush()
    for did in body.device_ids:
        session.add(BulkJobTarget(job_id=job.id, device_id=did))
    session.commit()
    session.refresh(job)
    write_audit(session, "create_bulk_job", current, "bulk_job", str(job.id),
                {"name": body.name, "section": body.section, "devices": len(body.device_ids)})
    return _job_dict(job, session)


@router.get("/jobs")
def list_jobs(session: DBSession, rbac: RBAC, current: CurrentUser):
    rbac.require("bulk_actions")
    jobs = session.exec(select(BulkJob).order_by(BulkJob.created_at.desc())).all()
    return [_job_dict(j, session) for j in jobs]


@router.get("/jobs/{job_id}")
def get_job(job_id: uuid.UUID, session: DBSession, rbac: RBAC, current: CurrentUser):
    rbac.require("bulk_actions")
    job = session.get(BulkJob, job_id)
    if not job:
        raise HTTPException(status_code=404)
    targets = session.exec(select(BulkJobTarget).where(BulkJobTarget.job_id == job_id)).all()
    logs = session.exec(select(BulkJobLog).where(BulkJobLog.job_id == job_id)
                        .order_by(BulkJobLog.created_at)).all()
    return {
        **_job_dict(job, session),
        "patch": json.loads(job.patch_json),
        "targets": [{"id": str(t.id), "device_id": str(t.device_id), "status": t.status,
                     "diff": json.loads(t.diff_json) if t.diff_json else None,
                     "error": t.error, "executed_at": t.executed_at} for t in targets],
        "logs": [{"level": l.level, "message": l.message, "created_at": l.created_at} for l in logs],
    }


@router.post("/jobs/{job_id}/preview")
def preview_job(job_id: uuid.UUID, session: DBSession, rbac: RBAC, current: CurrentUser):
    rbac.require("bulk_actions")
    job = session.get(BulkJob, job_id)
    if not job:
        raise HTTPException(status_code=404)
    patch = json.loads(job.patch_json)
    targets = session.exec(select(BulkJobTarget).where(BulkJobTarget.job_id == job_id)).all()
    previews = []
    for t in targets:
        device = session.get(Device, t.device_id)
        if not device:
            continue
        snap = session.exec(
            select(ConfigSnapshot)
            .where(ConfigSnapshot.device_id == t.device_id,
                   ConfigSnapshot.section == job.section)
            .order_by(ConfigSnapshot.version.desc())
        ).first()
        before = json.loads(snap.data_json) if snap else {}
        after = do_patch(before, patch)
        previews.append({"device_id": str(t.device_id), "device_name": device.name,
                         "before": before, "after": after, "diff": compute_diff(before, after)})
    return previews


@router.post("/jobs/{job_id}/execute")
def execute_job(job_id: uuid.UUID, session: DBSession, rbac: RBAC, current: CurrentUser):
    rbac.require("bulk_actions", "write")
    job = session.get(BulkJob, job_id)
    if not job:
        raise HTTPException(status_code=404)
    if job.status != "pending":
        raise HTTPException(status_code=400, detail=f"Job is already {job.status}")
    from app.tasks.bulk import run_bulk_job
    task = run_bulk_job.delay(str(job_id))
    job.celery_task_id = task.id
    job.status = "queued"
    session.add(job)
    session.commit()
    write_audit(session, "execute_bulk_job", current, "bulk_job", str(job_id))
    return {"task_id": task.id, "status": "queued"}


@router.post("/jobs/{job_id}/cancel", status_code=204)
def cancel_job(job_id: uuid.UUID, session: DBSession, rbac: RBAC, current: CurrentUser):
    rbac.require("bulk_actions", "write")
    job = session.get(BulkJob, job_id)
    if not job:
        raise HTTPException(status_code=404)
    if job.celery_task_id:
        from app.tasks.celery_app import celery_app
        celery_app.control.revoke(job.celery_task_id, terminate=True)
    job.status = "cancelled"
    session.add(job)
    session.commit()
