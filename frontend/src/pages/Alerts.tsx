import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Box, Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Select, MenuItem, FormControl, InputLabel, Switch, FormControlLabel,
  Chip, IconButton, Tooltip, Paper,
} from '@mui/material'
import { DataGrid } from '@mui/x-data-grid'
import type { GridColDef } from '@mui/x-data-grid'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import {
  listAlertRules, createAlertRule, updateAlertRule, deleteAlertRule, listDeliveries,
} from '../api/alerts'
import { useToastStore } from '../store/toast'
import ConfirmDialog from '../components/ConfirmDialog'
import type { AlertRule, AlertDelivery } from '../types'

const EVENT_TYPES = [
  { value: 'device_offline',  label: 'Device Offline' },
  { value: 'drift_detected',  label: 'Config Drift Detected' },
  { value: 'job_failed',      label: 'Bulk Job Failed' },
  { value: 'compliance_fail', label: 'Compliance Failure' },
]

const DELIVERY_TYPES = [
  { value: 'webhook', label: 'Webhook' },
  { value: 'email',   label: 'Email' },
  { value: 'slack',   label: 'Slack' },
]

const EMPTY_FORM = {
  name: '',
  event_type: 'device_offline',
  enabled: true,
  delivery_type: 'webhook',
  webhook_url: '',
  webhook_secret: '',
  email_to: '',
  slack_webhook_url: '',
}

