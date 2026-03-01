import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ColumnWidthsStore {
  widths: Record<string, Record<string, number>>
  setWidth: (table: string, field: string, width: number) => void
  resetWidths: (table: string) => void
}

export const useColumnWidthsStore = create<ColumnWidthsStore>()(
  persist(
    (set) => ({
      widths: {},
      setWidth: (table, field, width) =>
        set((s) => ({
          widths: {
            ...s.widths,
            [table]: { ...(s.widths[table] ?? {}), [field]: width },
          },
        })),
      resetWidths: (table) =>
        set((s) => {
          const { [table]: _, ...rest } = s.widths
          return { widths: rest }
        }),
    }),
    { name: 'zyxel-column-widths' },
  ),
)
