import { api } from './client'

export const cloneDevice = async (sourceId: string, body: {
  name: string
  mgmt_ip: string
  port: number
  protocol: string
  username: string
  password: string
}) => (await api.post(`/devices/${sourceId}/clone`, body)).data
