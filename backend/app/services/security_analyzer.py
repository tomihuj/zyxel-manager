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

    # Zone names that mean "all traffic" (any representation)
    _WILD = {"ANY", "ALL", "*", ""}

    def _is_deny_default(r: dict) -> bool:
        if r.get("action", "").lower() != "deny":
            return False
        if not r.get("enabled", True):
            return False
        src = r.get("src_zone", "").upper()
        dst = r.get("dst_zone", "").upper()
        # Catch-all: ANY/ALL → ANY/ALL
        if src in _WILD and dst in _WILD:
            return True
        # WAN (or wildcard) → LAN (or wildcard): covers the most important direction
        if src in (_WILD | {"WAN"}) and dst in (_WILD | {"LAN"}):
            return True
        # WAN (or wildcard) → ANY destination: blocks all inbound WAN traffic
        if src in (_WILD | {"WAN"}) and dst in _WILD:
            return True
        return False

    if not any(_is_deny_default(r) for r in rules):
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
# New checks — SNMP
# ---------------------------------------------------------------------------

def check_snmp_default_community(config: dict) -> Optional[FindingDict]:
    """SNMP community string is the factory-default 'public' or 'private'."""
    snmp = config.get("snmp", {})
    if not snmp.get("enabled"):
        return None
    community = snmp.get("community", "")
    if community.lower() in ("public", "private", ""):
        return _finding(
            category="authentication",
            severity="critical",
            title=f"SNMP default community string in use ('{community}')",
            description=(
                f"SNMP is enabled with the well-known community string '{community}'. "
                "Any host on the network can read full device configuration and statistics, "
                "and potentially write configuration if RW access is granted."
            ),
            recommendation=(
                "Change the SNMP community string to a long, random value. "
                "Restrict SNMP access to specific management hosts using an ACL. "
                "Prefer SNMPv3 with authentication and encryption over v1/v2c."
            ),
            config_path="snmp.community",
            compliance_refs='["CIS-FW-4.1", "NIST-IA-3", "ISO27001-A.9"]',
        )
    return None


def check_snmp_v1v2_enabled(config: dict) -> Optional[FindingDict]:
    """SNMPv1 or SNMPv2c is enabled — both lack encryption and strong auth."""
    snmp = config.get("snmp", {})
    if not snmp.get("enabled"):
        return None
    version = snmp.get("version", "").lower()
    if version in ("v1", "v2c", "v2"):
        return _finding(
            category="weak_protocol",
            severity="high",
            title=f"SNMP {snmp.get('version')} enabled — no encryption or strong auth",
            description=(
                f"SNMP version {snmp.get('version')} is active. This version transmits "
                "community strings and MIB data in plaintext, making it trivial to "
                "intercept credentials with a network sniffer."
            ),
            recommendation=(
                "Upgrade to SNMPv3 with authPriv security level (authentication + "
                "AES encryption). Disable SNMPv1 and SNMPv2c entirely. "
                "Restrict SNMP to a dedicated management VLAN."
            ),
            config_path="snmp.version",
            compliance_refs='["CIS-FW-4.1", "NIST-SC-8", "ISO27001-A.13"]',
        )
    return None


# ---------------------------------------------------------------------------
# New checks — IPS / threat prevention
# ---------------------------------------------------------------------------

def check_no_ips(config: dict) -> Optional[FindingDict]:
    """Intrusion Prevention System is disabled."""
    ips = config.get("ips", {})
    if ips.get("enabled") is False:
        return _finding(
            category="missing_hardening",
            severity="high",
            title="Intrusion Prevention System (IPS) disabled",
            description=(
                "The IPS engine is disabled. Without active intrusion prevention, "
                "exploit attempts, malware command-and-control traffic, and known "
                "attack signatures pass through the firewall uninspected."
            ),
            recommendation=(
                "Enable IPS in prevention mode. Subscribe to Zyxel's signature feed "
                "and schedule regular signature updates. Review and tune the default "
                "profile to minimise false positives before enforcing block mode."
            ),
            config_path="ips.enabled",
            compliance_refs='["CIS-FW-7.1", "NIST-SI-3", "ISO27001-A.12.6"]',
        )
    return None


