import { api } from './client'

export interface ScheduledReport {
  id: string
  name: string
  device_ids: string[]
  group_ids: string[]
  tags: string[]
  sections: string[]
  format: 'json' | 'csv'
  cron_expression: string
  delivery_email: string
  enabled: boolean
  last_run: string | null
  next_run: string | null
  created_at: string
}

export const listScheduledReports = async () =>
  (await api.get('/scheduled-reports')).data as ScheduledReport[]

export const createScheduledReport = async (body: Record<string, unknown>) =>
  (await api.post('/scheduled-reports', body)).data as ScheduledReport

export const updateScheduledReport = async (id: string, body: Record<string, unknown>) =>
  (await api.put(`/scheduled-reports/${id}`, body)).data as ScheduledReport

export const deleteScheduledReport = async (id: string) =>
  api.delete(`/scheduled-reports/${id}`)

export const runScheduledReport = async (id: string) =>
  (await api.post(`/scheduled-reports/${id}/run`)).data
