import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box, Typography, Button, Chip, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, MenuItem, Snackbar, Tooltip, Card,
  Table, TableHead, TableRow, TableCell, TableBody, CircularProgress, Alert,
  Collapse, InputAdornment, Accordion, AccordionSummary, AccordionDetails,
} from '@mui/material'
import { DataGrid, type GridColDef } from '@mui/x-data-grid'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
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
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listDevices, createDevice, updateDevice, deleteDevice, testConnection, syncDevice, getDeviceConfig } from '../api/devices'
import { api } from '../api/client'
import type { Device } from '../types'

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

const defaultForm = {
  name: '', model: 'USG FLEX 100', mgmt_ip: '', port: 443,
  protocol: 'https', adapter: 'mock', username: 'admin', password: '', tags: '',
}

export default function Devices() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: devices = [], isLoading } = useQuery({ queryKey: ['devices'], queryFn: listDevices })
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
    })
  }

  const updateMut = useMutation({
    mutationFn: () => updateDevice(editDevice!.id, {
      ...editForm,
      port: Number(editForm.port),
      tags: editForm.tags.split(',').map((t) => t.trim()).filter(Boolean),
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
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['devices'] }); setOpen(false); setForm(defaultForm); setSnack('Device created') },
    onError: () => setSnack('Failed to create device'),
  })
  const deleteMut = useMutation({
    mutationFn: deleteDevice,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['devices'] }); setSnack('Device deleted') },
  })
  const testMut = useMutation({
    mutationFn: testConnection,
    onSuccess: (d) => { qc.invalidateQueries({ queryKey: ['devices'] }); setSnack((d as any).message) },
  })
  const syncMut = useMutation({
    mutationFn: syncDevice,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['devices'] }); setSnack('Config synced') },
  })

  const columns: GridColDef<Device>[] = [
    { field: 'name', headerName: 'Name', flex: 1, minWidth: 140 },
    { field: 'model', headerName: 'Model', width: 130 },
    { field: 'mgmt_ip', headerName: 'IP / FQDN', width: 140 },
    { field: 'adapter', headerName: 'Adapter', width: 90 },
    {
      field: 'tags', headerName: 'Tags', width: 160,
      renderCell: (p) => (
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
          {(p.value as string[])?.map((t: string) => <Chip key={t} label={t} size="small" />)}
        </Box>
      ),
    },
    {
      field: 'status', headerName: 'Status', width: 100,
      renderCell: (p) => (
        <Chip size="small" label={p.value}
          color={p.value === 'online' ? 'success' : p.value === 'offline' ? 'error' : 'default'} />
      ),
    },
    { field: 'firmware_version', headerName: 'Firmware', width: 130 },
    {
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
            <IconButton size="small" onClick={() => testMut.mutate(p.row.id)}><WifiIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title="Sync config">
            <IconButton size="small" onClick={() => syncMut.mutate(p.row.id)}><SyncIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title="Diagnostics">
            <IconButton size="small" onClick={() => { setDiagDevice(p.row); setDiagSteps([]); diagMut.mutate(p.row.id) }}><BugReportIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title="View Config">
            <IconButton size="small" onClick={() => openConfig(p.row)}><DescriptionIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton size="small" color="error" onClick={() => deleteMut.mutate(p.row.id)}><DeleteIcon fontSize="small" /></IconButton>
          </Tooltip>
        </Box>
      ),
    },
  ]

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>Devices</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>Add Device</Button>
      </Box>
      <Card>
        <DataGrid rows={devices} columns={columns} loading={isLoading} autoHeight
          getRowId={(r) => r.id} pageSizeOptions={[25, 50]} sx={{ border: 0 }} />
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
          <Box sx={{ display: 'flex', gap: 1 }}>
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
          {configData && <ConfigSections data={configData} />}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfigDevice(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!snack} autoHideDuration={3000} onClose={() => setSnack('')}
        message={snack} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </Box>
  )
}
