"""Application-level settings stored in Redis (key-value pairs)."""
import redis as redis_lib
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.config import get_settings
from app.core.deps import CurrentUser

router = APIRouter()

# key -> (min, max) inclusive
_ALLOWED: dict[str, tuple[int, int]] = {
    "auto_poll_interval": (0, 3600),  # 0 = disabled
}

_PREFIX = "ztm:setting:"


def _redis() -> redis_lib.Redis:
    return redis_lib.from_url(get_settings().redis_url, decode_responses=True)


@router.get("")
def get_app_settings(current: CurrentUser) -> dict:
    r = _redis()
    return {key: int(r.get(f"{_PREFIX}{key}") or 0) for key in _ALLOWED}


class SettingBody(BaseModel):
    value: int


@router.put("/{key}")
def set_app_setting(key: str, body: SettingBody, current: CurrentUser) -> dict:
    if key not in _ALLOWED:
        raise HTTPException(status_code=400, detail=f"Unknown setting key: {key!r}")
    lo, hi = _ALLOWED[key]
    if not (lo <= body.value <= hi):
        raise HTTPException(status_code=422,
                            detail=f"{key} must be between {lo} and {hi}")
    _redis().set(f"{_PREFIX}{key}", str(body.value))
    return {"key": key, "value": body.value}
