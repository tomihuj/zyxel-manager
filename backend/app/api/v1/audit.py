import csv
import io
import json
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlmodel import select

from app.core.deps import SuperUser, DBSession
from app.models.audit import AuditLog
from app.models.audit_config import AuditActionConfig

router = APIRouter()

# All known action types with human-readable labels, descriptions and category
KNOWN_ACTIONS: List[dict] = [
    # Auth
    {"action": "login",                  "label": "Login",                  "description": "Successful user authentication",              "category": "Auth"},
    {"action": "login_failed",           "label": "Login Failed",           "description": "Failed authentication attempt",               "category": "Auth"},
    # Devices
    {"action": "create_device",          "label": "Create Device",          "description": "Adding a new device",                         "category": "Devices"},
    {"action": "update_device",          "label": "Update Device",          "description": "Modifying device settings",                   "category": "Devices"},
    {"action": "delete_device",          "label": "Delete Device",          "description": "Removing a device",                           "category": "Devices"},
    {"action": "test_connection",        "label": "Test Connection",        "description": "Testing connectivity to a device",            "category": "Devices"},
    {"action": "test_connection_failed", "label": "Test Connection Failed", "description": "Device connection test returned failure",      "category": "Devices"},
    {"action": "sync_device",            "label": "Sync Device",            "description": "Fetching live config from a device",          "category": "Devices"},
    {"action": "sync_device_failed",     "label": "Sync Device Failed",     "description": "Error while fetching config from device",     "category": "Devices"},
    {"action": "patch_config",           "label": "Patch Config",           "description": "Applying config changes to a device",         "category": "Devices"},
    {"action": "patch_config_failed",    "label": "Patch Config Failed",    "description": "Error while applying config patch",           "category": "Devices"},
    # Groups
    {"action": "create_group",           "label": "Create Group",           "description": "Creating a device group",                     "category": "Groups"},
    {"action": "update_group",           "label": "Update Group",           "description": "Renaming or editing a device group",          "category": "Groups"},
    {"action": "delete_group",           "label": "Delete Group",           "description": "Removing a device group",                     "category": "Groups"},
    # Users
    {"action": "create_user",            "label": "Create User",            "description": "Creating a new user account",                 "category": "Users"},
    {"action": "update_user",            "label": "Update User",            "description": "Modifying a user account",                    "category": "Users"},
    {"action": "delete_user",            "label": "Delete User",            "description": "Removing a user account",                     "category": "Users"},
    {"action": "assign_role",            "label": "Assign Role",            "description": "Granting a role to a user",                   "category": "Users"},
    {"action": "remove_role",            "label": "Remove Role",            "description": "Revoking a role from a user",                 "category": "Users"},
    {"action": "create_role",            "label": "Create Role",            "description": "Creating a new role",                         "category": "Users"},
    {"action": "set_permissions",        "label": "Set Permissions",        "description": "Updating role permissions",                   "category": "Users"},
    # Bulk
    {"action": "create_bulk_job",        "label": "Create Bulk Job",        "description": "Scheduling a bulk operation",                 "category": "Bulk"},
    {"action": "execute_bulk_job",       "label": "Execute Bulk Job",       "description": "Running a bulk job",                          "category": "Bulk"},
    {"action": "cancel_bulk_job",        "label": "Cancel Bulk Job",        "description": "Cancelling a running bulk job",               "category": "Bulk"},
    # Reports
    {"action": "generate_report",        "label": "Generate Report",        "description": "Exporting a configuration report",            "category": "Reports"},
    # Backups
    {"action": "trigger_backup",         "label": "Trigger Backup",         "description": "Manually triggering a device backup",         "category": "Backups"},
    {"action": "trigger_backup_failed",  "label": "Trigger Backup Failed",  "description": "Error while creating a backup",               "category": "Backups"},
    {"action": "delete_backup",          "label": "Delete Backup",          "description": "Deleting a stored backup snapshot",           "category": "Backups"},
    {"action": "update_backup_settings", "label": "Update Backup Settings", "description": "Changing auto-backup schedule or retention",  "category": "Backups"},
    {"action": "restore_backup",         "label": "Restore Backup",         "description": "Restoring a device config from a stored snapshot", "category": "Backups"},
    {"action": "restore_backup_failed",  "label": "Restore Backup Failed",  "description": "Error while restoring config from snapshot",       "category": "Backups"},
    {"action": "upload_restore",         "label": "Upload & Restore",       "description": "Restoring device config from uploaded file",       "category": "Backups"},
    {"action": "upload_restore_failed",  "label": "Upload & Restore Failed","description": "Error while restoring config from upload",        "category": "Backups"},
]

