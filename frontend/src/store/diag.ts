import { create } from 'zustand'

export interface DiagEntry {
  id: string
  timestamp: string
  method: string
  url: string
  requestBody?: unknown
  status?: number
  responseBody?: unknown
  duration_ms?: number
  error?: string
}

interface DiagState {
  enabled: boolean
  logs: DiagEntry[]
  toggle: () => void
  addLog: (entry: DiagEntry) => void
  clear: () => void
}

export const useDiagStore = create<DiagState>()((set) => ({
  enabled: false,
  logs: [],
  toggle: () => set((s) => ({ enabled: !s.enabled })),
  addLog: (entry) => set((s) => ({ logs: [...s.logs, entry] })),
  clear: () => set({ logs: [] }),
}))
