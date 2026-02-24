"""
Mock adapter — simulates a Zyxel USG FLEX without a real device.
Per-device state is kept in memory so multiple mock devices behave independently.
"""
import copy
import random
import time

from app.adapters.base import FirewallAdapter

_MOCK_CONFIG_TEMPLATE = {
    "system": {
        "hostname": "zyxel-mock",
        "firmware": "V5.37(ABFY.1)",
        "serial": "S220Z12345678",
        "model": "USG FLEX 100",
    },
    "interfaces": [
        {"name": "wan1", "type": "ethernet", "ip": "203.0.113.1", "mask": "255.255.255.0"},
        {"name": "lan1", "type": "ethernet", "ip": "192.168.1.1", "mask": "255.255.255.0"},
    ],
    "routing": {
        "default_gateway": "203.0.113.254",
        "static_routes": [],
    },
    "nat": [
        {"no": 1, "name": "WAN-to-LAN", "type": "Many-to-One", "incoming_interface": "wan1", "original_ip": "192.168.1.0/24", "mapped_ip": "wan1 ip", "enabled": True},
        {"no": 2, "name": "DMZ-to-WAN", "type": "Many-to-One", "incoming_interface": "wan1", "original_ip": "192.168.2.0/24", "mapped_ip": "wan1 ip", "enabled": True},
    ],
    "nat_snat": [{"default_snat": "yes"}],
    "firewall_rules": [
        {"name": "Allow-LAN-to-WAN", "src_zone": "LAN", "dst_zone": "WAN", "action": "allow", "enabled": True},
        {"name": "Block-WAN-to-LAN", "src_zone": "WAN", "dst_zone": "LAN", "action": "deny", "enabled": True},
    ],
    "vpn": {"ipsec_tunnels": [], "ssl_vpn_enabled": False},
    "dns": {"servers": ["8.8.8.8", "8.8.4.4"], "search_domain": "local"},
    "ntp": {"servers": ["pool.ntp.org", "time.google.com"], "timezone": "UTC", "enabled": True},
    "address_objects": [{"name": "LAN_SUBNET", "type": "subnet", "address": "192.168.1.0/24"}],
    "service_objects": [
        {"name": "HTTP", "protocol": "tcp", "port": 80},
        {"name": "HTTPS", "protocol": "tcp", "port": 443},
    ],
    "users": {"local_accounts": [{"username": "admin", "role": "admin"}]},
}

_device_states: dict = {}


def _get_state(device_id: str) -> dict:
    if device_id not in _device_states:
        state = copy.deepcopy(_MOCK_CONFIG_TEMPLATE)
        idx = len(_device_states) + 1
        state["interfaces"][1]["ip"] = f"192.168.{idx}.1"
        state["system"]["hostname"] = f"zyxel-mock-{idx}"
        _device_states[device_id] = state
    return _device_states[device_id]


class MockAdapter(FirewallAdapter):

    def test_connection(self, device, credentials: dict) -> dict:
        time.sleep(random.uniform(0.05, 0.15))
        return {
            "success": True,
            "message": f"Mock connection to {device.mgmt_ip}:{device.port} successful",
            "latency_ms": round(random.uniform(5, 50), 1),
        }

    def fetch_config(self, device, credentials: dict, section: str = "full") -> dict:
        state = _get_state(str(device.id))
        if section == "full":
            return copy.deepcopy(state)
        return copy.deepcopy(state.get(section, {}))

    def apply_patch(self, device, credentials: dict, section: str, patch: dict) -> dict:
        from app.services.diff import apply_patch as do_patch
        state = _get_state(str(device.id))
        state[section] = do_patch(state.get(section, {}), patch)
        return {
            "success": True,
            "message": f"Mock: applied patch to '{section}' on {device.name}",
            "rollback_hint": "Re-apply previous snapshot to revert.",
        }

    def get_device_info(self, device, credentials: dict) -> dict:
        sys = _get_state(str(device.id)).get("system", {})
        return {
            "firmware_version": sys.get("firmware"),
            "serial_number": sys.get("serial"),
            "model": sys.get("model"),
            "uptime_seconds": random.randint(1000, 9_999_999),
        }
