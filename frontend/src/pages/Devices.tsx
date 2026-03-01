import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box, Typography, Button, Chip, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, MenuItem, Snackbar, Tooltip, Card,
  Table, TableHead, TableRow, TableCell, TableBody, CircularProgress, Alert,
  Collapse, InputAdornment, Accordion, AccordionSummary, AccordionDetails,
  ToggleButton, ToggleButtonGroup, Select, FormControl, InputLabel,
} from '@mui/material'
import { DataGrid, type GridColDef } from '@mui/x-data-grid'
import AddIcon from '@mui/icons-material/Add'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import DifferenceIcon from '@mui/icons-material/Difference'
import DeleteIcon from '@mui/icons-material/Delete'
import RestoreIcon from '@mui/icons-material/Restore'
import DeleteForeverIcon from '@mui/icons-material/DeleteForever'
import WifiIcon from '@mui/icons-material/Wifi'
import SyncIcon from '@mui/icons-material/Sync'
import SettingsIcon from '@mui/icons-material/Settings'
import BugReportIcon from '@mui/icons-material/BugReport'
import EditIcon from '@mui/icons-material/Edit'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import DescriptionIcon from '@mui/icons-material/Description'
import DownloadIcon from '@mui/icons-material/Download'
import ViewListIcon from '@mui/icons-material/ViewList'
import TableRowsIcon from '@mui/icons-material/TableRows'
import SearchIcon from '@mui/icons-material/Search'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listDevices, listDeletedDevices, createDevice, updateDevice, deleteDevice, restoreDevice, permanentDeleteDevice, testConnection, syncDevice, getDeviceConfig } from '../api/devices'
import { listGroups } from '../api/groups'
import { api } from '../api/client'
import type { Device } from '../types'
import { useFilterStore } from '../store/filters'
import { useSettingsStore } from '../store/settings'
import { useColumnWidthsStore } from '../store/columnWidths'
import ConfirmDialog from '../components/ConfirmDialog'