def check_no_content_filter(config: dict) -> Optional[FindingDict]:
    """Web content filtering is disabled."""
    cf = config.get("content_filter", {})
    if cf.get("enabled") is False:
        return _finding(
            category="missing_hardening",
            severity="medium",
            title="Web content filtering disabled",
            description=(
                "Web content filtering is not active. Users can reach malicious, "
                "phishing, and policy-violating websites without restriction. "
                "Drive-by downloads and watering-hole attacks are unmitigated."
            ),
            recommendation=(
                "Enable web content filtering with at least malware and phishing "
                "category blocks. Consider blocking uncategorised sites in "
                "high-security environments."
            ),
            config_path="content_filter.enabled",
            compliance_refs='["CIS-FW-7.2", "NIST-SC-7"]',
        )
    return None


def check_no_app_patrol(config: dict) -> Optional[FindingDict]:
    """Application patrol / deep packet inspection is disabled."""
    ap = config.get("app_patrol", {})
    if ap.get("enabled") is False:
        return _finding(
            category="missing_hardening",
            severity="medium",
            title="Application patrol (deep packet inspection) disabled",
            description=(
                "Application patrol is disabled. Without DPI the firewall cannot "
                "identify or control applications that tunnel over permitted ports "
                "(e.g. P2P over port 80, or Shadow-IT SaaS applications)."
            ),
            recommendation=(
                "Enable application patrol and configure a policy that blocks "
                "high-risk application categories (P2P, anonymisers, remote-access "
                "tools). Log all application activity for audit purposes."
            ),
            config_path="app_patrol.enabled",
            compliance_refs='["NIST-SC-7", "ISO27001-A.13.1"]',
        )
    return None


# ---------------------------------------------------------------------------
# New checks — Logging
# ---------------------------------------------------------------------------

def check_no_remote_syslog(config: dict) -> Optional[FindingDict]:
    """No remote syslog server configured."""
    logging_cfg = config.get("logging", {})
    if not logging_cfg.get("syslog_servers"):
        return _finding(
            category="missing_hardening",
            severity="medium",
            title="No remote syslog server configured",
            description=(
                "Firewall logs are stored locally only. Local-only logs can be lost "
                "if the device is compromised, rebooted, or its storage fills up. "
                "Incident response and forensic analysis require centralised log retention."
            ),
            recommendation=(
                "Configure at least one remote syslog server (e.g. a SIEM or syslog-ng "
                "instance). Ensure logs are retained for at minimum 90 days per most "
                "compliance frameworks. Protect the syslog channel with TLS if available."
            ),
            config_path="logging.syslog_servers",
            compliance_refs='["CIS-FW-8.1", "NIST-AU-9", "ISO27001-A.12.4"]',
        )
    return None


def check_log_level_too_high(config: dict) -> Optional[FindingDict]:
    """Log level set to 'error' or 'critical' only — important events are missed."""
    logging_cfg = config.get("logging", {})
    level = logging_cfg.get("log_level", "").lower()
    if level in ("error", "critical", "alert", "emergency"):
        return _finding(
            category="missing_hardening",
            severity="low",
            title=f"Log verbosity too low (level: {level})",
            description=(
                f"The logging level is set to '{level}'. Only the most severe events "
                "are recorded. Denied connection attempts, policy violations, and "
                "authentication failures will not appear in logs."
            ),
            recommendation=(
                "Set the log level to 'warning' or 'info' to capture denied traffic, "
                "authentication events, and policy hits. Review storage capacity "
                "and rotate logs to a remote syslog server."
            ),
            config_path="logging.log_level",
            compliance_refs='["NIST-AU-2", "ISO27001-A.12.4"]',
        )
    return None


# ---------------------------------------------------------------------------
# New checks — Dangerous service objects
# ---------------------------------------------------------------------------

def check_ftp_service(config: dict) -> Optional[FindingDict]:
    """FTP service object (port 21) present — cleartext file transfer."""
    for i, svc in enumerate(config.get("service_objects", [])):
        if int(svc.get("port", 0)) == 21:
            return _finding(
                category="exposed_service",
                severity="high",
                title="FTP service object defined (port 21)",
                description=(
                    "A service object for FTP (TCP/21) is defined. FTP transmits "
                    "credentials and file data in cleartext and is vulnerable to "
                    "credential sniffing and man-in-the-middle attacks."
                ),
                recommendation=(
                    "Replace FTP with SFTP (SSH file transfer, TCP/22) or FTPS "
                    "(FTP over TLS, TCP/990). Remove the FTP service object and "
                    "any firewall rules that permit it."
                ),
                config_path=f"service_objects[{i}]",
                compliance_refs='["CIS-FW-2.1", "NIST-SC-8"]',
            )
    return None


