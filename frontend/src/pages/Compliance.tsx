import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Box, Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Select, MenuItem, FormControl, InputLabel, Switch, FormControlLabel,
  Chip, IconButton, Tooltip, Paper, CircularProgress,
} from '@mui/material'
import { DataGrid } from '@mui/x-data-grid'
import type { GridColDef } from '@mui/x-data-grid'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import {
  listComplianceRules, createComplianceRule, updateComplianceRule,
  deleteComplianceRule, listComplianceResults, runComplianceCheck,
} from '../api/compliance'
import { listDevices } from '../api/devices'
import { useToastStore } from '../store/toast'
import ConfirmDialog from '../components/ConfirmDialog'
import type { ComplianceRule } from '../types'

const OPERATORS = [
  { value: 'eq',       label: 'Equals (eq)' },
  { value: 'neq',      label: 'Not Equals (neq)' },
  { value: 'contains', label: 'Contains' },
  { value: 'regex',    label: 'Regex match' },
]

const EMPTY_FORM = {
  name: '',
  section: '',
  key_path: '',
  operator: 'eq',
  expected_value: '',
  enabled: true,
}

export default function Compliance() {
  const qc = useQueryClient()
  const { push } = useToastStore()

  const { data: rules = [], isLoading: rulesLoading } = useQuery({
    queryKey: ['compliance-rules'],
    queryFn: listComplianceRules,
  })
  const { data: results = [], isLoading: resultsLoading } = useQuery({
    queryKey: ['compliance-results'],
    queryFn: listComplianceResults,
    refetchInterval: 30_000,
  })
  const { data: devices = [] } = useQuery({
    queryKey: ['devices'],
    queryFn: listDevices,
  })

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<ComplianceRule | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const deviceMap = Object.fromEntries(devices.map((d) => [d.id, d.name]))

  const createMut = useMutation({
    mutationFn: createComplianceRule,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['compliance-rules'] })
      push('Compliance rule created')
      setDialogOpen(false)
    },
    onError: () => push('Failed to create compliance rule', 'error'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ComplianceRule> }) =>
      updateComplianceRule(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['compliance-rules'] })
      push('Compliance rule updated')
      setDialogOpen(false)
    },
    onError: () => push('Failed to update compliance rule', 'error'),
  })

  const deleteMut = useMutation({
    mutationFn: deleteComplianceRule,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['compliance-rules'] })
      push('Compliance rule deleted')
      setDeleteId(null)
    },
    onError: () => push('Failed to delete compliance rule', 'error'),
  })

  const checkMut = useMutation({
    mutationFn: runComplianceCheck,
    onSuccess: () => {
      push('Compliance check triggered — results will update shortly')
      setTimeout(() => qc.invalidateQueries({ queryKey: ['compliance-results'] }), 3000)
    },
    onError: () => push('Failed to trigger compliance check', 'error'),
  })

  const openCreate = () => {
    setEditingRule(null)
    setForm({ ...EMPTY_FORM })
    setDialogOpen(true)
  }

  const openEdit = (rule: ComplianceRule) => {
    setEditingRule(rule)
    setForm({
      name: rule.name,
      section: rule.section,
      key_path: rule.key_path,
      operator: rule.operator,
      expected_value: rule.expected_value,
      enabled: rule.enabled,
    })
    setDialogOpen(true)
  }

  const handleSubmit = () => {
    if (editingRule) {
      updateMut.mutate({ id: editingRule.id, data: form })
    } else {
      createMut.mutate(form)
    }
  }

  const ruleColumns: GridColDef[] = [
    { field: 'name', headerName: 'Name', flex: 1 },
    { field: 'section', headerName: 'Section', width: 120 },
    { field: 'key_path', headerName: 'Key Path', width: 160 },
    { field: 'operator', headerName: 'Operator', width: 110 },
    { field: 'expected_value', headerName: 'Expected', flex: 1 },
    {
      field: 'enabled', headerName: 'Status', width: 100,
      renderCell: (p) => (
        <Chip
          label={p.value ? 'Enabled' : 'Disabled'}
          color={p.value ? 'success' : 'default'}
          size="small"
        />
      ),
    },
    {
      field: 'actions', headerName: '', width: 90, sortable: false,
      renderCell: (p) => (
        <Box>
          <Tooltip title="Edit">
            <IconButton size="small" onClick={() => openEdit(p.row)}>
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton size="small" color="error" onClick={() => setDeleteId(p.row.id)}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
  ]

  const resultColumns: GridColDef[] = [
    {
      field: 'rule_id', headerName: 'Rule', flex: 1,
      valueGetter: (v) => rules.find((r) => r.id === v)?.name ?? v,
    },
    {
      field: 'device_id', headerName: 'Device', width: 180,
      valueGetter: (v) => deviceMap[v] ?? v,
    },
    {
      field: 'passed', headerName: 'Result', width: 110,
      renderCell: (p) => (
        <Chip
          label={p.value ? 'PASS' : 'FAIL'}
          color={p.value ? 'success' : 'error'}
          size="small"
        />
      ),
    },
    { field: 'actual_value', headerName: 'Actual Value', flex: 1, valueGetter: (v) => v ?? '—' },
    {
      field: 'checked_at', headerName: 'Checked At', width: 180,
      valueGetter: (v) => new Date(v).toLocaleString(),
    },
  ]

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} gutterBottom>
        Config Compliance
      </Typography>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h6">Compliance Rules</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={checkMut.isPending ? <CircularProgress size={16} /> : <PlayArrowIcon />}
            onClick={() => checkMut.mutate()}
            disabled={checkMut.isPending}
          >
            Run Check
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            New Rule
          </Button>
        </Box>
      </Box>

      <Paper sx={{ mb: 4 }}>
        <DataGrid
          rows={rules}
          columns={ruleColumns}
          loading={rulesLoading}
          autoHeight
          pageSizeOptions={[10, 25]}
          initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
          disableRowSelectionOnClick
        />
      </Paper>

      <Typography variant="h6" gutterBottom>
        Compliance Results
      </Typography>
      <Paper>
        <DataGrid
          rows={results}
          columns={resultColumns}
          loading={resultsLoading}
          autoHeight
          pageSizeOptions={[10, 25, 50]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          disableRowSelectionOnClick
        />
      </Paper>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingRule ? 'Edit Compliance Rule' : 'New Compliance Rule'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <TextField
            label="Name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            fullWidth
            required
          />
          <TextField
            label="Section"
            value={form.section}
            onChange={(e) => setForm((f) => ({ ...f, section: e.target.value }))}
            fullWidth
            required
            placeholder="e.g. dns, ntp, interfaces"
          />
          <TextField
            label="Key Path (dot-notation)"
            value={form.key_path}
            onChange={(e) => setForm((f) => ({ ...f, key_path: e.target.value }))}
            fullWidth
            required
            placeholder="e.g. dns.primary or server.hostname"
          />
          <FormControl fullWidth>
            <InputLabel>Operator</InputLabel>
            <Select
              label="Operator"
              value={form.operator}
              onChange={(e) => setForm((f) => ({ ...f, operator: e.target.value }))}
            >
              {OPERATORS.map((op) => (
                <MenuItem key={op.value} value={op.value}>{op.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="Expected Value"
            value={form.expected_value}
            onChange={(e) => setForm((f) => ({ ...f, expected_value: e.target.value }))}
            fullWidth
            required
          />
          <FormControlLabel
            control={
              <Switch
                checked={form.enabled}
                onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
              />
            }
            label="Enabled"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={
              !form.name || !form.section || !form.key_path || !form.expected_value ||
              createMut.isPending || updateMut.isPending
            }
          >
            {editingRule ? 'Save' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Delete Compliance Rule"
        message="Are you sure you want to delete this compliance rule? All associated results will be removed."
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        onClose={() => setDeleteId(null)}
        loading={deleteMut.isPending}
      />
    </Box>
  )
}
