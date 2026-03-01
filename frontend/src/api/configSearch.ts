import { api } from './client'

export interface ConfigSearchResult {
  device_id: string
  device_name: string
  section: string
  snapshot_id: string
  snapshot_version: number
  matches: Array<{ key: string; value: string }>
}

export function searchConfig(q: string, section?: string, device_id?: string) {
  return api
    .get('/config/search', { params: { q, section: section || undefined, device_id: device_id || undefined } })
    .then((r) => r.data as ConfigSearchResult[])
}
