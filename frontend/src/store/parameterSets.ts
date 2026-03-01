import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface ColumnDef {
  key: string
  label: string
  visible: boolean
}

export interface ParameterSet {
  id: string
  name: string
  section: string
  builtin: boolean
  columns: ColumnDef[]
}

export const BUILTIN_SETS: ParameterSet[] = [
  {
    id: '__fw_rules',
    name: 'Firewall Rules (Zyxel)',
    section: 'firewall_rules',
    builtin: true,
    columns: [
      { key: '__name',          label: 'Priority',    visible: true  },
      { key: '_name',           label: 'Name',        visible: true  },
      { key: '_description',    label: 'Description', visible: false },
      { key: '_from',           label: 'From',        visible: true  },
      { key: '_to',             label: 'To',          visible: true  },
      { key: '_source_IP',      label: 'Source IP',   visible: true  },
      { key: '_source_port',    label: 'Source Port', visible: false },
      { key: '_destination_IP', label: 'Dest IP',     visible: true  },
      { key: '_service',        label: 'Service',     visible: true  },
      { key: '_action',         label: 'Action',      visible: true  },
      { key: '_log',            label: 'Log',         visible: true  },
      { key: '_enable',         label: 'Enabled',     visible: false },
      { key: '_user',           label: 'User',        visible: false },
      { key: '_schedule',       label: 'Schedule',    visible: false },
      { key: '_device',         label: 'Device',      visible: false },
      { key: '_comment',        label: 'Comment',     visible: false },
    ],
  },
  {
    id: '__interfaces',
    name: 'Interfaces (Zyxel)',
    section: 'interfaces',
    builtin: true,
    columns: [
      { key: '_name',        label: 'Name',        visible: true  },
      { key: '_type',        label: 'Type',        visible: true  },
      { key: '_ip',          label: 'IP Address',  visible: true  },
      { key: '_mask',        label: 'Mask',        visible: true  },
      { key: '_status',      label: 'Status',      visible: true  },
      { key: '_description', label: 'Description', visible: false },
      { key: '_mtu',         label: 'MTU',         visible: false },
      { key: '_mac',         label: 'MAC',         visible: false },
    ],
  },
  {
    id: '__address_objects',
    name: 'Address Objects (Zyxel)',
    section: 'address_objects',
    builtin: true,
    columns: [
      { key: '_name',    label: 'Name',    visible: true },
      { key: '_type',    label: 'Type',    visible: true },
      { key: '_addr',    label: 'Address', visible: true },
      { key: '_mask',    label: 'Mask',    visible: true },
      { key: '_description', label: 'Description', visible: false },
    ],
  },
  {
    id: '__service_objects',
    name: 'Service Objects (Zyxel)',
    section: 'service_objects',
    builtin: true,
    columns: [
      { key: '_name',     label: 'Name',      visible: true },
      { key: '_protocol', label: 'Protocol',  visible: true },
      { key: '_port',     label: 'Port',      visible: true },
      { key: '_description', label: 'Description', visible: false },
    ],
  },
]

interface ParameterSetsStore {
  sets: ParameterSet[]
  getSetForSection: (section: string) => ParameterSet | undefined
  updateSet: (id: string, updates: { name?: string; columns?: ColumnDef[] }) => void
  addSet: (name: string, section: string) => ParameterSet
  deleteSet: (id: string) => void
  resetBuiltin: (id: string) => void
}

export const useParameterSetsStore = create<ParameterSetsStore>()(
  persist(
    (set, get) => ({
      sets: [...BUILTIN_SETS],

      getSetForSection: (section) =>
        get().sets.find((s) => s.section === section),

      updateSet: (id, updates) =>
        set((s) => ({
          sets: s.sets.map((ps) => (ps.id === id ? { ...ps, ...updates } : ps)),
        })),

      addSet: (name, section) => {
        const newSet: ParameterSet = {
          id: `user_${Date.now()}`,
          name,
          section,
          builtin: false,
          columns: [],
        }
        set((s) => ({ sets: [...s.sets, newSet] }))
        return newSet
      },

      deleteSet: (id) =>
        set((s) => ({ sets: s.sets.filter((ps) => ps.id !== id || ps.builtin) })),

      resetBuiltin: (id) => {
        const def = BUILTIN_SETS.find((d) => d.id === id)
        if (def) {
          set((s) => ({
            sets: s.sets.map((ps) => (ps.id === id ? { ...def } : ps)),
          }))
        }
      },
    }),
    {
      name: 'zyxel-parameter-sets',
      onRehydrateStorage: () => (state) => {
        if (!state) return
        const ids = new Set(state.sets.map((s) => s.id))
        const missing = BUILTIN_SETS.filter((d) => !ids.has(d.id))
        if (missing.length > 0) {
          state.sets = [...state.sets, ...missing]
        }
      },
    },
  ),
)

/** Given raw device config data, extract the array of row objects.
 *  Handles:
 *   - Zyxel wrapper: [{_secure_policy_rule: [...]}, ...] → inner array
 *   - Generic Zyxel: [{_any_key: [...]}, ...] → first array-valued key
 *   - Direct array: [{...}, {...}] → as-is
 */
export function extractConfigRows(data: unknown): Record<string, unknown>[] | null {
  if (!Array.isArray(data)) return null
  if (data.length === 0) return []

  const first = data[0]
  if (first && typeof first === 'object' && !Array.isArray(first)) {
    // Look for a key whose value is a non-empty array (Zyxel CLI wrapper pattern)
    for (const v of Object.values(first as Record<string, unknown>)) {
      if (Array.isArray(v) && v.length > 0) return v as Record<string, unknown>[]
    }
  }
  return data as Record<string, unknown>[]
}

/** Render a cell value as a string for table display */
export function cellStr(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
