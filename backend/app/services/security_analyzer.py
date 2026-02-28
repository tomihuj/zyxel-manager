"""
Rule-based security analyzer for Zyxel USG FLEX config snapshots.

Each check_* function receives the full config dict and returns either a
FindingDict or None.  All checks are collected in ALL_CHECKS at module load.
"""
from typing import Optional, TypedDict


class FindingDict(TypedDict):
    category: str
    severity: str
    title: str
    description: str
    recommendation: str
    remediation_patch: Optional[str]
    config_path: Optional[str]
    compliance_refs: Optional[str]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_PUBLIC_DNS = {"8.8.8.8", "8.8.4.4", "1.1.1.1", "1.0.0.1", "9.9.9.9", "208.67.222.222"}


def _finding(
    category: str,
    severity: str,
    title: str,
    description: str,
    recommendation: str,
    remediation_patch: Optional[str] = None,
    config_path: Optional[str] = None,
    compliance_refs: Optional[str] = None,
) -> FindingDict:
    return FindingDict(
        category=category,
        severity=severity,
        title=title,
        description=description,
        recommendation=recommendation,
        remediation_patch=remediation_patch,
        config_path=config_path,
        compliance_refs=compliance_refs,
    )


# ---------------------------------------------------------------------------
# Checks
# ---------------------------------------------------------------------------

def check_wan_to_lan_allow(config: dict) -> Optional[FindingDict]:
    """WAN→LAN allow firewall rule is a critical risk."""
    for i, rule in enumerate(config.get("firewall_rules", [])):
        if (
            rule.get("src_zone", "").upper() == "WAN"
            and rule.get("dst_zone", "").upper() == "LAN"
            and rule.get("action", "").lower() == "allow"
            and rule.get("enabled", True)
        ):
            return _finding(
                category="permissive_rule",
                severity="critical",
                title="WAN-to-LAN allow rule detected",
                description=(
                    f"Firewall rule '{rule.get('name', 'unknown')}' permits all traffic "
                    "from the WAN zone directly into the LAN zone. This exposes internal "
                    "hosts to the internet."
                ),
                recommendation=(
                    "Remove or restrict this rule. Create specific allow rules for only "
                    "required services and source addresses instead of blanket WAN→LAN allow."
                ),
                config_path=f"firewall_rules[{i}].action",
                compliance_refs='["CIS-FW-1.3", "NIST-SC-7"]',
            )
    return None


def check_no_deny_by_default(config: dict) -> Optional[FindingDict]:
    """No explicit deny-all / default-deny rule present."""
    rules = config.get("firewall_rules", [])
    has_deny_all = any(
        r.get("action", "").lower() == "deny"
        and r.get("src_zone", "").upper() in ("ANY", "WAN")
        and r.get("dst_zone", "").upper() in ("ANY", "LAN")
        and r.get("enabled", True)
        for r in rules
    )
    if not has_deny_all:
        return _finding(
            category="permissive_rule",
            severity="critical",
            title="No deny-by-default firewall rule",
            description=(
                "No catch-all deny rule was found. Without a default-deny policy, "
                "traffic that does not match any explicit rule may be implicitly allowed, "
                "depending on firmware defaults."
            ),
            recommendation=(
                "Add a lowest-priority rule that denies all traffic from WAN to LAN. "
                "Explicit deny-all is the recommended security baseline."
            ),
            config_path="firewall_rules",
            compliance_refs='["CIS-FW-1.1", "NIST-SC-7", "ISO27001-A.13"]',
        )
    return None


