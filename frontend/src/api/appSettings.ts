import { api } from './client'

export interface AppSettings {
  auto_poll_interval: number
}

export const getAppSettings = async (): Promise<AppSettings> =>
  (await api.get('/app-settings')).data

export const setAppSetting = async (key: string, value: number): Promise<void> => {
  await api.put(`/app-settings/${key}`, { value })
}
