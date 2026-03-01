"""
Celery task: run compliance checks across all devices and rules.
"""
import json
import re
import logging
from datetime import datetime, timezone

from sqlmodel import Session, select

from app.tasks.celery_app import celery_app
from app.db.session import get_engine
from app.models.device import Device
from app.models.config import ConfigSnapshot
from app.models.compliance import ComplianceRule, ComplianceResult

logger = logging.getLogger(__name__)


def _resolve_key_path(data: dict, key_path: str):
    """Resolve a dot-notation key path in a nested dict."""
    parts = key_path.split(".")
    current = data
    for part in parts:
        if not isinstance(current, dict):
            return None
        current = current.get(part)
    return current


def _evaluate(operator: str, actual, expected: str) -> bool:
    if actual is None:
        return False
    actual_str = str(actual)
    if operator == "eq":
        return actual_str == expected
    elif operator == "neq":
        return actual_str != expected
    elif operator == "contains":
        return expected in actual_str
    elif operator == "regex":
        return bool(re.search(expected, actual_str))
    return False


@celery_app.task(bind=True, name="compliance.run_compliance_check")
def run_compliance_check(self):
    engine = get_engine()
    with Session(engine) as session:
        rules = session.exec(
            select(ComplianceRule).where(ComplianceRule.enabled == True)
        ).all()
        devices = session.exec(select(Device)).all()

        for rule in rules:
            for device in devices:
                try:
                    _check_rule_device(session, rule, device)
                except Exception as exc:
                    logger.exception(
                        "Compliance check failed rule=%s device=%s: %s",
                        rule.id, device.id, exc
                    )


def _check_rule_device(session: Session, rule: ComplianceRule, device: Device):
    snapshot = session.exec(
        select(ConfigSnapshot)
        .where(ConfigSnapshot.device_id == device.id,
               ConfigSnapshot.section == rule.section)
        .order_by(ConfigSnapshot.version.desc())
    ).first()

    if not snapshot:
        return

    try:
        data = json.loads(snapshot.data_json)
    except Exception:
        return

    actual = _resolve_key_path(data, rule.key_path)
    passed = _evaluate(rule.operator, actual, rule.expected_value)
    actual_str = str(actual) if actual is not None else None

    # Upsert: find existing result for this rule+device
    existing = session.exec(
        select(ComplianceResult)
        .where(ComplianceResult.rule_id == rule.id,
               ComplianceResult.device_id == device.id)
    ).first()

    if existing:
        existing.passed = passed
        existing.actual_value = actual_str
        existing.checked_at = datetime.now(timezone.utc)
        session.add(existing)
    else:
        result = ComplianceResult(
            rule_id=rule.id,
            device_id=device.id,
            passed=passed,
            actual_value=actual_str,
            checked_at=datetime.now(timezone.utc),
        )
        session.add(result)

    session.commit()

    if not passed:
        try:
            from app.tasks.alerts import fire_alert
            fire_alert.delay("compliance_fail", {
                "rule_id": str(rule.id),
                "rule_name": rule.name,
                "device_id": str(device.id),
                "device_name": device.name,
                "key_path": rule.key_path,
                "expected": rule.expected_value,
                "actual": actual_str,
                "checked_at": datetime.now(timezone.utc).isoformat(),
            })
        except Exception as exc:
            logger.warning("Could not fire compliance alert: %s", exc)
