import { api } from './client'
import type { AlertRule, AlertDelivery } from '../types'

export const listAlertRules = () =>
  api.get<AlertRule[]>('/alerts/rules').then((r) => r.data)

export const createAlertRule = (data: Partial<AlertRule>) =>
  api.post<AlertRule>('/alerts/rules', data).then((r) => r.data)

export const updateAlertRule = (id: string, data: Partial<AlertRule>) =>
  api.put<AlertRule>(`/alerts/rules/${id}`, data).then((r) => r.data)

export const deleteAlertRule = (id: string) =>
  api.delete(`/alerts/rules/${id}`)

export const listDeliveries = () =>
  api.get<AlertDelivery[]>('/alerts/deliveries').then((r) => r.data)
