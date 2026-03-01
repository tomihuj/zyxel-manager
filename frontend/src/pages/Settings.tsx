import { useEffect, useState } from 'react'
import {
  Box, Typography, Card, CardContent, MenuItem, TextField, Divider,
  CircularProgress, Button, IconButton, Chip, Tooltip, Switch,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  FormControlLabel,
} from '@mui/material'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import RestoreIcon from '@mui/icons-material/Restore'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import { useSettingsStore } from '../store/settings'
import { useThemeStore } from '../store/theme'
import { getAppSettings, setAppSetting } from '../api/appSettings'
import {
  useParameterSetsStore, type ParameterSet, type ColumnDef,
} from '../store/parameterSets'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIMEOUT_OPTIONS = [
  { value: 3,  label: '3 seconds' },
  { value: 5,  label: '5 seconds (default)' },
  { value: 10, label: '10 seconds' },
  { value: 15, label: '15 seconds' },
  { value: 20, label: '20 seconds' },
  { value: 30, label: '30 seconds' },
  { value: 60, label: '60 seconds' },
]

const POLL_OPTIONS = [
  { value: 0,    label: 'Disabled' },
  { value: 30,   label: 'Every 30 seconds' },
  { value: 60,   label: 'Every minute' },
  { value: 300,  label: 'Every 5 minutes' },
  { value: 600,  label: 'Every 10 minutes' },
  { value: 900,  label: 'Every 15 minutes' },
  { value: 1800, label: 'Every 30 minutes' },
  { value: 3600, label: 'Every hour' },
]

const SECTION_OPTIONS = [
  'firewall_rules', 'interfaces', 'routing', 'nat', 'vpn',
  'dns', 'ntp', 'address_objects', 'service_objects', 'users', 'system',
]

// ---------------------------------------------------------------------------
// Edit Parameter Set dialog
// ---------------------------------------------------------------------------

