import { api } from './client'

export function listSessions() {
  return api.get('/auth/sessions').then((r) => r.data)
}

export function revokeSession(id: string) {
  return api.delete(`/auth/sessions/${id}`)
}

export function revokeAllSessions() {
  return api.delete('/auth/sessions')
}
