"""
Abstract FirewallAdapter interface — all adapters must implement this.
"""
from abc import ABC, abstractmethod


class FirewallAdapter(ABC):

    @abstractmethod
    def test_connection(self, device, credentials: dict) -> dict:
        """Returns: {success: bool, message: str, latency_ms: float|None}"""

    @abstractmethod
    def fetch_config(self, device, credentials: dict, section: str = "full") -> dict:
        """Returns config dict, optionally filtered to a section."""

    @abstractmethod
    def apply_patch(self, device, credentials: dict, section: str, patch: dict) -> dict:
        """Returns: {success: bool, message: str, rollback_hint: str|None}"""

    def get_device_info(self, device, credentials: dict) -> dict:
        """Optional: returns firmware_version, serial_number, model, uptime_seconds."""
        return {}

    def restore_config(self, device, credentials: dict, config: dict) -> dict:
        """Push a full config dict to the device. Returns {success, message}."""
        raise NotImplementedError("restore_config not supported by this adapter")
