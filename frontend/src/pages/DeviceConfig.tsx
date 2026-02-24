import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Box, Typography, Tabs, Tab, Button, CircularProgress,
  Alert, Snackbar, Breadcrumbs, Link, Paper, Chip, Divider, List, ListItem, ListItemText,
} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import SaveIcon from '@mui/icons-material/Save'
import RefreshIcon from '@mui/icons-material/Refresh'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import FactCheckIcon from '@mui/icons-material/FactCheck'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getDeviceConfig, patchDeviceConfig } from '../api/devices'
import { api } from '../api/client'

const SECTIONS = [
  'system', 'interfaces', 'routing', 'nat', 'firewall_rules',
  'vpn', 'dns', 'ntp', 'address_objects', 'service_objects', 'users',
]

const SECTION_EXPECTED_TYPE: Record<string, 'array' | 'object'> = {
  interfaces:      'array',
  nat:             'array',
  firewall_rules:  'array',
  address_objects: 'array',
  service_objects: 'array',
  routing:         'object',
  dns:             'object',
  ntp:             'object',
  vpn:             'object',
  system:          'object',
  users:           'object',
}

type Change = { type: 'added' | 'removed' | 'modified'; path: string; from?: string; to?: string }

type CheckResult = {
  ok: boolean
  errors: string[]
  warnings: string[]
  changes: Change[]
}

function diffValues(original: any, draft: any, path = ''): Change[] {
  const changes: Change[] = []
  if (Array.isArray(original) && Array.isArray(draft)) {
    if (original.length !== draft.length) {
      changes.push({ type: 'modified', path: path || '(root)', from: `${original.length} items`, to: `${draft.length} items` })
    }
    return changes
  }
  if (original !== null && typeof original === 'object' && draft !== null && typeof draft === 'object' && !Array.isArray(draft)) {
    const allKeys = new Set([...Object.keys(original), ...Object.keys(draft)])
    for (const k of allKeys) {
      const p = path ? `${path}.${k}` : k
      if (!(k in original)) {
        changes.push({ type: 'added', path: p, to: JSON.stringify(draft[k]) })
      } else if (!(k in draft)) {
        changes.push({ type: 'removed', path: p, from: JSON.stringify(original[k]) })
      } else if (JSON.stringify(original[k]) !== JSON.stringify(draft[k])) {
        if (typeof original[k] === 'object' && typeof draft[k] === 'object') {
          changes.push(...diffValues(original[k], draft[k], p))
        } else {
          changes.push({ type: 'modified', path: p, from: JSON.stringify(original[k]), to: JSON.stringify(draft[k]) })
        }
      }
    }
    return changes
  }
  if (JSON.stringify(original) !== JSON.stringify(draft)) {
    changes.push({ type: 'modified', path: path || '(root)', from: JSON.stringify(original), to: JSON.stringify(draft) })
  }
  return changes
}

function checkConfig(section: string, draftText: string, original: any): CheckResult {
  const errors: string[] = []
  const warnings: string[] = []
  const changes: Change[] = []

  // 1. JSON syntax
  let parsed: any
  try {
    parsed = JSON.parse(draftText)
  } catch (e: any) {
    return { ok: false, errors: [`Invalid JSON: ${e.message}`], warnings: [], changes: [] }
  }

  // 2. Type check
  const expectedType = SECTION_EXPECTED_TYPE[section]
  if (expectedType === 'array' && !Array.isArray(parsed)) {
    errors.push(`Section "${section}" must be an array, got ${typeof parsed}`)
  }
  if (expectedType === 'object' && (Array.isArray(parsed) || typeof parsed !== 'object' || parsed === null)) {
    errors.push(`Section "${section}" must be an object, got ${Array.isArray(parsed) ? 'array' : typeof parsed}`)
  }

  // 3. Emptiness warning
  if (Array.isArray(parsed) && parsed.length === 0 && Array.isArray(original) && original.length > 0) {
    warnings.push(`This will clear all ${original.length} existing ${section} entries`)
  }

  if (errors.length > 0) return { ok: false, errors, warnings, changes }

  // 4. Diff vs original
  if (original !== undefined && original !== null) {
    changes.push(...diffValues(original, parsed))
  }

  if (changes.length === 0 && warnings.length === 0) {
    warnings.push('No changes detected vs the loaded config')
  }

  return { ok: true, errors, warnings, changes }
}

