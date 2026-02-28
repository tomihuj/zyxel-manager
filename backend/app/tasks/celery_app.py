from celery import Celery
from app.core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "zyxel_manager",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=[
        "app.tasks.bulk",
        "app.tasks.backup",
        "app.tasks.drift",
        "app.tasks.alerts",
        "app.tasks.compliance",
        "app.tasks.metrics",
        "app.tasks.poll_devices",
        "app.tasks.security",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    beat_schedule={
        "scheduled-backup-check": {
            "task": "backup.scheduled_backup_check",
            "schedule": 900.0,
        },
        "drift-check": {
            "task": "drift.check_drift_all",
            "schedule": 3600.0,
        },
        "compliance-check": {
            "task": "compliance.run_compliance_check",
            "schedule": 3600.0,
        },
        "scheduled-jobs-check": {
            "task": "bulk.run_scheduled_jobs",
            "schedule": 60.0,
        },
        "metrics-collect": {
            "task": "metrics.collect_all_metrics",
            "schedule": 300.0,
        },
        "poll-devices": {
            "task": "poll_devices.poll_all_devices",
            "schedule": 30.0,   # self-throttles via Redis interval setting
        },
        "alert-retry": {
            "task": "alerts.retry_failed_deliveries",
            "schedule": 300.0,  # every 5 minutes
        },
        "security-scan": {
            "task": "security.run_security_scan",
            "schedule": 21600.0,  # every 6 hours
        },
    },
)
