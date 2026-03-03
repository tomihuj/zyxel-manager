import { useState } from 'react'
import {
  Box, Typography, Button, Chip, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Switch, FormControlLabel,
  MenuItem, Select, FormControl, InputLabel, LinearProgress, Alert,
  OutlinedInput, Checkbox, ListItemText,
} from '@mui/material'
import { DataGrid, type GridColDef } from '@mui/x-data-grid'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import ScheduleSendIcon from '@mui/icons-material/ScheduleSend'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listScheduledReports, createScheduledReport, updateScheduledReport,
  deleteScheduledReport, runScheduledReport,
} from '../api/scheduled_reports'
import { listDevices } from '../api/devices'
import { listGroups } from '../api/groups'
import { useToastStore } from '../store/toast'
import ConfirmDialog from '../components/ConfirmDialog'
import TableConfigToolbar from '../components/TableConfigToolbar'
import { useColumnVisibilityStore } from '../store/columnVisibility'

const SECTIONS = ['interfaces', 'routing', 'nat', 'firewall_rules', 'vpn',
                  'users', 'dns', 'ntp', 'address_objects', 'service_objects', 'system']

interface FormState {
  name: string
  device_ids: string[]
  group_ids: string[]
  tags: string[]
  sections: string[]
  format: string
  cron_expression: string
  delivery_email: string
  enabled: boolean
}

const defaultForm: FormState = {
  name: '',
  device_ids: [],
  group_ids: [],
  tags: [],
  sections: SECTIONS,
  format: 'json',
  cron_expression: '0 8 * * 1',
  delivery_email: '',
  enabled: true,
}

