import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete as sql_delete
from sqlmodel import select

from app.core.deps import CurrentUser, DBSession
from app.models.compliance import ComplianceRule, ComplianceResult
from app.services.audit import write_audit

router = APIRouter()


class ComplianceRuleCreate(BaseModel):
    name: str
    section: str
    key_path: str
    operator: str
    expected_value: str
    enabled: bool = True


class ComplianceRuleUpdate(BaseModel):
    name: Optional[str] = None
    section: Optional[str] = None
    key_path: Optional[str] = None
    operator: Optional[str] = None
    expected_value: Optional[str] = None
    enabled: Optional[bool] = None


def _rule_dict(r: ComplianceRule) -> dict:
    return {
        "id": str(r.id),
        "name": r.name,
        "section": r.section,
        "key_path": r.key_path,
        "operator": r.operator,
        "expected_value": r.expected_value,
        "enabled": r.enabled,
        "created_at": r.created_at,
    }


def _result_dict(r: ComplianceResult) -> dict:
    return {
        "id": str(r.id),
        "rule_id": str(r.rule_id),
        "device_id": str(r.device_id),
        "passed": r.passed,
        "actual_value": r.actual_value,
        "checked_at": r.checked_at,
    }


@router.get("/rules")
def list_rules(current: CurrentUser, session: DBSession):
    rules = session.exec(select(ComplianceRule)).all()
    return [_rule_dict(r) for r in rules]


@router.post("/rules", status_code=201)
def create_rule(body: ComplianceRuleCreate, current: CurrentUser, session: DBSession):
    rule = ComplianceRule(
        name=body.name,
        section=body.section,
        key_path=body.key_path,
        operator=body.operator,
        expected_value=body.expected_value,
        enabled=body.enabled,
        created_at=datetime.now(timezone.utc),
    )
    session.add(rule)
    session.commit()
    session.refresh(rule)
    write_audit(session, "create_compliance_rule", current, "compliance_rule", str(rule.id),
                {"name": body.name})
    return _rule_dict(rule)


@router.put("/rules/{rule_id}")
def update_rule(rule_id: uuid.UUID, body: ComplianceRuleUpdate,
                current: CurrentUser, session: DBSession):
    rule = session.get(ComplianceRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404)
    for field in ("name", "section", "key_path", "operator", "expected_value", "enabled"):
        v = getattr(body, field)
        if v is not None:
            setattr(rule, field, v)
    session.add(rule)
    session.commit()
    session.refresh(rule)
    write_audit(session, "update_compliance_rule", current, "compliance_rule", str(rule_id),
                body.model_dump(exclude_none=True))
    return _rule_dict(rule)


@router.delete("/rules/{rule_id}", status_code=204)
def delete_rule(rule_id: uuid.UUID, current: CurrentUser, session: DBSession):
    rule = session.get(ComplianceRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404)
    session.execute(sql_delete(ComplianceResult).where(ComplianceResult.rule_id == rule_id))
    session.flush()
    session.delete(rule)
    session.commit()
    write_audit(session, "delete_compliance_rule", current, "compliance_rule", str(rule_id), {})


@router.get("/results")
def list_results(current: CurrentUser, session: DBSession):
    results = session.exec(
        select(ComplianceResult).order_by(ComplianceResult.checked_at.desc())
    ).all()
    return [_result_dict(r) for r in results]


@router.post("/check", status_code=202)
def trigger_check(current: CurrentUser, session: DBSession):
    from app.tasks.compliance import run_compliance_check
    task = run_compliance_check.delay()
    write_audit(session, "trigger_compliance_check", current, None, None, {})
    return {"task_id": task.id}