def check_rdp_service(config: dict) -> Optional[FindingDict]:
    """RDP service object (port 3389) present."""
    for i, svc in enumerate(config.get("service_objects", [])):
        if int(svc.get("port", 0)) == 3389:
            return _finding(
                category="exposed_service",
                severity="high",
                title="RDP service object defined (port 3389)",
                description=(
                    "A service object for Remote Desktop Protocol (TCP/3389) is defined. "
                    "RDP is one of the most frequently exploited remote access protocols "
                    "and a top initial-access vector in ransomware campaigns."
                ),
                recommendation=(
                    "Remove direct RDP exposure. Require RDP sessions to be established "
                    "only over VPN. Enable Network Level Authentication (NLA) and "
                    "consider a Remote Desktop Gateway to add MFA."
                ),
                config_path=f"service_objects[{i}]",
                compliance_refs='["CIS-FW-2.3", "NIST-SC-7"]',
            )
    return None


def check_smb_service(config: dict) -> Optional[FindingDict]:
    """SMB service object (port 445) present."""
    for i, svc in enumerate(config.get("service_objects", [])):
        if int(svc.get("port", 0)) == 445:
            return _finding(
                category="exposed_service",
                severity="high",
                title="SMB service object defined (port 445)",
                description=(
                    "A service object for SMB (TCP/445) is defined. Publicly reachable "
                    "SMB is the attack vector for EternalBlue (MS17-010/WannaCry) and "
                    "numerous other critical exploits. SMB should never be internet-facing."
                ),
                recommendation=(
                    "Block SMB at the perimeter unconditionally. Remove this service "
                    "object or ensure no firewall rule allows it from untrusted zones. "
                    "Internal SMB traffic should traverse only trusted network segments."
                ),
                config_path=f"service_objects[{i}]",
                compliance_refs='["CIS-FW-2.4", "NIST-SC-7", "ISO27001-A.13.1"]',
            )
    return None


# ---------------------------------------------------------------------------
# New checks — Session and password hardening
# ---------------------------------------------------------------------------

def check_no_login_timeout(config: dict) -> Optional[FindingDict]:
    """Admin session idle timeout is zero (disabled)."""
    timeout = config.get("system", {}).get("login_timeout_minutes", None)
    if timeout is not None and int(timeout) == 0:
        return _finding(
            category="authentication",
            severity="medium",
            title="Admin session idle timeout disabled",
            description=(
                "The management session timeout is set to 0 (disabled). "
                "Unattended admin sessions remain active indefinitely, giving an "
                "attacker physical or network access a permanent foothold."
            ),
            recommendation=(
                "Set the idle session timeout to 10–15 minutes for interactive "
                "management sessions. Apply this to both web UI and SSH access."
            ),
            config_path="system.login_timeout_minutes",
            compliance_refs='["CIS-FW-5.3", "NIST-AC-11", "ISO27001-A.9.4"]',
        )
    return None


def check_no_account_lockout(config: dict) -> Optional[FindingDict]:
    """No account lockout threshold configured (brute-force protection absent)."""
    threshold = config.get("users", {}).get("lockout_threshold", None)
    if threshold is not None and int(threshold) == 0:
        return _finding(
            category="authentication",
            severity="medium",
            title="No account lockout threshold configured",
            description=(
                "Account lockout is disabled (threshold = 0). Without a lockout "
                "policy, brute-force and credential-stuffing attacks against the "
                "management interface can run indefinitely without automatic blocking."
            ),
            recommendation=(
                "Set the account lockout threshold to 5–10 failed attempts and a "
                "lockout duration of at least 15 minutes. Monitor lockout events "
                "and alert on repeated lockouts as indicators of attack."
            ),
            config_path="users.lockout_threshold",
            compliance_refs='["CIS-FW-5.4", "NIST-AC-7", "ISO27001-A.9.4"]',
        )
    return None