export default function ScheduledReports() {
  const { visibility, setVisibility } = useColumnVisibilityStore()
  const qc = useQueryClient()
  const toast = useToastStore()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(defaultForm)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['scheduled-reports'],
    queryFn: listScheduledReports,
  })

  const { data: devices = [] } = useQuery({ queryKey: ['devices'], queryFn: listDevices })
  const { data: groups = [] } = useQuery({ queryKey: ['groups'], queryFn: listGroups })

  const createMut = useMutation({
    mutationFn: createScheduledReport,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['scheduled-reports'] }); closeDialog() },
    onError: () => toast.push('Failed to create report', 'error'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      updateScheduledReport(id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['scheduled-reports'] }); closeDialog() },
    onError: () => toast.push('Failed to update report', 'error'),
  })

  const deleteMut = useMutation({
    mutationFn: deleteScheduledReport,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['scheduled-reports'] }); setDeleteId(null) },
    onError: () => toast.push('Failed to delete report', 'error'),
  })

  const runMut = useMutation({
    mutationFn: runScheduledReport,
    onSuccess: () => toast.push('Report triggered successfully', 'success'),
    onError: () => toast.push('Failed to trigger report', 'error'),
  })

  const openCreate = () => { setEditId(null); setForm(defaultForm); setDialogOpen(true) }
  const openEdit = (r: any) => {
    setEditId(r.id)
    setForm({
      name: r.name,
      device_ids: r.device_ids,
      group_ids: r.group_ids,
      tags: r.tags,
      sections: r.sections,
      format: r.format,
      cron_expression: r.cron_expression,
      delivery_email: r.delivery_email,
      enabled: r.enabled,
    })
    setDialogOpen(true)
  }
  const closeDialog = () => setDialogOpen(false)

  const handleSubmit = () => {
    const body = { ...form }
    if (editId) {
      updateMut.mutate({ id: editId, body })
    } else {
      createMut.mutate(body)
    }
  }

  const columns: GridColDef[] = [
    { field: 'name', headerName: 'Name', flex: 1, minWidth: 140 },
    { field: 'format', headerName: 'Format', width: 80,
      renderCell: ({ value }) => <Chip size="small" label={value.toUpperCase()} variant="outlined" /> },
    { field: 'cron_expression', headerName: 'Schedule (cron)', width: 150,
      renderCell: ({ value }) => <code>{value}</code> },
    { field: 'delivery_email', headerName: 'Email', flex: 1, minWidth: 160 },
    { field: 'enabled', headerName: 'Enabled', width: 90,
      renderCell: ({ value }) => <Chip size="small" label={value ? 'On' : 'Off'} color={value ? 'success' : 'default'} /> },
    { field: 'last_run', headerName: 'Last Run', width: 160,
      valueFormatter: (v: string | null) => v ? new Date(v).toLocaleString() : '—' },
    { field: 'next_run', headerName: 'Next Run', width: 160,
      valueFormatter: (v: string | null) => v ? new Date(v).toLocaleString() : '—' },
    {
      field: 'actions', headerName: 'Actions', width: 130, sortable: false, hideable: false,
      renderCell: ({ row }) => (
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <IconButton size="small" onClick={() => runMut.mutate(row.id)} title="Run Now">
            <PlayArrowIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={() => openEdit(row)} title="Edit">
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" color="error" onClick={() => setDeleteId(row.id)} title="Delete">
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      ),
    },
  ]

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <ScheduleSendIcon color="primary" />
        <Typography variant="h5" fontWeight={700} sx={{ flexGrow: 1 }}>Scheduled Reports</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
          New Schedule
        </Button>
      </Box>

      {isLoading ? <LinearProgress /> : (
        <DataGrid
          rows={reports}
          columns={columns}
          autoHeight
          pageSizeOptions={[25, 50]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          disableRowSelectionOnClick
          density="compact"
          slots={{ toolbar: TableConfigToolbar }}
          columnVisibilityModel={visibility['scheduled-reports'] ?? {}}
          onColumnVisibilityModelChange={(model) => setVisibility('scheduled-reports', model)}
          sx={{ bgcolor: 'background.paper', borderRadius: 1 }}
        />
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onClose={closeDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{editId ? 'Edit Scheduled Report' : 'New Scheduled Report'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <TextField label="Name" size="small" fullWidth value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />

          <FormControl size="small" fullWidth>
            <InputLabel>Devices</InputLabel>
            <Select
              multiple label="Devices" value={form.device_ids}
              onChange={(e) => setForm((f) => ({ ...f, device_ids: e.target.value as string[] }))}
              input={<OutlinedInput label="Devices" />}
              renderValue={(sel) => `${sel.length} selected`}
            >
              {devices.map((d) => (
                <MenuItem key={d.id} value={d.id}>
                  <Checkbox checked={form.device_ids.includes(d.id)} />
                  <ListItemText primary={d.name} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" fullWidth>
            <InputLabel>Sections</InputLabel>
            <Select
              multiple label="Sections" value={form.sections}
              onChange={(e) => setForm((f) => ({ ...f, sections: e.target.value as string[] }))}
              input={<OutlinedInput label="Sections" />}
              renderValue={(sel) => `${sel.length} sections`}
            >
              {SECTIONS.map((s) => (
                <MenuItem key={s} value={s}>
                  <Checkbox checked={form.sections.includes(s)} />
                  <ListItemText primary={s} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" fullWidth>
            <InputLabel>Format</InputLabel>
            <Select label="Format" value={form.format}
              onChange={(e) => setForm((f) => ({ ...f, format: e.target.value }))}>
              <MenuItem value="json">JSON</MenuItem>
              <MenuItem value="csv">CSV</MenuItem>
            </Select>
          </FormControl>

          <TextField label="Cron Expression" size="small" fullWidth value={form.cron_expression}
            placeholder="0 8 * * 1  (Monday 8am)"
            onChange={(e) => setForm((f) => ({ ...f, cron_expression: e.target.value }))} />

          <TextField label="Delivery Email" size="small" fullWidth type="email" value={form.delivery_email}
            onChange={(e) => setForm((f) => ({ ...f, delivery_email: e.target.value }))} />

          <FormControlLabel
            control={<Switch checked={form.enabled}
              onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))} />}
            label="Enabled"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>Cancel</Button>
          <Button variant="contained"
            onClick={handleSubmit}
            disabled={createMut.isPending || updateMut.isPending}>
            {editId ? 'Save' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        title="Delete Scheduled Report"
        message="This will permanently delete the scheduled report. This cannot be undone."
        confirmLabel="Delete"
        confirmColor="error"
        onConfirm={() => deleteMut.mutate(deleteId!)}
        onClose={() => setDeleteId(null)}
        loading={deleteMut.isPending}
      />
    </Box>
  )
}
