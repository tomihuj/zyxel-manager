export interface Device {
  id: string
  name: string
  model: string
  mgmt_ip: string
  port: number
  protocol: string
  adapter: string
  tags: string[]
  status: 'online' | 'offline' | 'unknown'
  last_seen: string | null
  firmware_version: string | null
  created_at: string
  group_ids: string[]
  drift_detected: boolean
  drift_detected_at: string | null
  deleted_at: string | null
  notes: string | null
  label_color: string | null
  credentials_updated_at: string | null
}

export interface DeviceGroup {
  id: string
  name: string
  description: string | null
  created_at: string
  device_count: number
}

export interface User {
  id: string
  email: string
  username: string
  full_name: string | null
  is_active: boolean
  is_superuser: boolean
  created_at: string
}

export interface Role {
  id: string
  name: string
  description: string | null
  created_at: string
}

export interface Permission {
  feature: string
  resource_type: string
  resource_id: string
  access_level: string
}

export interface BulkJob {
  id: string
  name: string
  section: string
  status: string
  created_at: string
  completed_at: string | null
  target_count: number
  success_count: number
  failed_count: number
}

export interface AuditLog {
  id: string
  username: string | null
  action: string
  resource_type: string | null
  resource_id: string | null
  details: Record<string, unknown> | null
  ip_address: string | null
  created_at: string
}

export interface AuditActionConfig {
  action: string
  label: string
  description: string
  category: string
  enabled: boolean
  log_payload: boolean
}

export interface ConfigSnapshot {
  id: string
  device_id: string
  section: string
  version: number
  checksum: string
  is_baseline: boolean
  triggered_by: string
  label: string | null
  created_at: string
  size: number
  device_name: string | null
}

export interface BackupSettings {
  auto_backup_enabled: boolean
  interval_hours: number
  retention: number | null
  last_auto_backup: string | null
}

export interface ApiToken {
  id: string
  name: string
  prefix: string
  expires_at: string | null
  last_used_at: string | null
  revoked: boolean
  created_at: string
}

export interface AlertRule {
  id: string
  name: string
  event_type: string
  enabled: boolean
  delivery_type: string
  webhook_url: string | null
  email_to: string | null
  slack_webhook_url: string | null
  created_at: string
}

export interface DeviceMetric {
  id: string
  cpu_pct: number | null
  memory_pct: number | null
  uptime_seconds: number | null
  collected_at: string
}

export interface DeviceHealth {
  device_id: string
  score: number
  grade: 'A' | 'B' | 'C' | 'D'
  online: boolean
  drift_detected: boolean
  last_seen: string | null
}

export interface Session {
  id: string
  user_agent: string | null
  ip_address: string | null
  created_at: string
  last_used_at: string | null
  expires_at: string
  revoked: boolean
}

export interface AlertDelivery {
  id: string
  rule_id: string
  event_type: string
  status: string
  http_status: number | null
  error: string | null
  delivered_at: string
}

export interface ComplianceRule {
  id: string
  name: string
  section: string
  key_path: string
  operator: string
  expected_value: string
  enabled: boolean
  created_at: string
}

export interface ComplianceResult {
  id: string
  rule_id: string
  device_id: string
  passed: boolean
  actual_value: string | null
  checked_at: string
}

export interface SecurityFinding {
  id: string
  device_id: string
  scan_id: string | null
  category: 'exposed_service' | 'permissive_rule' | 'weak_protocol' | 'missing_hardening' | 'firmware' | 'authentication'
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  title: string
  description: string
  recommendation: string
  remediation_patch: object | null
  config_path: string | null
  status: 'open' | 'suppressed' | 'excluded' | 'resolved'
  suppressed_reason: string | null
  compliance_refs: string[]
  first_seen: string
  last_seen: string
  resolved_at: string | null
  device_name?: string
}

export interface SecurityScan {
  id: string
  device_id: string | null
  device_name: string | null
  status: 'running' | 'completed' | 'failed'
  triggered_by: string
  triggered_by_user: string | null
  triggered_by_username: string | null
  findings_count: number
  critical_count: number
  high_count: number
  medium_count: number
  low_count: number
  info_count: number
  risk_score: number
  started_at: string
  completed_at: string | null
  error: string | null
}

export interface DeviceRiskScore {
  id: string
  device_id: string
  device_name: string
  score: number
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  critical_findings: number
  high_findings: number
  medium_findings: number
  low_findings: number
  open_findings: number
  calculated_at: string
}

export interface SecurityExclusion {
  id: string
  device_id: string
  device_name: string | null
  finding_title: string
  reason: string
  created_by: string | null
  created_by_username: string | null
  created_at: string
}

export interface SecuritySummary {
  fleet_score: number
  fleet_grade: string
  total_open: number
  device_count: number
  by_severity: Record<string, number>
  by_category: Record<string, number>
}
