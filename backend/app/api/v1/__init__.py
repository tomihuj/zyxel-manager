from fastapi import APIRouter
from app.api.v1 import auth, devices, groups, users, bulk, reports, audit

router = APIRouter()
router.include_router(auth.router,    prefix="/auth",    tags=["auth"])
router.include_router(users.router,   prefix="/users",   tags=["users"])
router.include_router(devices.router, prefix="/devices", tags=["devices"])
router.include_router(groups.router,  prefix="/groups",  tags=["groups"])
router.include_router(bulk.router,    prefix="/bulk",    tags=["bulk"])
router.include_router(reports.router, prefix="/reports", tags=["reports"])
router.include_router(audit.router,   prefix="/audit",   tags=["audit"])
