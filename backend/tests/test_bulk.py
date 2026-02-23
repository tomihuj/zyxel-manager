"""Tests for the bulk change pipeline using MockAdapter."""
import json
import uuid
import pytest
from unittest.mock import patch
from sqlmodel import Session, select

from app.models.user import User
from app.models.device import Device
from app.models.job import BulkJob, BulkJobTarget
from app.core.security import hash_password
from app.services.crypto import encrypt_credentials
from app.services.diff import compute_diff, apply_patch


def _make_user(session):
    u = User(email=f"{uuid.uuid4()}@t.com", username=f"u-{uuid.uuid4().hex[:8]}",
             hashed_password=hash_password("pw"), is_superuser=True)
    session.add(u)
    session.commit()
    session.refresh(u)
    return u


def _make_device(session):
    d = Device(name=f"dev-{uuid.uuid4().hex[:6]}", model="USG FLEX 100", mgmt_ip="10.0.0.1",
               adapter="mock", encrypted_credentials=encrypt_credentials("admin", "pw"), tags="[]")
    session.add(d)
    session.commit()
    session.refresh(d)
    return d


def test_apply_patch_preserves_unchanged_fields():
    before = {"servers": ["pool.ntp.org"], "timezone": "UTC", "enabled": True}
    after = apply_patch(before, {"servers": ["10.0.0.1"]})
    assert after["servers"] == ["10.0.0.1"]
    assert after["timezone"] == "UTC"
    assert after["enabled"] is True


def test_compute_diff_detects_change():
    diff = compute_diff({"servers": ["8.8.8.8"]}, {"servers": ["1.1.1.1"]})
    assert diff  # non-empty


def test_compute_diff_empty_when_equal():
    cfg = {"servers": ["8.8.8.8"]}
    assert compute_diff(cfg, cfg) == {}


def test_mock_adapter_apply_and_fetch():
    from app.adapters.mock import MockAdapter
    from unittest.mock import MagicMock
    adapter = MockAdapter()
    device = MagicMock()
    device.id = str(uuid.uuid4())
    device.name = "test"

    before = adapter.fetch_config(device, {}, section="ntp")
    assert "servers" in before

    result = adapter.apply_patch(device, {}, section="ntp", patch={"servers": ["10.99.99.99"]})
    assert result["success"] is True

    after = adapter.fetch_config(device, {}, section="ntp")
    assert after["servers"] == ["10.99.99.99"]


def test_bulk_job_execute_end_to_end(session):
    """Run bulk job synchronously (bypassing Celery) and verify state."""
    user = _make_user(session)
    device = _make_device(session)

    job = BulkJob(name="NTP test", section="ntp",
                  patch_json=json.dumps({"servers": ["10.0.0.50"]}), created_by=user.id)
    session.add(job)
    session.flush()
    session.add(BulkJobTarget(job_id=job.id, device_id=device.id))
    session.commit()

    from app.tasks.bulk import run_bulk_job
    # Call the underlying function directly, bypassing Celery
    run_bulk_job.__wrapped__(None, str(job.id)) if hasattr(run_bulk_job, '__wrapped__') else run_bulk_job(str(job.id))

    session.expire_all()
    updated_job = session.get(BulkJob, job.id)
    assert updated_job.status in ("completed", "partial")
    targets = session.exec(select(BulkJobTarget).where(BulkJobTarget.job_id == job.id)).all()
    assert all(t.status == "success" for t in targets)
