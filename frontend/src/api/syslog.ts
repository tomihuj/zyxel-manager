import { api } from './client'

export interface SyslogEntry {
  id: string
  source_ip: string
  device_id: string | null
  device_name: string | null
  facility: number
  facility_name: string
  severity: number
  severity_name: string
  program: string | null
  message: string
  raw: string | null
  received_at: string
}

export interface SyslogSummary {
  total_24h: number
  devices_sending: number
  by_severity: Record<string, number>
}

export const listSyslogEntries = async (params?: {
  device_id?: string
  severity?: number
  severity_max?: number
  facility?: number
  program?: string
  search?: string
  hours?: number
  limit?: number
  source_ip?: string
}) => (await api.get('/syslog/entries', { params })).data as SyslogEntry[]

export const getSyslogSummary = async () =>
  (await api.get('/syslog/summary')).data as SyslogSummary

export const clearSyslog = async () =>
  api.delete('/syslog/entries')
