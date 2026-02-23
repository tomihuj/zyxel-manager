"""
Zyxel USG FLEX adapter — real device integration via HTTPS REST API.
Fill in the TODO sections for your firmware version.
"""
import logging
import time

import httpx

from app.adapters.base import FirewallAdapter

logger = logging.getLogger(__name__)

# Config section → API endpoint mapping (verify against your firmware docs)
_SECTION_ENDPOINTS: dict[str, str] = {
    "interfaces":      "/api/v1/system/interface",
    "routing":         "/api/v1/routing/static",
    "nat":             "/api/v1/policy/nat",
    "firewall_rules":  "/api/v1/policy/security",
    "vpn":             "/api/v1/vpn/ipsec",
    "dns":             "/api/v1/system/dns",
    "ntp":             "/api/v1/system/ntp",
    "address_objects": "/api/v1/objects/address",
    "service_objects": "/api/v1/objects/service",
}


class ZyxelAdapter(FirewallAdapter):

    def _base_url(self, device) -> str:
        return f"{device.protocol}://{device.mgmt_ip}:{device.port}"

    def _client(self, device) -> httpx.Client:
        return httpx.Client(verify=False, timeout=30.0)  # TODO: add custom CA support

    def _authenticate(self, client: httpx.Client, base_url: str, credentials: dict) -> str:
        # TODO: verify exact endpoint and response field from Zyxel API docs
        resp = client.post(
            f"{base_url}/api/v1/auth",
            json={"username": credentials.get("username"), "password": credentials.get("password")},
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("token") or data.get("access_token") or data["data"]["token"]

    def test_connection(self, device, credentials: dict) -> dict:
        t0 = time.monotonic()
        try:
            with self._client(device) as c:
                self._authenticate(c, self._base_url(device), credentials)
            return {"success": True, "message": "Connected",
                    "latency_ms": round((time.monotonic() - t0) * 1000, 1)}
        except Exception as e:
            logger.error("ZyxelAdapter.test_connection: %s", e)
            return {"success": False, "message": str(e), "latency_ms": None}

    def fetch_config(self, device, credentials: dict, section: str = "full") -> dict:
        try:
            with self._client(device) as c:
                base = self._base_url(device)
                headers = {"Authorization": f"Bearer {self._authenticate(c, base, credentials)}"}
                if section == "full":
                    result = {}
                    for sec, ep in _SECTION_ENDPOINTS.items():
                        r = c.get(f"{base}{ep}", headers=headers)
                        result[sec] = r.json() if r.is_success else None
                    return result
                ep = _SECTION_ENDPOINTS.get(section)
                if not ep:
                    raise ValueError(f"Unknown section: {section}")
                r = c.get(f"{base}{ep}", headers=headers)
                r.raise_for_status()
                return r.json()
        except Exception as e:
            logger.error("ZyxelAdapter.fetch_config: %s", e)
            raise

    def apply_patch(self, device, credentials: dict, section: str, patch: dict) -> dict:
        try:
            with self._client(device) as c:
                base = self._base_url(device)
                headers = {"Authorization": f"Bearer {self._authenticate(c, base, credentials)}"}
                ep = _SECTION_ENDPOINTS.get(section)
                if not ep:
                    raise ValueError(f"Unknown section: {section}")
                # TODO: confirm whether API uses PATCH or PUT
                r = c.patch(f"{base}{ep}", json=patch, headers=headers)
                r.raise_for_status()
                return {"success": True, "message": f"Applied patch to {section}",
                        "rollback_hint": "Restore via device sync."}
        except Exception as e:
            logger.error("ZyxelAdapter.apply_patch: %s", e)
            return {"success": False, "message": str(e)}
