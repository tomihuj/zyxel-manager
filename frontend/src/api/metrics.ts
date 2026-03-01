import { api } from './client'

export function getDeviceMetrics(deviceId: string, hours = 24) {
  return api.get(`/devices/${deviceId}/metrics`, { params: { hours } }).then((r) => r.data)
}

export function getDeviceHealth(deviceId: string) {
  return api.get(`/devices/${deviceId}/health`).then((r) => r.data)
}

export function getDeviceInterfaces(deviceId: string) {
  return api.get(`/devices/${deviceId}/interfaces`).then((r) => r.data)
}
