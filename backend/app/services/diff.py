"""Config diff and patch utilities."""
import json
from deepdiff import DeepDiff


def compute_diff(before: dict, after: dict) -> dict:
    """Return a serialisable diff between two config dicts."""
    diff = DeepDiff(before, after, ignore_order=True)
    return json.loads(diff.to_json()) if diff else {}


def apply_patch(base: dict, patch: dict) -> dict:
    """Recursively merge patch into base config."""
    result = dict(base)
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = apply_patch(result[key], value)
        else:
            result[key] = value
    return result