def check_no_password_policy(config: dict) -> Optional[FindingDict]:
    """No password complexity policy defined."""
    policy = config.get("users", {}).get("password_policy", None)
    if policy is None:
        return _finding(
            category="authentication",
            severity="medium",
            title="No password complexity policy configured",
            description=(
                "No password policy is enforced. Users and administrators can set "
                "trivially guessable passwords with no minimum length, complexity, "
                "or rotation requirements."
            ),
            recommendation=(
                "Define a password policy requiring a minimum of 12 characters, "
                "mixed case, digits, and special characters. Enforce password "
                "rotation every 90 days for privileged accounts."
            ),
            config_path="users.password_policy",
            compliance_refs='["CIS-FW-5.5", "NIST-IA-5", "ISO27001-A.9.4"]',
        )
    return None


# ---------------------------------------------------------------------------
# New checks — Network-level hardening
# ---------------------------------------------------------------------------

def check_no_anti_spoofing(config: dict) -> Optional[FindingDict]:
    """Anti-IP-spoofing protection is disabled."""
    fw_settings = config.get("firewall_settings", {})
    if fw_settings.get("anti_spoofing") is False:
        return _finding(
            category="missing_hardening",
            severity="medium",
            title="Anti-IP-spoofing protection disabled",
            description=(
                "Anti-spoofing (reverse-path forwarding / unicast RPF) is disabled. "
                "Attackers can send packets with forged source addresses, bypassing "
                "ACL restrictions and making attribution difficult."
            ),
            recommendation=(
                "Enable anti-spoofing on all WAN-facing interfaces. "
                "Configure strict RPF on interfaces where routing is deterministic, "
                "and loose RPF on asymmetric routing paths."
            ),
            config_path="firewall_settings.anti_spoofing",
            compliance_refs='["CIS-FW-1.4", "NIST-SC-7", "BCP38"]',
        )
    return None


def check_no_syn_flood_protection(config: dict) -> Optional[FindingDict]:
    """SYN flood (DoS) protection is disabled."""
    fw_settings = config.get("firewall_settings", {})
    if fw_settings.get("syn_flood_protection") is False:
        return _finding(
            category="missing_hardening",
            severity="medium",
            title="SYN flood protection disabled",
            description=(
                "SYN flood protection (SYN cookies / half-open connection limiting) "
                "is disabled. A SYN flood attack can exhaust the TCP connection table "
                "and render the firewall and downstream services unavailable."
            ),
            recommendation=(
                "Enable SYN flood protection on WAN-facing interfaces. "
                "Configure appropriate thresholds for half-open connections and "
                "SYN packet rate limiting. Test thresholds under normal load first."
            ),
            config_path="firewall_settings.syn_flood_protection",
            compliance_refs='["CIS-FW-1.5", "NIST-SC-5"]',
        )
    return None


def check_auto_update_disabled(config: dict) -> Optional[FindingDict]:
    """Automatic firmware/signature update check is disabled."""
    if config.get("system", {}).get("auto_update_check") is False:
        return _finding(
            category="firmware",
            severity="low",
            title="Automatic update check disabled",
            description=(
                "The device does not automatically check for firmware or signature "
                "updates. Security patches and IPS/content-filter signature updates "
                "will not be applied unless triggered manually."
            ),
            recommendation=(
                "Enable automatic update checks so the device notifies administrators "
                "when new firmware is available. Schedule signature updates (IPS, "
                "content filter) on at least a daily cadence."
            ),
            config_path="system.auto_update_check",
            compliance_refs='["CIS-FW-6.2", "NIST-SI-2"]',
        )
    return None


# ---------------------------------------------------------------------------
# New checks — Network flood / DoS protection
# ---------------------------------------------------------------------------

def check_no_icmp_flood_protection(config: dict) -> Optional[FindingDict]:
    """ICMP flood (ping flood) protection is disabled."""
    fw_settings = config.get("firewall_settings", {})
    if fw_settings.get("icmp_flood_protection") is False:
        return _finding(
            category="missing_hardening",
            severity="medium",
            title="ICMP flood protection disabled",
            description=(
                "ICMP flood protection is not enabled. A sustained ICMP flood (ping "
                "flood) from the internet can saturate CPU and bandwidth, causing "
                "denial of service for legitimate traffic."
            ),
            recommendation=(
                "Enable ICMP flood protection on WAN-facing interfaces. "
                "Set a sensible ICMP rate-limit threshold and consider blocking "
                "unsolicited ICMP echo requests from untrusted zones entirely."
            ),
            config_path="firewall_settings.icmp_flood_protection",
            compliance_refs='["CIS-FW-1.6", "NIST-SC-5"]',
        )
    return None


