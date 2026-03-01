import { useState } from 'react'
import {
  Box, Typography, Button, Card, Table, TableHead, TableRow, TableCell,
  TableBody, Chip, IconButton, Tooltip, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, MenuItem, Alert, FormControlLabel, Checkbox,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listTemplates, createTemplate, updateTemplate,
  deleteTemplate, applyTemplate as applyTemplateApi,
} from '../api/templates'
import type { ConfigTemplate } from '../api/templates'
import { listDevices } from '../api/devices'
import ConfirmDialog from '../components/ConfirmDialog'
import { useToastStore } from '../store/toast'

const SECTIONS = [
  'ntp', 'dns', 'interfaces', 'routing', 'nat',
  'firewall_rules', 'vpn', 'address_objects', 'service_objects',
]

const defaultForm = { name: '', description: '', section: 'ntp', data_json: '{}' }

export default function Templates() {
  const qc = useQueryClient()
  const toast = useToastStore()
  const { data: templates = [], isLoading } = useQuery({ queryKey: ['templates'], queryFn: listTemplates })
  const { data: devices = [] } = useQuery({ queryKey: ['devices'], queryFn: listDevices })

  const [createOpen, setCreateOpen] = useState(false)
  const [editTmpl, setEditTmpl] = useState<ConfigTemplate | null>(null)
  const [applyTmpl, setApplyTmpl] = useState<ConfigTemplate | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [form, setForm] = useState(defaultForm)
  const [editForm, setEditForm] = useState(defaultForm)
  const [selectedDevices, setSelectedDevices] = useState<string[]>([])
  const [applyResults, setApplyResults] = useState<{ success: any[]; failed: any[] } | null>(null)

  const f = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }))
  const ef = (k: string, v: string) => setEditForm((p) => ({ ...p, [k]: v }))

  const openEdit = (t: ConfigTemplate) => {
    setEditTmpl(t)
    setEditForm({ name: t.name, description: t.description || '', section: t.section, data_json: t.data_json })
  }

  const openApply = (t: ConfigTemplate) => {
    setApplyTmpl(t)
    setSelectedDevices([])
    setApplyResults(null)
  }

  const toggleDevice = (id: string) =>
    setSelectedDevices((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id])

  const createMut = useMutation({
    mutationFn: () => createTemplate(form as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates'] })
      setCreateOpen(false)
      setForm(defaultForm)
      toast.push('Template created')
    },
    onError: () => toast.push('Failed to create template', 'error'),
  })

  const updateMut = useMutation({
    mutationFn: () => updateTemplate(editTmpl!.id, editForm as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates'] })
      setEditTmpl(null)
      toast.push('Template updated')
    },
    onError: () => toast.push('Failed to update template', 'error'),
  })

  const deleteMut = useMutation({
    mutationFn: () => deleteTemplate(deleteId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates'] })
      setDeleteId(null)
      toast.push('Template deleted')
    },
    onError: () => toast.push('Failed to delete template', 'error'),
  })

  const applyMut = useMutation({
    mutationFn: () => applyTemplateApi(applyTmpl!.id, selectedDevices),
    onSuccess: (data) => {
      setApplyResults(data)
      qc.invalidateQueries({ queryKey: ['devices'] })
      if (data.failed.length === 0)
        toast.push(`Applied to ${data.success.length} device(s)`)
      else
        toast.push(`Applied: ${data.success.length} ok, ${data.failed.length} failed`, 'warning')
    },
    onError: () => toast.push('Failed to apply template', 'error'),
  })

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>Config Templates</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
          New Template
        </Button>
      </Box>

      <Card>
        <Table>
          <TableHead>
            <TableRow sx={{ '& th': { fontWeight: 600 } }}>
              <TableCell>Name</TableCell>
              <TableCell>Section</TableCell>
              <TableCell>Description</TableCell>
              <TableCell>Created</TableCell>
              <TableCell width={140} />
            </TableRow>
          </TableHead>
          <TableBody>
            {templates.map((t) => (
              <TableRow key={t.id} hover>
                <TableCell sx={{ fontWeight: 600 }}>{t.name}</TableCell>
                <TableCell><Chip size="small" label={t.section} /></TableCell>
                <TableCell sx={{ color: 'text.secondary' }}>{t.description || '—'}</TableCell>
                <TableCell sx={{ color: 'text.secondary', fontSize: 13 }}>
                  {new Date(t.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <Tooltip title="Apply to devices">
                    <IconButton size="small" color="primary" onClick={() => openApply(t)}>
                      <PlayArrowIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Edit">
                    <IconButton size="small" onClick={() => openEdit(t)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <IconButton size="small" color="error" onClick={() => setDeleteId(t.id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && templates.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ color: 'text.secondary', py: 4 }}>
                  No templates yet. Create one to apply consistent configs across devices.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Create Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>New Template</DialogTitle>
        <DialogContent>
          <TextField label="Name" fullWidth margin="dense" value={form.name}
            onChange={(e) => f('name', e.target.value)} />
          <TextField label="Description" fullWidth margin="dense" value={form.description}
            onChange={(e) => f('description', e.target.value)} />
          <TextField select label="Section" fullWidth margin="dense" value={form.section}
            onChange={(e) => f('section', e.target.value)}>
            {SECTIONS.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </TextField>
          <TextField label="Config JSON" fullWidth multiline rows={8} margin="dense"
            value={form.data_json} onChange={(e) => f('data_json', e.target.value)}
            helperText="JSON object to apply to the selected section" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => createMut.mutate()}
            disabled={createMut.isPending || !form.name}>
            {createMut.isPending ? 'Creating…' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editTmpl} onClose={() => setEditTmpl(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Template — {editTmpl?.name}</DialogTitle>
        <DialogContent>
          <TextField label="Name" fullWidth margin="dense" value={editForm.name}
            onChange={(e) => ef('name', e.target.value)} />
          <TextField label="Description" fullWidth margin="dense" value={editForm.description}
            onChange={(e) => ef('description', e.target.value)} />
          <TextField select label="Section" fullWidth margin="dense" value={editForm.section}
            onChange={(e) => ef('section', e.target.value)}>
            {SECTIONS.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </TextField>
          <TextField label="Config JSON" fullWidth multiline rows={8} margin="dense"
            value={editForm.data_json} onChange={(e) => ef('data_json', e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditTmpl(null)}>Cancel</Button>
          <Button variant="contained" onClick={() => updateMut.mutate()} disabled={updateMut.isPending}>
            {updateMut.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Apply Dialog */}
      <Dialog open={!!applyTmpl} onClose={() => setApplyTmpl(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Apply Template — {applyTmpl?.name}</DialogTitle>
        <DialogContent>
          {!applyResults ? (
            <>
              <Typography variant="body2" color="text.secondary" mb={1}>
                Select devices to apply <strong>{applyTmpl?.section}</strong> section:
              </Typography>
              {devices.map((d) => (
                <FormControlLabel
                  key={d.id}
                  label={`${d.name} — ${d.mgmt_ip}`}
                  control={
                    <Checkbox
                      checked={selectedDevices.includes(d.id)}
                      onChange={() => toggleDevice(d.id)}
                    />
                  }
                  sx={{ display: 'block' }}
                />
              ))}
              {devices.length === 0 && <Alert severity="info">No devices found.</Alert>}
            </>
          ) : (
            <Box>
              {applyResults.success.length > 0 && (
                <Alert severity="success" sx={{ mb: 1 }}>
                  Applied to: {applyResults.success.map((s: any) => s.device_name).join(', ')}
                </Alert>
              )}
              {applyResults.failed.map((f: any, i: number) => (
                <Alert key={i} severity="error" sx={{ mb: 1 }}>
                  {f.device_name || f.device_id}: {f.error}
                </Alert>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setApplyTmpl(null)}>Close</Button>
          {!applyResults && (
            <Button
              variant="contained"
              onClick={() => applyMut.mutate()}
              disabled={applyMut.isPending || selectedDevices.length === 0}
            >
              {applyMut.isPending ? 'Applying…' : `Apply to ${selectedDevices.length} device(s)`}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteId}
        title="Delete Template"
        message="Are you sure you want to delete this template? This action cannot be undone."
        onConfirm={() => deleteMut.mutate()}
        onClose={() => setDeleteId(null)}
        loading={deleteMut.isPending}
      />
    </Box>
  )
}