def check_telnet_service(config: dict) -> Optional[FindingDict]:
    """Telnet service object (port 23) present in config."""
    for i, svc in enumerate(config.get("service_objects", [])):
        if int(svc.get("port", 0)) == 23:
            return _finding(
                category="exposed_service",
                severity="high",
                title="Telnet service object defined",
                description=(
                    "A service object for Telnet (TCP/23) exists. Telnet transmits "
                    "credentials in cleartext and is obsolete for management access."
                ),
                recommendation=(
                    "Remove the Telnet service object and any firewall rules that reference "
                    "it. Use SSH (TCP/22) or HTTPS management instead."
                ),
                config_path=f"service_objects[{i}]",
                compliance_refs='["CIS-FW-2.1", "NIST-IA-5"]',
            )
    return None


def check_http_wan_reachable(config: dict) -> Optional[FindingDict]:
    """HTTP (port 80) service object reachable from WAN."""
    http_svc_names = {
        s.get("name")
        for s in config.get("service_objects", [])
        if int(s.get("port", 0)) == 80
    }
    if not http_svc_names:
        return None
    # If any WAN→LAN allow rule references HTTP or is generic
    for i, rule in enumerate(config.get("firewall_rules", [])):
        if (
            rule.get("src_zone", "").upper() == "WAN"
            and rule.get("action", "").lower() == "allow"
            and rule.get("enabled", True)
        ):
            return _finding(
                category="exposed_service",
                severity="high",
                title="HTTP (port 80) potentially reachable from WAN",
                description=(
                    "An HTTP service object (port 80) exists and a permissive WAN allow "
                    "rule is present. Unencrypted HTTP exposes management traffic."
                ),
                recommendation=(
                    "Enforce HTTPS (TLS) for all management access. Disable or remove "
                    "HTTP service objects and update firewall rules accordingly."
                ),
                config_path=f"firewall_rules[{i}]",
                compliance_refs='["CIS-FW-2.2", "NIST-SC-8"]',
            )
    return None


def check_default_admin_username(config: dict) -> Optional[FindingDict]:
    """Default 'admin' username still in use."""
    accounts = config.get("users", {}).get("local_accounts", [])
    for i, acct in enumerate(accounts):
        if acct.get("username", "").lower() == "admin":
            return _finding(
                category="authentication",
                severity="high",
                title="Default 'admin' username in use",
                description=(
                    "The factory-default username 'admin' is still active. Attackers "
                    "routinely target this well-known account in credential-stuffing attacks."
                ),
                recommendation=(
                    "Rename the default admin account to a non-guessable username and "
                    "enforce a strong password policy."
                ),
                config_path=f"users.local_accounts[{i}].username",
                compliance_refs='["CIS-FW-5.1", "NIST-IA-5"]',
            )
    return None


def check_any_to_any_allow(config: dict) -> Optional[FindingDict]:
    """Any-to-any allow rule is present."""
    for i, rule in enumerate(config.get("firewall_rules", [])):
        src = rule.get("src_zone", "").upper()
        dst = rule.get("dst_zone", "").upper()
        if (
            src == "ANY" and dst == "ANY"
            and rule.get("action", "").lower() == "allow"
            and rule.get("enabled", True)
        ):
            return _finding(
                category="permissive_rule",
                severity="high",
                title="Any-to-any allow rule detected",
                description=(
                    f"Rule '{rule.get('name', 'unknown')}' allows traffic between all "
                    "zones without restriction. This essentially disables the firewall."
                ),
                recommendation=(
                    "Replace this rule with specific zone-pair rules that permit only "
                    "required traffic. Follow the principle of least privilege."
                ),
                config_path=f"firewall_rules[{i}]",
                compliance_refs='["CIS-FW-1.2", "NIST-SC-7"]',
            )
    return None


def check_no_vpn(config: dict) -> Optional[FindingDict]:
    """No VPN configured (no IPSec tunnels, no SSL VPN)."""
    vpn = config.get("vpn", {})
    if not vpn.get("ipsec_tunnels") and not vpn.get("ssl_vpn_enabled"):
        return _finding(
            category="weak_protocol",
            severity="medium",
            title="No VPN configured",
            description=(
                "Neither IPSec tunnels nor SSL VPN are configured. Remote users or "
                "branch offices may be connecting over unencrypted channels."
            ),
            recommendation=(
                "Configure IPSec or SSL VPN for secure remote access. "
                "Require VPN for all administrative management traffic."
            ),
            config_path="vpn",
            compliance_refs='["NIST-SC-8", "ISO27001-A.10"]',
        )
    return None


