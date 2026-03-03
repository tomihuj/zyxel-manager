import { useState } from 'react'
import {
  Box, Typography, Chip, MenuItem, Select, FormControl, InputLabel,
  LinearProgress, Card, CardContent, TextField, Button, Tooltip,
  IconButton, Collapse, Alert,
} from '@mui/material'
import { DataGrid, type GridColDef } from '@mui/x-data-grid'
import TerminalIcon from '@mui/icons-material/Terminal'
import DeleteForeverIcon from '@mui/icons-material/DeleteForever'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listSyslogEntries, getSyslogSummary, clearSyslog } from '../api/syslog'
import { listDevices } from '../api/devices'
import { useAuthStore } from '../store/auth'
import { useToastStore } from '../store/toast'
import ConfirmDialog from '../components/ConfirmDialog'
import TableConfigToolbar from '../components/TableConfigToolbar'
import { useColumnVisibilityStore } from '../store/columnVisibility'

const SEVERITY_COLORS: Record<string, 'error' | 'warning' | 'info' | 'default'> = {
  emergency: 'error', alert: 'error', critical: 'error', error: 'error',
  warning: 'warning', notice: 'info', info: 'info', debug: 'default',
}

const SEVERITY_OPTIONS = [
  { value: 0, label: 'Emergency (0)' }, { value: 1, label: 'Alert (1)' },
  { value: 2, label: 'Critical (2)' }, { value: 3, label: 'Error (3)' },
  { value: 4, label: 'Warning (4)' }, { value: 5, label: 'Notice (5)' },
  { value: 6, label: 'Info (6)' }, { value: 7, label: 'Debug (7)' },
]

const FACILITY_OPTIONS = [
  { value: 0, label: 'kern (0)' }, { value: 1, label: 'user (1)' },
  { value: 2, label: 'mail (2)' }, { value: 3, label: 'daemon (3)' },
  { value: 4, label: 'auth (4)' }, { value: 5, label: 'syslog (5)' },
  { value: 6, label: 'lpr (6)' }, { value: 7, label: 'news (7)' },
  { value: 8, label: 'uucp (8)' }, { value: 9, label: 'cron (9)' },
  { value: 10, label: 'authpriv (10)' }, { value: 11, label: 'ftp (11)' },
  { value: 16, label: 'local0 (16)' }, { value: 17, label: 'local1 (17)' },
  { value: 18, label: 'local2 (18)' }, { value: 19, label: 'local3 (19)' },
  { value: 20, label: 'local4 (20)' }, { value: 21, label: 'local5 (21)' },
  { value: 22, label: 'local6 (22)' }, { value: 23, label: 'local7 (23)' },
]