export default function Alerts() {
  const qc = useQueryClient()
  const { push } = useToastStore()

  const { data: rules = [], isLoading: rulesLoading } = useQuery({
    queryKey: ['alert-rules'],
    queryFn: listAlertRules,
  })
  const { data: deliveries = [], isLoading: deliveriesLoading } = useQuery({
    queryKey: ['alert-deliveries'],
    queryFn: listDeliveries,
  })

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const createMut = useMutation({
    mutationFn: createAlertRule,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alert-rules'] })
      push('Alert rule created')
      setDialogOpen(false)
    },
    onError: () => push('Failed to create alert rule', 'error'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<AlertRule> }) =>
      updateAlertRule(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alert-rules'] })
      push('Alert rule updated')
      setDialogOpen(false)
    },
    onError: () => push('Failed to update alert rule', 'error'),
  })

  const deleteMut = useMutation({
    mutationFn: deleteAlertRule,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alert-rules'] })
      push('Alert rule deleted')
      setDeleteId(null)
    },
    onError: () => push('Failed to delete alert rule', 'error'),
  })

  const openCreate = () => {
    setEditingRule(null)
    setForm({ ...EMPTY_FORM })
    setDialogOpen(true)
  }

  const openEdit = (rule: AlertRule) => {
    setEditingRule(rule)
    setForm({
      name: rule.name,
      event_type: rule.event_type,
      enabled: rule.enabled,
      delivery_type: rule.delivery_type ?? 'webhook',
      webhook_url: rule.webhook_url ?? '',
      webhook_secret: '',
      email_to: rule.email_to ?? '',
      slack_webhook_url: rule.slack_webhook_url ?? '',
    })
    setDialogOpen(true)
  }

  const handleSubmit = () => {
    const data = {
      name: form.name,
      event_type: form.event_type,
      enabled: form.enabled,
      delivery_type: form.delivery_type,
      webhook_url: form.delivery_type === 'webhook' ? (form.webhook_url || null) : null,
      webhook_secret: form.delivery_type === 'webhook' ? (form.webhook_secret || null) : null,
      email_to: form.delivery_type === 'email' ? (form.email_to || null) : null,
      slack_webhook_url: form.delivery_type === 'slack' ? (form.slack_webhook_url || null) : null,
    }
    if (editingRule) {
      updateMut.mutate({ id: editingRule.id, data })
    } else {
      createMut.mutate(data)
    }
  }

  const ruleColumns: GridColDef[] = [
    { field: 'name', headerName: 'Name', flex: 1 },
    {
      field: 'event_type', headerName: 'Event Type', width: 200,
      renderCell: (p) => {
        const et = EVENT_TYPES.find((e) => e.value === p.value)
        return <Chip label={et?.label ?? p.value} size="small" />
      },
    },
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
    { field: 'webhook_url', headerName: 'Webhook URL', flex: 1, valueGetter: (v) => v ?? '—' },
    {
      field: 'created_at', headerName: 'Created', width: 180,
      valueGetter: (v) => new Date(v).toLocaleString(),
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

  const deliveryColumns: GridColDef[] = [
    { field: 'event_type', headerName: 'Event', width: 180 },
    {
      field: 'status', headerName: 'Status', width: 100,
      renderCell: (p) => (
        <Chip
          label={p.value}
          color={p.value === 'sent' ? 'success' : 'error'}
          size="small"
        />
      ),
    },
    { field: 'http_status', headerName: 'HTTP', width: 80, valueGetter: (v) => v ?? '—' },
    { field: 'error', headerName: 'Error', flex: 1, valueGetter: (v) => v ?? '—' },
    {
      field: 'delivered_at', headerName: 'Delivered At', width: 180,
      valueGetter: (v) => new Date(v).toLocaleString(),
    },
  ]

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} gutterBottom>
        Alerting & Webhooks
      </Typography>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h6">Alert Rules</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
          New Rule
        </Button>
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
        Recent Deliveries
      </Typography>
      <Paper>
        <DataGrid
          rows={deliveries}
          columns={deliveryColumns}
          loading={deliveriesLoading}
          autoHeight
          pageSizeOptions={[10, 25]}
          initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
          disableRowSelectionOnClick
        />
      </Paper>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingRule ? 'Edit Alert Rule' : 'New Alert Rule'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <TextField
            label="Name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            fullWidth
            required
          />
          <FormControl fullWidth>
            <InputLabel>Event Type</InputLabel>
            <Select
              label="Event Type"
              value={form.event_type}
              onChange={(e) => setForm((f) => ({ ...f, event_type: e.target.value }))}
            >
              {EVENT_TYPES.map((et) => (
                <MenuItem key={et.value} value={et.value}>{et.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth>
            <InputLabel>Delivery Type</InputLabel>
            <Select
              label="Delivery Type"
              value={form.delivery_type}
              onChange={(e) => setForm((f) => ({ ...f, delivery_type: e.target.value }))}
            >
              {DELIVERY_TYPES.map((dt) => (
                <MenuItem key={dt.value} value={dt.value}>{dt.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          {form.delivery_type === 'webhook' && (
            <>
              <TextField
                label="Webhook URL"
                value={form.webhook_url}
                onChange={(e) => setForm((f) => ({ ...f, webhook_url: e.target.value }))}
                fullWidth
                placeholder="https://hooks.example.com/..."
              />
              <TextField
                label="Webhook Secret (HMAC-SHA256)"
                value={form.webhook_secret}
                onChange={(e) => setForm((f) => ({ ...f, webhook_secret: e.target.value }))}
                fullWidth
                type="password"
                placeholder={editingRule ? '(leave blank to keep existing)' : ''}
              />
            </>
          )}
          {form.delivery_type === 'email' && (
            <TextField
              label="Recipient Email"
              value={form.email_to}
              onChange={(e) => setForm((f) => ({ ...f, email_to: e.target.value }))}
              fullWidth
              type="email"
              placeholder="alerts@example.com"
            />
          )}
          {form.delivery_type === 'slack' && (
            <TextField
              label="Slack Incoming Webhook URL"
              value={form.slack_webhook_url}
              onChange={(e) => setForm((f) => ({ ...f, slack_webhook_url: e.target.value }))}
              fullWidth
              placeholder="https://hooks.slack.com/services/..."
            />
          )}
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
            disabled={!form.name || createMut.isPending || updateMut.isPending}
          >
            {editingRule ? 'Save' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Delete Alert Rule"
        message="Are you sure you want to delete this alert rule? All associated deliveries will be removed."
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        onClose={() => setDeleteId(null)}
        loading={deleteMut.isPending}
      />
    </Box>
  )
}
