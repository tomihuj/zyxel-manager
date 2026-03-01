import { api } from './client'
import type { AuditLog, AuditActionConfig } from '../types'

export interface LogFilters {
  action?: string
  username?: string
  date_from?: string
  date_to?: string
  limit?: number
  offset?: number
}

export const getAuditLogs = (filters: LogFilters = {}) =>
  api.get('/audit/logs', { params: filters }).then(r => r.data as AuditLog[])

export const getActionConfigs = () =>
  api.get('/audit/actions').then(r => r.data as AuditActionConfig[])

export const updateActionConfig = (action: string, enabled: boolean, log_payload: boolean) =>
  api.put(`/audit/actions/${action}`, { enabled, log_payload }).then(r => r.data as AuditActionConfig)