export default function SyslogViewer() {
  const { visibility, setVisibility } = useColumnVisibilityStore()
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const toast = useToastStore()
  const [filterDevice, setFilterDevice] = useState('')
  const [filterSeverity, setFilterSeverity] = useState('')
  const [filterSeverityMax, setFilterSeverityMax] = useState('')
  const [filterFacility, setFilterFacility] = useState('')
  const [filterProgram, setFilterProgram] = useState('')
  const [filterSearch, setFilterSearch] = useState('')
  const [filterHours, setFilterHours] = useState(24)
  const [filterSourceIp, setFilterSourceIp] = useState('')
  const [filterLimit, setFilterLimit] = useState(500)
  const [clearOpen, setClearOpen] = useState(false)
  const [showSetup, setShowSetup] = useState(false)

  const params = {
    device_id: filterDevice || undefined,
    severity: filterSeverity !== '' ? parseInt(filterSeverity) : undefined,
    severity_max: filterSeverityMax !== '' ? parseInt(filterSeverityMax) : undefined,
    facility: filterFacility !== '' ? parseInt(filterFacility) : undefined,
    program: filterProgram || undefined,
    search: filterSearch || undefined,
    hours: filterHours,
    source_ip: filterSourceIp || undefined,
    limit: filterLimit,
  }

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['syslog-entries', params],
    queryFn: () => listSyslogEntries(params),
    refetchInterval: 15_000,
  })

  const { data: summary } = useQuery({
    queryKey: ['syslog-summary'],
    queryFn: getSyslogSummary,
    refetchInterval: 15_000,
  })

  const { data: devices = [] } = useQuery({ queryKey: ['devices'], queryFn: listDevices })

  const clearMut = useMutation({
    mutationFn: clearSyslog,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['syslog-entries'] })
      qc.invalidateQueries({ queryKey: ['syslog-summary'] })
      setClearOpen(false)
      toast.push('Syslog entries cleared', 'success')
    },
    onError: () => toast.push('Failed to clear syslog', 'error'),
  })

  const columns: GridColDef[] = [
    {
      field: 'received_at', headerName: 'Received At', width: 155,
      valueFormatter: (v: string) => new Date(v).toLocaleString(),
    },
    {
      field: 'source_ip', headerName: 'Source IP', width: 120,
      renderCell: ({ value }) => (
        <Typography variant="caption" fontFamily="monospace">{value}</Typography>
      ),
    },
    {
      field: 'device_name', headerName: 'Device', width: 130,
      renderCell: ({ row }) => row.device_name
        ? <Typography variant="caption">{row.device_name}</Typography>
        : <Typography variant="caption" color="text.secondary">—</Typography>,
    },
    {
      field: 'severity_name', headerName: 'Severity', width: 100,
      renderCell: ({ value }) => (
        <Chip size="small" label={value} color={SEVERITY_COLORS[value] ?? 'default'} />
      ),
    },
    {
      field: 'facility_name', headerName: 'Facility', width: 90,
      renderCell: ({ value }) => (
        <Typography variant="caption" color="text.secondary">{value}</Typography>
      ),
    },
    {
      field: 'program', headerName: 'Program', width: 110,
      renderCell: ({ value }) => (
        <Typography variant="caption" fontFamily="monospace">{value ?? '—'}</Typography>
      ),
    },
    {
      field: 'message', headerName: 'Message', flex: 1, minWidth: 220,
      renderCell: ({ value, row }) => (
        <Tooltip title={row.raw ?? value} placement="bottom-start" enterDelay={600}>
          <Typography variant="caption" noWrap>{value}</Typography>
        </Tooltip>
      ),
    },
  ]

  const hostInfo = window.location.hostname

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
        <TerminalIcon color="primary" />
        <Typography variant="h5" fontWeight={700} sx={{ flexGrow: 1 }}>Syslog Viewer</Typography>
        <Tooltip title="Setup guide">
          <IconButton onClick={() => setShowSetup((v) => !v)}>
            <InfoOutlinedIcon />
          </IconButton>
        </Tooltip>
        {user?.is_superuser && (
          <Button variant="outlined" color="error" startIcon={<DeleteForeverIcon />}
            onClick={() => setClearOpen(true)}>
            Clear All
          </Button>
        )}
      </Box>

      {/* Setup guide */}
      <Collapse in={showSetup}>
        <Alert severity="info" sx={{ mb: 2 }} icon={<TerminalIcon />}>
          <Typography variant="body2" fontWeight={600} mb={0.5}>Device Syslog Setup</Typography>
          <Typography variant="body2">
            On each Zyxel device: <strong>Configuration → Log &amp; Report → Log Settings → Remote Server</strong>
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
            <Typography variant="body2" fontFamily="monospace">
              Server IP: <strong>{hostInfo}</strong> &nbsp;|&nbsp; Port: <strong>514</strong> &nbsp;|&nbsp; Protocol: <strong>UDP</strong>
            </Typography>
            <Tooltip title="Copy server IP">
              <IconButton size="small" onClick={() => { navigator.clipboard.writeText(hostInfo); toast.push('Copied', 'success') }}>
                <ContentCopyIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </Alert>
      </Collapse>

      {/* Summary */}
      {summary && (
        <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
          <Chip label={`${summary.total_24h} entries (24h)`} variant="outlined" />
          <Chip label={`${summary.devices_sending} devices sending`} variant="outlined" />
          {Object.entries(summary.by_severity).map(([sev, count]) => (
            <Chip key={sev} size="small" label={`${sev}: ${count}`}
              color={SEVERITY_COLORS[sev] ?? 'default'} variant="outlined" />
          ))}
        </Box>
      )}

      {/* Filters */}
      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ pb: '12px !important' }}>
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 1.5 }}>
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Device</InputLabel>
              <Select label="Device" value={filterDevice} onChange={(e) => setFilterDevice(e.target.value)}>
                <MenuItem value="">All Devices</MenuItem>
                {devices.map((d) => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 145 }}>
              <InputLabel>Min Severity</InputLabel>
              <Select label="Min Severity" value={filterSeverity} onChange={(e) => setFilterSeverity(String(e.target.value))}>
                <MenuItem value="">Any</MenuItem>
                {SEVERITY_OPTIONS.map((s) => (
                  <MenuItem key={s.value} value={String(s.value)}>{s.label}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 145 }}>
              <InputLabel>Max Severity</InputLabel>
              <Select label="Max Severity" value={filterSeverityMax} onChange={(e) => setFilterSeverityMax(String(e.target.value))}>
                <MenuItem value="">Any</MenuItem>
                {SEVERITY_OPTIONS.map((s) => (
                  <MenuItem key={s.value} value={String(s.value)}>{s.label}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 135 }}>
              <InputLabel>Facility</InputLabel>
              <Select label="Facility" value={filterFacility} onChange={(e) => setFilterFacility(String(e.target.value))}>
                <MenuItem value="">All</MenuItem>
                {FACILITY_OPTIONS.map((f) => (
                  <MenuItem key={f.value} value={String(f.value)}>{f.label}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Time Range</InputLabel>
              <Select label="Time Range" value={filterHours} onChange={(e) => setFilterHours(Number(e.target.value))}>
                <MenuItem value={1}>Last 1h</MenuItem>
                <MenuItem value={6}>Last 6h</MenuItem>
                <MenuItem value={24}>Last 24h</MenuItem>
                <MenuItem value={72}>Last 3 days</MenuItem>
                <MenuItem value={168}>Last 7 days</MenuItem>
                <MenuItem value={720}>Last 30 days</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 100 }}>
              <InputLabel>Limit</InputLabel>
              <Select label="Limit" value={filterLimit} onChange={(e) => setFilterLimit(Number(e.target.value))}>
                <MenuItem value={100}>100</MenuItem>
                <MenuItem value={500}>500</MenuItem>
                <MenuItem value={1000}>1 000</MenuItem>
                <MenuItem value={5000}>5 000</MenuItem>
              </Select>
            </FormControl>
          </Box>

          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            <TextField size="small" label="Source IP" value={filterSourceIp}
              onChange={(e) => setFilterSourceIp(e.target.value)} sx={{ minWidth: 150 }} />
            <TextField size="small" label="Program" value={filterProgram}
              onChange={(e) => setFilterProgram(e.target.value)} sx={{ minWidth: 130 }} />
            <TextField size="small" label="Search message" value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)} sx={{ minWidth: 200 }} />
          </Box>
        </CardContent>
      </Card>

      {isLoading ? <LinearProgress /> : (
        <DataGrid
          rows={entries}
          columns={columns}
          autoHeight
          pageSizeOptions={[50, 100, 500]}
          initialState={{ pagination: { paginationModel: { pageSize: 100 } } }}
          disableRowSelectionOnClick
          density="compact"
          slots={{ toolbar: TableConfigToolbar }}
          columnVisibilityModel={visibility['syslog-entries'] ?? {}}
          onColumnVisibilityModelChange={(model) => setVisibility('syslog-entries', model)}
          sx={{ bgcolor: 'background.paper', borderRadius: 1 }}
        />
      )}

      <ConfirmDialog
        open={clearOpen}
        title="Clear All Syslog Entries"
        message="This will permanently delete all syslog entries. This cannot be undone."
        confirmLabel="Clear All"
        confirmColor="error"
        onConfirm={() => clearMut.mutate()}
        onClose={() => setClearOpen(false)}
        loading={clearMut.isPending}
      />
    </Box>
  )
}
