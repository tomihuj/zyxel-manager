import { api } from './client'

export function totpSetup() {
  return api.get('/auth/totp/setup').then((r) => r.data as { secret: string; uri: string })
}

export function totpVerify(code: string) {
  return api.post('/auth/totp/verify', { code }).then((r) => r.data)
}

export function totpDisable(code: string) {
  return api.delete('/auth/totp/disable', { data: { code } }).then((r) => r.data)
}
