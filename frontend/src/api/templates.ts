import { api } from './client'

export interface ConfigTemplate {
  id: string
  name: string
  description: string | null
  section: string
  data_json: string
  created_by: string
  created_at: string
  updated_at: string
}

export interface ApplyResult {
  success: { device_id: string; device_name: string }[]
  failed: { device_id: string; device_name?: string; error: string }[]
}

export const listTemplates = async () => (await api.get('/templates')).data as ConfigTemplate[]
export const getTemplate = async (id: string) => (await api.get(`/templates/${id}`)).data as ConfigTemplate
export const createTemplate = async (body: Record<string, unknown>) =>
  (await api.post('/templates', body)).data as ConfigTemplate
export const updateTemplate = async (id: string, body: Record<string, unknown>) =>
  (await api.put(`/templates/${id}`, body)).data as ConfigTemplate
export const deleteTemplate = async (id: string) => api.delete(`/templates/${id}`)
export const applyTemplate = async (id: string, deviceIds: string[]) =>
  (await api.post(`/templates/${id}/apply`, { device_ids: deviceIds })).data as ApplyResult