function EditParameterSetDialog({ ps, onClose }: { ps: ParameterSet; onClose: () => void }) {
  const { updateSet, resetBuiltin } = useParameterSetsStore()
  const [name, setName] = useState(ps.name)
  const [columns, setColumns] = useState<ColumnDef[]>(ps.columns.map((c) => ({ ...c })))

  useEffect(() => {
    setName(ps.name)
    setColumns(ps.columns.map((c) => ({ ...c })))
  }, [ps.id])

  const handleSave = () => {
    updateSet(ps.id, { name, columns })
    onClose()
  }

  const handleAddRow = () => {
    setColumns([...columns, { key: '', label: '', visible: true }])
  }

  const handleDelete = (i: number) => {
    setColumns(columns.filter((_, ci) => ci !== i))
  }

  const handleMoveUp = (i: number) => {
    if (i === 0) return
    const c = [...columns];
    [c[i - 1], c[i]] = [c[i], c[i - 1]]
    setColumns(c)
  }

  const handleMoveDown = (i: number) => {
    if (i === columns.length - 1) return
    const c = [...columns];
    [c[i], c[i + 1]] = [c[i + 1], c[i]]
    setColumns(c)
  }

  const handleChange = (i: number, field: keyof ColumnDef, value: string | boolean) => {
    setColumns(columns.map((c, ci) => ci === i ? { ...c, [field]: value } : c))
  }

  const handleReset = () => {
    resetBuiltin(ps.id)
    onClose()
  }

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Edit Parameter Set
        {ps.builtin && (
          <Chip label="built-in" size="small" color="info" sx={{ ml: 1, verticalAlign: 'middle' }} />
        )}
      </DialogTitle>
      <DialogContent>
        <TextField
          label="Name"
          fullWidth
          value={name}
          onChange={(e) => setName(e.target.value)}
          sx={{ mt: 1, mb: 2 }}
          size="small"
        />
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
          Columns — define how each raw device field is labelled and whether it's visible in table views
        </Typography>
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 64, p: 0.5 }}>Order</TableCell>
                <TableCell>Field Key <Typography variant="caption" color="text.secondary">(raw device field)</Typography></TableCell>
                <TableCell>Display Label</TableCell>
                <TableCell sx={{ width: 80 }} align="center">Visible</TableCell>
                <TableCell sx={{ width: 40, p: 0.5 }}></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {columns.map((col, i) => (
                <TableRow key={i}>
                  <TableCell sx={{ p: 0.5 }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                      <IconButton size="small" onClick={() => handleMoveUp(i)} disabled={i === 0} sx={{ p: 0.25 }}>
                        <ArrowUpwardIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                      <IconButton size="small" onClick={() => handleMoveDown(i)} disabled={i === columns.length - 1} sx={{ p: 0.25 }}>
                        <ArrowDownwardIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <TextField
                      size="small"
                      fullWidth
                      value={col.key}
                      onChange={(e) => handleChange(i, 'key', e.target.value)}
                      placeholder="_field_name"
                      inputProps={{ style: { fontFamily: 'monospace', fontSize: 12 } }}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      size="small"
                      fullWidth
                      value={col.label}
                      onChange={(e) => handleChange(i, 'label', e.target.value)}
                      placeholder="Display Label"
                      inputProps={{ style: { fontSize: 12 } }}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Switch
                      size="small"
                      checked={col.visible}
                      onChange={(e) => handleChange(i, 'visible', e.target.checked)}
                    />
                  </TableCell>
                  <TableCell sx={{ p: 0.5 }}>
                    <IconButton size="small" color="error" onClick={() => handleDelete(i)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {columns.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center">
                    <Typography variant="caption" color="text.secondary">No columns defined</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <Button startIcon={<AddIcon />} onClick={handleAddRow} sx={{ mt: 1 }} size="small">
          Add column
        </Button>
      </DialogContent>
      <DialogActions>
        {ps.builtin && (
          <Tooltip title="Reset to factory defaults">
            <Button startIcon={<RestoreIcon />} color="warning" onClick={handleReset} sx={{ mr: 'auto' }}>
              Reset to defaults
            </Button>
          </Tooltip>
        )}
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave}>Save</Button>
      </DialogActions>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Add Parameter Set dialog
// ---------------------------------------------------------------------------

function AddParameterSetDialog({ onClose }: { onClose: () => void }) {
  const { addSet } = useParameterSetsStore()
  const [name, setName] = useState('')
  const [section, setSection] = useState('firewall_rules')

  const handleCreate = () => {
    if (!name.trim()) return
    addSet(name.trim(), section)
    onClose()
  }

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>New Parameter Set</DialogTitle>
      <DialogContent>
        <TextField
          label="Name"
          fullWidth
          value={name}
          onChange={(e) => setName(e.target.value)}
          sx={{ mt: 1, mb: 2 }}
          size="small"
          autoFocus
        />
        <TextField
          select
          label="Section"
          fullWidth
          value={section}
          onChange={(e) => setSection(e.target.value)}
          size="small"
          helperText="Which device config section this mapping applies to"
        >
          {SECTION_OPTIONS.map((s) => (
            <MenuItem key={s} value={s}>{s}</MenuItem>
          ))}
        </TextField>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleCreate} disabled={!name.trim()}>Create</Button>
      </DialogActions>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Main Settings page
// ---------------------------------------------------------------------------

export default function Settings() {
  const { testConnectionTimeout, setTestConnectionTimeout } = useSettingsStore()
  const { darkMode, toggle: toggleDark } = useThemeStore()
  const { sets, deleteSet } = useParameterSetsStore()
  const qc = useQueryClient()

  const [editingSet, setEditingSet] = useState<ParameterSet | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const { data: appSettings, isLoading } = useQuery({
    queryKey: ['app-settings'],
    queryFn: getAppSettings,
  })

  const pollMut = useMutation({
    mutationFn: (value: number) => setAppSetting('auto_poll_interval', value),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['app-settings'] }),
  })

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} mb={3}>Settings</Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, maxWidth: 700 }}>

        {/* Network */}
        <Card>
          <CardContent>
            <Typography variant="h6" mb={2}>Network</Typography>
            <Divider sx={{ mb: 2 }} />
            <TextField
              select
              label="Test Connection Timeout"
              fullWidth
              value={testConnectionTimeout}
              onChange={(e) => setTestConnectionTimeout(Number(e.target.value))}
              helperText="How long to wait when testing device connectivity before marking it unreachable."
            >
              {TIMEOUT_OPTIONS.map((o) => (
                <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
              ))}
            </TextField>
          </CardContent>
        </Card>

        {/* Device Polling */}
        <Card>
          <CardContent>
            <Typography variant="h6" mb={2}>Device Polling</Typography>
            <Divider sx={{ mb: 2 }} />
            {isLoading ? (
              <CircularProgress size={24} />
            ) : (
              <TextField
                select
                label="Auto-Poll Interval"
                fullWidth
                value={appSettings?.auto_poll_interval ?? 0}
                onChange={(e) => pollMut.mutate(Number(e.target.value))}
                helperText="How often the server checks every device's connectivity and fetches missing firmware versions. Changes take effect within 30 seconds."
                disabled={pollMut.isPending}
              >
                {POLL_OPTIONS.map((o) => (
                  <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                ))}
              </TextField>
            )}
          </CardContent>
        </Card>

        {/* Appearance */}
        <Card>
          <CardContent>
            <Typography variant="h6" mb={2}>Appearance</Typography>
            <Divider sx={{ mb: 2 }} />
            <TextField
              select
              label="Theme"
              fullWidth
              value={darkMode ? 'dark' : 'light'}
              onChange={(e) => { if ((e.target.value === 'dark') !== darkMode) toggleDark() }}
              helperText="Choose between light and dark mode."
            >
              <MenuItem value="light">Light</MenuItem>
              <MenuItem value="dark">Dark</MenuItem>
            </TextField>
          </CardContent>
        </Card>

        {/* Parameter Sets */}
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">Parameter Sets</Typography>
              <Button size="small" startIcon={<AddIcon />} variant="outlined" onClick={() => setAddOpen(true)}>
                Add
              </Button>
            </Box>
            <Divider sx={{ mb: 2 }} />
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Define how raw device configuration fields are labelled and displayed in table views
              (Device Config → Table, Security Advisor → Finding Details).
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {sets.map((ps) => (
                <Box
                  key={ps.id}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 1,
                    p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1,
                  }}
                >
                  <Box flex={1} minWidth={0}>
                    <Typography variant="body2" fontWeight={600}>{ps.name}</Typography>
                    <Box sx={{ display: 'flex', gap: 0.75, mt: 0.5, flexWrap: 'wrap' }}>
                      <Chip size="small" label={ps.section} variant="outlined" />
                      <Chip size="small" label={`${ps.columns.length} columns`} />
                      <Chip size="small" label={`${ps.columns.filter((c) => c.visible).length} visible`} variant="outlined" />
                      {ps.builtin && <Chip size="small" label="built-in" color="info" />}
                    </Box>
                  </Box>
                  <Tooltip title="Edit">
                    <IconButton size="small" onClick={() => setEditingSet(ps)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  {!ps.builtin && (
                    <Tooltip title="Delete">
                      <IconButton size="small" color="error" onClick={() => deleteSet(ps.id)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>

      </Box>

      {/* Dialogs */}
      {editingSet && (
        <EditParameterSetDialog ps={editingSet} onClose={() => setEditingSet(null)} />
      )}
      {addOpen && (
        <AddParameterSetDialog onClose={() => setAddOpen(false)} />
      )}
    </Box>
  )
}
