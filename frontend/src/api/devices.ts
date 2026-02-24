import { api } from './client'
import type { Device } from '../types'

export const listDevices = async () => (await api.get('/devices')).data as Device[]
export const createDevice = async (body: Record<string, unknown>) => (await api.post('/devices', body)).data as Device
export const updateDevice = async (id: string, body: Record<string, unknown>) => (await api.put(`/devices/${id}`, body)).data as Device
export const deleteDevice = async (id: string) => api.delete(`/devices/${id}`)
export const testConnection = async (id: string) => (await api.post(`/devices/${id}/test-connection`)).data
export const syncDevice = async (id: string) => (await api.post(`/devices/${id}/sync`)).data
export const listSnapshots = async (id: string) => (await api.get(`/devices/${id}/snapshots`)).data
export const getDeviceConfig = async (id: string, section = 'full') =>
  (await api.get(`/devices/${id}/config`, { params: { section } })).data
export const patchDeviceConfig = async (id: string, section: string, patch: unknown) =>
  (await api.patch(`/devices/${id}/config/${section}`, patch)).data
