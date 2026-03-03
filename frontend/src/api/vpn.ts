import { api } from './client'

export interface VpnTunnel {
  id: string
  device_id: string
  device_name: string | null
  tunnel_name: string
  tunnel_type: string
  remote_gateway: string | null
  status: 'up' | 'down' | 'unknown'
  local_subnet: string | null
  remote_subnet: string | null
  collected_at: string
}

export interface VpnSummary {
  total: number
  up: number
  down: number
  unknown: number
}

export const listVpnTunnels = async (params?: { device_id?: string; status?: string }) =>
  (await api.get('/vpn/tunnels', { params })).data as VpnTunnel[]

export const getVpnSummary = async () =>
  (await api.get('/vpn/summary')).data as VpnSummary
