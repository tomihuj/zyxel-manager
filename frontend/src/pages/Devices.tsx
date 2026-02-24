import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box, Typography, Button, Chip, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, MenuItem, Snackbar, Tooltip, Card,
} from '@mui/material'
import { DataGrid, type GridColDef } from '@mui/x-data-grid'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import WifiIcon from '@mui/icons-material/Wifi'
import SyncIcon from '@mui/icons-material/Sync'
import SettingsIcon from '@mui/icons-material/Settings'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listDevices, createDevice, deleteDevice, testConnection, syncDevice } from '../api/devices'
import type { Device } from '../types'

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
      field: 'actions', headerName: '', width: 160, sortable: false,
      renderCell: (p) => (
        <Box>
          <Tooltip title="Configure">
            <IconButton size="small" onClick={() => navigate(`/devices/${p.row.id}/config`)}><SettingsIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title="Test connection">
            <IconButton size="small" onClick={() => testMut.mutate(p.row.id)}><WifiIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title="Sync config">
            <IconButton size="small" onClick={() => syncMut.mutate(p.row.id)}><SyncIcon fontSize="small" /></IconButton>
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
          <TextField label="Password" type="password" fullWidth margin="dense" value={form.password}
            onChange={(e) => f('password', e.target.value)} />
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

      <Snackbar open={!!snack} autoHideDuration={3000} onClose={() => setSnack('')}
        message={snack} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </Box>
  )
}