def check_ntp_disabled(config: dict) -> Optional[FindingDict]:
    """NTP is disabled."""
    ntp = config.get("ntp", {})
    if ntp.get("enabled") is False:
        return _finding(
            category="missing_hardening",
            severity="medium",
            title="NTP is disabled",
            description=(
                "Network Time Protocol is disabled. Accurate timekeeping is essential "
                "for log correlation, certificate validation, and audit trails."
            ),
            recommendation=(
                "Enable NTP and configure at least two reliable time sources. "
                "Use pool.ntp.org or your organisation's internal NTP server."
            ),
            config_path="ntp.enabled",
            compliance_refs='["CIS-FW-3.1", "NIST-AU-8"]',
        )
    return None


def check_no_ntp_servers(config: dict) -> Optional[FindingDict]:
    """NTP is enabled but no servers are configured."""
    ntp = config.get("ntp", {})
    if ntp.get("enabled", True) and not ntp.get("servers"):
        return _finding(
            category="missing_hardening",
            severity="medium",
            title="No NTP servers configured",
            description=(
                "NTP is enabled but no server addresses are defined. "
                "The device cannot synchronise its clock."
            ),
            recommendation="Configure at least two NTP server addresses.",
            config_path="ntp.servers",
            compliance_refs='["CIS-FW-3.1", "NIST-AU-8"]',
        )
    return None


def check_single_dns(config: dict) -> Optional[FindingDict]:
    """Only one DNS server configured — no redundancy."""
    servers = config.get("dns", {}).get("servers", [])
    if len(servers) == 1:
        return _finding(
            category="missing_hardening",
            severity="low",
            title="Single DNS server — no redundancy",
            description=(
                "Only one DNS resolver is configured. If it becomes unavailable, "
                "all DNS resolution will fail, disrupting connectivity."
            ),
            recommendation=(
                "Add a secondary DNS server for redundancy. "
                "Consider using different providers or your ISP's resolver as a backup."
            ),
            config_path="dns.servers",
            compliance_refs='["CIS-FW-3.2"]',
        )
    return None


def check_single_ntp(config: dict) -> Optional[FindingDict]:
    """Only one NTP server configured — no redundancy."""
    servers = config.get("ntp", {}).get("servers", [])
    if len(servers) == 1:
        return _finding(
            category="missing_hardening",
            severity="low",
            title="Single NTP server — no redundancy",
            description=(
                "Only one NTP server is configured. A single time source is a "
                "single point of failure and is insufficient per RFC 5905."
            ),
            recommendation=(
                "Configure at least three NTP sources for proper clock selection "
                "and resilience against a single server failure."
            ),
            config_path="ntp.servers",
            compliance_refs='["CIS-FW-3.1", "NIST-AU-8"]',
        )
    return None


def check_multiple_admin_accounts(config: dict) -> Optional[FindingDict]:
    """Multiple local accounts with admin role."""
    accounts = config.get("users", {}).get("local_accounts", [])
    admins = [a for a in accounts if a.get("role", "").lower() == "admin"]
    if len(admins) > 1:
        return _finding(
            category="authentication",
            severity="medium",
            title=f"Multiple admin accounts ({len(admins)})",
            description=(
                f"{len(admins)} local accounts have the administrator role. "
                "Shared admin accounts hinder accountability and audit trails."
            ),
            recommendation=(
                "Limit admin accounts to the minimum required. Use role-based access "
                "control with least-privilege accounts for day-to-day operations. "
                "Ensure each account belongs to a named individual."
            ),
            config_path="users.local_accounts",
            compliance_refs='["CIS-FW-5.2", "NIST-AC-6"]',
        )
    return None


