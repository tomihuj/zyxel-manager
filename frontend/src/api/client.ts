import axios from 'axios'
import { useAuthStore } from '../store/auth'
import type { DiagEntry } from '../store/diag'
import { useDiagStore } from '../store/diag'

export const api = axios.create({ baseURL: '/api/v1' })

const _pending = new Map<string, { startTime: number; entry: Partial<DiagEntry> }>()

api.interceptors.request.use((config) => {
  if (useDiagStore.getState().enabled) {
    const id = Math.random().toString(36).slice(2)
    ;(config as any).__diagId = id
    _pending.set(id, {
      startTime: Date.now(),
      entry: {
        id,
        timestamp: new Date().toISOString(),
        method: config.method?.toUpperCase() ?? 'GET',
        url: config.url ?? '',
        requestBody: config.data,
      },
    })
  }

  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (r) => {
    const { enabled, addLog } = useDiagStore.getState()
    if (enabled) {
      const id = (r.config as any).__diagId
      const p = _pending.get(id)
      if (p) {
        _pending.delete(id)
        addLog({
          ...p.entry,
          status: r.status,
          responseBody: r.data,
          duration_ms: Date.now() - p.startTime,
        } as DiagEntry)
      }
    }
    return r
  },
  (err) => {
    const { enabled, addLog } = useDiagStore.getState()
    if (enabled) {
      const id = err.config?.__diagId
      const p = _pending.get(id)
      if (p) {
        _pending.delete(id)
        addLog({
          ...p.entry,
          status: err.response?.status,
          responseBody: err.response?.data,
          duration_ms: Date.now() - p.startTime,
          error: err.message,
        } as DiagEntry)
      }
    }

    if (err.response?.status === 401) {
      useAuthStore.getState().clearAuth()
      window.location.href = '/login'
    }
    return Promise.reject(err)
  },
)
