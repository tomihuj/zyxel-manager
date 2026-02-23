from celery import Celery
from app.core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "zyxel_manager",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.tasks.bulk"],
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
)
