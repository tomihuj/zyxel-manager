import { api } from './client'
import type { ConfigSnapshot, BackupSettings } from '../types'

export const triggerBackup = (deviceId: string) =>
  api.post(`/backups/${deviceId}/trigger`).then(r => r.data as ConfigSnapshot)

export const listBackups = (deviceId: string) =>
  api.get(`/backups/${deviceId}`).then(r => r.data as ConfigSnapshot[])

export const getBackupData = (snapshotId: string) =>
  api.get(`/backups/${snapshotId}/data`).then(r => r.data)

export const deleteBackup = (snapshotId: string) =>
  api.delete(`/backups/${snapshotId}`)

export const downloadBackupBlob = (snapshotId: string) =>
  api.get(`/backups/${snapshotId}/download`, { responseType: 'blob' }).then(r => r.data as Blob)

export const getBackupSettings = (deviceId: string) =>
  api.get(`/backups/${deviceId}/settings`).then(r => r.data as BackupSettings)

export const updateBackupSettings = (deviceId: string, settings: Omit<BackupSettings, 'last_auto_backup'>) =>
  api.put(`/backups/${deviceId}/settings`, settings).then(r => r.data as BackupSettings)

export const compareBackups = (snapshotIds: string[]) =>
  api.post('/backups/compare', { snapshot_ids: snapshotIds }).then(r => r.data as {
    snapshots: ConfigSnapshot[]
    data: Record<string, unknown>
  })

export const restoreBackup = (snapshotId: string, deviceId?: string) =>
  api.post(`/backups/${snapshotId}/restore`, deviceId ? { device_id: deviceId } : {})
     .then(r => r.data)

export const uploadAndRestore = (deviceId: string, config: unknown, label?: string) =>
  api.post(`/backups/${deviceId}/upload-restore`, { config, label })
     .then(r => r.data)
