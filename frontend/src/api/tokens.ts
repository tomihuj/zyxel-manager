import { api } from './client'
import type { ApiToken } from '../types'

export const listTokens = () =>
  api.get<ApiToken[]>('/auth/tokens').then((r) => r.data)

export const createToken = (name: string, expires_at?: string) =>
  api.post<ApiToken & { token: string }>('/auth/tokens', { name, expires_at }).then((r) => r.data)

export const revokeToken = (id: string) =>
  api.delete(`/auth/tokens/${id}`)
