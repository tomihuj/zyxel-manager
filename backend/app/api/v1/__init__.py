from fastapi import APIRouter
from app.api.v1 import auth, devices, groups, users, bulk, reports, audit, backups, templates
from app.api.v1 import tokens, alerts, compliance
from app.api.v1 import config_search, metrics_api, totp, sessions, app_settings
from app.api.v1 import security

router = APIRouter()
router.include_router(auth.router,          prefix="/auth",           tags=["auth"])
router.include_router(users.router,         prefix="/users",          tags=["users"])
router.include_router(devices.router,       prefix="/devices",        tags=["devices"])
router.include_router(groups.router,        prefix="/groups",         tags=["groups"])
router.include_router(bulk.router,          prefix="/bulk",           tags=["bulk"])
router.include_router(reports.router,       prefix="/reports",        tags=["reports"])
router.include_router(audit.router,         prefix="/audit",          tags=["audit"])
router.include_router(backups.router,       prefix="/backups",        tags=["backups"])
router.include_router(templates.router,     prefix="/templates",      tags=["templates"])
router.include_router(tokens.router,        prefix="/auth/tokens",    tags=["tokens"])
router.include_router(alerts.router,        prefix="/alerts",         tags=["alerts"])
router.include_router(compliance.router,    prefix="/compliance",     tags=["compliance"])
router.include_router(config_search.router, prefix="/config/search",  tags=["config-search"])
router.include_router(metrics_api.router,   prefix="/devices",        tags=["metrics"])
router.include_router(totp.router,          prefix="/auth/totp",      tags=["totp"])
router.include_router(sessions.router,      prefix="/auth/sessions",  tags=["sessions"])
router.include_router(app_settings.router,  prefix="/app-settings",   tags=["app-settings"])
router.include_router(security.router,      prefix="/security",       tags=["security"])