def check_no_port_scan_detection(config: dict) -> Optional[FindingDict]:
    """Port scan detection is disabled."""
    fw_settings = config.get("firewall_settings", {})
    if fw_settings.get("port_scan_detection") is False:
        return _finding(
            category="missing_hardening",
            severity="medium",
            title="Port scan detection disabled",
            description=(
                "Port scan detection is not active. Reconnaissance scans from the "
                "internet can enumerate open ports and services without triggering "
                "any alert, giving attackers valuable information about the network."
            ),
            recommendation=(
                "Enable port scan detection on WAN-facing interfaces. "
                "Configure automatic blocking of scanning source addresses and "
                "alert on detected scan activity."
            ),
            config_path="firewall_settings.port_scan_detection",
            compliance_refs='["CIS-FW-1.7", "NIST-SI-4"]',
        )
    return None


# ---------------------------------------------------------------------------
# New checks — IPS mode
# ---------------------------------------------------------------------------

def check_ips_detection_only(config: dict) -> Optional[FindingDict]:
    """IPS is enabled but in detection-only (monitor) mode — threats are not blocked."""
    ips = config.get("ips", {})
    if ips.get("enabled") and ips.get("mode", "").lower() == "detection":
        return _finding(
            category="missing_hardening",
            severity="medium",
            title="IPS running in detection-only mode (not blocking)",
            description=(
                "The Intrusion Prevention System is enabled but configured in "
                "detection mode only. Known attack signatures are logged but "
                "not actively blocked, giving attackers a free pass."
            ),
            recommendation=(
                "Switch IPS from detection mode to prevention (inline blocking) mode. "
                "Review the default prevention profile for false-positive risk before "
                "enforcing block mode in a production environment."
            ),
            config_path="ips.mode",
            compliance_refs='["CIS-FW-7.1", "NIST-SI-3"]',
        )
    return None


# ---------------------------------------------------------------------------
# New checks — SNMP
# ---------------------------------------------------------------------------

def check_snmp_no_trap_host(config: dict) -> Optional[FindingDict]:
    """SNMP is enabled but no trap host is configured."""
    snmp = config.get("snmp", {})
    if snmp.get("enabled") and not snmp.get("trap_host"):
        return _finding(
            category="missing_hardening",
            severity="low",
            title="SNMP enabled without a trap destination",
            description=(
                "SNMP is active but no trap host is configured. SNMP traps are the "
                "primary mechanism for the device to proactively alert a NMS/SIEM "
                "about threshold violations, link state changes, and auth failures."
            ),
            recommendation=(
                "Configure an SNMP trap host pointing to your NMS or SIEM. "
                "Ensure trap community strings differ from read community strings, "
                "or migrate to SNMPv3 inform notifications with authentication."
            ),
            config_path="snmp.trap_host",
            compliance_refs='["CIS-FW-4.2", "NIST-AU-9"]',
        )
    return None


# ---------------------------------------------------------------------------
# New checks — Authentication / access control
# ---------------------------------------------------------------------------

def check_local_auth_only(config: dict) -> Optional[FindingDict]:
    """Only local accounts are used — no centralised authentication server."""
    remote_auth = config.get("users", {}).get("remote_auth", {})
    if not remote_auth.get("enabled", False):
        return _finding(
            category="authentication",
            severity="info",
            title="No centralised authentication server configured",
            description=(
                "Remote authentication (RADIUS/LDAP/Active Directory) is disabled. "
                "All admin accounts are managed locally on the device. Local-only "
                "accounts are not subject to central password policies, MFA, or "
                "immediate de-provisioning when staff leave."
            ),
            recommendation=(
                "Integrate the firewall with a centralised identity provider (RADIUS, "
                "LDAP, or SAML). This enables MFA enforcement, centralised audit "
                "trails, and instant account revocation."
            ),
            config_path="users.remote_auth.enabled",
            compliance_refs='["CIS-FW-5.6", "NIST-IA-2", "ISO27001-A.9.2"]',
        )
    return None