def check_disabled_rules_present(config: dict) -> Optional[FindingDict]:
    """Disabled firewall rules are still present in config."""
    disabled = [r for r in config.get("firewall_rules", []) if not r.get("enabled", True)]
    if disabled:
        return _finding(
            category="permissive_rule",
            severity="low",
            title=f"Disabled firewall rules present ({len(disabled)})",
            description=(
                f"{len(disabled)} firewall rule(s) are disabled but still defined. "
                "Stale rules increase management complexity and may be accidentally re-enabled."
            ),
            recommendation=(
                "Review and remove rules that are no longer needed. "
                "Document intentionally disabled rules with comments."
            ),
            config_path="firewall_rules[].enabled",
        )
    return None


def check_no_static_routes(config: dict) -> Optional[FindingDict]:
    """No static routes defined."""
    routes = config.get("routing", {}).get("static_routes", [])
    if not routes:
        return _finding(
            category="missing_hardening",
            severity="info",
            title="No static routes configured",
            description=(
                "No static routes are defined beyond the default gateway. "
                "In multi-segment environments this may indicate misconfiguration."
            ),
            recommendation=(
                "Review routing requirements. Add static routes for internal subnets "
                "if multiple network segments are in use."
            ),
            config_path="routing.static_routes",
        )
    return None


def check_old_firmware_v5(config: dict) -> Optional[FindingDict]:
    """Firmware is on the V5.x branch (older release train)."""
    firmware = config.get("system", {}).get("firmware", "")
    if firmware.upper().startswith("V5."):
        return _finding(
            category="firmware",
            severity="medium",
            title=f"Firmware on older V5.x branch ({firmware})",
            description=(
                f"Device is running firmware '{firmware}' which is on the older V5 "
                "release branch. Zyxel has released V5.38+ with security patches."
            ),
            recommendation=(
                "Update to the latest stable firmware release. "
                "Review the Zyxel security advisory for CVEs addressed in newer versions."
            ),
            config_path="system.firmware",
            compliance_refs='["CIS-FW-6.1", "NIST-SI-2"]',
        )
    return None


def check_nat_snat_default(config: dict) -> Optional[FindingDict]:
    """NAT SNAT contains uncustomised default_snat entry."""
    snat_entries = config.get("nat_snat", [])
    for i, entry in enumerate(snat_entries):
        if "default_snat" in entry:
            return _finding(
                category="missing_hardening",
                severity="low",
                title="Default SNAT rule not customised",
                description=(
                    "The NAT SNAT table contains the factory-default SNAT entry. "
                    "This may indicate NAT policy has not been reviewed or tailored."
                ),
                recommendation=(
                    "Review NAT/SNAT rules and replace the default entry with "
                    "explicit, documented SNAT policies matching your network design."
                ),
                config_path=f"nat_snat[{i}]",
            )
    return None


def check_no_address_objects(config: dict) -> Optional[FindingDict]:
    """No address objects defined."""
    if not config.get("address_objects"):
        return _finding(
            category="missing_hardening",
            severity="info",
            title="No address objects defined",
            description=(
                "No named address objects are configured. Firewall rules written "
                "with raw IP ranges are harder to audit and maintain."
            ),
            recommendation=(
                "Define address objects for key subnets and hosts. "
                "Reference these objects in firewall and NAT rules for clarity."
            ),
            config_path="address_objects",
        )
    return None


def check_default_hostname(config: dict) -> Optional[FindingDict]:
    """Hostname still contains 'mock' or 'default'."""
    hostname = config.get("system", {}).get("hostname", "")
    if any(kw in hostname.lower() for kw in ("mock", "default", "zyxel-flex")):
        return _finding(
            category="missing_hardening",
            severity="low",
            title="Default or generic hostname in use",
            description=(
                f"The system hostname '{hostname}' appears to be a factory default or "
                "placeholder. This makes devices harder to identify in logs and alerts."
            ),
            recommendation=(
                "Set a meaningful, organisation-specific hostname that helps identify "
                "the device's location and purpose in log entries."
            ),
            config_path="system.hostname",
        )
    return None


