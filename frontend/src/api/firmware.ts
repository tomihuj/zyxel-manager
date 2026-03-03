import { api } from './client'

export interface FirmwareDevice {
  device_id: string
  device_name: string
  model: string
  mgmt_ip: string
  firmware_version: string | null
  status: string
  last_seen: string | null
}

export interface FirmwareUpgrade {
  id: string
  device_id: string
  device_name: string | null
  previous_version: string | null
  target_version: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  celery_task_id: string | null
  firmware_file_name: string | null
  started_at: string | null
  completed_at: string | null
  error: string | null
  created_at: string
}

export const listFirmwareDevices = async () =>
  (await api.get('/firmware')).data as FirmwareDevice[]

export const listUpgrades = async () =>
  (await api.get('/firmware/upgrades')).data as FirmwareUpgrade[]

export const listDeviceUpgrades = async (deviceId: string) =>
  (await api.get(`/firmware/upgrades/${deviceId}`)).data as FirmwareUpgrade[]

export const createUpgrade = async (params: {
  device_id: string
  target_version: string
  firmware_file?: File | null
}) => {
  const form = new FormData()
  form.append('device_id', params.device_id)
  form.append('target_version', params.target_version)
  if (params.firmware_file) {
    form.append('firmware_file', params.firmware_file)
  }
  return (await api.post('/firmware/upgrades', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })).data as FirmwareUpgrade
}

export const cancelUpgrade = async (id: string) =>
  api.delete(`/firmware/upgrades/${id}`)