# ---------------------------------------------------------------------------
# New checks — Dangerous service objects (additional ports)
# ---------------------------------------------------------------------------

def check_tftp_service(config: dict) -> Optional[FindingDict]:
    """TFTP service object (UDP/69) present — unauthenticated file transfer."""
    for i, svc in enumerate(config.get("service_objects", [])):
        if int(svc.get("port", 0)) == 69:
            return _finding(
                category="exposed_service",
                severity="high",
                title="TFTP service object defined (port 69)",
                description=(
                    "A service object for TFTP (UDP/69) is defined. TFTP has no "
                    "authentication mechanism — any host that can reach the port "
                    "can read or overwrite files, including firmware images."
                ),
                recommendation=(
                    "Remove the TFTP service object. Use SFTP or SCP for secure "
                    "file transfers. Ensure no firewall rule permits TFTP from "
                    "untrusted zones."
                ),
                config_path=f"service_objects[{i}]",
                compliance_refs='["CIS-FW-2.5", "NIST-SC-8"]',
            )
    return None


def check_vnc_service(config: dict) -> Optional[FindingDict]:
    """VNC service object (port 5900) present."""
    for i, svc in enumerate(config.get("service_objects", [])):
        if int(svc.get("port", 0)) == 5900:
            return _finding(
                category="exposed_service",
                severity="high",
                title="VNC service object defined (port 5900)",
                description=(
                    "A service object for VNC (TCP/5900) is defined. VNC implementations "
                    "often use weak authentication and transmit the desktop session with "
                    "inadequate encryption. Internet-facing VNC is a frequent ransomware "
                    "initial access vector."
                ),
                recommendation=(
                    "Remove direct VNC exposure. Replace with a VPN + RDP/SSH "
                    "combination, or an enterprise remote-access platform with MFA. "
                    "If VNC must be used, tunnel it through SSH."
                ),
                config_path=f"service_objects[{i}]",
                compliance_refs='["CIS-FW-2.6", "NIST-SC-7"]',
            )
    return None


def check_mysql_service(config: dict) -> Optional[FindingDict]:
    """MySQL/MariaDB service object (port 3306) present."""
    for i, svc in enumerate(config.get("service_objects", [])):
        if int(svc.get("port", 0)) == 3306:
            return _finding(
                category="exposed_service",
                severity="high",
                title="MySQL/MariaDB service object defined (port 3306)",
                description=(
                    "A service object for MySQL/MariaDB (TCP/3306) is defined. "
                    "Databases should never be directly internet-accessible. "
                    "Exposed database ports are a primary target for automated "
                    "credential brute-force and data-exfiltration attacks."
                ),
                recommendation=(
                    "Remove this service object and ensure no firewall rule permits "
                    "TCP/3306 from untrusted zones. Database traffic should only flow "
                    "on private internal segments between application and database tiers."
                ),
                config_path=f"service_objects[{i}]",
                compliance_refs='["CIS-FW-2.7", "NIST-SC-7", "ISO27001-A.13.1"]',
            )
    return None


def check_mssql_service(config: dict) -> Optional[FindingDict]:
    """MSSQL service object (port 1433) present."""
    for i, svc in enumerate(config.get("service_objects", [])):
        if int(svc.get("port", 0)) == 1433:
            return _finding(
                category="exposed_service",
                severity="high",
                title="MSSQL service object defined (port 1433)",
                description=(
                    "A service object for Microsoft SQL Server (TCP/1433) is defined. "
                    "Publicly reachable MSSQL is routinely targeted for sa-account "
                    "brute force, xp_cmdshell exploitation, and data exfiltration."
                ),
                recommendation=(
                    "Block TCP/1433 at the perimeter unconditionally. Remove this "
                    "service object or ensure no WAN-sourced rule references it. "
                    "Use encrypted private tunnels for any remote DBA access."
                ),
                config_path=f"service_objects[{i}]",
                compliance_refs='["CIS-FW-2.8", "NIST-SC-7", "ISO27001-A.13.1"]',
            )
    return None


