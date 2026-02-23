"""
Seed script: creates admin user, demo roles, groups, and devices.
Called automatically on backend startup in dev.
Run manually: python -m scripts.seed
"""
import json
import logging
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlmodel import Session, select, SQLModel

from app.db.session import get_engine
from app.core.config import get_settings
from app.core.security import hash_password
from app.models import *  # noqa
from app.services.crypto import encrypt_credentials

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("seed")


def seed():
    settings = get_settings()
    engine = get_engine()
    SQLModel.metadata.create_all(engine)

    with Session(engine) as s:
        # Admin user
        if not s.exec(select(User).where(User.username == settings.admin_username)).first():
            admin = User(
                email=settings.admin_email,
                username=settings.admin_username,
                full_name="Administrator",
                hashed_password=hash_password(settings.admin_password),
                is_superuser=True,
            )
            s.add(admin)
            s.commit()
            logger.info("Created admin: %s", settings.admin_username)

        # Viewer role
        if not s.exec(select(Role).where(Role.name == "viewer")).first():
            role = Role(name="viewer", description="Read-only access")
            s.add(role)
            s.commit()
            s.refresh(role)
            s.add(Permission(role_id=role.id, feature="view_devices", access_level="read"))
            s.add(Permission(role_id=role.id, feature="export_reports", access_level="read"))
            s.commit()
            logger.info("Created viewer role")

        # Groups
        for gname, gdesc in [("Production", "Production firewalls"), ("Lab", "Lab / staging firewalls")]:
            if not s.exec(select(DeviceGroup).where(DeviceGroup.name == gname)).first():
                s.add(DeviceGroup(name=gname, description=gdesc))
                s.commit()
                logger.info("Created group: %s", gname)

        prod = s.exec(select(DeviceGroup).where(DeviceGroup.name == "Production")).first()
        lab  = s.exec(select(DeviceGroup).where(DeviceGroup.name == "Lab")).first()

        # Demo devices
        demo = [
            ("HQ Firewall",       "USG FLEX 500", "10.0.0.1",   ["hq", "prod"],    prod),
            ("Branch-A Firewall", "USG FLEX 100", "10.0.1.1",   ["branch", "prod"], prod),
            ("Branch-B Firewall", "USG FLEX 100", "10.0.2.1",   ["branch", "prod"], prod),
            ("Lab Firewall",      "USG FLEX 100", "192.168.100.1", ["lab"],          lab),
        ]
        for name, model, ip, tags, group in demo:
            if not s.exec(select(Device).where(Device.name == name)).first():
                device = Device(
                    name=name, model=model, mgmt_ip=ip, port=443,
                    protocol="https", adapter="mock",
                    encrypted_credentials=encrypt_credentials("admin", "demo_password"),
                    tags=json.dumps(tags),
                )
                s.add(device)
                s.commit()
                s.refresh(device)
                if group:
                    s.add(GroupMembership(device_id=device.id, group_id=group.id))
                    s.commit()
                logger.info("Created device: %s", name)

    logger.info("Seed complete")


if __name__ == "__main__":
    seed()