_ACTION_SET = {a["action"] for a in KNOWN_ACTIONS}


class ActionConfigUpdate(BaseModel):
    enabled: bool
    log_payload: bool = False


def _log_dict(log: AuditLog) -> dict:
    return {
        "id": str(log.id),
        "username": log.username,
        "action": log.action,
        "resource_type": log.resource_type,
        "resource_id": log.resource_id,
        "details": json.loads(log.details) if log.details else None,
        "ip_address": log.ip_address,
        "created_at": log.created_at,
    }


@router.get("/logs")
def get_audit_logs(
    session: DBSession,
    current: SuperUser,
    limit: int = Query(default=100, le=1000),
    offset: int = Query(default=0),
    action: Optional[str] = None,
    username: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
):
    stmt = select(AuditLog).order_by(AuditLog.created_at.desc()).offset(offset).limit(limit)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if username:
        stmt = stmt.where(AuditLog.username == username)
    if date_from:
        stmt = stmt.where(AuditLog.created_at >= date_from)
    if date_to:
        stmt = stmt.where(AuditLog.created_at <= date_to)
    return [_log_dict(l) for l in session.exec(stmt).all()]


@router.get("/actions")
def get_action_configs(session: DBSession, current: SuperUser):
    """Return all known actions merged with their DB config state."""
    db_configs = {c.action: c for c in session.exec(select(AuditActionConfig)).all()}
    result = []
    for a in KNOWN_ACTIONS:
        cfg = db_configs.get(a["action"])
        result.append({
            **a,
            "enabled": cfg.enabled if cfg else True,
            "log_payload": cfg.log_payload if cfg else False,
        })
    return result


@router.get("/export")
def export_audit_logs(
    session: DBSession,
    current: SuperUser,
    action: Optional[str] = None,
    username: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    format: str = Query(default="csv", regex="^(csv|json)$"),
):
    """Export audit logs as CSV or JSON."""
    stmt = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(10000)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if username:
        stmt = stmt.where(AuditLog.username == username)
    if date_from:
        stmt = stmt.where(AuditLog.created_at >= date_from)
    if date_to:
        stmt = stmt.where(AuditLog.created_at <= date_to)

    logs = [_log_dict(l) for l in session.exec(stmt).all()]

    if format == "json":
        content = json.dumps(logs, indent=2, default=str)
        return StreamingResponse(
            iter([content]),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=audit_logs.json"},
        )

    # CSV export
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=["id", "username", "action", "resource_type",
                                                  "resource_id", "ip_address", "created_at"])
    writer.writeheader()
    for log in logs:
        writer.writerow({k: log.get(k, "") for k in writer.fieldnames})
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=audit_logs.csv"},
    )


@router.put("/actions/{action}")
def update_action_config(
    action: str,
    body: ActionConfigUpdate,
    session: DBSession,
    current: SuperUser,
):
    cfg = session.get(AuditActionConfig, action)
    if not cfg:
        cfg = AuditActionConfig(action=action)
    cfg.enabled = body.enabled
    cfg.log_payload = body.log_payload
    session.add(cfg)
    session.commit()
    session.refresh(cfg)

    known = next((a for a in KNOWN_ACTIONS if a["action"] == action), None)
    base = known or {"action": action, "label": action, "description": "", "category": "Other"}
    return {**base, "enabled": cfg.enabled, "log_payload": cfg.log_payload}
