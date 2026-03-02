import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type MetricSectionId = 'cpu' | 'memory' | 'uptime' | 'health' | 'interfaces'

interface MetricsConfigStore {
  visible: Record<MetricSectionId, boolean>
  toggle: (id: MetricSectionId) => void
  reset: () => void
}

const DEFAULTS: Record<MetricSectionId, boolean> = {
  cpu: true, memory: true, uptime: true, health: true, interfaces: true,
}

export const useMetricsConfigStore = create<MetricsConfigStore>()(
  persist(
    (set) => ({
      visible: { ...DEFAULTS },
      toggle: (id) => set((s) => ({ visible: { ...s.visible, [id]: !s.visible[id] } })),
      reset: () => set({ visible: { ...DEFAULTS } }),
    }),
    { name: 'zyxel-metrics-config' },
  ),
)

export const METRIC_SECTION_LABELS: Record<MetricSectionId, string> = {
  cpu: 'CPU Usage',
  memory: 'Memory Usage',
  uptime: 'Uptime',
  health: 'Health Grade',
  interfaces: 'Interfaces',
}
