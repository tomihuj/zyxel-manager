import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Box, Typography, Tabs, Tab, Card, CardContent, Chip, Button, Grid,
  LinearProgress, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Select, MenuItem, FormControl, InputLabel, CircularProgress,
  Paper, Tooltip, IconButton, Collapse, Divider, Stack, Alert,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Autocomplete,
} from '@mui/material'
import { DataGrid } from '@mui/x-data-grid'
import type { GridColDef } from '@mui/x-data-grid'
import SecurityIcon from '@mui/icons-material/Security'
import RefreshIcon from '@mui/icons-material/Refresh'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import StopIcon from '@mui/icons-material/Stop'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import RestoreIcon from '@mui/icons-material/Restore'
import BuildIcon from '@mui/icons-material/Build'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import SettingsIcon from '@mui/icons-material/Settings'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import BlockIcon from '@mui/icons-material/Block'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import {
  listFindings, suppressFinding, reopenFinding, remediateFinding,
  listScans, triggerScan, cancelScan, listScores, getSecuritySummary, getFindingContext,
  listExclusions, createExclusion, deleteExclusion,
} from '../api/security'
import { listDevices } from '../api/devices'
import { useToastStore } from '../store/toast'
import { useParameterSetsStore, extractConfigRows, cellStr } from '../store/parameterSets'
import type { SecurityFinding, SecurityScan, SecurityExclusion } from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SEVERITY_COLOR: Record<string, string> = {
  critical: '#dc2626',
  high: '#d97706',
  medium: '#ca8a04',
  low: '#2563eb',
  info: '#6b7280',
}

const SEVERITY_MUI: Record<string, 'error' | 'warning' | 'info' | 'default'> = {
  critical: 'error',
  high: 'warning',
  medium: 'warning',
  low: 'info',
  info: 'default',
}

const CATEGORY_LABELS: Record<string, string> = {
  exposed_service: 'Exposed Service',
  permissive_rule: 'Permissive Rule',
  weak_protocol: 'Weak Protocol',
  missing_hardening: 'Missing Hardening',
  firmware: 'Firmware',
  authentication: 'Authentication',
}

function gradeColor(grade: string) {
  if (grade === 'A') return '#059669'
  if (grade === 'B') return '#16a34a'
  if (grade === 'C') return '#ca8a04'
  if (grade === 'D') return '#d97706'
  return '#dc2626'
}

function ScoreGauge({ score, grade }: { score: number; grade: string }) {
  const color = gradeColor(grade)
  return (
    <Box sx={{ textAlign: 'center', py: 2 }}>
      <Typography variant="h1" fontWeight={800} sx={{ color, lineHeight: 1 }}>
        {score}
      </Typography>
      <Typography variant="h4" fontWeight={700} sx={{ color, mt: 0.5 }}>
        {grade}
      </Typography>
      <Typography variant="body2" color="text.secondary" mt={1}>
        Fleet Security Score
      </Typography>
    </Box>
  )
}

// ---------------------------------------------------------------------------
// Tab panels
// ---------------------------------------------------------------------------

function TabPanel({ value, index, children }: { value: number; index: number; children: React.ReactNode }) {
  return value === index ? <Box sx={{ pt: 3 }}>{children}</Box> : null
}

// ---------------------------------------------------------------------------
// Overview tab
// ---------------------------------------------------------------------------