def check_public_dns_servers(config: dict) -> Optional[FindingDict]:
    """Using well-known public DNS resolvers."""
    servers = config.get("dns", {}).get("servers", [])
    public_used = [s for s in servers if s in _PUBLIC_DNS]
    if public_used:
        return _finding(
            category="missing_hardening",
            severity="info",
            title=f"Public DNS resolver(s) in use ({', '.join(public_used)})",
            description=(
                "Public DNS resolvers are configured. DNS queries reveal browsing "
                "and connection patterns to third-party providers."
            ),
            recommendation=(
                "Consider using an internal DNS resolver or privacy-focused resolver. "
                "Evaluate DNS-over-HTTPS or DNS-over-TLS for transit privacy."
            ),
            config_path="dns.servers",
        )
    return None


def check_ssl_vpn_without_ipsec(config: dict) -> Optional[FindingDict]:
    """SSL VPN enabled without any IPSec tunnels."""
    vpn = config.get("vpn", {})
    if vpn.get("ssl_vpn_enabled") and not vpn.get("ipsec_tunnels"):
        return _finding(
            category="weak_protocol",
            severity="medium",
            title="SSL VPN enabled without IPSec backup",
            description=(
                "SSL VPN is the only remote access method configured. "
                "Without IPSec as a fallback, a TLS outage leaves remote users without access."
            ),
            recommendation=(
                "Configure IPSec tunnels as a complementary VPN technology. "
                "Ensure SSL VPN certificates are from a trusted CA and up to date."
            ),
            config_path="vpn.ssl_vpn_enabled",
            compliance_refs='["NIST-SC-8", "ISO27001-A.10"]',
        )
    return None


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

ALL_CHECKS = [
    check_wan_to_lan_allow,
    check_no_deny_by_default,
    check_telnet_service,
    check_http_wan_reachable,
    check_default_admin_username,
    check_any_to_any_allow,
    check_no_vpn,
    check_ntp_disabled,
    check_no_ntp_servers,
    check_single_dns,
    check_single_ntp,
    check_multiple_admin_accounts,
    check_disabled_rules_present,
    check_no_static_routes,
    check_old_firmware_v5,
    check_nat_snat_default,
    check_no_address_objects,
    check_default_hostname,
    check_public_dns_servers,
    check_ssl_vpn_without_ipsec,
]


def analyze_config(config: dict) -> list[FindingDict]:
    """Run all checks and return a list of findings (non-None results)."""
    findings = []
    for check_fn in ALL_CHECKS:
        try:
            result = check_fn(config)
            if result is not None:
                findings.append(result)
        except Exception:
            pass
    return findings


# ---------------------------------------------------------------------------
# Score calculation
# ---------------------------------------------------------------------------

def calculate_score(findings: list) -> tuple[int, str]:
    """
    Returns (score, grade).
    score: 0-100 (100 = no findings)
    grade: A/B/C/D/F
    """
    critical = sum(1 for f in findings if f.get("severity") == "critical")
    high = sum(1 for f in findings if f.get("severity") == "high")
    medium = sum(1 for f in findings if f.get("severity") == "medium")
    low = sum(1 for f in findings if f.get("severity") == "low")
    info = sum(1 for f in findings if f.get("severity") == "info")

    score = 100 - (critical * 25 + high * 10 + medium * 5 + low * 2 + info * 1)
    score = max(0, score)

    if score >= 90:
        grade = "A"
    elif score >= 75:
        grade = "B"
    elif score >= 50:
        grade = "C"
    elif score >= 25:
        grade = "D"
    else:
        grade = "F"

    return score, grade