function CheckResultPanel({ result }: { result: CheckResult }) {
  return (
    <Box sx={{ mt: 2, border: '1px solid', borderColor: result.ok ? 'success.light' : 'error.light', borderRadius: 1, p: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: result.errors.length + result.warnings.length + result.changes.length > 0 ? 1 : 0 }}>
        <CheckCircleIcon fontSize="small" color={result.ok ? 'success' : 'error'} />
        <Typography fontWeight={600} fontSize={13} color={result.ok ? 'success.main' : 'error.main'}>
          {result.ok ? 'Check passed' : 'Check failed'}
        </Typography>
      </Box>

      {result.errors.length > 0 && (
        <List dense disablePadding>
          {result.errors.map((e, i) => (
            <ListItem key={i} disablePadding sx={{ py: 0.25 }}>
              <Chip size="small" label="error" color="error" sx={{ mr: 1, minWidth: 52 }} />
              <ListItemText primary={e} primaryTypographyProps={{ fontSize: 12 }} />
            </ListItem>
          ))}
        </List>
      )}

      {result.warnings.length > 0 && (
        <List dense disablePadding>
          {result.warnings.map((w, i) => (
            <ListItem key={i} disablePadding sx={{ py: 0.25 }}>
              <Chip size="small" label="warn" color="warning" sx={{ mr: 1, minWidth: 52 }} />
              <ListItemText primary={w} primaryTypographyProps={{ fontSize: 12 }} />
            </ListItem>
          ))}
        </List>
      )}

      {result.changes.length > 0 && (
        <>
          <Divider sx={{ my: 1 }} />
          <Typography fontSize={12} fontWeight={600} color="text.secondary" sx={{ mb: 0.5 }}>
            {result.changes.length} change{result.changes.length !== 1 ? 's' : ''}
          </Typography>
          <List dense disablePadding>
            {result.changes.slice(0, 20).map((c, i) => (
              <ListItem key={i} disablePadding sx={{ py: 0.25 }}>
                <Chip size="small" label={c.type}
                  color={c.type === 'added' ? 'success' : c.type === 'removed' ? 'error' : 'warning'}
                  sx={{ mr: 1, minWidth: 64 }} />
                <ListItemText
                  primary={c.path}
                  secondary={c.type === 'modified' ? `${c.from} → ${c.to}` : c.from ?? c.to}
                  primaryTypographyProps={{ fontSize: 12, fontFamily: 'monospace' }}
                  secondaryTypographyProps={{ fontSize: 11, fontFamily: 'monospace' }}
                />
              </ListItem>
            ))}
            {result.changes.length > 20 && (
              <ListItem disablePadding>
                <ListItemText primary={`…and ${result.changes.length - 20} more`} primaryTypographyProps={{ fontSize: 12, color: 'text.secondary' }} />
              </ListItem>
            )}
          </List>
        </>
      )}
    </Box>
  )
}

export default function DeviceConfig() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [tab, setTab] = useState(0)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [snack, setSnack] = useState('')
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null)
  const [checked, setChecked] = useState(false)

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

  // Clear check state when switching tabs
  useEffect(() => {
    setCheckResult(null)
    setChecked(false)
  }, [section])

  const saveMut = useMutation({
    mutationFn: () => {
      const patch = JSON.parse(drafts[section] ?? '')
      return patchDeviceConfig(id!, section, patch)
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['device-config', id, section] })
      setSnack(result?.message ?? 'Saved')
      setChecked(false)
      setCheckResult(null)
    },
    onError: () => setSnack('Save failed'),
  })

  const handleCheck = () => {
    const result = checkConfig(section, drafts[section] ?? '', config)
    setCheckResult(result)
    setChecked(result.ok)
  }

  const handleDraftChange = (text: string) => {
    setDrafts((prev) => ({ ...prev, [section]: text }))
    // Invalidate check when draft changes
    if (checked) {
      setChecked(false)
      setCheckResult(null)
    }
  }

  const handleTabChange = (_: React.SyntheticEvent, v: number) => {
    setTab(v)
  }

  const handleRefresh = () => {
    setDrafts((prev) => { const d = { ...prev }; delete d[section]; return d })
    setCheckResult(null)
    setChecked(false)
    refetch()
  }

  const draft = drafts[section] ?? (isLoading ? '' : JSON.stringify(config, null, 2))
  const isDirty = draft !== JSON.stringify(config, null, 2)

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
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Button startIcon={<RefreshIcon />} onClick={handleRefresh} disabled={isLoading}>
            Refresh
          </Button>
          <Button startIcon={<FactCheckIcon />} onClick={handleCheck}
            disabled={isLoading || !isDirty} variant="outlined">
            Check
          </Button>
          <Button variant="contained" startIcon={<SaveIcon />}
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending || isLoading || !checked}>
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
          {!isLoading && !isDirty && (
            <Alert severity="info" sx={{ mb: 1 }}>No unsaved changes</Alert>
          )}
          {!isLoading && isDirty && !checked && (
            <Alert severity="warning" sx={{ mb: 1 }}>Unsaved changes — click Check before saving</Alert>
          )}
          {!isLoading && checked && (
            <Alert severity="success" sx={{ mb: 1 }} icon={<CheckCircleIcon fontSize="small" />}>
              Config checked — ready to save
            </Alert>
          )}
          {!isLoading && (
            <textarea
              value={draft}
              onChange={(e) => handleDraftChange(e.target.value)}
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
          {checkResult && <CheckResultPanel result={checkResult} />}
        </Box>
      </Paper>

      <Snackbar open={!!snack} autoHideDuration={3000} onClose={() => setSnack('')}
        message={snack} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </Box>
  )
}
