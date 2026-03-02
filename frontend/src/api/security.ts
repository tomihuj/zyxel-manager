import { api } from './client'
import type { SecurityFinding, SecurityScan, DeviceRiskScore, SecuritySummary, SecurityExclusion } from '../types'

export const listFindings = (params?: {
  device_id?: string
  severity?: string
  status?: string
  category?: string
  scan_id?: string
}) => api.get<SecurityFinding[]>('/security/findings', { params }).then((r) => r.data)

export const getFinding = (id: string) =>
  api.get<SecurityFinding>(`/security/findings/${id}`).then((r) => r.data)

export const getFindingContext = (id: string) =>
  api.get<{ finding: SecurityFinding; section: string; config: Record<string, unknown> }>(
    `/security/findings/${id}/context`,
  ).then((r) => r.data)

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

export const triggerScan = (device_ids?: string[]) =>
  api.post<{ task_id: string }>('/security/scans', { device_ids: device_ids ?? [] }).then((r) => r.data)

export const cancelScan = (id: string) =>
  api.post<{ cancelled: boolean }>(`/security/scans/${id}/cancel`).then((r) => r.data)

export const listScores = () =>
  api.get<DeviceRiskScore[]>('/security/scores').then((r) => r.data)

export const getDeviceScores = (device_id: string) =>
  api.get<DeviceRiskScore[]>(`/security/scores/${device_id}`).then((r) => r.data)

export const getSecuritySummary = () =>
  api.get<SecuritySummary>('/security/summary').then((r) => r.data)

export const listExclusions = (device_id?: string) =>
  api.get<SecurityExclusion[]>('/security/exclusions', { params: device_id ? { device_id } : {} }).then((r) => r.data)

export const createExclusion = (device_id: string, finding_title: string, reason: string) =>
  api.post<SecurityExclusion>('/security/exclusions', { device_id, finding_title, reason }).then((r) => r.data)

export const deleteExclusion = (id: string) =>
  api.delete<{ deleted: boolean }>(`/security/exclusions/${id}`).then((r) => r.data)
