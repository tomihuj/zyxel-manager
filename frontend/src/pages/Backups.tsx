import { useState, ChangeEvent } from 'react'
import {
  Box, Typography, Button, Chip, Card, Table, TableHead, TableRow, TableCell,
  TableBody, CircularProgress, Alert, Select, MenuItem, FormControl, InputLabel,
  Switch, FormControlLabel, Dialog, DialogTitle, DialogContent, DialogActions,
  IconButton, Tooltip, ToggleButtonGroup, ToggleButton, Autocomplete, TextField, Snackbar,
} from '@mui/material'
import CloudSyncIcon from '@mui/icons-material/CloudSync'
import SettingsIcon from '@mui/icons-material/Settings'
import HistoryIcon from '@mui/icons-material/History'
import DownloadIcon from '@mui/icons-material/Download'
import DeleteIcon from '@mui/icons-material/Delete'
import SettingsBackupRestoreIcon from '@mui/icons-material/SettingsBackupRestore'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import CompareArrowsIcon from '@mui/icons-material/CompareArrows'
import AddIcon from '@mui/icons-material/Add'
import RemoveIcon from '@mui/icons-material/Remove'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listDevices } from '../api/devices'
import {
  triggerBackup, listBackups, deleteBackup, downloadBackupBlob,
  getBackupSettings, updateBackupSettings, compareBackups,
  restoreBackup, uploadAndRestore,
} from '../api/backups'
import type { Device, ConfigSnapshot, BackupSettings } from '../types'
import { buildRows } from '../utils/configDiff'

// ─── helpers ────────────────────────────────────────────────────────────────

