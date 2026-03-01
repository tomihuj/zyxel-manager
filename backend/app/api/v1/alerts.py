import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete as sql_delete
from sqlmodel import select

from app.core.deps import CurrentUser, DBSession
from app.models.alert import AlertRule, AlertDelivery
from app.services.audit import write_audit

router = APIRouter()


class AlertRuleCreate(BaseModel):
    name: str
    event_type: str
    enabled: bool = True
    delivery_type: str = "webhook"
    webhook_url: Optional[str] = None
    webhook_secret: Optional[str] = None
    email_to: Optional[str] = None
    slack_webhook_url: Optional[str] = None


class AlertRuleUpdate(BaseModel):
    name: Optional[str] = None
    event_type: Optional[str] = None
    enabled: Optional[bool] = None
    delivery_type: Optional[str] = None
    webhook_url: Optional[str] = None
    webhook_secret: Optional[str] = None
    email_to: Optional[str] = None
    slack_webhook_url: Optional[str] = None


def _rule_dict(r: AlertRule) -> dict:
    return {
        "id": str(r.id),
        "name": r.name,
        "event_type": r.event_type,
        "enabled": r.enabled,
        "delivery_type": r.delivery_type,
        "webhook_url": r.webhook_url,
        "email_to": r.email_to,
        "slack_webhook_url": r.slack_webhook_url,
        "created_at": r.created_at,
    }


def _delivery_dict(d: AlertDelivery) -> dict:
    return {
        "id": str(d.id),
        "rule_id": str(d.rule_id),
        "event_type": d.event_type,
        "status": d.status,
        "http_status": d.http_status,
        "error": d.error,
        "delivered_at": d.delivered_at,
    }


@router.get("/rules")
def list_rules(current: CurrentUser, session: DBSession):
    rules = session.exec(select(AlertRule)).all()
    return [_rule_dict(r) for r in rules]


@router.post("/rules", status_code=201)
def create_rule(body: AlertRuleCreate, current: CurrentUser, session: DBSession):
    rule = AlertRule(
        name=body.name,
        event_type=body.event_type,
        enabled=body.enabled,
        delivery_type=body.delivery_type,
        webhook_url=body.webhook_url,
        webhook_secret=body.webhook_secret,
        email_to=body.email_to,
        slack_webhook_url=body.slack_webhook_url,
        created_by=current.id,
        created_at=datetime.now(timezone.utc),
    )
    session.add(rule)
    session.commit()
    session.refresh(rule)
    write_audit(session, "create_alert_rule", current, "alert_rule", str(rule.id),
                {"name": body.name, "event_type": body.event_type})
    return _rule_dict(rule)


@router.put("/rules/{rule_id}")
def update_rule(rule_id: uuid.UUID, body: AlertRuleUpdate,
                current: CurrentUser, session: DBSession):
    rule = session.get(AlertRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404)
    for field in ("name", "event_type", "enabled", "delivery_type",
                  "webhook_url", "webhook_secret", "email_to", "slack_webhook_url"):
        v = getattr(body, field)
        if v is not None:
            setattr(rule, field, v)
    session.add(rule)
    session.commit()
    session.refresh(rule)
    write_audit(session, "update_alert_rule", current, "alert_rule", str(rule_id),
                body.model_dump(exclude_none=True))
    return _rule_dict(rule)


@router.delete("/rules/{rule_id}", status_code=204)
def delete_rule(rule_id: uuid.UUID, current: CurrentUser, session: DBSession):
    rule = session.get(AlertRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404)
    session.execute(sql_delete(AlertDelivery).where(AlertDelivery.rule_id == rule_id))
    session.flush()
    session.delete(rule)
    session.commit()
    write_audit(session, "delete_alert_rule", current, "alert_rule", str(rule_id), {})


@router.get("/deliveries")
def list_deliveries(current: CurrentUser, session: DBSession):
    deliveries = session.exec(
        select(AlertDelivery).order_by(AlertDelivery.delivered_at.desc())
    ).all()
    return [_delivery_dict(d) for d in deliveries]
