import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Box, Typography, Tabs, Tab, Button, CircularProgress,
  Alert, Snackbar, Breadcrumbs, Link, Paper,
} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import SaveIcon from '@mui/icons-material/Save'
import RefreshIcon from '@mui/icons-material/Refresh'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getDeviceConfig, patchDeviceConfig } from '../api/devices'
import { api } from '../api/client'

const SECTIONS = [
  'system', 'interfaces', 'routing', 'nat', 'firewall_rules',
  'vpn', 'dns', 'ntp', 'address_objects', 'service_objects', 'users',
]

export default function DeviceConfig() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [tab, setTab] = useState(0)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [parseError, setParseError] = useState<string | null>(null)
  const [snack, setSnack] = useState('')

  const { data: device } = useQuery({
    queryKey: ['device', id],
    queryFn: async () => (await api.get(`/devices/${id}`)).data,
  })

  const section = SECTIONS[tab]

  const { data: config, isLoading, isError, refetch } = useQuery({
    queryKey: ['device-config', id, section],
    queryFn: () => getDeviceConfig(id!, section),
    enabled: !!id,
  })

  useEffect(() => {
    if (config !== undefined && !(section in drafts)) {
      setDrafts((prev) => ({ ...prev, [section]: JSON.stringify(config, null, 2) }))
    }
  }, [config, section])

  const saveMut = useMutation({
    mutationFn: () => {
      const text = drafts[section] ?? ''
      const patch = JSON.parse(text)
      return patchDeviceConfig(id!, section, patch)
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['device-config', id, section] })
      setSnack(result?.message ?? 'Saved')
    },
    onError: () => setSnack('Save failed'),
  })

  const handleSave = () => {
    setParseError(null)
    try {
      JSON.parse(drafts[section] ?? '')
    } catch (e: unknown) {
      setParseError(`Invalid JSON: ${(e as Error).message}`)
      return
    }
    saveMut.mutate()
  }

  const handleTabChange = (_: React.SyntheticEvent, v: number) => {
    setParseError(null)
    setTab(v)
  }

  const handleRefresh = () => {
    setDrafts((prev) => { const d = { ...prev }; delete d[section]; return d })
    refetch()
  }

  const draft = drafts[section] ?? (isLoading ? '' : JSON.stringify(config, null, 2))

  return (
    <Box>
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link component="button" underline="hover" color="inherit"
          onClick={() => navigate('/devices')} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <ArrowBackIcon fontSize="small" /> Devices
        </Link>
        <Typography color="text.primary">{device?.name ?? id}</Typography>
        <Typography color="text.primary">Configuration</Typography>
      </Breadcrumbs>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" fontWeight={700}>
          {device?.name ?? '…'} — Configuration
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button startIcon={<RefreshIcon />} onClick={handleRefresh} disabled={isLoading}>
            Refresh
          </Button>
          <Button variant="contained" startIcon={<SaveIcon />}
            onClick={handleSave} disabled={saveMut.isPending || isLoading}>
            {saveMut.isPending ? 'Saving…' : 'Save'}
          </Button>
        </Box>
      </Box>

      <Paper variant="outlined">
        <Tabs value={tab} onChange={handleTabChange} variant="scrollable" scrollButtons="auto"
          sx={{ borderBottom: 1, borderColor: 'divider' }}>
          {SECTIONS.map((s) => (
            <Tab key={s} label={s.replace(/_/g, ' ')} sx={{ textTransform: 'none', fontWeight: 600 }} />
          ))}
        </Tabs>

        <Box sx={{ p: 2 }}>
          {isLoading && <CircularProgress size={24} />}
          {isError && <Alert severity="error">Failed to load config section.</Alert>}
          {parseError && <Alert severity="error" sx={{ mb: 1 }}>{parseError}</Alert>}
          {!isLoading && (
            <textarea
              value={draft}
              onChange={(e) => setDrafts((prev) => ({ ...prev, [section]: e.target.value }))}
              style={{
                width: '100%',
                minHeight: 420,
                fontFamily: 'monospace',
                fontSize: 13,
                padding: 12,
                border: '1px solid #ddd',
                borderRadius: 4,
                resize: 'vertical',
                boxSizing: 'border-box',
                background: '#fafafa',
              }}
              spellCheck={false}
            />
          )}
        </Box>
      </Paper>

      <Snackbar open={!!snack} autoHideDuration={3000} onClose={() => setSnack('')}
        message={snack} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </Box>
  )
}
