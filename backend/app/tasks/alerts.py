"""
Celery task: fire alerts (webhook, email, slack) for matching AlertRules.
Failed deliveries are retried with exponential backoff (1 min, 5 min, 30 min).
"""
import json
import hashlib
import hmac
import logging
from datetime import datetime, timezone, timedelta

import httpx
from sqlmodel import Session, select

from app.tasks.celery_app import celery_app
from app.db.session import get_engine
from app.models.alert import AlertRule, AlertDelivery

logger = logging.getLogger(__name__)

_RETRY_DELAYS = [60, 300, 1800]  # seconds: 1 min, 5 min, 30 min


@celery_app.task(bind=True, name="alerts.fire_alert")
def fire_alert(self, event_type: str, payload: dict):
    engine = get_engine()
    with Session(engine) as session:
        rules = session.exec(
            select(AlertRule)
            .where(AlertRule.event_type == event_type, AlertRule.enabled == True)
        ).all()
        for rule in rules:
            _deliver(session, rule, event_type, payload)


@celery_app.task(name="alerts.retry_failed_deliveries")
def retry_failed_deliveries():
    """Beat task: retry failed deliveries that are due for their next attempt."""
    engine = get_engine()
    now = datetime.now(timezone.utc)
    with Session(engine) as session:
        due = session.exec(
            select(AlertDelivery)
            .where(
                AlertDelivery.status == "failed",
                AlertDelivery.retry_count < len(_RETRY_DELAYS),
                AlertDelivery.next_retry_at <= now,
            )
        ).all()
        for delivery in due:
            rule = session.get(AlertRule, delivery.rule_id)
            if not rule or not rule.enabled:
                continue
            payload = json.loads(delivery.payload_json)
            _redeliver(session, delivery, rule, payload)


def _deliver(session: Session, rule: AlertRule, event_type: str, payload: dict):
    payload_str = json.dumps(payload)
    delivery_type = rule.delivery_type or "webhook"
    status = "sent"
    http_status = None
    error = None
    next_retry_at = None

    try:
        if delivery_type == "webhook" and rule.webhook_url:
            _deliver_webhook(rule, payload_str)
        elif delivery_type == "email" and rule.email_to:
            _deliver_email(rule, event_type, payload_str)
        elif delivery_type == "slack" and rule.slack_webhook_url:
            _deliver_slack(rule, event_type, payload_str)
        else:
            return
    except httpx.HTTPStatusError as exc:
        status = "failed"
        http_status = exc.response.status_code
        error = f"HTTP {http_status}"
        next_retry_at = datetime.now(timezone.utc) + timedelta(seconds=_RETRY_DELAYS[0])
        logger.warning("Alert delivery failed for rule %s: %s", rule.id, exc)
    except Exception as exc:
        status = "failed"
        error = str(exc)
        next_retry_at = datetime.now(timezone.utc) + timedelta(seconds=_RETRY_DELAYS[0])
        logger.warning("Alert delivery failed for rule %s: %s", rule.id, exc)

    delivery = AlertDelivery(
        rule_id=rule.id,
        event_type=event_type,
        payload_json=payload_str,
        status=status,
        http_status=http_status,
        error=error,
        delivered_at=datetime.now(timezone.utc),
        retry_count=0,
        next_retry_at=next_retry_at,
    )
    session.add(delivery)
    session.commit()


def _redeliver(session: Session, delivery: AlertDelivery, rule: AlertRule, payload: dict):
    payload_str = delivery.payload_json
    delivery_type = rule.delivery_type or "webhook"
    retry_count = delivery.retry_count + 1

    try:
        if delivery_type == "webhook" and rule.webhook_url:
            _deliver_webhook(rule, payload_str)
        elif delivery_type == "email" and rule.email_to:
            _deliver_email(rule, delivery.event_type, payload_str)
        elif delivery_type == "slack" and rule.slack_webhook_url:
            _deliver_slack(rule, delivery.event_type, payload_str)
        delivery.status = "sent"
        delivery.retry_count = retry_count
        delivery.next_retry_at = None
        logger.info("Alert delivery retry %d succeeded for delivery %s", retry_count, delivery.id)
    except Exception as exc:
        delivery.status = "failed"
        delivery.error = str(exc)
        delivery.retry_count = retry_count
        if retry_count < len(_RETRY_DELAYS):
            delivery.next_retry_at = datetime.now(timezone.utc) + timedelta(seconds=_RETRY_DELAYS[retry_count])
        else:
            delivery.next_retry_at = None  # max retries exhausted
        logger.warning("Alert delivery retry %d failed for delivery %s: %s", retry_count, delivery.id, exc)

    session.add(delivery)
    session.commit()


def _deliver_webhook(rule: AlertRule, payload_str: str):
    headers = {"Content-Type": "application/json"}
    if rule.webhook_secret:
        sig = hmac.new(
            rule.webhook_secret.encode(),
            payload_str.encode(),
            hashlib.sha256,
        ).hexdigest()
        headers["X-Zyxel-Signature"] = f"sha256={sig}"
    resp = httpx.post(rule.webhook_url, content=payload_str, headers=headers, timeout=10)
    resp.raise_for_status()


def _deliver_email(rule: AlertRule, event_type: str, payload_str: str):
    from app.services.email import send_email
    subject = f"[ZyxelManager] Alert: {event_type}"
    body = f"Alert event: {event_type}\n\nPayload:\n{payload_str}"
    send_email(rule.email_to, subject, body)


def _deliver_slack(rule: AlertRule, event_type: str, payload_str: str):
    message = {
        "text": f":warning: *ZyxelManager Alert*: `{event_type}`",
        "attachments": [{"text": payload_str, "color": "danger"}],
    }
    resp = httpx.post(rule.slack_webhook_url, json=message, timeout=10)
    resp.raise_for_status()
