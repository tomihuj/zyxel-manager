import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface FilterState {
  deviceSearch: string
  deviceStatus: 'all' | 'online' | 'offline' | 'unknown'
  deviceGroupId: string
  setDeviceSearch: (v: string) => void
  setDeviceStatus: (v: FilterState['deviceStatus']) => void
  setDeviceGroupId: (v: string) => void
  resetDeviceFilters: () => void
}

export const useFilterStore = create<FilterState>()(
  persist(
    (set) => ({
      deviceSearch: '',
      deviceStatus: 'all',
      deviceGroupId: '',
      setDeviceSearch: (v) => set({ deviceSearch: v }),
      setDeviceStatus: (v) => set({ deviceStatus: v }),
      setDeviceGroupId: (v) => set({ deviceGroupId: v }),
      resetDeviceFilters: () => set({ deviceSearch: '', deviceStatus: 'all', deviceGroupId: '' }),
    }),
    { name: 'zyxel-filters' },
  ),
)
