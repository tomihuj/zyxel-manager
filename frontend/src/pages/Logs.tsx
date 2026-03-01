import { useState } from 'react'
import {
  Box, Typography, Card, Table, TableHead, TableRow, TableCell, TableBody,
  Chip, IconButton, Tooltip, TextField, MenuItem, Button, ButtonGroup,
  CircularProgress, Collapse, Alert,
} from '@mui/material'
import FilterListIcon from '@mui/icons-material/FilterList'
import RefreshIcon from '@mui/icons-material/Refresh'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import DownloadIcon from '@mui/icons-material/Download'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getAuditLogs, getActionConfigs, updateActionConfig } from '../api/logs'
import { api } from '../api/client'
import type { AuditLog, AuditActionConfig } from '../types'

// ─── helpers ──────────────────────────────────────────────────────────────────

async function exportLogs(format: 'csv' | 'json', filters: Record<string, unknown>) {
  const params = { ...filters, format }
  const resp = await api.get('/audit/export', { params, responseType: 'blob' })
  const blob = new Blob([resp.data], { type: resp.headers['content-type'] })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `audit_logs.${format}`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── constants ────────────────────────────────────────────────────────────────

const ACTION_COLORS: Record<string, 'error' | 'warning' | 'info' | 'success' | 'default' | 'primary'> = {
  login: 'success',
  login_failed: 'error',
  create_device: 'primary',
  update_device: 'info',
  delete_device: 'error',
  test_connection: 'info',
  test_connection_failed: 'error',
  sync_device: 'info',
  sync_device_failed: 'error',
  patch_config: 'warning',
  patch_config_failed: 'error',
  create_group: 'primary',
  update_group: 'info',
  delete_group: 'error',
  create_user: 'primary',
  update_user: 'info',
  delete_user: 'error',
  assign_role: 'primary',
  remove_role: 'warning',
  create_role: 'primary',
  set_permissions: 'warning',
  create_bulk_job: 'warning',
  execute_bulk_job: 'warning',
  cancel_bulk_job: 'error',
  generate_report: 'default',
  trigger_backup: 'info',
  trigger_backup_failed: 'error',
  delete_backup: 'error',
  update_backup_settings: 'info',
}

const ALL_ACTIONS = Object.keys(ACTION_COLORS)

// ─── helpers ──────────────────────────────────────────────────────────────────

function actionChip(action: string) {
  const color = ACTION_COLORS[action] ?? 'default'
  return <Chip size="small" label={action} color={color} sx={{ fontSize: 11, fontFamily: 'monospace' }} />
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString()
}

// ─── DetailsCell ──────────────────────────────────────────────────────────────

function DetailsCell({ details }: { details: Record<string, unknown> | null }) {
  const [open, setOpen] = useState(false)
  if (!details || Object.keys(details).length === 0) return <span style={{ color: '#9ca3af' }}>—</span>
  const keys = Object.keys(details)
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Typography fontSize={11} fontFamily="monospace" color="text.secondary">
          {keys.slice(0, 2).join(', ')}{keys.length > 2 ? '…' : ''}
        </Typography>
        <IconButton size="small" onClick={() => setOpen(o => !o)} sx={{ p: 0.25 }}>
          {open ? <ExpandLessIcon sx={{ fontSize: 14 }} /> : <ExpandMoreIcon sx={{ fontSize: 14 }} />}
        </IconButton>
      </Box>
      <Collapse in={open}>
        <pre style={{
          margin: '4px 0 0', fontSize: 11, background: '#f8fafc', borderRadius: 4,
          padding: '6px 8px', maxWidth: 340, overflow: 'auto', whiteSpace: 'pre-wrap',
        }}>
          {JSON.stringify(details, null, 2)}
        </pre>
      </Collapse>
    </Box>
  )
}

// ─── LogsTab ─────────────────────────────────────────────────────────────────