def check_ssh_from_wan(config: dict) -> Optional[FindingDict]:
    """SSH (port 22) service object reachable from WAN via an allow rule."""
    ssh_svc_names = {
        s.get("name")
        for s in config.get("service_objects", [])
        if int(s.get("port", 0)) == 22
    }
    if not ssh_svc_names:
        return None
    for i, rule in enumerate(config.get("firewall_rules", [])):
        if (
            rule.get("src_zone", "").upper() == "WAN"
            and rule.get("action", "").lower() == "allow"
            and rule.get("enabled", True)
        ):
            return _finding(
                category="exposed_service",
                severity="high",
                title="SSH (port 22) potentially reachable from WAN",
                description=(
                    "An SSH service object (TCP/22) exists and a permissive WAN allow "
                    "rule is active. Publicly reachable SSH is a prime target for "
                    "credential brute-force, especially with default usernames."
                ),
                recommendation=(
                    "Restrict SSH management access to specific trusted source IPs only. "
                    "Disable password authentication and require SSH key pairs. "
                    "Consider moving SSH to a non-standard port or using a VPN jump host."
                ),
                config_path=f"firewall_rules[{i}]",
                compliance_refs='["CIS-FW-2.9", "NIST-IA-5", "ISO27001-A.9.4"]',
            )
    return None


# ---------------------------------------------------------------------------
# New checks — Outbound / egress policy
# ---------------------------------------------------------------------------

def check_unrestricted_outbound(config: dict) -> Optional[FindingDict]:
    """LAN-to-WAN allow rule with no service restriction (all ports permitted)."""
    for i, rule in enumerate(config.get("firewall_rules", [])):
        if (
            rule.get("src_zone", "").upper() == "LAN"
            and rule.get("dst_zone", "").upper() == "WAN"
            and rule.get("action", "").lower() == "allow"
            and rule.get("enabled", True)
            and not rule.get("service")   # no service field = all services
        ):
            return _finding(
                category="permissive_rule",
                severity="low",
                title="Unrestricted outbound traffic (LAN→WAN, all services)",
                description=(
                    f"Rule '{rule.get('name', 'unknown')}' allows all traffic from "
                    "LAN to WAN without service restriction. This permits any protocol "
                    "and port egress, making it easier for malware to establish "
                    "outbound C2 channels and for data to be exfiltrated."
                ),
                recommendation=(
                    "Replace with explicit allow rules for required services only "
                    "(e.g. TCP/80, TCP/443, TCP/25). Block all other outbound traffic "
                    "by default. Use application patrol to enforce egress policy "
                    "even on permitted ports."
                ),
                config_path=f"firewall_rules[{i}]",
                compliance_refs='["CIS-FW-1.8", "NIST-SC-7", "ISO27001-A.13.1"]',
            )
    return None


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

ALL_CHECKS = [
    # Permissive rules
    check_wan_to_lan_allow,
    check_no_deny_by_default,
    check_any_to_any_allow,
    check_disabled_rules_present,
    check_unrestricted_outbound,
    # Exposed services
    check_telnet_service,
    check_http_wan_reachable,
    check_ssh_from_wan,
    check_ftp_service,
    check_tftp_service,
    check_rdp_service,
    check_vnc_service,
    check_smb_service,
    check_mysql_service,
    check_mssql_service,
    # Authentication
    check_default_admin_username,
    check_multiple_admin_accounts,
    check_no_login_timeout,
    check_no_account_lockout,
    check_no_password_policy,
    check_local_auth_only,
    check_snmp_default_community,
    # Weak protocols
    check_no_vpn,
    check_ssl_vpn_without_ipsec,
    check_snmp_v1v2_enabled,
    # Missing hardening
    check_ntp_disabled,
    check_no_ntp_servers,
    check_single_dns,
    check_single_ntp,
    check_no_static_routes,
    check_nat_snat_default,
    check_no_address_objects,
    check_default_hostname,
    check_public_dns_servers,
    check_no_ips,
    check_ips_detection_only,
    check_no_content_filter,
    check_no_app_patrol,
    check_no_remote_syslog,
    check_log_level_too_high,
    check_no_anti_spoofing,
    check_no_syn_flood_protection,
    check_no_icmp_flood_protection,
    check_no_port_scan_detection,
    check_snmp_no_trap_host,
    # Firmware
    check_old_firmware_v5,
    check_auto_update_disabled,
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
