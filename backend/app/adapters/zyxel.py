"""
Zyxel USG FLEX adapter — real device integration.

Authentication: POST / with username/pwd/password form fields (ZLD ExtJS UI).
Config fetch:   POST /cgi-bin/zysh-cgi with CLI commands (requires X-Requested-With header).
Response format: JavaScript variable declarations — var zyshdata0=[{...}];
"""
import ast
import logging
import re
import time

import httpx

from app.adapters.base import FirewallAdapter

logger = logging.getLogger(__name__)

# Section → ordered list of CLI commands to try (first non-empty result wins).
# Multiple candidates handle firmware differences across FLEX models.
_SECTION_CLI: dict[str, list[str]] = {
    "system":          ["show version"],
    "interfaces":      ["show interface all"],
    "routing":         ["show ip route static"],
    "nat":             [
        "show nat rule many-to-one",   # ZLD 5.x many-to-one SNAT rules
        "show nat rule 1-to-1",        # 1:1 NAT / DNAT rules
        "show virtual-server",         # port-forwarding / virtual server
        "show policy nat",             # policy-based NAT
        "show policy-nat",             # alternative spelling
        "show snat",                   # SNAT only
        "show nat rule",               # generic
        "show ip nat",                 # legacy fallback
    ],
    "nat_snat":        ["show system default-snat"],
    "firewall_rules":  ["show secure-policy"],
    "vpn":             ["show l2tp-over-ipsec"],
    "dns":             ["show ip dns server status"],
    "ntp":             ["show ntp server"],
    "address_objects": ["show address-object"],
    "service_objects": ["show service-object"],
    "users":           [
        "show user admin list",        # ZLD 5.x admin users
        "show admin",                  # alternative
        "show user local",             # local user accounts
        "show object-user",            # user objects
        "show local-user",             # local user list
        "show user",                   # generic fallback
    ],
}

_CGI_PATH = "/cgi-bin/zysh-cgi"


def _extract_system_info(data) -> dict:
    """Extract firmware_version / serial_number / model from a parsed 'show version' response.

    Handles:
      - list of dicts with _boot_status (real Zyxel): pick the Running image
      - single dict (mock / legacy)
    """
    row = {}
    if isinstance(data, list) and data:
        # Prefer the "Running" image; fall back to first entry
        running = next((r for r in data if isinstance(r, dict) and r.get("_boot_status") == "Running"), None)
        row = running or (data[0] if isinstance(data[0], dict) else {})
    elif isinstance(data, dict) and "_error" not in data:
        row = data

    fw = (row.get("_firmware_version")        # real Zyxel: _firmware_version
          or row.get("Firmware Version")       # alternative real format
          or row.get("firmware")               # mock format
          or row.get("Firmware")
          or row.get("version")
          or row.get("Version"))
    serial = (row.get("_serial_number") or row.get("Serial Number")
              or row.get("serial") or row.get("Serial"))
    model = (row.get("_model") or row.get("Model Name")
             or row.get("model") or row.get("Model"))
    return {"firmware_version": fw, "serial_number": serial, "model": model}


def _parse_zysh_response(text: str, cmd: str = "") -> list | dict | None:
    """Parse the JavaScript variable response from zysh-cgi.

    Response format:
        var zyshdata0=[{'key':'value',...}];
        var errno0=0;
        var errmsg0='OK';

    Returns the parsed zyshdata0 value, or None on failure.
    """
    if not text:
        return None

    # Log errno/errmsg so we can spot bad commands
    errno_m  = re.search(r"var errno0=(\d+);", text)
    errmsg_m = re.search(r"var errmsg0='([^']*)';", text)
    errno  = int(errno_m.group(1))  if errno_m  else None
    errmsg = errmsg_m.group(1)      if errmsg_m else None
    if errno or (errmsg and errmsg.upper() not in ("OK", "")):
        logger.warning("zysh-cgi cmd=%r errno=%s errmsg=%r", cmd, errno, errmsg)
    else:
        logger.debug("zysh-cgi cmd=%r errno=%s errmsg=%r", cmd, errno, errmsg)

    m = re.search(r"var zyshdata0=(.*?);", text, re.DOTALL)
    if not m:
        logger.debug("zysh-cgi cmd=%r: no zyshdata0 in response; raw=%r", cmd, text[:300])
        return None
    raw = m.group(1).strip()
    try:
        return ast.literal_eval(raw)
    except Exception as exc:
        logger.warning("zysh-cgi cmd=%r: parse error %s; raw=%r", cmd, exc, raw[:300])
        return None


