import { api } from './client'

export const generateReport = async (body: Record<string, unknown>) => {
  if (body.format === 'csv') {
    const resp = await api.post('/reports/generate', body, { responseType: 'blob' })
    const url = URL.createObjectURL(resp.data)
    const a = document.createElement('a')
    a.href = url
    a.download = 'report.csv'
    a.click()
    URL.revokeObjectURL(url)
    return null
  }
  return (await api.post('/reports/generate', body)).data
}

export const listAuditLogs = async () => (await api.get('/audit/logs?limit=100')).data
