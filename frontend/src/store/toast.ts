import { create } from 'zustand'

export type ToastSeverity = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: number
  msg: string
  severity: ToastSeverity
  duration: number
}

interface ToastState {
  toasts: Toast[]
  push: (msg: string, severity?: ToastSeverity, duration?: number) => void
  dismiss: (id: number) => void
}

let _id = 0

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (msg, severity = 'success', duration = 3000) =>
    set((s) => ({
      toasts: [...s.toasts.slice(-2), { id: ++_id, msg, severity, duration }],
    })),
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))
