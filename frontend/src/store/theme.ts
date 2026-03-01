import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ThemeStore {
  darkMode: boolean
  toggle: () => void
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      darkMode: false,
      toggle: () => set((s) => ({ darkMode: !s.darkMode })),
    }),
    { name: 'zyxel-theme' },
  ),
)
