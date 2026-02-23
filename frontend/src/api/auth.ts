import { api } from './client'
import type { User } from '../types'

export const login = async (username: string, password: string) => {
  const params = new URLSearchParams()
  params.append('username', username)
  params.append('password', password)
  const { data } = await api.post('/auth/login', params)
  return data as { access_token: string; refresh_token: string }
}

export const getMe = async () => (await api.get('/auth/me')).data as User
