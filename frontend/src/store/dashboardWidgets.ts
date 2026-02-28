import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type WidgetId = 'statCards' | 'deviceStatus' | 'recentActivity' | 'deviceList' | 'securityScore'

interface DashboardWidgetsStore {
  visible: Record<WidgetId, boolean>
  toggle: (id: WidgetId) => void
  reset: () => void
}

const DEFAULTS: Record<WidgetId, boolean> = {
  statCards: true,
  deviceStatus: true,
  recentActivity: true,
  deviceList: true,
  securityScore: true,
}

export const useDashboardWidgetsStore = create<DashboardWidgetsStore>()(
  persist(
    (set) => ({
      visible: { ...DEFAULTS },
      toggle: (id) => set((s) => ({ visible: { ...s.visible, [id]: !s.visible[id] } })),
      reset: () => set({ visible: { ...DEFAULTS } }),
    }),
    { name: 'zyxel-dashboard-widgets' },
  ),
)

export const WIDGET_LABELS: Record<WidgetId, string> = {
  statCards: 'Stat Cards',
  deviceStatus: 'Device Status',
  recentActivity: 'Recent Activity',
  deviceList: 'Device List',
  securityScore: 'Security Score',
}
