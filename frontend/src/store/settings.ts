import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SettingsStore {
  testConnectionTimeout: number
  setTestConnectionTimeout: (n: number) => void
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      testConnectionTimeout: 5,
      setTestConnectionTimeout: (n) => set({ testConnectionTimeout: n }),
    }),
    { name: 'zyxel-settings' },
  ),
)
