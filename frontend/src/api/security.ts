import { api } from './client'
import type { SecurityFinding, SecurityScan, DeviceRiskScore, SecuritySummary } from '../types'

export const listFindings = (params?: {
  device_id?: string
  severity?: string
  status?: string
  category?: string
  scan_id?: string
}) => api.get<SecurityFinding[]>('/security/findings', { params }).then((r) => r.data)

export const getFinding = (id: string) =>
  api.get<SecurityFinding>(`/security/findings/${id}`).then((r) => r.data)

export const suppressFinding = (id: string, reason: string) =>
  api.put<SecurityFinding>(`/security/findings/${id}/suppress`, { reason }).then((r) => r.data)

export const reopenFinding = (id: string) =>
  api.put<SecurityFinding>(`/security/findings/${id}/reopen`).then((r) => r.data)

export const remediateFinding = (id: string) =>
  api.post<{ job_id: string }>(`/security/findings/${id}/remediate`).then((r) => r.data)

export const listScans = () =>
  api.get<SecurityScan[]>('/security/scans').then((r) => r.data)

export const getScan = (id: string) =>
  api.get<SecurityScan>(`/security/scans/${id}`).then((r) => r.data)

export const triggerScan = (device_id?: string | null) =>
  api.post<{ task_id: string }>('/security/scans', { device_id: device_id ?? null }).then((r) => r.data)

export const listScores = () =>
  api.get<DeviceRiskScore[]>('/security/scores').then((r) => r.data)

export const getDeviceScores = (device_id: string) =>
  api.get<DeviceRiskScore[]>(`/security/scores/${device_id}`).then((r) => r.data)

export const getSecuritySummary = () =>
  api.get<SecuritySummary>('/security/summary').then((r) => r.data)
