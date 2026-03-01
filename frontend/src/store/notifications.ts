import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface NotificationsStore {
  dismissed: Set<string>
  dismiss: (key: string) => void
  dismissAll: (keys: string[]) => void
  clear: () => void
}

export const useNotificationsStore = create<NotificationsStore>()(
  persist(
    (set) => ({
      dismissed: new Set(),
      dismiss: (key) =>
        set((s) => ({ dismissed: new Set([...s.dismissed, key]) })),
      dismissAll: (keys) =>
        set((s) => ({ dismissed: new Set([...s.dismissed, ...keys]) })),
      clear: () => set({ dismissed: new Set() }),
    }),
    {
      name: 'zyxel-notifications',
      storage: {
        getItem: (name) => {
          const raw = localStorage.getItem(name)
          if (!raw) return null
          const parsed = JSON.parse(raw)
          parsed.state.dismissed = new Set(parsed.state.dismissed ?? [])
          return parsed
        },
        setItem: (name, value) => {
          const v = { ...value, state: { ...value.state, dismissed: [...value.state.dismissed] } }
          localStorage.setItem(name, JSON.stringify(v))
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
    },
  ),
)
