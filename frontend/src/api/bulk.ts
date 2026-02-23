import { api } from './client'
import type { BulkJob } from '../types'

export const listJobs = async () => (await api.get('/bulk/jobs')).data as BulkJob[]
export const getJob = async (id: string) => (await api.get(`/bulk/jobs/${id}`)).data
export const createJob = async (body: Record<string, unknown>) => (await api.post('/bulk/jobs', body)).data as BulkJob
export const previewJob = async (id: string) => (await api.post(`/bulk/jobs/${id}/preview`)).data
export const executeJob = async (id: string) => (await api.post(`/bulk/jobs/${id}/execute`)).data
export const cancelJob = async (id: string) => api.post(`/bulk/jobs/${id}/cancel`)