function triggeredByChip(val: string) {
  const colorMap: Record<string, 'primary' | 'secondary' | 'info' | 'warning' | 'default'> = {
    manual: 'primary', schedule: 'info', sync: 'default', pre_restore: 'warning', upload: 'secondary',
  }
  return <Chip size="small" label={val} color={colorMap[val] ?? 'default'} />
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

const INTERVAL_OPTIONS = [
  { value: 1, label: 'Every 1 hour' },
  { value: 6, label: 'Every 6 hours' },
  { value: 12, label: 'Every 12 hours' },
  { value: 24, label: 'Every 24 hours' },
  { value: 48, label: 'Every 48 hours' },
  { value: 168, label: 'Weekly' },
]

const RETENTION_OPTIONS = [
  { value: 1, label: 'Keep 1 version' },
  { value: 5, label: 'Keep 5 versions' },
  { value: 10, label: 'Keep 10 versions' },
  { value: 20, label: 'Keep 20 versions' },
  { value: 50, label: 'Keep 50 versions' },
  { value: null, label: 'Unlimited' },
]

// ─── BackupSettingsDialog ────────────────────────────────────────────────────

function BackupSettingsDialog({ device, onClose }: { device: Device; onClose: () => void }) {
  const qc = useQueryClient()
  const { data: settings, isLoading } = useQuery({
    queryKey: ['backup-settings', device.id],
    queryFn: () => getBackupSettings(device.id),
  })

  const [form, setForm] = useState<Omit<BackupSettings, 'last_auto_backup'>>({
    auto_backup_enabled: false,
    interval_hours: 24,
    retention: 10,
  })

  const [initialized, setInitialized] = useState(false)
  if (settings && !initialized) {
    setForm({
      auto_backup_enabled: settings.auto_backup_enabled,
      interval_hours: settings.interval_hours,
      retention: settings.retention,
    })
    setInitialized(true)
  }

  const save = useMutation({
    mutationFn: () => updateBackupSettings(device.id, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['backup-settings', device.id] })
      onClose()
    },
  })

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Backup Settings — {device.name}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {isLoading ? <CircularProgress size={24} /> : (
          <>
            <FormControlLabel
              control={
                <Switch
                  checked={form.auto_backup_enabled}
                  onChange={e => setForm(f => ({ ...f, auto_backup_enabled: e.target.checked }))}
                />
              }
              label="Enable automatic backups"
            />
            <FormControl size="small" fullWidth>
              <InputLabel>Interval</InputLabel>
              <Select
                value={form.interval_hours}
                label="Interval"
                onChange={e => setForm(f => ({ ...f, interval_hours: Number(e.target.value) }))}
                disabled={!form.auto_backup_enabled}
              >
                {INTERVAL_OPTIONS.map(o => (
                  <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth>
              <InputLabel>Retention</InputLabel>
              <Select
                value={form.retention ?? 'null'}
                label="Retention"
                onChange={e => {
                  const v = e.target.value
                  setForm(f => ({ ...f, retention: v === 'null' ? null : Number(v) }))
                }}
              >
                {RETENTION_OPTIONS.map(o => (
                  <MenuItem key={String(o.value)} value={o.value ?? 'null'}>{o.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </>
        )}
        {save.isError && <Alert severity="error">Failed to save settings</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? <CircularProgress size={16} sx={{ mr: 1 }} /> : null}Save
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ─── RestoreConfirmDialog ────────────────────────────────────────────────────

function RestoreConfirmDialog({
  snap,
  device,
  onClose,
  onSuccess,
  onError,
}: {
  snap: ConfigSnapshot
  device: Device
  onClose: () => void
  onSuccess: (message: string) => void
  onError: (message: string) => void
}) {
  const restore = useMutation({
    mutationFn: () => restoreBackup(snap.id),
    onSuccess: (data: any) => onSuccess(data?.message ?? 'Configuration restored successfully'),
    onError: (err: any) => onError(err?.response?.data?.detail ?? 'Restore failed'),
  })

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Restore Configuration?</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        <Typography>
          This will push snapshot v{snap.version} ({formatDate(snap.created_at)}) to{' '}
          <strong>{device.name}</strong>. The current config will be saved as a pre-restore backup automatically.
        </Typography>
        {device.adapter !== 'mock' && (
          <Alert severity="warning">Restore support for Zyxel devices is limited.</Alert>
        )}
        {restore.isError && (
          <Alert severity="error">
            {(restore.error as any)?.response?.data?.detail ?? 'Restore failed'}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={restore.isPending}>Cancel</Button>
        <Button variant="contained" onClick={() => restore.mutate()} disabled={restore.isPending}>
          {restore.isPending && <CircularProgress size={16} sx={{ mr: 1 }} />}
          Restore
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ─── BackupHistoryDialog ─────────────────────────────────────────────────────

function BackupHistoryDialog({
  device,
  onClose,
  onSelectForCompare,
  compareSelected,
}: {
  device: Device
  onClose: () => void
  onSelectForCompare: (snap: ConfigSnapshot) => void
  compareSelected: string[]
}) {
  const qc = useQueryClient()
  const { data: snaps = [], isLoading } = useQuery({
    queryKey: ['backups', device.id],
    queryFn: () => listBackups(device.id),
  })

  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [restoreSnap, setRestoreSnap] = useState<ConfigSnapshot | null>(null)
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success',
  })

  const handleRestoreSuccess = (message: string) => {
    setRestoreSnap(null)
    qc.invalidateQueries({ queryKey: ['backups', device.id] })
    setSnackbar({ open: true, message, severity: 'success' })
  }

  const handleRestoreError = (message: string) => {
    setSnackbar({ open: true, message, severity: 'error' })
  }

  const doDelete = useMutation({
    mutationFn: (id: string) => deleteBackup(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['backups', device.id] })
      setDeleteId(null)
    },
  })

  const handleDownload = async (snap: ConfigSnapshot) => {
    const blob = await downloadBackupBlob(snap.id)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const date = snap.created_at ? new Date(snap.created_at).toISOString().slice(0, 10) : 'unknown'
    a.href = url
    a.download = `${device.name}-config-v${snap.version}-${date}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Backup History — {device.name}</DialogTitle>
      <DialogContent sx={{ p: 0 }}>
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : snaps.length === 0 ? (
          <Typography sx={{ p: 3, color: 'text.secondary' }}>No backups yet.</Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 700, fontSize: 12, bgcolor: 'grey.50' } }}>
                <TableCell>#</TableCell>
                <TableCell>Date / Time</TableCell>
                <TableCell>Version</TableCell>
                <TableCell>Section</TableCell>
                <TableCell>Triggered By</TableCell>
                <TableCell>Size</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {snaps.map((snap, i) => (
                <TableRow key={snap.id} hover>
                  <TableCell sx={{ fontSize: 12, color: 'text.secondary' }}>{i + 1}</TableCell>
                  <TableCell sx={{ fontSize: 12 }}>{formatDate(snap.created_at)}</TableCell>
                  <TableCell sx={{ fontSize: 12 }}>v{snap.version}</TableCell>
                  <TableCell sx={{ fontSize: 12 }}>{snap.section}</TableCell>
                  <TableCell>{triggeredByChip(snap.triggered_by)}</TableCell>
                  <TableCell sx={{ fontSize: 12 }}>{snap.size?.toLocaleString() ?? '—'} chars</TableCell>
                  <TableCell align="right">
                    <Tooltip title="Download">
                      <IconButton size="small" onClick={() => handleDownload(snap)}>
                        <DownloadIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton size="small" color="error" onClick={() => setDeleteId(snap.id)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Restore">
                      <IconButton size="small" color="primary" onClick={() => setRestoreSnap(snap)}>
                        <SettingsBackupRestoreIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={compareSelected.includes(snap.id) ? 'Deselect for compare' : 'Select for compare'}>
                      <IconButton
                        size="small"
                        color={compareSelected.includes(snap.id) ? 'primary' : 'default'}
                        onClick={() => onSelectForCompare(snap)}
                      >
                        <CompareArrowsIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>

      {/* Confirm delete */}
      <Dialog open={!!deleteId} onClose={() => setDeleteId(null)} maxWidth="xs">
        <DialogTitle>Delete backup?</DialogTitle>
        <DialogContent>
          <Typography>This action cannot be undone.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => deleteId && doDelete.mutate(deleteId)}
            disabled={doDelete.isPending}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {restoreSnap && (
        <RestoreConfirmDialog
          snap={restoreSnap}
          device={device}
          onClose={() => setRestoreSnap(null)}
          onSuccess={handleRestoreSuccess}
          onError={handleRestoreError}
        />
      )}

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Dialog>
  )
}

// ─── DiffTable ───────────────────────────────────────────────────────────────

function DiffTable({
  columnLabels,
  columnIds,
  data,
}: {
  columnLabels: string[]
  columnIds: string[]
  data: Record<string, any>
}) {
  const [diffsOnly, setDiffsOnly] = useState(false)
  const rows = buildRows('full', columnIds, data)
  const visible = diffsOnly ? rows.filter(r => r.differs) : rows
  const diffCount = rows.filter(r => r.differs).length

  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            {rows.length} field{rows.length !== 1 ? 's' : ''}
          </Typography>
          {diffCount > 0
            ? <Chip size="small" label={`${diffCount} difference${diffCount !== 1 ? 's' : ''}`} color="warning" />
            : <Chip size="small" label="Identical" color="success" />
          }
        </Box>
        <FormControlLabel
          control={<Switch checked={diffsOnly} onChange={e => setDiffsOnly(e.target.checked)} size="small" />}
          label="Differences only"
          sx={{ mr: 0 }}
        />
      </Box>
      <Card>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 700, fontSize: 12, bgcolor: 'grey.50', borderBottom: 2, borderColor: 'divider' } }}>
                <TableCell sx={{ minWidth: 240, position: 'sticky', left: 0, bgcolor: 'grey.50', zIndex: 1 }}>
                  Field
                </TableCell>
                {columnLabels.map((lbl, i) => (
                  <TableCell key={i} sx={{ minWidth: 180 }}>
                    <Typography fontWeight={700} fontSize={12}>{lbl}</Typography>
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {visible.map((row, i) => (
                <TableRow key={i} sx={{
                  bgcolor: row.differs ? 'warning.50' : undefined,
                  '&:hover': { bgcolor: row.differs ? 'warning.100' : 'action.hover' },
                }}>
                  <TableCell sx={{
                    fontSize: 12, fontWeight: row.differs ? 600 : 400,
                    color: row.differs ? 'warning.dark' : 'text.primary',
                    position: 'sticky', left: 0,
                    bgcolor: row.differs ? 'warning.50' : 'background.paper',
                    zIndex: 1, borderRight: '1px solid', borderColor: 'divider',
                  }}>
                    {row.label}
                  </TableCell>
                  {row.values.map((val, j) => (
                    <TableCell key={j} sx={{ fontSize: 12, fontFamily: 'monospace' }}>
                      {val === null
                        ? <Chip size="small" label="missing" color="error" variant="outlined" sx={{ fontSize: 11 }} />
                        : val}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              {visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={columnLabels.length + 1} align="center" sx={{ py: 4, color: 'text.secondary', fontSize: 13 }}>
                    {diffsOnly ? 'No differences found — all values are identical.' : 'No data.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Box>
      </Card>
    </>
  )
}

// ─── SameDeviceCompare ────────────────────────────────────────────────────────

function SameDeviceCompare({ devices }: { devices: Device[] }) {
  const [device, setDevice] = useState<Device | null>(null)
  const [snapshotA, setSnapshotA] = useState('')
  const [snapshotB, setSnapshotB] = useState('')
  const [result, setResult] = useState<{ snapshots: ConfigSnapshot[]; data: Record<string, any> } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const { data: snaps = [] } = useQuery({
    queryKey: ['backups', device?.id],
    queryFn: () => listBackups(device!.id),
    enabled: !!device,
  })

  const handleCompare = async () => {
    if (!snapshotA || !snapshotB) return
    setLoading(true)
    setError('')
    try {
      const r = await compareBackups([snapshotA, snapshotB])
      setResult(r)
    } catch {
      setError('Failed to compare snapshots')
    } finally {
      setLoading(false)
    }
  }

  const snapA = result?.snapshots.find(s => s.id === snapshotA)
  const snapB = result?.snapshots.find(s => s.id === snapshotB)

  return (
    <Box>
      <Card sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Autocomplete
            options={devices}
            getOptionLabel={d => `${d.name} (${d.mgmt_ip})`}
            value={device}
            onChange={(_, v) => { setDevice(v); setSnapshotA(''); setSnapshotB(''); setResult(null) }}
            renderInput={params => <TextField {...params} label="Device" size="small" />}
            sx={{ minWidth: 280 }}
          />
          <FormControl size="small" sx={{ minWidth: 220 }} disabled={!device}>
            <InputLabel>Snapshot A</InputLabel>
            <Select value={snapshotA} label="Snapshot A" onChange={e => setSnapshotA(e.target.value)}>
              {snaps.map(s => (
                <MenuItem key={s.id} value={s.id}>
                  v{s.version} — {formatDate(s.created_at)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 220 }} disabled={!device}>
            <InputLabel>Snapshot B</InputLabel>
            <Select value={snapshotB} label="Snapshot B" onChange={e => setSnapshotB(e.target.value)}>
              {snaps.map(s => (
                <MenuItem key={s.id} value={s.id}>
                  v{s.version} — {formatDate(s.created_at)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            variant="contained"
            startIcon={loading ? undefined : <CompareArrowsIcon />}
            onClick={handleCompare}
            disabled={!snapshotA || !snapshotB || snapshotA === snapshotB || loading}
          >
            {loading ? <CircularProgress size={18} sx={{ mr: 1 }} /> : null}
            {loading ? 'Comparing…' : 'Compare'}
          </Button>
        </Box>
      </Card>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {result && (
        <DiffTable
          columnIds={[snapshotA, snapshotB]}
          columnLabels={[
            `v${snapA?.version ?? ''} · ${formatDate(snapA?.created_at ?? null)}`,
            `v${snapB?.version ?? ''} · ${formatDate(snapB?.created_at ?? null)}`,
          ]}
          data={result.data}
        />
      )}
    </Box>
  )
}

// ─── AcrossFirewallsCompare ───────────────────────────────────────────────────

function AcrossFirewallsCompare({ devices }: { devices: Device[] }) {
  const [rows, setRows] = useState<{ deviceId: string; snapshotId: string }[]>([
    { deviceId: '', snapshotId: '' },
    { deviceId: '', snapshotId: '' },
  ])
  const [result, setResult] = useState<{ snapshots: ConfigSnapshot[]; data: Record<string, any> } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [snapsCache, setSnapsCache] = useState<Record<string, ConfigSnapshot[]>>({})
  const loadSnaps = async (deviceId: string) => {
    if (!deviceId || snapsCache[deviceId]) return
    const data = await listBackups(deviceId)
    setSnapsCache(c => ({ ...c, [deviceId]: data }))
  }

  const updateRow = (i: number, field: 'deviceId' | 'snapshotId', value: string) => {
    setRows(prev => {
      const next = [...prev]
      next[i] = { ...next[i], [field]: value }
      if (field === 'deviceId') {
        next[i].snapshotId = ''
        loadSnaps(value)
      }
      return next
    })
    setResult(null)
  }

  const handleCompare = async () => {
    const ids = rows.map(r => r.snapshotId).filter(Boolean)
    if (ids.length < 2) return
    setLoading(true)
    setError('')
    try {
      const r = await compareBackups(ids)
      setResult(r)
    } catch {
      setError('Failed to compare snapshots')
    } finally {
      setLoading(false)
    }
  }

  const ready = rows.every(r => r.snapshotId) && rows.length >= 2

  return (
    <Box>
      <Card sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {rows.map((row, i) => (
            <Box key={i} sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              <Autocomplete
                options={devices}
                getOptionLabel={d => `${d.name} (${d.mgmt_ip})`}
                value={devices.find(d => d.id === row.deviceId) ?? null}
                onChange={(_, v) => updateRow(i, 'deviceId', v?.id ?? '')}
                renderInput={params => <TextField {...params} label={`Firewall ${i + 1}`} size="small" />}
                sx={{ minWidth: 280 }}
              />
              <FormControl size="small" sx={{ minWidth: 220 }} disabled={!row.deviceId}>
                <InputLabel>Snapshot</InputLabel>
                <Select
                  value={row.snapshotId}
                  label="Snapshot"
                  onChange={e => updateRow(i, 'snapshotId', e.target.value)}
                >
                  {(snapsCache[row.deviceId] ?? []).map(s => (
                    <MenuItem key={s.id} value={s.id}>
                      v{s.version} — {formatDate(s.created_at)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              {rows.length > 2 && (
                <IconButton size="small" color="error" onClick={() => setRows(prev => prev.filter((_, j) => j !== i))}>
                  <RemoveIcon />
                </IconButton>
              )}
            </Box>
          ))}
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button startIcon={<AddIcon />} onClick={() => setRows(prev => [...prev, { deviceId: '', snapshotId: '' }])}>
              Add firewall
            </Button>
            <Button
              variant="contained"
              startIcon={loading ? undefined : <CompareArrowsIcon />}
              onClick={handleCompare}
              disabled={!ready || loading}
            >
              {loading ? <CircularProgress size={18} sx={{ mr: 1 }} /> : null}
              {loading ? 'Comparing…' : 'Compare'}
            </Button>
          </Box>
        </Box>
      </Card>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {result && (
        <DiffTable
          columnIds={rows.map(r => r.snapshotId)}
          columnLabels={result.snapshots.map(s => `${s.device_name ?? s.device_id} · v${s.version}`)}
          data={result.data}
        />
      )}
    </Box>
  )
}

// ─── UploadRestoreDialog ─────────────────────────────────────────────────────

function UploadRestoreDialog({
  device,
  onClose,
  onSuccess,
  onError,
}: {
  device: Device
  onClose: () => void
  onSuccess: (message: string) => void
  onError: (message: string) => void
}) {
  const [parsedConfig, setParsedConfig] = useState<unknown>(null)
  const [fileName, setFileName] = useState('')
  const [fileSize, setFileSize] = useState(0)
  const [parseError, setParseError] = useState('')
  const [label, setLabel] = useState('')

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setFileSize(file.size)
    setParseError('')
    setParsedConfig(null)
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        setParsedConfig(JSON.parse(ev.target?.result as string))
      } catch {
        setParseError('Invalid JSON file. Please upload a valid backup file.')
      }
    }
    reader.readAsText(file)
  }

  const restore = useMutation({
    mutationFn: () => uploadAndRestore(device.id, parsedConfig, label || undefined),
    onSuccess: (data: any) => onSuccess(data?.message ?? 'Configuration restored successfully'),
    onError: (err: any) => onError(err?.response?.data?.detail ?? 'Restore failed'),
  })

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Upload & Restore — {device.name}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        <Box
          component="label"
          sx={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            border: '2px dashed', borderColor: 'divider', borderRadius: 1, p: 3, cursor: 'pointer',
            '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
          }}
        >
          <input type="file" accept=".json" hidden onChange={handleFile} />
          <UploadFileIcon sx={{ fontSize: 40, color: 'text.secondary', mb: 1 }} />
          {fileName ? (
            <Typography variant="body2">{fileName} ({(fileSize / 1024).toFixed(1)} KB)</Typography>
          ) : (
            <Typography variant="body2" color="text.secondary">Click to select a JSON backup file</Typography>
          )}
        </Box>
        {parseError && <Alert severity="error">{parseError}</Alert>}
        <TextField
          label="Label (optional)"
          size="small"
          value={label}
          onChange={e => setLabel(e.target.value)}
          fullWidth
        />
        <Typography variant="body2" color="text.secondary">
          Current config will be automatically backed up before restore.
        </Typography>
        {device.adapter !== 'mock' && (
          <Alert severity="warning">Restore support for Zyxel devices is limited.</Alert>
        )}
        {restore.isError && (
          <Alert severity="error">
            {(restore.error as any)?.response?.data?.detail ?? 'Restore failed'}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={restore.isPending}>Cancel</Button>
        <Button
          variant="contained"
          onClick={() => restore.mutate()}
          disabled={!parsedConfig || !!parseError || restore.isPending}
        >
          {restore.isPending && <CircularProgress size={16} sx={{ mr: 1 }} />}
          Restore
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ─── HistoryTab ───────────────────────────────────────────────────────────────

function HistoryTab({ devices }: { devices: Device[] }) {
  const qc = useQueryClient()
  const [settingsDevice, setSettingsDevice] = useState<Device | null>(null)
  const [historyDevice, setHistoryDevice] = useState<Device | null>(null)
  const [compareSelected, setCompareSelected] = useState<string[]>([])
  const [backingUp, setBackingUp] = useState<Record<string, boolean>>({})
  const [backupError, setBackupError] = useState<Record<string, string>>({})
  const [uploadDevice, setUploadDevice] = useState<Device | null>(null)
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success',
  })

  const handleBackupNow = async (device: Device) => {
    setBackingUp(b => ({ ...b, [device.id]: true }))
    setBackupError(e => ({ ...e, [device.id]: '' }))
    try {
      await triggerBackup(device.id)
      qc.invalidateQueries({ queryKey: ['backups', device.id] })
    } catch {
      setBackupError(e => ({ ...e, [device.id]: 'Backup failed' }))
    } finally {
      setBackingUp(b => ({ ...b, [device.id]: false }))
    }
  }

  const handleSelectForCompare = (snap: ConfigSnapshot) => {
    setCompareSelected(prev =>
      prev.includes(snap.id) ? prev.filter(id => id !== snap.id) : [...prev, snap.id].slice(-2)
    )
  }

  return (
    <>
      <Card>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ '& th': { fontWeight: 700, fontSize: 12, bgcolor: 'grey.50' } }}>
              <TableCell>Device</TableCell>
              <TableCell>IP Address</TableCell>
              <TableCell>Adapter</TableCell>
              <TableCell>Auto-Backup</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {devices.map(device => (
              <TableRow key={device.id} hover>
                <TableCell>
                  <Typography fontWeight={600} fontSize={13}>{device.name}</Typography>
                  {backupError[device.id] && (
                    <Typography fontSize={11} color="error">{backupError[device.id]}</Typography>
                  )}
                </TableCell>
                <TableCell sx={{ fontSize: 12 }}>{device.mgmt_ip}</TableCell>
                <TableCell sx={{ fontSize: 12 }}>{device.adapter}</TableCell>
                <TableCell>
                  <BackupStatusChip deviceId={device.id} />
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="Backup Now">
                    <IconButton
                      size="small"
                      onClick={() => handleBackupNow(device)}
                      disabled={backingUp[device.id]}
                    >
                      {backingUp[device.id] ? <CircularProgress size={16} /> : <CloudSyncIcon fontSize="small" />}
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Backup Settings">
                    <IconButton size="small" onClick={() => setSettingsDevice(device)}>
                      <SettingsIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="View History">
                    <IconButton size="small" onClick={() => setHistoryDevice(device)}>
                      <HistoryIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Upload & Restore">
                    <IconButton size="small" onClick={() => setUploadDevice(device)}>
                      <UploadFileIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {settingsDevice && (
        <BackupSettingsDialog device={settingsDevice} onClose={() => setSettingsDevice(null)} />
      )}
      {historyDevice && (
        <BackupHistoryDialog
          device={historyDevice}
          onClose={() => setHistoryDevice(null)}
          onSelectForCompare={handleSelectForCompare}
          compareSelected={compareSelected}
        />
      )}
      {uploadDevice && (
        <UploadRestoreDialog
          device={uploadDevice}
          onClose={() => setUploadDevice(null)}
          onSuccess={(message) => {
            qc.invalidateQueries({ queryKey: ['backups', uploadDevice.id] })
            setUploadDevice(null)
            setSnackbar({ open: true, message, severity: 'success' })
          }}
          onError={(message) => setSnackbar({ open: true, message, severity: 'error' })}
        />
      )}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  )
}

function BackupStatusChip({ deviceId }: { deviceId: string }) {
  const { data } = useQuery({
    queryKey: ['backup-settings', deviceId],
    queryFn: () => getBackupSettings(deviceId),
  })
  if (!data) return <Chip size="small" label="loading…" />
  return data.auto_backup_enabled
    ? <Chip size="small" label="Auto" color="success" />
    : <Chip size="small" label="Manual" color="default" />
}

// ─── CompareTab ───────────────────────────────────────────────────────────────

function CompareTab({ devices }: { devices: Device[] }) {
  const [mode, setMode] = useState<'same' | 'across'>('same')
  return (
    <Box>
      <ToggleButtonGroup
        value={mode}
        exclusive
        onChange={(_, v) => v && setMode(v)}
        size="small"
        sx={{ mb: 3 }}
      >
        <ToggleButton value="same">Same Device</ToggleButton>
        <ToggleButton value="across">Across Firewalls</ToggleButton>
      </ToggleButtonGroup>
      {mode === 'same' ? <SameDeviceCompare devices={devices} /> : <AcrossFirewallsCompare devices={devices} />}
    </Box>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Backups() {
  const [tab, setTab] = useState<'history' | 'compare'>('history')
  const { data: devices = [], isLoading } = useQuery({ queryKey: ['devices'], queryFn: listDevices })

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>Backups</Typography>

      <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
        <Button
          variant={tab === 'history' ? 'contained' : 'outlined'}
          onClick={() => setTab('history')}
          startIcon={<HistoryIcon />}
        >
          History
        </Button>
        <Button
          variant={tab === 'compare' ? 'contained' : 'outlined'}
          onClick={() => setTab('compare')}
          startIcon={<CompareArrowsIcon />}
        >
          Compare
        </Button>
      </Box>

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      ) : tab === 'history' ? (
        <HistoryTab devices={devices} />
      ) : (
        <CompareTab devices={devices} />
      )}
    </Box>
  )
}