function OverviewTab() {
  const { push } = useToastStore()
  const qc = useQueryClient()

  const { data: summary } = useQuery({
    queryKey: ['security-summary'],
    queryFn: getSecuritySummary,
    refetchInterval: 30_000,
  })

  const { data: scores = [] } = useQuery({
    queryKey: ['security-scores'],
    queryFn: listScores,
    refetchInterval: 30_000,
  })

  const { data: devices = [] } = useQuery({ queryKey: ['devices'], queryFn: listDevices })
  const [scanDevices, setScanDevices] = useState<{ id: string; name: string }[]>([])

  const scanMut = useMutation({
    mutationFn: () => triggerScan(scanDevices.length > 0 ? scanDevices.map((d) => d.id) : []),
    onSuccess: () => {
      const label = scanDevices.length === 0
        ? 'Fleet scan triggered — results will update shortly'
        : `Scan triggered for ${scanDevices.length === 1 ? scanDevices[0].name : `${scanDevices.length} devices`}`
      push(label)
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['security-summary'] })
        qc.invalidateQueries({ queryKey: ['security-scores'] })
        qc.invalidateQueries({ queryKey: ['security-findings'] })
        qc.invalidateQueries({ queryKey: ['security-scans'] })
      }, 4000)
    },
    onError: () => push('Failed to trigger scan', 'error'),
  })

  const fleetScore = summary?.fleet_score ?? 100
  const fleetGrade = summary?.fleet_grade ?? 'A'
  const bySeverity = summary?.by_severity ?? {}
  const severities = ['critical', 'high', 'medium', 'low', 'info']
  const maxSeverityCount = Math.max(...severities.map((s) => bySeverity[s] ?? 0), 1)

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 2, mb: 3, alignItems: 'flex-start', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <Autocomplete
          multiple
          size="small"
          options={devices}
          getOptionLabel={(d) => d.name}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          value={scanDevices}
          onChange={(_, val) => setScanDevices(val)}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Firewalls to scan"
              placeholder={scanDevices.length === 0 ? 'All devices (fleet)' : ''}
            />
          )}
          renderTags={(value, getTagProps) =>
            value.map((d, i) => (
              <Chip label={d.name} size="small" {...getTagProps({ index: i })} key={d.id} />
            ))
          }
          sx={{ minWidth: 280 }}
          noOptionsText="No devices found"
        />
        <Button
          variant="contained"
          startIcon={scanMut.isPending ? <CircularProgress size={16} color="inherit" /> : <PlayArrowIcon />}
          onClick={() => scanMut.mutate()}
          disabled={scanMut.isPending}
          color="primary"
          sx={{ mt: 0.5, whiteSpace: 'nowrap' }}
        >
          {scanDevices.length === 0 ? 'Scan All' : `Scan ${scanDevices.length} Device${scanDevices.length > 1 ? 's' : ''}`}
        </Button>
      </Box>

      <Grid container spacing={3}>
        {/* Score card */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <ScoreGauge score={fleetScore} grade={fleetGrade} />
              <Box sx={{ mt: 2, textAlign: 'center' }}>
                <Chip
                  label={`${summary?.total_open ?? 0} open findings`}
                  color={summary?.total_open ? 'error' : 'success'}
                  size="small"
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Severity breakdown */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" fontWeight={600} mb={2}>Findings by Severity</Typography>
              {severities.map((sev) => {
                const count = bySeverity[sev] ?? 0
                const pct = (count / maxSeverityCount) * 100
                return (
                  <Box key={sev} sx={{ mb: 1.5 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="caption" sx={{ textTransform: 'capitalize', color: SEVERITY_COLOR[sev] }}>
                        {sev}
                      </Typography>
                      <Typography variant="caption" fontWeight={600}>{count}</Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={pct}
                      sx={{
                        height: 6, borderRadius: 3,
                        bgcolor: 'grey.200',
                        '& .MuiLinearProgress-bar': { bgcolor: SEVERITY_COLOR[sev], borderRadius: 3 },
                      }}
                    />
                  </Box>
                )
              })}
            </CardContent>
          </Card>
        </Grid>

        {/* Category breakdown */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" fontWeight={600} mb={2}>Findings by Category</Typography>
              {Object.entries(summary?.by_category ?? {}).length === 0 && (
                <Typography variant="body2" color="text.secondary">No open findings.</Typography>
              )}
              {Object.entries(summary?.by_category ?? {}).map(([cat, count]) => (
                <Box key={cat} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.75, borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="body2">{CATEGORY_LABELS[cat] ?? cat}</Typography>
                  <Chip label={count} size="small" />
                </Box>
              ))}
            </CardContent>
          </Card>
        </Grid>

        {/* Per-device scores */}
        <Grid item xs={12}>
          <Typography variant="h6" fontWeight={600} mb={2}>Device Security Scores</Typography>
          <Grid container spacing={2}>
            {scores.length === 0 && (
              <Grid item xs={12}>
                <Typography variant="body2" color="text.secondary">
                  No scores yet — run a scan to populate device scores.
                </Typography>
              </Grid>
            )}
            {scores.map((s) => (
              <Grid item xs={12} sm={6} md={4} lg={3} key={s.id}>
                <Card variant="outlined">
                  <CardContent sx={{ pb: '12px !important' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <Typography variant="body2" fontWeight={600} noWrap sx={{ maxWidth: 140 }}>
                        {s.device_name}
                      </Typography>
                      <Typography variant="h5" fontWeight={800} sx={{ color: gradeColor(s.grade) }}>
                        {s.grade}
                      </Typography>
                    </Box>
                    <Typography variant="h4" fontWeight={700} sx={{ color: gradeColor(s.grade), mt: 0.5 }}>
                      {s.score}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, mt: 1, flexWrap: 'wrap' }}>
                      {s.critical_findings > 0 && (
                        <Chip label={`${s.critical_findings} critical`} size="small" color="error" />
                      )}
                      {s.high_findings > 0 && (
                        <Chip label={`${s.high_findings} high`} size="small" color="warning" />
                      )}
                      {s.open_findings === 0 && (
                        <Chip label="Clean" size="small" color="success" />
                      )}
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Grid>
      </Grid>
    </Box>
  )
}

// ---------------------------------------------------------------------------
// Compliance reference database
// ---------------------------------------------------------------------------

interface RefDetail {
  framework: string
  title: string
  description: string
  url: string
}

const CIS_URL = 'https://www.cisecurity.org/benchmark/cisco'
const ISO_URL = 'https://www.iso.org/standard/54534.html'

function nistUrl(control: string) {
  return `https://csrc.nist.gov/Projects/risk-management/sp800-53-controls/release-search#!/control?version=5.1&number=${control}`
}

const COMPLIANCE_REF_DB: Record<string, RefDetail> = {
  // ── CIS Benchmark for Firewalls ──────────────────────────────────────────
  'CIS-FW-1.1': { framework: 'CIS Firewall Benchmark', title: 'Deny by Default', description: 'All firewall rule sets must have an explicit deny-all rule as the last entry to block traffic not explicitly permitted.', url: CIS_URL },
  'CIS-FW-1.2': { framework: 'CIS Firewall Benchmark', title: 'Remove Unused Rules', description: 'Unused or disabled firewall rules should be removed to reduce the attack surface and simplify audits.', url: CIS_URL },
  'CIS-FW-1.3': { framework: 'CIS Firewall Benchmark', title: 'No WAN-to-LAN Permit', description: 'Inbound connections from untrusted zones (WAN) to trusted zones (LAN) must not be permitted without explicit business justification.', url: CIS_URL },
  'CIS-FW-1.4': { framework: 'CIS Firewall Benchmark', title: 'Ingress Filtering (BCP38)', description: 'Implement ingress filtering to block IP packets with spoofed source addresses. Complements RFC 2827 (BCP38).', url: CIS_URL },
  'CIS-FW-1.5': { framework: 'CIS Firewall Benchmark', title: 'Flood / DoS Protection', description: 'Enable rate-limiting and flood-protection mechanisms to mitigate denial-of-service attacks.', url: CIS_URL },
  'CIS-FW-1.6': { framework: 'CIS Firewall Benchmark', title: 'Port Scan Detection', description: 'Enable port-scan detection to identify reconnaissance activity against the firewall and protected networks.', url: CIS_URL },
  'CIS-FW-1.7': { framework: 'CIS Firewall Benchmark', title: 'Intrusion Prevention (IPS)', description: 'Enable IPS in blocking (inline) mode to actively prevent exploitation attempts rather than merely logging them.', url: CIS_URL },
  'CIS-FW-2.1': { framework: 'CIS Firewall Benchmark', title: 'Strong Admin Authentication', description: 'Administrative access must require strong, unique credentials. Default account names and passwords must be changed.', url: CIS_URL },
  'CIS-FW-2.2': { framework: 'CIS Firewall Benchmark', title: 'Encrypted Management Traffic', description: 'All administrative sessions must use encrypted protocols (SSH, HTTPS). Cleartext protocols (Telnet, HTTP) must be disabled.', url: CIS_URL },
  'CIS-FW-2.3': { framework: 'CIS Firewall Benchmark', title: 'Restrict Management Access', description: 'Management interface access should be restricted to specific trusted IP addresses or management networks.', url: CIS_URL },
  'CIS-FW-2.4': { framework: 'CIS Firewall Benchmark', title: 'Management on Secure Zone', description: 'The management interface must not be exposed to untrusted zones such as the WAN or DMZ.', url: CIS_URL },
  'CIS-FW-2.5': { framework: 'CIS Firewall Benchmark', title: 'Secure SNMP Configuration', description: 'SNMP must use SNMPv3 with authentication and privacy, or be disabled. SNMP trap receivers must be configured.', url: CIS_URL },
  'CIS-FW-2.6': { framework: 'CIS Firewall Benchmark', title: 'Disable TFTP', description: 'TFTP provides unauthenticated file transfer and must be disabled unless explicitly required.', url: CIS_URL },
  'CIS-FW-3.1': { framework: 'CIS Firewall Benchmark', title: 'NTP Configuration', description: 'Accurate time synchronisation via NTP is required for meaningful log correlation, forensics, and certificate validation.', url: CIS_URL },
  'CIS-FW-3.2': { framework: 'CIS Firewall Benchmark', title: 'Audit Logging Enabled', description: 'All security-relevant events must be logged and forwarded to a centralised syslog server for retention and analysis.', url: CIS_URL },
  'CIS-FW-4.1': { framework: 'CIS Firewall Benchmark', title: 'Strong VPN Encryption', description: 'VPN tunnels must use strong encryption algorithms (AES-256) and authentication (IKEv2, certificate-based) — not deprecated protocols.', url: CIS_URL },
  'CIS-FW-4.2': { framework: 'CIS Firewall Benchmark', title: 'VPN Certificate Auth', description: 'VPN authentication should use certificates or multi-factor authentication rather than pre-shared keys alone.', url: CIS_URL },
  'CIS-FW-5.1': { framework: 'CIS Firewall Benchmark', title: 'Rename Default Admin Account', description: 'The default "admin" account must be renamed or disabled to prevent targeted credential attacks.', url: CIS_URL },
  'CIS-FW-5.2': { framework: 'CIS Firewall Benchmark', title: 'Least Privilege for Accounts', description: 'Administrative accounts must be granted only the minimum privileges required for their role. Multiple full-admin accounts increase risk.', url: CIS_URL },
  'CIS-FW-5.3': { framework: 'CIS Firewall Benchmark', title: 'Session Timeout', description: 'Inactive administrative sessions must time out automatically to prevent unauthorised access from unattended terminals.', url: CIS_URL },
  'CIS-FW-5.4': { framework: 'CIS Firewall Benchmark', title: 'Account Lockout Policy', description: 'Accounts must lock after a defined number of consecutive failed login attempts to prevent brute-force attacks.', url: CIS_URL },
  'CIS-FW-5.5': { framework: 'CIS Firewall Benchmark', title: 'Password Complexity Policy', description: 'Passwords must meet minimum length, complexity, and history requirements to resist guessing and dictionary attacks.', url: CIS_URL },
  'CIS-FW-5.6': { framework: 'CIS Firewall Benchmark', title: 'Multi-Factor Authentication', description: 'Administrative access should require a second authentication factor in addition to a password.', url: CIS_URL },
  'CIS-FW-6.1': { framework: 'CIS Firewall Benchmark', title: 'Firmware Up to Date', description: 'The firewall firmware must be kept current to address known vulnerabilities and security issues.', url: CIS_URL },
  'CIS-FW-6.2': { framework: 'CIS Firewall Benchmark', title: 'Firmware Integrity', description: 'Firmware updates should be verified for integrity before installation using vendor-provided checksums or signatures.', url: CIS_URL },
  'CIS-FW-7.1': { framework: 'CIS Firewall Benchmark', title: 'Malware / IPS Protection', description: 'Intrusion prevention and anti-malware capabilities should be enabled and kept up to date with current signatures.', url: CIS_URL },
  'CIS-FW-7.2': { framework: 'CIS Firewall Benchmark', title: 'Content / URL Filtering', description: 'Web content filtering should be enabled to block access to malicious or policy-violating categories.', url: CIS_URL },
  'CIS-FW-8.1': { framework: 'CIS Firewall Benchmark', title: 'Configuration Backup', description: 'Firewall configuration must be backed up regularly and stored securely to enable recovery after failure or misconfiguration.', url: CIS_URL },

  // ── NIST SP 800-53 Rev 5 ────────────────────────────────────────────────
  'NIST-SC-5':  { framework: 'NIST SP 800-53', title: 'SC-5 Denial of Service Protection', description: 'Protect against or limit the effects of denial-of-service attacks, including resource exhaustion.', url: nistUrl('SC-5') },
  'NIST-SC-7':  { framework: 'NIST SP 800-53', title: 'SC-7 Boundary Protection', description: 'Monitor and control communications at the external boundary and at key internal boundaries. Implement deny-all, permit-by-exception policies.', url: nistUrl('SC-7') },
  'NIST-SC-8':  { framework: 'NIST SP 800-53', title: 'SC-8 Transmission Confidentiality and Integrity', description: 'Implement cryptographic mechanisms to prevent unauthorised disclosure or modification of information during transmission.', url: nistUrl('SC-8') },
  'NIST-IA-2':  { framework: 'NIST SP 800-53', title: 'IA-2 Identification and Authentication', description: 'Uniquely identify and authenticate organisational users and processes acting on their behalf for system access.', url: nistUrl('IA-2') },
  'NIST-IA-3':  { framework: 'NIST SP 800-53', title: 'IA-3 Device Identification and Authentication', description: 'Uniquely identify and authenticate devices before establishing connections, including VPN endpoints.', url: nistUrl('IA-3') },
  'NIST-IA-5':  { framework: 'NIST SP 800-53', title: 'IA-5 Authenticator Management', description: 'Manage information system authenticators including passwords. Enforce complexity, minimum length, and rotation requirements.', url: nistUrl('IA-5') },
  'NIST-AC-6':  { framework: 'NIST SP 800-53', title: 'AC-6 Least Privilege', description: 'Employ least privilege, allowing only authorised accesses for users (or processes) which are necessary to accomplish assigned tasks.', url: nistUrl('AC-6') },
  'NIST-AC-7':  { framework: 'NIST SP 800-53', title: 'AC-7 Unsuccessful Logon Attempts', description: 'Enforce a limit on consecutive invalid login attempts, lock the account/node, and notify administrators.', url: nistUrl('AC-7') },
  'NIST-AC-11': { framework: 'NIST SP 800-53', title: 'AC-11 Session Lock', description: 'Prevent further access to the system by initiating a session lock after a period of inactivity.', url: nistUrl('AC-11') },
  'NIST-AU-2':  { framework: 'NIST SP 800-53', title: 'AU-2 Event Logging', description: 'Identify events types to be logged that are adequate to support post-hoc analysis of security incidents.', url: nistUrl('AU-2') },
  'NIST-AU-8':  { framework: 'NIST SP 800-53', title: 'AU-8 Time Stamps', description: 'Use system clocks to generate time stamps for audit records, synchronised to an authoritative time source (NTP).', url: nistUrl('AU-8') },
  'NIST-AU-9':  { framework: 'NIST SP 800-53', title: 'AU-9 Protection of Audit Information', description: 'Protect audit information and tools from unauthorised access, modification, and deletion.', url: nistUrl('AU-9') },
  'NIST-SI-2':  { framework: 'NIST SP 800-53', title: 'SI-2 Flaw Remediation', description: 'Identify, report, and correct information system flaws. Install security-relevant software updates within defined time periods.', url: nistUrl('SI-2') },
  'NIST-SI-3':  { framework: 'NIST SP 800-53', title: 'SI-3 Malicious Code Protection', description: 'Implement malicious code protection mechanisms at appropriate locations to detect and eradicate malicious code.', url: nistUrl('SI-3') },
  'NIST-SI-4':  { framework: 'NIST SP 800-53', title: 'SI-4 System Monitoring', description: 'Monitor the system to detect attacks, indicators of potential attacks, and unauthorised access, use, and connections.', url: nistUrl('SI-4') },

  // ── ISO/IEC 27001:2022 ───────────────────────────────────────────────────
  'ISO27001-A.9':      { framework: 'ISO/IEC 27001', title: 'A.9 Access Control', description: 'Limit access to information and information processing facilities to authorised users, processes, and systems.', url: ISO_URL },
  'ISO27001-A.9.2':    { framework: 'ISO/IEC 27001', title: 'A.9.2 User Access Management', description: 'Ensure authorised user access and prevent unauthorised access through formal provisioning and de-provisioning processes.', url: ISO_URL },
  'ISO27001-A.9.4':    { framework: 'ISO/IEC 27001', title: 'A.9.4 System & Application Access Control', description: 'Prevent unauthorised access to systems and applications, including password management and session controls.', url: ISO_URL },
  'ISO27001-A.10':     { framework: 'ISO/IEC 27001', title: 'A.10 Cryptography', description: 'Ensure proper and effective use of cryptography to protect the confidentiality, integrity, and availability of information.', url: ISO_URL },
  'ISO27001-A.12.4':   { framework: 'ISO/IEC 27001', title: 'A.12.4 Logging and Monitoring', description: 'Record events, generate evidence, and monitor usage of systems to detect anomalies and support investigations.', url: ISO_URL },
  'ISO27001-A.12.6':   { framework: 'ISO/IEC 27001', title: 'A.12.6 Technical Vulnerability Management', description: 'Prevent exploitation of technical vulnerabilities by obtaining timely information, assessing exposure, and taking appropriate action.', url: ISO_URL },
  'ISO27001-A.13':     { framework: 'ISO/IEC 27001', title: 'A.13 Communications Security', description: 'Ensure the protection of information in networks and the protection of supporting infrastructure.', url: ISO_URL },
  'ISO27001-A.13.1':   { framework: 'ISO/IEC 27001', title: 'A.13.1 Network Security Management', description: 'Manage and control networks to protect information in systems and applications. Apply appropriate controls on all network services.', url: ISO_URL },

  // ── Other ────────────────────────────────────────────────────────────────
  'BCP38': { framework: 'IETF BCP 38 / RFC 2827', title: 'Network Ingress Filtering', description: 'Defeating Denial of Service attacks which employ IP source address spoofing. ISPs and network operators should filter packets with spoofed source addresses at ingress points.', url: 'https://www.rfc-editor.org/rfc/rfc2827' },
}

// Framework badge colours
const FRAMEWORK_COLOR: Record<string, string> = {
  'CIS Firewall Benchmark': '#1565c0',
  'NIST SP 800-53':         '#2e7d32',
  'ISO/IEC 27001':          '#6a1b9a',
  'IETF BCP 38 / RFC 2827': '#e65100',
}

// ---------------------------------------------------------------------------
// ComplianceRefList — expandable accordion per reference
// ---------------------------------------------------------------------------

function ComplianceRefList({ refs }: { refs: string[] }) {
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 0.5 }}>
      {refs.map((ref) => {
        const detail = COMPLIANCE_REF_DB[ref]
        const isOpen = expanded === ref
        const fwColor = detail ? FRAMEWORK_COLOR[detail.framework] ?? '#555' : '#555'

        return (
          <Box
            key={ref}
            sx={{
              border: '1px solid',
              borderColor: isOpen ? 'primary.light' : 'divider',
              borderRadius: 1,
              overflow: 'hidden',
              transition: 'border-color 0.15s',
            }}
          >
            {/* Header row */}
            <Box
              onClick={() => setExpanded(isOpen ? null : ref)}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75,
                cursor: 'pointer', bgcolor: isOpen ? 'action.selected' : 'transparent',
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <Chip
                label={ref}
                size="small"
                sx={{ fontFamily: 'monospace', fontWeight: 700, bgcolor: fwColor, color: '#fff', fontSize: 11 }}
              />
              {detail ? (
                <>
                  <Typography variant="caption" fontWeight={600} sx={{ flex: 1 }}>
                    {detail.title}
                  </Typography>
                  <Typography variant="caption" color="text.disabled" sx={{ flexShrink: 0 }}>
                    {detail.framework}
                  </Typography>
                </>
              ) : (
                <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                  Unknown reference
                </Typography>
              )}
              {isOpen ? <ExpandLessIcon sx={{ fontSize: 16, color: 'text.secondary', flexShrink: 0 }} /> : <ExpandMoreIcon sx={{ fontSize: 16, color: 'text.secondary', flexShrink: 0 }} />}
            </Box>

            {/* Expanded detail */}
            {isOpen && detail && (
              <Box sx={{ px: 1.5, py: 1, bgcolor: 'action.hover', borderTop: '1px solid', borderColor: 'divider' }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  {detail.description}
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  href={detail.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{ textTransform: 'none', fontSize: 12 }}
                  startIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
                >
                  View full {detail.framework} documentation
                </Button>
              </Box>
            )}
          </Box>
        )
      })}
    </Box>
  )
}

// ---------------------------------------------------------------------------
// Finding context dialog — full details + live config section
// ---------------------------------------------------------------------------

function FindingContextDialog({
  findingId,
  onClose,
}: {
  findingId: string | null
  onClose: () => void
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['security-finding-context', findingId],
    queryFn: () => getFindingContext(findingId!),
    enabled: !!findingId,
  })

  const f = data?.finding
  const section = data?.section
  const config = data?.config

  const { getSetForSection } = useParameterSetsStore()
  const paramSet = section ? getSetForSection(section) : undefined

  function renderConfig() {
    if (!config) return null
    if ((config as any)._error) {
      const isUnavailable = (config as any)._error === 'not_available'
      return (
        <Alert severity={isUnavailable ? 'info' : 'error'} sx={{ mt: 1 }}>
          {isUnavailable
            ? `The "${section}" section is not accessible via the device CLI on this firmware. The finding was detected from scan data — see the description and recommendation above.`
            : `Could not fetch live config: ${(config as any)._error}${(config as any)._detail ? ' — ' + (config as any)._detail : ''}`
          }
        </Alert>
      )
    }

    // ── Attempt to extract rows (handles Zyxel [{_secure_policy_rule:[...]}, ...] wrapper) ──
    const rows = extractConfigRows(config)

    if (rows !== null) {
      if (rows.length === 0) {
        return <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>No entries found in this section.</Typography>
      }

      // Collect all keys present in the data
      const allKeys = Array.from(new Set(rows.flatMap((r) => Object.keys(r))))

      // Build column list from parameter set (visible only) + any extra keys not covered
      const psCols = paramSet ? paramSet.columns.filter((c) => c.visible && allKeys.includes(c.key)) : []
      const psKeys = new Set(psCols.map((c) => c.key))
      const extraKeys = allKeys.filter((k) => !psKeys.has(k))

      const cols: { key: string; label: string }[] = [
        ...psCols.map((c) => ({ key: c.key, label: c.label })),
        ...extraKeys.map((k) => ({ key: k, label: k })),
      ]

      return (
        <TableContainer component={Paper} variant="outlined" sx={{ mt: 1, maxHeight: 420 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                {cols.map((col) => (
                  <TableCell key={col.key} sx={{ fontWeight: 700, whiteSpace: 'nowrap', fontSize: 12 }}>
                    {col.label}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow key={i} hover>
                  {cols.map((col) => (
                    <TableCell key={col.key} sx={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                      {cellStr(row[col.key])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )
    }

    // ── Non-array section: key-value cards ────────────────────────────────
    const items: unknown[] = Array.isArray(config) ? config : [config]
    if (items.length === 0) {
      return <Typography variant="body2" color="text.secondary">No entries in this section.</Typography>
    }
    return (
      <Stack spacing={0.75} sx={{ mt: 1 }}>
        {items.map((item, i) => (
          <Box key={i} sx={{ p: 1.5, borderRadius: 1, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
            {typeof item === 'object' && item !== null
              ? Object.entries(item as Record<string, unknown>).map(([k, v]) => {
                const label = paramSet?.columns.find((c) => c.key === k)?.label ?? k
                return (
                  <Box key={k} sx={{ display: 'flex', gap: 1, mb: 0.25, flexWrap: 'wrap' }}>
                    <Typography variant="caption" color="text.secondary" sx={{ minWidth: 160, flexShrink: 0 }}>{label}</Typography>
                    <Typography variant="caption" fontWeight={600} fontFamily="monospace" sx={{ wordBreak: 'break-all' }}>
                      {cellStr(v)}
                    </Typography>
                  </Box>
                )
              })
              : <Typography variant="caption" fontFamily="monospace">{String(item)}</Typography>
            }
          </Box>
        ))}
      </Stack>
    )
  }

  return (
    <Dialog open={!!findingId} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        Finding Details
        {f && (
          <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
            <Chip
              label={f.severity}
              size="small"
              color={SEVERITY_MUI[f.severity] ?? 'default'}
              sx={{ textTransform: 'capitalize' }}
            />
            <Chip label={CATEGORY_LABELS[f.category] ?? f.category} size="small" variant="outlined" />
            <Chip
              label={f.status}
              size="small"
              color={f.status === 'open' ? 'error' : f.status === 'suppressed' ? 'warning' : f.status === 'excluded' ? 'default' : 'success'}
              variant="outlined"
              sx={{ textTransform: 'capitalize' }}
            />
          </Box>
        )}
      </DialogTitle>

      <DialogContent dividers>
        {isLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        )}
        {isError && <Alert severity="error">Failed to load finding details.</Alert>}

        {f && (
          <Stack spacing={2}>
            {/* Core fields */}
            <Box>
              <Typography variant="subtitle2" fontWeight={700}>{f.title}</Typography>
              <Typography variant="caption" color="text.secondary">
                Device: {f.device_name ?? f.device_id}
                {f.first_seen && ` · First seen: ${new Date(f.first_seen).toLocaleString()}`}
                {f.last_seen && ` · Last seen: ${new Date(f.last_seen).toLocaleString()}`}
              </Typography>
            </Box>

            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                <strong>Description</strong>
              </Typography>
              <Typography variant="body2">{f.description}</Typography>
            </Box>

            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                <strong>Recommendation</strong>
              </Typography>
              <Typography variant="body2">{f.recommendation}</Typography>
            </Box>

            {f.config_path && (
              <Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  <strong>Config path</strong>
                </Typography>
                <Typography variant="body2" fontFamily="monospace" sx={{ bgcolor: 'action.hover', px: 1, py: 0.5, borderRadius: 1, display: 'inline-block' }}>
                  {f.config_path}
                </Typography>
              </Box>
            )}

            {f.compliance_refs && f.compliance_refs.length > 0 && (
              <Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  <strong>Compliance references</strong>
                </Typography>
                <ComplianceRefList refs={f.compliance_refs} />
              </Box>
            )}

            {f.status === 'resolved' && (
              <Alert severity="success" icon={<CheckCircleOutlineIcon />}>
                <strong>Resolved</strong>
                {f.resolved_at && ` on ${new Date(f.resolved_at).toLocaleString()}`}
                {' '}— this issue is no longer detected. The configuration shown below reflects the <strong>current</strong> state of the device.
              </Alert>
            )}

            {f.suppressed_reason && (
              <Alert severity="warning">
                <strong>Suppression reason:</strong> {f.suppressed_reason}
              </Alert>
            )}

            {/* Live config section */}
            <Divider />
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Typography variant="subtitle2" fontWeight={700}>
                  {f.status === 'resolved' ? 'Current Configuration' : 'Active Configuration'}
                </Typography>
                {section && (
                  <Typography variant="caption" color="text.secondary">
                    section: <code>{section}</code>
                  </Typography>
                )}
                {paramSet && (
                  <Chip label={paramSet.name} size="small" variant="outlined" sx={{ fontSize: 11 }} />
                )}
                <Tooltip title="Manage field labels in Settings → Parameter Sets">
                  <IconButton size="small" sx={{ ml: 'auto' }} onClick={() => { onClose(); setTimeout(() => window.location.assign('/settings'), 100) }}>
                    <SettingsIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </Box>
              {isLoading
                ? <CircularProgress size={20} />
                : renderConfig()
              }
            </Box>
          </Stack>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}


// ---------------------------------------------------------------------------
// Findings tab
// ---------------------------------------------------------------------------

function FindingsTab() {
  const navigate = useNavigate()
  const { push } = useToastStore()
  const qc = useQueryClient()

  const [filterSeverity, setFilterSeverity] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterStatus, setFilterStatus] = useState('open')
  const [filterDevice, setFilterDevice] = useState('')
  const [suppressDialogOpen, setSuppressDialogOpen] = useState(false)
  const [suppressTarget, setSuppressTarget] = useState<SecurityFinding | null>(null)
  const [suppressReason, setSuppressReason] = useState('')
  const [excludeDialogOpen, setExcludeDialogOpen] = useState(false)
  const [excludeTarget, setExcludeTarget] = useState<SecurityFinding | null>(null)
  const [excludeReason, setExcludeReason] = useState('')
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [contextFindingId, setContextFindingId] = useState<string | null>(null)

  const { data: findings = [], isLoading } = useQuery({
    queryKey: ['security-findings', filterSeverity, filterCategory, filterStatus, filterDevice],
    queryFn: () => listFindings({
      severity: filterSeverity || undefined,
      category: filterCategory || undefined,
      status: filterStatus || undefined,
      device_id: filterDevice || undefined,
    }),
    refetchInterval: 30_000,
  })

  const { data: devices = [] } = useQuery({ queryKey: ['devices'], queryFn: listDevices })

  const suppressMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => suppressFinding(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['security-findings'] })
      qc.invalidateQueries({ queryKey: ['security-summary'] })
      push('Finding suppressed')
      setSuppressDialogOpen(false)
      setSuppressReason('')
    },
    onError: () => push('Failed to suppress finding', 'error'),
  })

  const reopenMut = useMutation({
    mutationFn: (id: string) => reopenFinding(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['security-findings'] })
      qc.invalidateQueries({ queryKey: ['security-summary'] })
      push('Finding reopened')
    },
    onError: () => push('Failed to reopen finding', 'error'),
  })

  const remediateMut = useMutation({
    mutationFn: (id: string) => remediateFinding(id),
    onSuccess: (data) => {
      push('Remediation job created')
      navigate('/bulk')
    },
    onError: () => push('Failed to create remediation job', 'error'),
  })

  const excludeMut = useMutation({
    mutationFn: ({ device_id, finding_title, reason }: { device_id: string; finding_title: string; reason: string }) =>
      createExclusion(device_id, finding_title, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['security-findings'] })
      qc.invalidateQueries({ queryKey: ['security-exclusions'] })
      qc.invalidateQueries({ queryKey: ['security-summary'] })
      push('Exclusion created — finding will be ignored in future scans')
      setExcludeDialogOpen(false)
      setExcludeReason('')
    },
    onError: () => push('Failed to create exclusion', 'error'),
  })

  const columns: GridColDef[] = [
    {
      field: 'severity', headerName: 'Severity', width: 110,
      renderCell: (p) => (
        <Chip
          label={p.value}
          size="small"
          color={SEVERITY_MUI[p.value] ?? 'default'}
          sx={{ textTransform: 'capitalize' }}
        />
      ),
    },
    {
      field: 'category', headerName: 'Category', width: 160,
      valueGetter: (v) => CATEGORY_LABELS[v] ?? v,
    },
    { field: 'title', headerName: 'Title', flex: 1, minWidth: 200 },
    {
      field: 'device_name', headerName: 'Device', width: 150,
      valueGetter: (v) => v ?? '—',
    },
    {
      field: 'status', headerName: 'Status', width: 110,
      renderCell: (p) => (
        <Chip
          label={p.value}
          size="small"
          color={p.value === 'open' ? 'error' : p.value === 'suppressed' ? 'warning' : p.value === 'excluded' ? 'default' : 'success'}
          variant={p.value === 'resolved' || p.value === 'excluded' ? 'outlined' : 'filled'}
          sx={{ textTransform: 'capitalize' }}
        />
      ),
    },
    {
      field: 'first_seen', headerName: 'First Seen', width: 165,
      valueGetter: (v) => new Date(v).toLocaleString(),
    },
    {
      field: 'last_seen', headerName: 'Last Seen', width: 165,
      valueGetter: (v) => new Date(v).toLocaleString(),
    },
    {
      field: 'actions', headerName: '', width: 160, sortable: false,
      renderCell: (p) => {
        const f: SecurityFinding = p.row
        return (
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Tooltip title="View details & active config">
              <IconButton size="small" color="info" onClick={() => setContextFindingId(f.id)}>
                <InfoOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Expand summary">
              <IconButton size="small" onClick={() => setExpandedRow(expandedRow === f.id ? null : f.id)}>
                {expandedRow === f.id ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
            {f.status === 'open' && (
              <Tooltip title="Suppress (false positive)">
                <IconButton
                  size="small"
                  onClick={() => { setSuppressTarget(f); setSuppressDialogOpen(true) }}
                >
                  <VisibilityOffIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {(f.status === 'open' || f.status === 'suppressed') && (
              <Tooltip title="Exclude from future scans">
                <IconButton
                  size="small"
                  onClick={() => { setExcludeTarget(f); setExcludeDialogOpen(true) }}
                >
                  <BlockIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {f.status === 'suppressed' && (
              <Tooltip title="Re-open">
                <IconButton size="small" onClick={() => reopenMut.mutate(f.id)}>
                  <RestoreIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {f.remediation_patch && f.status === 'open' && (
              <Tooltip title="Create remediation job">
                <IconButton
                  size="small"
                  color="primary"
                  onClick={() => remediateMut.mutate(f.id)}
                  disabled={remediateMut.isPending}
                >
                  <BuildIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        )
      },
    },
  ]

  return (
    <Box>
      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>Severity</InputLabel>
          <Select label="Severity" value={filterSeverity} onChange={(e) => setFilterSeverity(e.target.value)}>
            <MenuItem value="">All</MenuItem>
            {['critical', 'high', 'medium', 'low', 'info'].map((s) => (
              <MenuItem key={s} value={s} sx={{ textTransform: 'capitalize' }}>{s}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>Category</InputLabel>
          <Select label="Category" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            <MenuItem value="">All</MenuItem>
            {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
              <MenuItem key={v} value={v}>{l}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>Status</InputLabel>
          <Select label="Status" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <MenuItem value="">All</MenuItem>
            {['open', 'suppressed', 'excluded', 'resolved'].map((s) => (
              <MenuItem key={s} value={s} sx={{ textTransform: 'capitalize' }}>{s}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Device</InputLabel>
          <Select label="Device" value={filterDevice} onChange={(e) => setFilterDevice(e.target.value)}>
            <MenuItem value="">All Devices</MenuItem>
            {devices.map((d) => (
              <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      <Paper>
        <DataGrid
          rows={findings}
          columns={columns}
          loading={isLoading}
          autoHeight
          pageSizeOptions={[25, 50, 100]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          disableRowSelectionOnClick
          getRowClassName={(p) =>
            p.row.status === 'suppressed' || p.row.status === 'excluded' || p.row.status === 'resolved'
              ? 'finding-dimmed'
              : expandedRow === p.row.id ? 'finding-expanded' : ''
          }
          sx={{
            '& .finding-dimmed': { opacity: 0.55 },
            '& .finding-expanded': { bgcolor: 'action.selected' },
          }}
        />
      </Paper>

      {/* Expanded row detail — shown below the grid, clearly labelled */}
      {expandedRow && (() => {
        const f = findings.find((x) => x.id === expandedRow)
        if (!f) return null
        return (
          <Card sx={{ mt: 1, border: 2, borderColor: 'primary.main' }} variant="outlined">
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Chip label={f.severity} size="small" color={SEVERITY_MUI[f.severity] ?? 'default'} sx={{ textTransform: 'capitalize' }} />
                <Chip label={CATEGORY_LABELS[f.category] ?? f.category} size="small" variant="outlined" />
                <Chip label={f.status} size="small" color={f.status === 'open' ? 'error' : f.status === 'suppressed' ? 'warning' : f.status === 'excluded' ? 'default' : 'success'} variant="outlined" sx={{ textTransform: 'capitalize' }} />
                <Typography variant="subtitle2" fontWeight={700} sx={{ ml: 0.5 }}>{f.title}</Typography>
                <IconButton size="small" sx={{ ml: 'auto' }} onClick={() => setExpandedRow(null)}>
                  <ExpandLessIcon fontSize="small" />
                </IconButton>
              </Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                <strong>Description:</strong> {f.description}
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                <strong>Recommendation:</strong> {f.recommendation}
              </Typography>
              {f.config_path && (
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  <strong>Config path:</strong> <code>{f.config_path}</code>
                </Typography>
              )}
              {f.compliance_refs && f.compliance_refs.length > 0 && (
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 1 }}>
                  {f.compliance_refs.map((ref) => {
                    const detail = COMPLIANCE_REF_DB[ref]
                    const fwColor = detail ? FRAMEWORK_COLOR[detail.framework] ?? '#555' : '#555'
                    return (
                      <Tooltip key={ref} title={detail ? `${detail.title} — ${detail.framework}` : ref}>
                        <Chip
                          label={ref}
                          size="small"
                          component="a"
                          href={detail?.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          clickable={!!detail}
                          sx={{ fontFamily: 'monospace', fontWeight: 700, bgcolor: fwColor, color: '#fff', fontSize: 11 }}
                        />
                      </Tooltip>
                    )
                  })}
                </Box>
              )}
              {f.suppressed_reason && (
                <Typography variant="body2" color="warning.main" mt={1}>
                  <strong>Suppression reason:</strong> {f.suppressed_reason}
                </Typography>
              )}
              {f.status === 'excluded' && (
                <Typography variant="body2" color="text.secondary" mt={1}>
                  <strong>Excluded from future scans.</strong> Manage exclusions in the Exclusions tab.
                </Typography>
              )}
            </CardContent>
          </Card>
        )
      })()}

      {/* Finding context dialog */}
      <FindingContextDialog
        findingId={contextFindingId}
        onClose={() => setContextFindingId(null)}
      />

      {/* Suppress dialog */}
      <Dialog open={suppressDialogOpen} onClose={() => setSuppressDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Suppress Finding</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {suppressTarget?.title}
          </Typography>
          <TextField
            label="Reason (required)"
            value={suppressReason}
            onChange={(e) => setSuppressReason(e.target.value)}
            fullWidth
            multiline
            rows={3}
            sx={{ mt: 1 }}
            placeholder="e.g. Accepted risk — monitored by external IDS"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSuppressDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="warning"
            disabled={!suppressReason || suppressMut.isPending}
            onClick={() => suppressTarget && suppressMut.mutate({ id: suppressTarget.id, reason: suppressReason })}
          >
            Suppress
          </Button>
        </DialogActions>
      </Dialog>

      {/* Exclude dialog */}
      <Dialog open={excludeDialogOpen} onClose={() => setExcludeDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Exclude Finding from Future Scans</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            <strong>{excludeTarget?.title}</strong>
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            This finding will be permanently ignored in future scans for this firewall. Only the timestamp will be updated. You can remove the exclusion at any time from the Exclusions tab.
          </Typography>
          <TextField
            label="Reason (required)"
            value={excludeReason}
            onChange={(e) => setExcludeReason(e.target.value)}
            fullWidth
            multiline
            rows={3}
            sx={{ mt: 1 }}
            placeholder="e.g. Rule has geo-restriction + single destination IP — accepted risk"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExcludeDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            disabled={!excludeReason || excludeMut.isPending}
            onClick={() => excludeTarget && excludeMut.mutate({
              device_id: excludeTarget.device_id,
              finding_title: excludeTarget.title,
              reason: excludeReason,
            })}
          >
            Exclude
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

// ---------------------------------------------------------------------------
// Scan detail panel (expanded)
// ---------------------------------------------------------------------------

function ScanDetail({ scan }: { scan: SecurityScan }) {
  const { data: findings = [], isLoading } = useQuery({
    queryKey: ['security-findings-scan', scan.id],
    queryFn: () => listFindings({ scan_id: scan.id }),
  })

  // Group findings by device
  const byDevice = useMemo(() => {
    const map: Record<string, { device_id: string; device_name: string; findings: SecurityFinding[] }> = {}
    for (const f of findings) {
      if (!map[f.device_id]) {
        map[f.device_id] = { device_id: f.device_id, device_name: f.device_name ?? f.device_id, findings: [] }
      }
      map[f.device_id].findings.push(f)
    }
    return Object.values(map).sort((a, b) => a.device_name.localeCompare(b.device_name))
  }, [findings])

  // Human-readable description sentence
  const scope = scan.device_id
    ? `device "${scan.device_name ?? scan.device_id}"`
    : `all devices (fleet scan)`
  const trigger = scan.triggered_by === 'scheduled'
    ? 'Scheduled automatically'
    : scan.triggered_by_username
      ? `Triggered manually by ${scan.triggered_by_username}`
      : 'Triggered manually'
  const duration = scan.completed_at
    ? (() => {
        const ms = new Date(scan.completed_at).getTime() - new Date(scan.started_at).getTime()
        return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`
      })()
    : null

  const severityOrder = ['critical', 'high', 'medium', 'low', 'info']

  return (
    <Box sx={{ px: 3, pb: 3, pt: 1 }}>
      {/* Description paragraph */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: 'action.hover' }}>
        <Typography variant="body2">
          <strong>{trigger}</strong> on {scope}.{' '}
          Started at {new Date(scan.started_at).toLocaleString()}.
          {duration && ` Completed in ${duration}.`}
          {scan.status === 'failed' && !duration && ' Did not complete.'}
        </Typography>
        {scan.findings_count > 0 && (
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            Found <strong>{scan.findings_count}</strong> issue{scan.findings_count !== 1 ? 's' : ''}
            {scan.critical_count > 0 && ` — ${scan.critical_count} critical`}
            {scan.high_count > 0 && `, ${scan.high_count} high`}
            {scan.medium_count > 0 && `, ${scan.medium_count} medium`}
            {scan.low_count > 0 && `, ${scan.low_count} low`}
            {scan.info_count > 0 && `, ${scan.info_count} info`}
            {'. '}
            Risk score: <strong>{scan.risk_score}</strong>.
          </Typography>
        )}
        {scan.findings_count === 0 && scan.status === 'completed' && (
          <Typography variant="body2" sx={{ mt: 0.5, color: 'success.main' }}>
            No issues found — all checks passed.
          </Typography>
        )}
        {scan.error && (
          <Alert severity="error" sx={{ mt: 1 }}>{scan.error}</Alert>
        )}
      </Paper>

      {/* Per-device results */}
      {isLoading && <CircularProgress size={20} />}
      {!isLoading && byDevice.length === 0 && scan.status === 'completed' && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'success.main' }}>
          <CheckCircleOutlineIcon fontSize="small" />
          <Typography variant="body2">No findings recorded for this scan.</Typography>
        </Box>
      )}
      {byDevice.map(({ device_id, device_name, findings: dFindings }) => {
        const countBySev = severityOrder.reduce<Record<string, number>>((acc, s) => {
          acc[s] = dFindings.filter((f) => f.severity === s).length
          return acc
        }, {})
        return (
          <Box key={device_id} sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Typography variant="subtitle2" fontWeight={600}>{device_name}</Typography>
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                {severityOrder.map((sev) =>
                  countBySev[sev] > 0 ? (
                    <Chip
                      key={sev}
                      label={`${countBySev[sev]} ${sev}`}
                      size="small"
                      color={SEVERITY_MUI[sev] ?? 'default'}
                      sx={{ textTransform: 'capitalize', fontSize: 11 }}
                    />
                  ) : null
                )}
                {dFindings.length === 0 && (
                  <Chip label="clean" size="small" color="success" sx={{ fontSize: 11 }} />
                )}
              </Box>
            </Box>
            <Stack spacing={0.5}>
              {dFindings.map((f) => (
                <Box
                  key={f.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    py: 0.75,
                    px: 1.5,
                    borderRadius: 1,
                    bgcolor: 'background.paper',
                    border: '1px solid',
                    borderColor: 'divider',
                    opacity: f.status !== 'open' ? 0.6 : 1,
                  }}
                >
                  <Chip
                    label={f.severity}
                    size="small"
                    color={SEVERITY_MUI[f.severity] ?? 'default'}
                    sx={{ textTransform: 'capitalize', minWidth: 72, justifyContent: 'center' }}
                  />
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={500} noWrap>{f.title}</Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {CATEGORY_LABELS[f.category] ?? f.category}
                      {f.config_path && ` · ${f.config_path}`}
                    </Typography>
                  </Box>
                  <Chip
                    label={f.status}
                    size="small"
                    variant="outlined"
                    color={f.status === 'open' ? 'error' : f.status === 'suppressed' ? 'warning' : f.status === 'excluded' ? 'default' : 'success'}
                    sx={{ textTransform: 'capitalize', flexShrink: 0 }}
                  />
                </Box>
              ))}
            </Stack>
          </Box>
        )
      })}
    </Box>
  )
}


// ---------------------------------------------------------------------------
// Scans tab
// ---------------------------------------------------------------------------

function ScansTab() {
  const { push } = useToastStore()
  const qc = useQueryClient()

  const [scanDevices, setScanDevices] = useState<{ id: string; name: string }[]>([])
  const [expandedScan, setExpandedScan] = useState<string | null>(null)

  const { data: scans = [], isLoading } = useQuery({
    queryKey: ['security-scans'],
    queryFn: listScans,
    refetchInterval: 15_000,
  })

  const { data: devices = [] } = useQuery({ queryKey: ['devices'], queryFn: listDevices })

  const scanMut = useMutation({
    mutationFn: () => triggerScan(scanDevices.length > 0 ? scanDevices.map((d) => d.id) : []),
    onSuccess: () => {
      const label = scanDevices.length === 0
        ? 'Fleet scan triggered'
        : scanDevices.length === 1
          ? `Scan triggered for ${scanDevices[0].name}`
          : `Scan triggered for ${scanDevices.length} devices`
      push(label)
      setTimeout(() => qc.invalidateQueries({ queryKey: ['security-scans'] }), 3000)
    },
    onError: () => push('Failed to trigger scan', 'error'),
  })

  const cancelMut = useMutation({
    mutationFn: (id: string) => cancelScan(id),
    onSuccess: () => {
      push('Scan cancelled')
      qc.invalidateQueries({ queryKey: ['security-scans'] })
    },
    onError: () => push('Failed to cancel scan', 'error'),
  })

  function toggleExpand(id: string) {
    setExpandedScan((prev) => (prev === id ? null : id))
  }

  function durationStr(scan: SecurityScan) {
    if (!scan.completed_at) return '—'
    const ms = new Date(scan.completed_at).getTime() - new Date(scan.started_at).getTime()
    return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`
  }

  return (
    <Box>
      {/* Trigger controls */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <Autocomplete
          multiple
          size="small"
          options={devices}
          getOptionLabel={(d) => d.name}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          value={scanDevices}
          onChange={(_, val) => setScanDevices(val)}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Firewalls to scan"
              placeholder={scanDevices.length === 0 ? 'All devices (fleet)' : ''}
            />
          )}
          renderTags={(value, getTagProps) =>
            value.map((d, i) => (
              <Chip label={d.name} size="small" {...getTagProps({ index: i })} key={d.id} />
            ))
          }
          sx={{ minWidth: 300 }}
          noOptionsText="No devices found"
        />
        <Button
          variant="contained"
          startIcon={scanMut.isPending ? <CircularProgress size={16} color="inherit" /> : <PlayArrowIcon />}
          onClick={() => scanMut.mutate()}
          disabled={scanMut.isPending}
          sx={{ mt: 0.5 }}
        >
          {scanDevices.length === 0 ? 'Scan All' : `Scan ${scanDevices.length} Device${scanDevices.length > 1 ? 's' : ''}`}
        </Button>
      </Box>

      {isLoading && <CircularProgress size={24} />}

      {!isLoading && scans.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          No scans yet — trigger one above.
        </Typography>
      )}

      {/* Scan list */}
      <Stack spacing={1}>
        {scans.map((scan) => {
          const isExpanded = expandedScan === scan.id
          const scope = scan.device_id ? scan.device_name ?? scan.device_id : 'Fleet'
          const triggerLabel = scan.triggered_by === 'scheduled'
            ? 'Scheduled'
            : scan.triggered_by_username
              ? `Manual · ${scan.triggered_by_username}`
              : 'Manual'

          return (
            <Paper key={scan.id} variant="outlined">
              {/* Header row */}
              <Box
                sx={{
                  display: 'flex', alignItems: 'center', gap: 1.5,
                  px: 2, py: 1.5, cursor: 'pointer',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
                onClick={() => toggleExpand(scan.id)}
              >
                {/* Expand chevron */}
                <IconButton size="small" sx={{ flexShrink: 0 }}>
                  {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                </IconButton>

                {/* Date + scope */}
                <Box sx={{ minWidth: 200 }}>
                  <Typography variant="body2" fontWeight={600}>
                    {new Date(scan.started_at).toLocaleString()}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {scope} · {triggerLabel}
                  </Typography>
                </Box>

                {/* Status */}
                <Chip
                  label={scan.status}
                  size="small"
                  color={
                    scan.status === 'completed' ? 'success'
                    : scan.status === 'running' ? 'info'
                    : scan.status === 'cancelled' ? 'default'
                    : 'error'
                  }
                  sx={{ textTransform: 'capitalize', flexShrink: 0 }}
                />

                {/* Cancel button — only for running scans */}
                {scan.status === 'running' && (
                  <Tooltip title="Stop scan">
                    <IconButton
                      size="small"
                      color="error"
                      disabled={cancelMut.isPending}
                      onClick={(e) => { e.stopPropagation(); cancelMut.mutate(scan.id) }}
                      sx={{ flexShrink: 0 }}
                    >
                      {cancelMut.isPending && cancelMut.variables === scan.id
                        ? <CircularProgress size={16} color="error" />
                        : <StopIcon fontSize="small" />
                      }
                    </IconButton>
                  </Tooltip>
                )}

                {/* Severity counts */}
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', flexGrow: 1 }}>
                  {scan.critical_count > 0 && (
                    <Chip label={`${scan.critical_count} critical`} size="small" color="error" />
                  )}
                  {scan.high_count > 0 && (
                    <Chip label={`${scan.high_count} high`} size="small" color="warning" />
                  )}
                  {scan.medium_count > 0 && (
                    <Chip label={`${scan.medium_count} medium`} size="small" sx={{ bgcolor: '#ca8a04', color: '#fff' }} />
                  )}
                  {scan.low_count > 0 && (
                    <Chip label={`${scan.low_count} low`} size="small" color="info" />
                  )}
                  {scan.info_count > 0 && (
                    <Chip label={`${scan.info_count} info`} size="small" />
                  )}
                  {scan.findings_count === 0 && scan.status === 'completed' && (
                    <Chip label="No findings" size="small" color="success" variant="outlined" />
                  )}
                </Box>

                {/* Score + duration */}
                <Box sx={{ textAlign: 'right', flexShrink: 0, minWidth: 80 }}>
                  <Typography variant="body2" fontWeight={700} sx={{ color: gradeColor(
                    scan.risk_score >= 90 ? 'A' : scan.risk_score >= 75 ? 'B' : scan.risk_score >= 50 ? 'C' : scan.risk_score >= 25 ? 'D' : 'F'
                  ) }}>
                    Score {scan.risk_score}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {durationStr(scan)}
                  </Typography>
                </Box>
              </Box>

              {/* Expanded detail */}
              <Collapse in={isExpanded} unmountOnExit>
                <Divider />
                <ScanDetail scan={scan} />
              </Collapse>
            </Paper>
          )
        })}
      </Stack>
    </Box>
  )
}

// ---------------------------------------------------------------------------
// Exclusions tab
// ---------------------------------------------------------------------------

function ExclusionsTab() {
  const { push } = useToastStore()
  const qc = useQueryClient()
  const [filterDevice, setFilterDevice] = useState('')

  const { data: exclusions = [], isLoading } = useQuery({
    queryKey: ['security-exclusions', filterDevice],
    queryFn: () => listExclusions(filterDevice || undefined),
  })

  const { data: devices = [] } = useQuery({ queryKey: ['devices'], queryFn: listDevices })

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteExclusion(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['security-exclusions'] })
      qc.invalidateQueries({ queryKey: ['security-findings'] })
      qc.invalidateQueries({ queryKey: ['security-summary'] })
      push('Exclusion removed — finding will be re-evaluated on next scan')
    },
    onError: () => push('Failed to remove exclusion', 'error'),
  })

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
        <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
          Excluded findings are ignored during scans — only their timestamp is updated. Remove an exclusion to re-evaluate the finding.
        </Typography>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Device</InputLabel>
          <Select label="Device" value={filterDevice} onChange={(e) => setFilterDevice(e.target.value)}>
            <MenuItem value="">All Devices</MenuItem>
            {devices.map((d) => (
              <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {isLoading && <CircularProgress size={24} />}
      {!isLoading && exclusions.length === 0 && (
        <Alert severity="info">No exclusions configured. Use the block icon on any finding to add one.</Alert>
      )}

      <Stack spacing={1}>
        {exclusions.map((excl: SecurityExclusion) => (
          <Paper key={excl.id} variant="outlined" sx={{ px: 2, py: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
              <BlockIcon fontSize="small" sx={{ color: 'text.disabled', mt: 0.5, flexShrink: 0 }} />
              <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                <Typography variant="body2" fontWeight={600} noWrap>{excl.finding_title}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {excl.device_name ?? excl.device_id}
                  {excl.created_by_username && ` · Added by ${excl.created_by_username}`}
                  {` · ${new Date(excl.created_at).toLocaleDateString()}`}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {excl.reason}
                </Typography>
              </Box>
              <Tooltip title="Remove exclusion">
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => deleteMut.mutate(excl.id)}
                  disabled={deleteMut.isPending}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          </Paper>
        ))}
      </Stack>
    </Box>
  )
}


// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function SecurityAdvisor() {
  const [tab, setTab] = useState(0)
  const qc = useQueryClient()
  const [refreshing, setRefreshing] = useState(false)

  async function handleRefresh() {
    setRefreshing(true)
    await qc.invalidateQueries({ queryKey: ['security-summary'] })
    await qc.invalidateQueries({ queryKey: ['security-scores'] })
    await qc.invalidateQueries({ queryKey: ['security-findings'] })
    await qc.invalidateQueries({ queryKey: ['security-scans'] })
    await qc.invalidateQueries({ queryKey: ['security-exclusions'] })
    setRefreshing(false)
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <SecurityIcon color="error" />
        <Typography variant="h5" fontWeight={700}>Security Advisor</Typography>
        <Box sx={{ flexGrow: 1 }} />
        <Tooltip title="Refresh">
          <IconButton onClick={handleRefresh} disabled={refreshing}>
            <RefreshIcon sx={{ transition: 'transform 0.4s', transform: refreshing ? 'rotate(360deg)' : 'none' }} />
          </IconButton>
        </Tooltip>
      </Box>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 1, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="Overview" />
        <Tab label="Findings" />
        <Tab label="Scan History" />
        <Tab label="Exclusions" />
      </Tabs>

      <TabPanel value={tab} index={0}><OverviewTab /></TabPanel>
      <TabPanel value={tab} index={1}><FindingsTab /></TabPanel>
      <TabPanel value={tab} index={2}><ScansTab /></TabPanel>
      <TabPanel value={tab} index={3}><ExclusionsTab /></TabPanel>
    </Box>
  )
}