function sectionLabel(key: string) {
  return key.replace(/^_/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function isFlat(obj: any): boolean {
  return obj !== null && typeof obj === 'object' &&
    Object.values(obj).every(v => !Array.isArray(v) && (typeof v !== 'object' || v === null))
}

function ConfigSections({ data }: { data: Record<string, any> }) {
  return (
    <Box sx={{ mt: 1 }}>
      {Object.entries(data).map(([key, value]) => {
        const label = sectionLabel(key)
        const isEmpty = value === null || value === undefined ||
          (Array.isArray(value) && value.length === 0) ||
          (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0)

        let content: ReactNode
        if (isEmpty) {
          content = <Chip label="No data" size="small" variant="outlined" sx={{ color: 'text.disabled' }} />
        } else if (Array.isArray(value)) {
          const flatItems = value.every(item => isFlat(item))
          if (flatItems && value.length > 0 && typeof value[0] === 'object') {
            const cols = Object.keys(value[0])
            content = (
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ '& th': { fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' } }}>
                      {cols.map(c => <TableCell key={c}>{sectionLabel(c)}</TableCell>)}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {value.map((row, i) => (
                      <TableRow key={i}>
                        {cols.map(c => (
                          <TableCell key={c} sx={{ fontSize: 12, fontFamily: typeof row[c] === 'number' ? 'monospace' : undefined }}>
                            {row[c] === null || row[c] === undefined ? '—' : String(row[c])}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            )
          } else {
            content = (
              <Box component="pre" sx={{ fontSize: 12, fontFamily: 'monospace', whiteSpace: 'pre-wrap', m: 0, overflowX: 'auto' }}>
                {JSON.stringify(value, null, 2)}
              </Box>
            )
          }
        } else if (typeof value === 'object') {
          content = (
            <Table size="small">
              <TableBody>
                {Object.entries(value).map(([k, v]) => (
                  <TableRow key={k}>
                    <TableCell sx={{ fontWeight: 600, fontSize: 12, width: 200, whiteSpace: 'nowrap' }}>{sectionLabel(k)}</TableCell>
                    <TableCell sx={{ fontSize: 12, fontFamily: 'monospace' }}>
                      {v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )
        } else {
          content = <Typography sx={{ fontSize: 13, fontFamily: 'monospace' }}>{String(value)}</Typography>
        }

        return (
          <Accordion key={key} disableGutters elevation={0} sx={{ border: '1px solid', borderColor: 'divider', mb: 1, '&:before': { display: 'none' } }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography fontWeight={600} fontSize={14}>{label}</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0 }}>
              {content}
            </AccordionDetails>
          </Accordion>
        )
      })}
    </Box>
  )
}

function flattenConfig(data: Record<string, any>): { section: string; key: string; value: string }[] {
  const rows: { section: string; key: string; value: string }[] = []
  for (const [section, value] of Object.entries(data)) {
    const sec = sectionLabel(section)
    if (value === null || value === undefined) {
      rows.push({ section: sec, key: '—', value: '—' })
    } else if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item !== null && typeof item === 'object') {
          for (const [k, v] of Object.entries(item)) {
            rows.push({ section: sec, key: sectionLabel(k), value: v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v) })
          }
        } else {
          rows.push({ section: sec, key: '—', value: String(item) })
        }
      })
    } else if (typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        rows.push({ section: sec, key: sectionLabel(k), value: v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v) })
      }
    } else {
      rows.push({ section: sec, key: sec, value: String(value) })
    }
  }
  return rows
}

function ConfigTable({ data }: { data: Record<string, any> }) {
  const rows = flattenConfig(data)
  return (
    <Box sx={{ overflowX: 'auto', mt: 1 }}>
      <Table size="small">
        <TableHead>
          <TableRow sx={{ '& th': { fontWeight: 600, fontSize: 12 } }}>
            <TableCell width={160}>Section</TableCell>
            <TableCell width={200}>Key</TableCell>
            <TableCell>Value</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={i} sx={{ '&:hover': { bgcolor: 'action.hover' } }}>
              <TableCell sx={{ fontSize: 12, color: 'text.secondary', whiteSpace: 'nowrap' }}>{row.section}</TableCell>
              <TableCell sx={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' }}>{row.key}</TableCell>
              <TableCell sx={{ fontSize: 12, fontFamily: 'monospace', wordBreak: 'break-all' }}>{row.value}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  )
}

const LABEL_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280']

const defaultForm = {
  name: '', model: 'USG FLEX 100', mgmt_ip: '', port: 443,
  protocol: 'https', adapter: 'mock', username: 'admin', password: '', tags: '',
  notes: '', label_color: '',
}

export default function Devices() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: devices = [], isLoading } = useQuery({
    queryKey: ['devices'],
    queryFn: listDevices,
    refetchInterval: 30_000,
  })
  const { data: groups = [] } = useQuery({ queryKey: ['groups'], queryFn: listGroups })

  const {
    deviceSearch, deviceStatus, deviceGroupId,
    setDeviceSearch, setDeviceStatus, setDeviceGroupId, resetDeviceFilters,
  } = useFilterStore()
  const { testConnectionTimeout } = useSettingsStore()
  const { widths: savedWidths, setWidth } = useColumnWidthsStore()
  const colWidths = savedWidths['devices'] ?? {}

  const [open, setOpen] = useState(false)
  const [snack, setSnack] = useState('')
  const [form, setForm] = useState(defaultForm)
  const [showPwd, setShowPwd] = useState(false)
  const [showEditPwd, setShowEditPwd] = useState(false)
  const [editDevice, setEditDevice] = useState<Device | null>(null)
  const [editForm, setEditForm] = useState(defaultForm)
  const [diagDevice, setDiagDevice] = useState<Device | null>(null)
  const [diagSteps, setDiagSteps] = useState<any[]>([])
  const [showLoginAttempts, setShowLoginAttempts] = useState(false)
  const [configDevice, setConfigDevice] = useState<Device | null>(null)
  const [configData, setConfigData] = useState<Record<string, any> | null>(null)
  const [configLoading, setConfigLoading] = useState(false)
  const [configError, setConfigError] = useState('')
  const [configView, setConfigView] = useState<'accordion' | 'table'>('accordion')
  const [deleteDeviceId, setDeleteDeviceId] = useState<string | null>(null)
  const [csvImportOpen, setCsvImportOpen] = useState(false)
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [csvResult, setCsvResult] = useState<{ created: number; errors: { row: number; error: string }[] } | null>(null)
  const [csvLoading, setCsvLoading] = useState(false)
  const [showDeleted, setShowDeleted] = useState(false)
  const [permanentDeleteId, setPermanentDeleteId] = useState<string | null>(null)

  const { data: deletedDevices = [] } = useQuery({
    queryKey: ['devices-deleted'],
    queryFn: listDeletedDevices,
    enabled: showDeleted,
    refetchInterval: showDeleted ? 30_000 : false,
  })

  const restoreMut = useMutation({
    mutationFn: (id: string) => restoreDevice(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['devices'] })
      qc.invalidateQueries({ queryKey: ['devices-deleted'] })
      setSnack('Device restored')
    },
    onError: () => setSnack('Failed to restore device'),
  })

  const permanentDeleteMut = useMutation({
    mutationFn: (id: string) => permanentDeleteDevice(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['devices-deleted'] })
      setPermanentDeleteId(null)
      setSnack('Device permanently deleted')
    },
    onError: () => setSnack('Failed to permanently delete device'),
  })

  // Derived filtered devices
  const filteredDevices = devices.filter((d) => {
    if (deviceSearch && !d.name.toLowerCase().includes(deviceSearch.toLowerCase()) &&
        !d.mgmt_ip.includes(deviceSearch)) return false
    if (deviceStatus !== 'all' && d.status !== deviceStatus) return false
    if (deviceGroupId && !d.group_ids?.includes(deviceGroupId)) return false
    return true
  })

  const ef = (k: string, v: unknown) => setEditForm((p) => ({ ...p, [k]: v }))

  const openEdit = (device: Device) => {
    setEditDevice(device)
    setEditForm({
      name: device.name,
      model: device.model,
      mgmt_ip: device.mgmt_ip,
      port: device.port,
      protocol: device.protocol,
      adapter: device.adapter,
      username: '',   // never pre-fill credentials
      password: '',
      tags: (device.tags as string[]).join(', '),
      notes: device.notes ?? '',
      label_color: device.label_color ?? '',
    })
  }

  const updateMut = useMutation({
    mutationFn: () => updateDevice(editDevice!.id, {
      ...editForm,
      port: Number(editForm.port),
      tags: editForm.tags.split(',').map((t) => t.trim()).filter(Boolean),
      notes: editForm.notes || null,
      label_color: editForm.label_color || null,
      // only send credentials if user typed something
      ...(editForm.username ? { username: editForm.username } : {}),
      ...(editForm.password ? { password: editForm.password } : {}),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['devices'] })
      setEditDevice(null)
      setSnack('Device updated')
    },
    onError: () => setSnack('Failed to update device'),
  })

  const diagMut = useMutation({
    mutationFn: (id: string) => api.post(`/devices/${id}/diagnostics`).then(r => r.data),
    onSuccess: (data) => setDiagSteps(data.steps ?? []),
  })

  const openConfig = async (device: Device) => {
    setConfigDevice(device)
    setConfigData(null)
    setConfigError('')
    setConfigLoading(true)
    try {
      const data = await getDeviceConfig(device.id)
      setConfigData(data)
    } catch (e: any) {
      setConfigError(e?.message || 'Failed to fetch config')
    } finally {
      setConfigLoading(false)
    }
  }

  const downloadConfig = () => {
    if (!configData || !configDevice) return
    const blob = new Blob([JSON.stringify(configData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${configDevice.name}-config-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const f = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }))

  const createMut = useMutation({
    mutationFn: () => createDevice({
      ...form, port: Number(form.port),
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
      notes: form.notes || null,
      label_color: form.label_color || null,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['devices'] }); setOpen(false); setForm(defaultForm); setSnack('Device created') },
    onError: () => setSnack('Failed to create device'),
  })
  const deleteMut = useMutation({
    mutationFn: () => deleteDevice(deleteDeviceId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['devices'] })
      setDeleteDeviceId(null)
      setSnack('Device deleted')
    },
  })
  const testMut = useMutation({
    mutationFn: (id: string) => testConnection(id, testConnectionTimeout),
    onSuccess: (d) => { qc.invalidateQueries({ queryKey: ['devices'] }); setSnack((d as any).message ?? 'Done') },
    onError: (e: any) => setSnack(e?.response?.data?.detail ?? 'Connection test failed'),
  })
  const syncMut = useMutation({
    mutationFn: syncDevice,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['devices'] }); setSnack('Config synced') },
    onError: (e: any) => setSnack(e?.response?.data?.detail ?? 'Sync failed'),
  })

  // Apply any saved column widths (drops flex when a saved width exists)
  const applyWidth = (col: GridColDef<Device>): GridColDef<Device> => {
    const saved = colWidths[col.field]
    if (saved === undefined) return col
    const { flex, ...rest } = col as any
    return { ...rest, width: saved }
  }

  const columns: GridColDef<Device>[] = [
    applyWidth({
      field: 'name', headerName: 'Name', flex: 1, minWidth: 140,
      renderCell: (p) => {
        const credsAge = p.row.credentials_updated_at
          ? Math.floor((Date.now() - new Date(p.row.credentials_updated_at).getTime()) / 86_400_000)
          : null
        const credWarn = credsAge !== null && credsAge > 90
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, width: '100%' }}>
            {p.row.label_color && (
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: p.row.label_color, flexShrink: 0 }} />
            )}
            <Typography variant="body2" noWrap>{p.value as string}</Typography>
            {credWarn && (
              <Tooltip title={`Credentials last updated ${credsAge}d ago — consider rotating`}>
                <Chip size="small" label="Creds" color="warning" sx={{ fontSize: 10, height: 18 }} />
              </Tooltip>
            )}
          </Box>
        )
      },
    }),
    applyWidth({ field: 'model', headerName: 'Model', width: 130 }),
    applyWidth({ field: 'mgmt_ip', headerName: 'IP / FQDN', width: 140 }),
    applyWidth({ field: 'adapter', headerName: 'Adapter', width: 90 }),
    applyWidth({
      field: 'tags', headerName: 'Tags', width: 160,
      renderCell: (p) => (
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
          {(p.value as string[])?.map((t: string) => <Chip key={t} label={t} size="small" />)}
        </Box>
      ),
    }),
    applyWidth({
      field: 'status', headerName: 'Status', width: 170,
      renderCell: (p) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{
            width: 8, height: 8, borderRadius: '50%',
            bgcolor: p.value === 'online' ? 'success.main' : p.value === 'offline' ? 'error.main' : 'grey.400',
            '@keyframes pulse': {
              '0%': { opacity: 1 },
              '50%': { opacity: 0.35 },
              '100%': { opacity: 1 },
            },
            ...(p.value === 'online' ? { animation: 'pulse 2s ease-in-out infinite' } : {}),
          }} />
          <Chip size="small" label={p.value}
            color={p.value === 'online' ? 'success' : p.value === 'offline' ? 'error' : 'default'} />
          {p.row.drift_detected && (
            <Tooltip title={`Config drift detected${p.row.drift_detected_at ? ` at ${new Date(p.row.drift_detected_at).toLocaleString()}` : ''}`}>
              <Chip
                size="small"
                icon={<DifferenceIcon fontSize="small" />}
                label="Drift"
                sx={{ bgcolor: 'orange', color: 'white', '& .MuiChip-icon': { color: 'white' } }}
              />
            </Tooltip>
          )}
        </Box>
      ),
    }),
    applyWidth({
      field: 'firmware_version', headerName: 'Firmware', width: 130,
      valueGetter: (v) => v ?? '—',
    }),
    applyWidth({
      field: 'actions', headerName: '', width: 196, sortable: false,
      renderCell: (p) => (
        <Box>
          <Tooltip title="Configure">
            <IconButton size="small" onClick={() => navigate(`/devices/${p.row.id}/config`)}><SettingsIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title="Edit">
            <IconButton size="small" onClick={() => openEdit(p.row)}><EditIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title="Test connection">
            <IconButton size="small"
              onClick={() => testMut.mutate(p.row.id)}
              disabled={testMut.isPending && testMut.variables === p.row.id}>
              {testMut.isPending && testMut.variables === p.row.id
                ? <CircularProgress size={14} />
                : <WifiIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
          <Tooltip title="Sync config">
            <IconButton size="small"
              onClick={() => syncMut.mutate(p.row.id)}
              disabled={syncMut.isPending && syncMut.variables === p.row.id}>
              {syncMut.isPending && syncMut.variables === p.row.id
                ? <CircularProgress size={14} />
                : <SyncIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
          <Tooltip title="Diagnostics">
            <IconButton size="small" onClick={() => { setDiagDevice(p.row); setDiagSteps([]); diagMut.mutate(p.row.id) }}><BugReportIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title="View Config">
            <IconButton size="small" onClick={() => openConfig(p.row)}><DescriptionIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton size="small" color="error" onClick={() => setDeleteDeviceId(p.row.id)}><DeleteIcon fontSize="small" /></IconButton>
          </Tooltip>
        </Box>
      ),
    }),
  ]

  const hasFilters = deviceSearch || deviceStatus !== 'all' || deviceGroupId

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>Devices</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => { setCsvFile(null); setCsvResult(null); setCsvImportOpen(true) }}>
            Import CSV
          </Button>
          <Button variant="outlined" color="warning" startIcon={<DeleteIcon />} onClick={() => setShowDeleted(true)}>
            Deleted Devices
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>Add Device</Button>
        </Box>
      </Box>

      {/* Filter toolbar */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          size="small"
          placeholder="Search name or IP…"
          value={deviceSearch}
          onChange={(e) => setDeviceSearch(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
          sx={{ minWidth: 220 }}
        />
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Status</InputLabel>
          <Select
            value={deviceStatus}
            label="Status"
            onChange={(e) => setDeviceStatus(e.target.value as any)}
          >
            <MenuItem value="all">All statuses</MenuItem>
            <MenuItem value="online">Online</MenuItem>
            <MenuItem value="offline">Offline</MenuItem>
            <MenuItem value="unknown">Unknown</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Group</InputLabel>
          <Select
            value={deviceGroupId}
            label="Group"
            onChange={(e) => setDeviceGroupId(e.target.value)}
          >
            <MenuItem value="">All groups</MenuItem>
            {groups.map((g) => (
              <MenuItem key={g.id} value={g.id}>{g.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
        {hasFilters && (
          <Button size="small" onClick={resetDeviceFilters}>Clear Filters</Button>
        )}
        {hasFilters && (
          <Typography variant="body2" color="text.secondary">
            {filteredDevices.length} of {devices.length} devices
          </Typography>
        )}
      </Box>

      <Card>
        <DataGrid rows={filteredDevices} columns={columns} loading={isLoading} autoHeight
          getRowId={(r) => r.id} pageSizeOptions={[25, 50]} sx={{ border: 0 }}
          onColumnWidthChange={(params) => setWidth('devices', params.colDef.field, params.width)} />
      </Card>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Device</DialogTitle>
        <DialogContent>
          {(['name', 'model', 'mgmt_ip'] as const).map((k) => (
            <TextField key={k} label={k.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
              fullWidth margin="dense" value={form[k]} onChange={(e) => f(k, e.target.value)} />
          ))}
          <TextField label="Port" type="number" fullWidth margin="dense" value={form.port}
            onChange={(e) => f('port', e.target.value)} />
          <TextField select label="Protocol" fullWidth margin="dense" value={form.protocol}
            onChange={(e) => f('protocol', e.target.value)}>
            <MenuItem value="https">HTTPS</MenuItem>
            <MenuItem value="ssh">SSH</MenuItem>
          </TextField>
          <TextField select label="Adapter" fullWidth margin="dense" value={form.adapter}
            onChange={(e) => f('adapter', e.target.value)}>
            <MenuItem value="mock">Mock (no real device)</MenuItem>
            <MenuItem value="zyxel">Zyxel (real device)</MenuItem>
          </TextField>
          <TextField label="Username" fullWidth margin="dense" value={form.username}
            onChange={(e) => f('username', e.target.value)} />
          <TextField label="Password" type={showPwd ? 'text' : 'password'} fullWidth margin="dense"
            value={form.password} onChange={(e) => f('password', e.target.value)}
            InputProps={{ endAdornment: (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setShowPwd(v => !v)} edge="end">
                  {showPwd ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                </IconButton>
              </InputAdornment>
            )}} />
          <TextField label="Tags (comma-separated)" fullWidth margin="dense" value={form.tags}
            onChange={(e) => f('tags', e.target.value)} helperText="e.g. prod, branch, hq" />
          <TextField label="Notes" fullWidth margin="dense" multiline rows={2} value={form.notes}
            onChange={(e) => f('notes', e.target.value)} helperText="Optional internal notes" />
          <Box sx={{ mt: 1, mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
              Label Color
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Box
                onClick={() => f('label_color', '')}
                sx={{
                  width: 24, height: 24, borderRadius: '50%', cursor: 'pointer',
                  bgcolor: 'grey.300', border: !form.label_color ? '3px solid' : '2px solid transparent',
                  borderColor: !form.label_color ? 'primary.main' : 'transparent',
                }}
              />
              {LABEL_COLORS.map((c) => (
                <Box key={c} onClick={() => f('label_color', c)} sx={{
                  width: 24, height: 24, borderRadius: '50%', cursor: 'pointer', bgcolor: c,
                  border: form.label_color === c ? '3px solid' : '2px solid transparent',
                  borderColor: form.label_color === c ? 'primary.main' : 'transparent',
                }} />
              ))}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => createMut.mutate()} disabled={createMut.isPending}>
            {createMut.isPending ? 'Creating…' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Edit device dialog ── */}
      <Dialog open={!!editDevice} onClose={() => setEditDevice(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Device — {editDevice?.name}</DialogTitle>
        <DialogContent>
          <TextField label="Name" fullWidth margin="dense" value={editForm.name} onChange={(e) => ef('name', e.target.value)} />
          <TextField label="Model" fullWidth margin="dense" value={editForm.model} onChange={(e) => ef('model', e.target.value)} />
          <TextField label="Management IP / FQDN" fullWidth margin="dense" value={editForm.mgmt_ip} onChange={(e) => ef('mgmt_ip', e.target.value)} />
          <TextField label="Port" type="number" fullWidth margin="dense" value={editForm.port} onChange={(e) => ef('port', e.target.value)} />
          <TextField select label="Protocol" fullWidth margin="dense" value={editForm.protocol} onChange={(e) => ef('protocol', e.target.value)}>
            <MenuItem value="https">HTTPS</MenuItem>
            <MenuItem value="ssh">SSH</MenuItem>
          </TextField>
          <TextField select label="Adapter" fullWidth margin="dense" value={editForm.adapter} onChange={(e) => ef('adapter', e.target.value)}>
            <MenuItem value="mock">Mock (no real device)</MenuItem>
            <MenuItem value="zyxel">Zyxel (real device)</MenuItem>
          </TextField>
          <TextField label="Username (leave blank to keep current)" fullWidth margin="dense"
            value={editForm.username} onChange={(e) => ef('username', e.target.value)} />
          <TextField label="Password (leave blank to keep current)" type={showEditPwd ? 'text' : 'password'}
            fullWidth margin="dense" value={editForm.password} onChange={(e) => ef('password', e.target.value)}
            InputProps={{ endAdornment: (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setShowEditPwd(v => !v)} edge="end">
                  {showEditPwd ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                </IconButton>
              </InputAdornment>
            )}} />
          <TextField label="Tags (comma-separated)" fullWidth margin="dense" value={editForm.tags}
            onChange={(e) => ef('tags', e.target.value)} helperText="e.g. prod, branch, hq" />
          <TextField label="Notes" fullWidth margin="dense" multiline rows={2} value={editForm.notes}
            onChange={(e) => ef('notes', e.target.value)} helperText="Optional internal notes" />
          <Box sx={{ mt: 1, mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
              Label Color
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Box
                onClick={() => ef('label_color', '')}
                sx={{
                  width: 24, height: 24, borderRadius: '50%', cursor: 'pointer',
                  bgcolor: 'grey.300', border: !editForm.label_color ? '3px solid' : '2px solid transparent',
                  borderColor: !editForm.label_color ? 'primary.main' : 'transparent',
                }}
              />
              {LABEL_COLORS.map((c) => (
                <Box key={c} onClick={() => ef('label_color', c)} sx={{
                  width: 24, height: 24, borderRadius: '50%', cursor: 'pointer', bgcolor: c,
                  border: editForm.label_color === c ? '3px solid' : '2px solid transparent',
                  borderColor: editForm.label_color === c ? 'primary.main' : 'transparent',
                }} />
              ))}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDevice(null)}>Cancel</Button>
          <Button variant="contained" onClick={() => updateMut.mutate()} disabled={updateMut.isPending}>
            {updateMut.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Diagnostics dialog ── */}
      <Dialog open={!!diagDevice} onClose={() => setDiagDevice(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Diagnostics — {diagDevice?.name}</DialogTitle>
        <DialogContent>
          {diagMut.isPending && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 2 }}>
              <CircularProgress size={20} /><Typography>Running tests…</Typography>
            </Box>
          )}
          {diagSteps.length > 0 && (
            <>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ '& th': { fontWeight: 600 } }}>
                    <TableCell>Step</TableCell>
                    <TableCell>Result</TableCell>
                    <TableCell>Detail</TableCell>
                    <TableCell>Latency</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {diagSteps.map((s) => (
                    <TableRow key={s.step}>
                      <TableCell>{s.step}</TableCell>
                      <TableCell>
                        {s.ok
                          ? <CheckCircleIcon color="success" fontSize="small" />
                          : <ErrorIcon color="error" fontSize="small" />}
                      </TableCell>
                      <TableCell sx={{ fontSize: 11, wordBreak: 'break-all' }}>{s.detail}</TableCell>
                      <TableCell>{s.latency_ms != null ? `${s.latency_ms} ms` : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Login attempts detail */}
              {diagSteps.find(s => s.step === 'Login')?.login_attempts?.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Button size="small" startIcon={showLoginAttempts ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    onClick={() => setShowLoginAttempts(v => !v)}>
                    {showLoginAttempts ? 'Hide' : 'Show'} login attempts ({diagSteps.find(s => s.step === 'Login').login_attempts.length})
                  </Button>
                  <Collapse in={showLoginAttempts}>
                    <Table size="small" sx={{ mt: 1 }}>
                      <TableHead>
                        <TableRow sx={{ '& th': { fontWeight: 600, fontSize: 11 } }}>
                          <TableCell>#</TableCell>
                          <TableCell>Method</TableCell>
                          <TableCell>URL</TableCell>
                          <TableCell>Body</TableCell>
                          <TableCell>HTTP</TableCell>
                          <TableCell>Location</TableCell>
                          <TableCell>Cookies</TableCell>
                          <TableCell>Result</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {diagSteps.find(s => s.step === 'Login').login_attempts.map((a: any, i: number) => (
                          <TableRow key={i}>
                            <TableCell sx={{ fontSize: 11 }}>{i + 1}</TableCell>
                            <TableCell sx={{ fontSize: 11 }}>{a.method}</TableCell>
                            <TableCell sx={{ fontSize: 11, wordBreak: 'break-all' }}>{a.url}</TableCell>
                            <TableCell sx={{ fontSize: 10, fontFamily: 'monospace', whiteSpace: 'pre' }}>
                              {JSON.stringify(a.body, null, 2)}
                            </TableCell>
                            <TableCell sx={{ fontSize: 11 }}>{a.http_status ?? '—'}</TableCell>
                            <TableCell sx={{ fontSize: 11 }}>{a.location ?? '—'}</TableCell>
                            <TableCell sx={{ fontSize: 11 }}>{(a.cookies_set ?? []).join(', ') || '—'}</TableCell>
                            <TableCell>
                              {a.success
                                ? <CheckCircleIcon color="success" fontSize="small" />
                                : <ErrorIcon color="error" fontSize="small" />}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Collapse>
                </Box>
              )}
            </>
          )}
          {diagMut.isError && (
            <Alert severity="error" sx={{ mt: 1 }}>
              {(diagMut.error as any)?.response?.data?.detail ?? 'Request failed'}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setDiagSteps([]); diagMut.mutate(diagDevice!.id) }}
            disabled={diagMut.isPending}>Re-run</Button>
          <Button onClick={() => setDiagDevice(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* ── Config Review dialog ── */}
      <Dialog open={!!configDevice} onClose={() => setConfigDevice(null)} maxWidth="lg" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Config — {configDevice?.name}
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <ToggleButtonGroup size="small" exclusive value={configView} onChange={(_, v) => v && setConfigView(v)}>
              <ToggleButton value="accordion"><Tooltip title="Accordion"><ViewListIcon fontSize="small" /></Tooltip></ToggleButton>
              <ToggleButton value="table"><Tooltip title="Table"><TableRowsIcon fontSize="small" /></Tooltip></ToggleButton>
            </ToggleButtonGroup>
            <Button startIcon={<SyncIcon />} onClick={() => openConfig(configDevice!)} disabled={configLoading} size="small">
              Refresh
            </Button>
            <Button startIcon={<DownloadIcon />} onClick={downloadConfig} disabled={!configData} size="small" variant="outlined">
              Download JSON
            </Button>
          </Box>
        </DialogTitle>
        <DialogContent>
          {configLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          )}
          {configError && <Alert severity="error">{configError}</Alert>}
          {configData && configView === 'accordion' && <ConfigSections data={configData} />}
          {configData && configView === 'table' && <ConfigTable data={configData} />}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfigDevice(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* ── Delete confirm ── */}
      <ConfirmDialog
        open={!!deleteDeviceId}
        title="Delete Device"
        message="Are you sure you want to delete this device? All associated config snapshots will also be removed."
        onConfirm={() => deleteMut.mutate()}
        onClose={() => setDeleteDeviceId(null)}
        loading={deleteMut.isPending}
      />

      {/* ── CSV Import dialog ── */}
      <Dialog open={csvImportOpen} onClose={() => setCsvImportOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Import Devices from CSV</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Upload a CSV file with columns: <code>name, mgmt_ip, model, adapter, port, protocol, username, password</code>.
            Only <code>name</code> and <code>mgmt_ip</code> are required.
          </Typography>
          <Button variant="outlined" component="label" startIcon={<UploadFileIcon />}>
            {csvFile ? csvFile.name : 'Choose CSV file'}
            <input
              type="file"
              accept=".csv"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null
                setCsvFile(f)
                setCsvResult(null)
              }}
            />
          </Button>
          {csvResult && (
            <Box sx={{ mt: 2 }}>
              <Alert severity={csvResult.errors.length === 0 ? 'success' : 'warning'}>
                Created {csvResult.created} device{csvResult.created !== 1 ? 's' : ''}.
                {csvResult.errors.length > 0 && ` ${csvResult.errors.length} row(s) failed.`}
              </Alert>
              {csvResult.errors.length > 0 && (
                <Box component="ul" sx={{ mt: 1, fontSize: 13 }}>
                  {csvResult.errors.map((e) => (
                    <li key={e.row}>Row {e.row}: {e.error}</li>
                  ))}
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCsvImportOpen(false)}>
            {csvResult ? 'Close' : 'Cancel'}
          </Button>
          {!csvResult && (
            <Button
              variant="contained"
              disabled={!csvFile || csvLoading}
              onClick={async () => {
                if (!csvFile) return
                setCsvLoading(true)
                try {
                  const formData = new FormData()
                  formData.append('file', csvFile)
                  const resp = await api.post('/devices/import', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                  })
                  setCsvResult(resp.data)
                  qc.invalidateQueries({ queryKey: ['devices'] })
                } catch (e: any) {
                  setSnack(e?.response?.data?.detail ?? 'Import failed')
                } finally {
                  setCsvLoading(false)
                }
              }}
            >
              {csvLoading ? <CircularProgress size={18} /> : 'Import'}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Deleted Devices Dialog */}
      <Dialog open={showDeleted} onClose={() => setShowDeleted(false)} maxWidth="md" fullWidth>
        <DialogTitle>Deleted Devices</DialogTitle>
        <DialogContent>
          {deletedDevices.length === 0 ? (
            <Alert severity="info">No deleted devices.</Alert>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 600 } }}>
                  <TableCell>Name</TableCell>
                  <TableCell>IP</TableCell>
                  <TableCell>Model</TableCell>
                  <TableCell>Deleted</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {deletedDevices.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>{d.name}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace' }}>{d.mgmt_ip}</TableCell>
                    <TableCell>{d.model}</TableCell>
                    <TableCell>{d.deleted_at ? new Date(d.deleted_at).toLocaleString() : '—'}</TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                        <Tooltip title="Restore">
                          <IconButton size="small" color="success"
                            onClick={() => restoreMut.mutate(d.id)}
                            disabled={restoreMut.isPending}>
                            <RestoreIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Permanently Delete">
                          <IconButton size="small" color="error"
                            onClick={() => setPermanentDeleteId(d.id)}>
                            <DeleteForeverIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDeleted(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Confirm permanent delete */}
      <ConfirmDialog
        open={!!permanentDeleteId}
        title="Permanently Delete Device"
        message="This will permanently delete the device and all its data (snapshots, metrics, etc.). This cannot be undone."
        confirmLabel="Delete Forever"
        confirmColor="error"
        onConfirm={() => permanentDeleteMut.mutate(permanentDeleteId!)}
        onClose={() => setPermanentDeleteId(null)}
        loading={permanentDeleteMut.isPending}
      />

      <Snackbar open={!!snack} autoHideDuration={3000} onClose={() => setSnack('')}
        message={snack} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </Box>
  )
}