function LogsTab() {
  const [showFilters, setShowFilters] = useState(false)
  const [action, setAction] = useState('')
  const [username, setUsername] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [offset, setOffset] = useState(0)
  const LIMIT = 100

  const filters = {
    action: action || undefined,
    username: username || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    limit: LIMIT,
    offset,
  }

  const { data: logs = [], isLoading, refetch } = useQuery({
    queryKey: ['audit-logs', filters],
    queryFn: () => getAuditLogs(filters),
  })

  const clearFilters = () => {
    setAction(''); setUsername(''); setDateFrom(''); setDateTo(''); setOffset(0)
  }

  return (
    <Box>
      {/* toolbar */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
          {logs.length} entries{offset > 0 ? ` (page ${Math.floor(offset / LIMIT) + 1})` : ''}
        </Typography>
        <Tooltip title="Toggle filters">
          <IconButton onClick={() => setShowFilters(f => !f)} color={showFilters ? 'primary' : 'default'}>
            <FilterListIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title="Export CSV">
          <IconButton onClick={() => exportLogs('csv', filters)} color="default">
            <DownloadIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title="Refresh">
          <IconButton onClick={() => refetch()} disabled={isLoading}>
            {isLoading ? <CircularProgress size={20} /> : <RefreshIcon />}
          </IconButton>
        </Tooltip>
      </Box>

      {/* filters */}
      <Collapse in={showFilters}>
        <Card sx={{ p: 2, mb: 2 }}>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <TextField
              select label="Action" size="small" sx={{ minWidth: 220 }}
              value={action} onChange={e => { setAction(e.target.value); setOffset(0) }}
            >
              <MenuItem value="">All actions</MenuItem>
              {ALL_ACTIONS.map(a => (
                <MenuItem key={a} value={a}>{a}</MenuItem>
              ))}
            </TextField>
            <TextField
              label="Username" size="small" sx={{ minWidth: 160 }}
              value={username} onChange={e => { setUsername(e.target.value); setOffset(0) }}
            />
            <TextField
              label="From" type="datetime-local" size="small" sx={{ minWidth: 200 }}
              value={dateFrom} onChange={e => { setDateFrom(e.target.value); setOffset(0) }}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="To" type="datetime-local" size="small" sx={{ minWidth: 200 }}
              value={dateTo} onChange={e => { setDateTo(e.target.value); setOffset(0) }}
              InputLabelProps={{ shrink: true }}
            />
            <Button size="small" onClick={clearFilters}>Clear</Button>
          </Box>
        </Card>
      </Collapse>

      {/* table */}
      <Card>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 700, fontSize: 12, bgcolor: 'grey.50', borderBottom: 2, borderColor: 'divider' } }}>
                <TableCell sx={{ minWidth: 160 }}>Date / Time</TableCell>
                <TableCell sx={{ minWidth: 110 }}>User</TableCell>
                <TableCell sx={{ minWidth: 200 }}>Action</TableCell>
                <TableCell sx={{ minWidth: 120 }}>Resource</TableCell>
                <TableCell sx={{ minWidth: 260 }}>Details</TableCell>
                <TableCell sx={{ minWidth: 120 }}>IP Address</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                    <CircularProgress size={24} />
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && logs.map((log: AuditLog) => (
                <TableRow
                  key={log.id}
                  hover
                  sx={{ bgcolor: log.action.endsWith('_failed') ? 'error.50' : undefined }}
                >
                  <TableCell sx={{ fontSize: 12, whiteSpace: 'nowrap' }}>{formatDate(log.created_at)}</TableCell>
                  <TableCell>
                    {log.username
                      ? <Chip size="small" label={log.username} variant="outlined" sx={{ fontSize: 11 }} />
                      : <Typography fontSize={11} color="text.disabled">system</Typography>
                    }
                  </TableCell>
                  <TableCell>{actionChip(log.action)}</TableCell>
                  <TableCell sx={{ fontSize: 12 }}>
                    {log.resource_type ? (
                      <Box>
                        <Typography fontSize={11} color="text.secondary">{log.resource_type}</Typography>
                        {log.resource_id && (
                          <Typography fontSize={11} fontFamily="monospace" color="text.disabled">
                            {log.resource_id.substring(0, 8)}…
                          </Typography>
                        )}
                      </Box>
                    ) : <Typography fontSize={11} color="text.disabled">—</Typography>}
                  </TableCell>
                  <TableCell><DetailsCell details={log.details} /></TableCell>
                  <TableCell sx={{ fontSize: 11, fontFamily: 'monospace', color: 'text.secondary' }}>
                    {log.ip_address ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
              {!isLoading && logs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary', fontSize: 13 }}>
                    No log entries found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Box>

        {/* pagination */}
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', p: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
          <Button size="small" disabled={offset === 0} onClick={() => setOffset(o => Math.max(0, o - LIMIT))}>
            ← Previous
          </Button>
          <Button size="small" disabled={logs.length < LIMIT} onClick={() => setOffset(o => o + LIMIT)}>
            Next →
          </Button>
        </Box>
      </Card>
    </Box>
  )
}

// ─── SettingsTab ──────────────────────────────────────────────────────────────

function ActionRow({ cfg }: { cfg: AuditActionConfig }) {
  const qc = useQueryClient()
  const [enabled, setEnabled] = useState(cfg.enabled)
  const [logPayload, setLogPayload] = useState(cfg.log_payload)
  const [error, setError] = useState('')

  const mut = useMutation({
    mutationFn: ({ en, lp }: { en: boolean; lp: boolean }) =>
      updateActionConfig(cfg.action, en, lp),
    onSuccess: (data) => {
      setEnabled(data.enabled)
      setLogPayload(data.log_payload)
      qc.invalidateQueries({ queryKey: ['audit-action-configs'] })
      setError('')
    },
    onError: () => setError('Save failed'),
  })

  const saving = mut.isPending

  return (
    <TableRow sx={{ opacity: enabled ? 1 : 0.6, transition: 'opacity 0.2s' }}>
      <TableCell>
        <Typography fontWeight={600} fontSize={13}>{cfg.label}</Typography>
        <Typography fontSize={11} color="text.secondary" sx={{ mt: 0.25 }}>{cfg.description}</Typography>
        {error && <Typography fontSize={11} color="error">{error}</Typography>}
      </TableCell>
      <TableCell sx={{ fontSize: 11, fontFamily: 'monospace', color: 'text.disabled' }}>
        {cfg.action}
      </TableCell>

      {/* Enable / Disable */}
      <TableCell align="center">
        <ButtonGroup size="small" disabled={saving}>
          <Button
            variant={enabled ? 'contained' : 'outlined'}
            color="success"
            onClick={() => mut.mutate({ en: true, lp: logPayload })}
            sx={{ minWidth: 78, fontWeight: enabled ? 700 : 400 }}
          >
            {saving && enabled ? <CircularProgress size={12} sx={{ mr: 0.5 }} /> : null}
            Enable
          </Button>
          <Button
            variant={!enabled ? 'contained' : 'outlined'}
            color="error"
            onClick={() => mut.mutate({ en: false, lp: logPayload })}
            sx={{ minWidth: 78, fontWeight: !enabled ? 700 : 400 }}
          >
            {saving && !enabled ? <CircularProgress size={12} sx={{ mr: 0.5 }} /> : null}
            Disable
          </Button>
        </ButtonGroup>
      </TableCell>

      {/* Log Payload ON / OFF */}
      <TableCell align="center">
        <Tooltip title={!enabled ? 'Enable logging first' : 'Store request & response body in Details'}>
          <span>
            <ButtonGroup size="small" disabled={!enabled || saving}>
              <Button
                variant={logPayload ? 'contained' : 'outlined'}
                color="info"
                onClick={() => mut.mutate({ en: enabled, lp: true })}
                sx={{ minWidth: 50, fontWeight: logPayload ? 700 : 400 }}
              >
                ON
              </Button>
              <Button
                variant={!logPayload ? 'contained' : 'outlined'}
                color="inherit"
                onClick={() => mut.mutate({ en: enabled, lp: false })}
                sx={{ minWidth: 50, fontWeight: !logPayload ? 700 : 400 }}
              >
                OFF
              </Button>
            </ButtonGroup>
          </span>
        </Tooltip>
      </TableCell>
    </TableRow>
  )
}

function SettingsTab() {
  const { data: configs = [], isLoading } = useQuery({
    queryKey: ['audit-action-configs'],
    queryFn: getActionConfigs,
  })

  const qc = useQueryClient()

  const enableAll = async () => {
    for (const cfg of configs) {
      await updateActionConfig(cfg.action, true, cfg.log_payload)
    }
    qc.invalidateQueries({ queryKey: ['audit-action-configs'] })
  }

  const disableAll = async () => {
    for (const cfg of configs) {
      await updateActionConfig(cfg.action, false, cfg.log_payload)
    }
    qc.invalidateQueries({ queryKey: ['audit-action-configs'] })
  }

  if (isLoading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
  }

  const categories = Array.from(new Set(configs.map(c => c.category)))
  const enabledCount = configs.filter(c => c.enabled).length

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>
        <strong>Enable / Disable</strong> — controls whether an action is recorded at all.{' '}
        <strong>Log Payload ON / OFF</strong> — when ON, the request body sent and response returned are saved in Details (sensitive values like passwords are masked).
      </Alert>

      <Box sx={{ display: 'flex', gap: 1, mb: 3, alignItems: 'center' }}>
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
          {enabledCount} of {configs.length} actions enabled
        </Typography>
        <Button size="small" variant="outlined" color="success" onClick={enableAll}>
          Enable All
        </Button>
        <Button size="small" variant="outlined" color="error" onClick={disableAll}>
          Disable All
        </Button>
      </Box>

      {categories.map(cat => {
        const rows = configs.filter(c => c.category === cat)
        const catEnabled = rows.filter(r => r.enabled).length
        return (
          <Box key={cat} sx={{ mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Typography variant="subtitle2" fontWeight={700} color="text.secondary"
                sx={{ textTransform: 'uppercase', fontSize: 11, letterSpacing: 1 }}>
                {cat}
              </Typography>
              <Chip size="small" label={`${catEnabled}/${rows.length} enabled`}
                color={catEnabled === rows.length ? 'success' : catEnabled === 0 ? 'error' : 'warning'}
                variant="outlined" sx={{ fontSize: 10 }} />
            </Box>
            <Card>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ '& th': { fontWeight: 700, fontSize: 12, bgcolor: 'grey.50' } }}>
                    <TableCell sx={{ minWidth: 240 }}>Action</TableCell>
                    <TableCell sx={{ minWidth: 200 }}>Key</TableCell>
                    <TableCell align="center" sx={{ minWidth: 180 }}>Logging</TableCell>
                    <TableCell align="center" sx={{ minWidth: 120 }}>Log Payload</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map(cfg => <ActionRow key={cfg.action} cfg={cfg} />)}
                </TableBody>
              </Table>
            </Card>
          </Box>
        )
      })}
    </Box>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Logs() {
  const [tab, setTab] = useState<'logs' | 'settings'>('logs')

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>Logs</Typography>

      <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
        <Button
          variant={tab === 'logs' ? 'contained' : 'outlined'}
          onClick={() => setTab('logs')}
        >
          Audit Log
        </Button>
        <Button
          variant={tab === 'settings' ? 'contained' : 'outlined'}
          onClick={() => setTab('settings')}
        >
          Log Settings
        </Button>
      </Box>

      {tab === 'logs' ? <LogsTab /> : <SettingsTab />}
    </Box>
  )
}
