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
  ip_address: string | null
  created_at: string
}
