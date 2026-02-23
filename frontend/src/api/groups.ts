import { api } from './client'
import type { DeviceGroup } from '../types'

export const listGroups = async () => (await api.get('/groups')).data as DeviceGroup[]
export const createGroup = async (body: { name: string; description?: string }) => (await api.post('/groups', body)).data as DeviceGroup
export const updateGroup = async (id: string, body: { name: string; description?: string }) => (await api.put(`/groups/${id}`, body)).data as DeviceGroup
export const deleteGroup = async (id: string) => api.delete(`/groups/${id}`)
export const getGroupDevices = async (id: string) => (await api.get(`/groups/${id}/devices`)).data
export const addDeviceToGroup = async (groupId: string, deviceId: string) => api.post(`/groups/${groupId}/devices/${deviceId}`)
export const removeDeviceFromGroup = async (groupId: string, deviceId: string) => api.delete(`/groups/${groupId}/devices/${deviceId}`)
