from app.adapters.base import FirewallAdapter
from app.adapters.mock import MockAdapter
from app.adapters.zyxel import ZyxelAdapter

_REGISTRY: dict[str, FirewallAdapter] = {
    "mock": MockAdapter(),
    "zyxel": ZyxelAdapter(),
}


def get_adapter(name: str) -> FirewallAdapter:
    adapter = _REGISTRY.get(name)
    if not adapter:
        raise ValueError(f"Unknown adapter: {name!r}. Available: {list(_REGISTRY)}")
    return adapter