class ZyxelAdapter(FirewallAdapter):

    def _base_url(self, device) -> str:
        return f"{device.protocol}://{device.mgmt_ip}:{device.port}"

    def _client(self, device) -> httpx.Client:
        return httpx.Client(verify=False, timeout=30.0, follow_redirects=False)

    def _extract_token(self, client: httpx.Client, resp: httpx.Response) -> str | None:
        """Try to extract a session token from the response (any status)."""
        # JSON token (REST API devices)
        if resp.status_code in (200, 201):
            try:
                data = resp.json()
                token = (
                    data.get("access_token")
                    or data.get("token")
                    or (data.get("data") or {}).get("token")
                )
                if token:
                    return token
            except Exception:
                pass

        # Session cookie — check known names first, then fall back to any cookie
        known = ("authtok", "SESSION", "JSESSIONID", "sid", "session",
                 "PHPSESSID", "LASSID", "webui_session")
        for cname in known:
            val = client.cookies.get(cname) or resp.cookies.get(cname)
            if val:
                return val

        # Fallback: accept any cookie present in jar after a 200 or 302
        if resp.status_code in (200, 301, 302):
            all_cookies = dict(client.cookies) | dict(resp.cookies)
            if all_cookies:
                name, val = next(iter(all_cookies.items()))
                logger.info("ZyxelAdapter: using cookie %s from jar", name)
                return val

        return None

    def _authenticate(self, client: httpx.Client, base_url: str, credentials: dict) -> str:
        user = credentials.get("username")
        pwd  = credentials.get("password")

        # ── Step 1: seed session + parse login form ───────────────────────────
        seed = None
        try:
            seed = client.get(f"{base_url}/", follow_redirects=True)
            logger.debug("ZyxelAdapter: seed GET / → HTTP %s", seed.status_code)
        except Exception as exc:
            logger.warning("ZyxelAdapter: seed GET failed: %s", exc)

        # Extract hidden field values (mp_idx, pwd_r) and CSRF token
        mp_idx = ""
        pwd_r  = ""
        csrf_token = None
        form_action = "/"
        if seed and seed.text:
            html = seed.text
            m = re.search(r'<input[^>]+id="mp_idx"[^>]+value="([^"]*)"', html, re.IGNORECASE)
            if m:
                mp_idx = m.group(1)
            m = re.search(r'<input[^>]+name="pwd_r"[^>]+value="([^"]*)"', html, re.IGNORECASE)
            if m:
                pwd_r = m.group(1)
            for pat in (
                r'name=["\']csrf[_-]?token["\'] value=["\']([^"\']+)["\']',
                r'"csrfToken"\s*:\s*"([^"]+)"',
            ):
                m = re.search(pat, html, re.IGNORECASE)
                if m:
                    csrf_token = m.group(1)
                    break
            m = re.search(r'<form[^>]+action=["\']([^"\']+)["\']', html, re.IGNORECASE)
            if m:
                form_action = m.group(1) or "/"

        # ZLD USG FLEX form: password hidden field = pwd + pwd_r (set by setData() JS)
        zyxel_pwd_field = pwd + pwd_r

        json_hdrs = {
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
            "Referer": f"{base_url}/",
        }
        form_hdrs = {
            "Content-Type": "application/x-www-form-urlencoded",
            "Referer": f"{base_url}/",
        }

        # ── Step 2: try strategies in order ──────────────────────────────────
        # Primary: ZLD USG FLEX form (username / pwd / password = pwd+pwd_r)
        zyxel_form = {
            "username": user,
            "pwd":      pwd,
            "password": zyxel_pwd_field,
            "pwd_r":    pwd_r,
            "mp_idx":   mp_idx,
        }
        if csrf_token:
            zyxel_form["csrf_token"] = csrf_token

        # Fallbacks
        generic_form = {"username": user, "password": pwd, "login": "1"}
        legacy_form  = {"myUsername": user, "myPassword": pwd, "login": "1"}
        if csrf_token:
            generic_form["csrf_token"] = csrf_token
            legacy_form["csrf_token"]  = csrf_token

        strategies = [
            # ZLD USG FLEX (ZLD 5.x ExtJS) — correct form fields
            ("POST", form_action,               "form", zyxel_form),
            ("POST", "/",                       "form", zyxel_form),
            # ZLD 5.x REST API
            ("POST", "/api/v1/auth",            "json", {"user": user, "password": pwd}),
            ("PUT",  "/api/v1/auth",            "json", {"user": user, "password": pwd}),
            ("POST", "/api/v1/auth",            "json", {"username": user, "password": pwd}),
            # CGI handlers
            ("POST", "/ztp/cgi-bin/handler",    "json", {"username": user, "password": pwd, "cmd": "login"}),
            ("POST", "/cgi-bin/dispatcher.cgi", "form", generic_form),
            # Legacy ZLD 4.x field names
            ("POST", form_action,               "form", legacy_form),
            ("POST", "/",                       "form", legacy_form),
            # Generic fallback
            ("POST", form_action,               "form", generic_form),
            ("POST", "/",                       "form", generic_form),
        ]

        errors = []
        for method, path, enc, body in strategies:
            try:
                kwargs = {"headers": json_hdrs if enc == "json" else form_hdrs}
                kwargs["json" if enc == "json" else "data"] = body
                resp = client.request(method, f"{base_url}{path}", **kwargs)
                loc  = resp.headers.get("location", "")
                logger.debug("ZyxelAdapter: %s %s → HTTP %s  Location: %s",
                             method, path, resp.status_code, loc)

                token = self._extract_token(client, resp)
                if token:
                    logger.info("ZyxelAdapter: authenticated via %s %s", method, path)
                    return token

                errors.append(f"{method} {path} → HTTP {resp.status_code}  Location: {loc or '—'}")
            except Exception as exc:
                errors.append(f"{method} {path} → {exc}")

        raise ValueError(
            "Authentication failed — all strategies exhausted.\n" +
            "\n".join(f"  {e}" for e in errors)
        )

    def diagnose_auth(self, device, credentials: dict) -> list[dict]:
        """Return per-attempt details for diagnostics UI (password masked in output)."""
        user = credentials.get("username")
        pwd  = credentials.get("password")
        base_url = self._base_url(device)

        with self._client(device) as client:
            # Seed to get cookies / form state
            mp_idx = ""
            pwd_r  = ""
            try:
                seed = client.get(f"{base_url}/", follow_redirects=True)
                html = seed.text
                m = re.search(r'<input[^>]+id="mp_idx"[^>]+value="([^"]*)"', html, re.IGNORECASE)
                if m:
                    mp_idx = m.group(1)
                m = re.search(r'<input[^>]+name="pwd_r"[^>]+value="([^"]*)"', html, re.IGNORECASE)
                if m:
                    pwd_r = m.group(1)
            except Exception:
                pass

            zyxel_pwd_field = pwd + pwd_r

            json_hdrs = {"Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest", "Referer": f"{base_url}/"}
            form_hdrs = {"Content-Type": "application/x-www-form-urlencoded", "Referer": f"{base_url}/"}

            zyxel_form   = {"username": user, "pwd": pwd, "password": zyxel_pwd_field, "pwd_r": pwd_r, "mp_idx": mp_idx}
            generic_form = {"username": user, "password": pwd, "login": "1"}
            legacy_form  = {"myUsername": user, "myPassword": pwd, "login": "1"}

            strategies = [
                ("POST", "/",                       "form", zyxel_form),
                ("POST", "/api/v1/auth",            "json", {"user": user,     "password": pwd}),
                ("PUT",  "/api/v1/auth",            "json", {"user": user,     "password": pwd}),
                ("POST", "/api/v1/auth",            "json", {"username": user, "password": pwd}),
                ("POST", "/ztp/cgi-bin/handler",    "json", {"username": user, "password": pwd, "cmd": "login"}),
                ("POST", "/cgi-bin/dispatcher.cgi", "form", generic_form),
                ("POST", "/",                       "form", legacy_form),
                ("POST", "/",                       "form", generic_form),
            ]

            results = []
            for method, path, enc, body in strategies:
                url = f"{base_url}{path}"
                hdrs = json_hdrs if enc == "json" else form_hdrs
                display_body = {k: ("***" if "password" in k.lower() else v) for k, v in body.items()}
                try:
                    kwargs = {"headers": hdrs}
                    kwargs["json" if enc == "json" else "data"] = body
                    resp = client.request(method, url, **kwargs)
                    loc = resp.headers.get("location", "")
                    token = self._extract_token(client, resp)
                    all_cookies = list((dict(client.cookies) | dict(resp.cookies)).keys())
                    results.append({
                        "method": method,
                        "url": url,
                        "content_type": enc,
                        "body": display_body,
                        "http_status": resp.status_code,
                        "location": loc or None,
                        "success": bool(token),
                        "cookies_set": all_cookies,
                    })
                    if token:
                        break
                except Exception as exc:
                    results.append({
                        "method": method,
                        "url": url,
                        "content_type": enc,
                        "body": display_body,
                        "http_status": None,
                        "location": None,
                        "success": False,
                        "error": str(exc),
                        "cookies_set": [],
                    })
            return results

    def test_connection(self, device, credentials: dict, timeout: int = 5) -> dict:
        t0 = time.monotonic()
        try:
            with httpx.Client(verify=False, timeout=float(timeout), follow_redirects=False) as c:
                self._authenticate(c, self._base_url(device), credentials)
            return {"success": True, "message": "Connected",
                    "latency_ms": round((time.monotonic() - t0) * 1000, 1)}
        except Exception as e:
            logger.error("ZyxelAdapter.test_connection: %s", e)
            return {"success": False, "message": str(e), "latency_ms": None}

    def _cgi_headers(self, base_url: str) -> dict:
        return {
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Requested-With": "XMLHttpRequest",
            "Referer": f"{base_url}/ext-js/index.html",
        }

    def _fetch_section(self, client: httpx.Client, base_url: str, cli_cmd: str) -> list | dict | None:
        """Run a single CLI command via zysh-cgi and return parsed data."""
        resp = client.post(
            f"{base_url}{_CGI_PATH}",
            data={"filter": "js2", "cmd": cli_cmd, "write": "0"},
            headers=self._cgi_headers(base_url),
        )
        if resp.status_code == 200:
            result = _parse_zysh_response(resp.text, cmd=cli_cmd)
            if not result:
                logger.info("ZyxelAdapter: cmd=%r returned empty; raw=%r", cli_cmd, resp.text[:300])
            return result
        logger.warning("ZyxelAdapter: zysh-cgi %r → HTTP %s", cli_cmd, resp.status_code)
        return None

    def _fetch_section_multi(self, client: httpx.Client, base_url: str, candidates: list[str]) -> list | dict | None:
        """Try each candidate command in order; return first non-empty result."""
        for cmd in candidates:
            result = self._fetch_section(client, base_url, cmd)
            if result:
                logger.info("ZyxelAdapter: section resolved via cmd=%r value=%r", cmd, result)
                return result
        logger.warning("ZyxelAdapter: all candidates exhausted for cmds=%r", candidates)
        return {"_error": "not_available", "_detail": "No CLI command returned data for this section. The account may lack privilege or this section is not accessible via zysh-cgi on this firmware."}

    def fetch_config(self, device, credentials: dict, section: str = "full") -> dict:
        try:
            with self._client(device) as c:
                base = self._base_url(device)
                self._authenticate(c, base, credentials)

                if section == "full":
                    result = {}
                    for sec, candidates in _SECTION_CLI.items():
                        result[sec] = self._fetch_section_multi(c, base, candidates)
                    return result

                candidates = _SECTION_CLI.get(section)
                if not candidates:
                    logger.warning("ZyxelAdapter: no CLI command for section %r", section)
                    return None
                return self._fetch_section_multi(c, base, candidates)
        except Exception as e:
            logger.error("ZyxelAdapter.fetch_config: %s", e)
            raise

    def get_device_info(self, device, credentials: dict) -> dict:
        try:
            with self._client(device) as c:
                base = self._base_url(device)
                self._authenticate(c, base, credentials)
                data = self._fetch_section_multi(c, base, _SECTION_CLI["system"])
                return _extract_system_info(data)
        except Exception as e:
            logger.error("ZyxelAdapter.get_device_info: %s", e)
            return {}

    def restore_config(self, device, credentials: dict, config: dict) -> dict:
        return {"success": False, "message": "Restore not yet supported for Zyxel adapter"}

    def apply_patch(self, device, credentials: dict, section: str, patch: dict) -> dict:
        """Apply a configuration patch via CLI commands (write=1).

        The patch dict must contain a 'cli' key with the CLI command string to execute.
        """
        try:
            with self._client(device) as c:
                base = self._base_url(device)
                self._authenticate(c, base, credentials)

                cli_cmd = patch.get("cli")
                if not cli_cmd:
                    raise ValueError("Patch must include a 'cli' key with the CLI command to apply.")

                resp = c.post(
                    f"{base}{_CGI_PATH}",
                    data={"filter": "js2", "cmd": cli_cmd, "write": "1"},
                    headers=self._cgi_headers(base),
                )
                if resp.status_code != 200:
                    raise RuntimeError(f"zysh-cgi returned HTTP {resp.status_code}")

                return {"success": True, "message": f"Applied patch to {section}",
                        "rollback_hint": "Restore previous config via device sync."}
        except Exception as e:
            logger.error("ZyxelAdapter.apply_patch: %s", e)
            return {"success": False, "message": str(e)}
