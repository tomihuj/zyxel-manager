import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ColumnVisibilityStore {
  visibility: Record<string, Record<string, boolean>>
  setVisibility: (table: string, model: Record<string, boolean>) => void
  resetVisibility: (table: string) => void
}

export const useColumnVisibilityStore = create<ColumnVisibilityStore>()(
  persist(
    (set) => ({
      visibility: {},
      setVisibility: (table, model) =>
        set((s) => ({
          visibility: { ...s.visibility, [table]: model },
        })),
      resetVisibility: (table) =>
        set((s) => {
          const { [table]: _, ...rest } = s.visibility
          return { visibility: rest }
        }),
    }),
    { name: 'zyxel-column-visibility' },
  ),
)
