import { api } from './client'
import type { ComplianceRule, ComplianceResult } from '../types'

export const listComplianceRules = () =>
  api.get<ComplianceRule[]>('/compliance/rules').then((r) => r.data)

export const createComplianceRule = (data: Partial<ComplianceRule>) =>
  api.post<ComplianceRule>('/compliance/rules', data).then((r) => r.data)

export const updateComplianceRule = (id: string, data: Partial<ComplianceRule>) =>
  api.put<ComplianceRule>(`/compliance/rules/${id}`, data).then((r) => r.data)

export const deleteComplianceRule = (id: string) =>
  api.delete(`/compliance/rules/${id}`)

export const listComplianceResults = () =>
  api.get<ComplianceResult[]>('/compliance/results').then((r) => r.data)

export const runComplianceCheck = () =>
  api.post('/compliance/check').then((r) => r.data)
