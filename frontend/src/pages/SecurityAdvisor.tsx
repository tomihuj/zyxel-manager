import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Box, Typography, Tabs, Tab, Card, CardContent, Chip, Button, Grid,
  LinearProgress, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Select, MenuItem, FormControl, InputLabel, CircularProgress,
  Paper, Tooltip, IconButton, Collapse, Divider, Stack, Alert,
} from '@mui/material'
import { DataGrid } from '@mui/x-data-grid'
import type { GridColDef } from '@mui/x-data-grid'
import SecurityIcon from '@mui/icons-material/Security'
import RefreshIcon from '@mui/icons-material/Refresh'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import RestoreIcon from '@mui/icons-material/Restore'
import BuildIcon from '@mui/icons-material/Build'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import {
  listFindings, suppressFinding, reopenFinding, remediateFinding,
  listScans, triggerScan, listScores, getSecuritySummary, getFindingContext,
} from '../api/security'
import { listDevices } from '../api/devices'
import { useToastStore } from '../store/toast'
import type { SecurityFinding, SecurityScan } from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SEVERITY_COLOR: Record<string, string> = {
  critical: '#dc2626',
  high: '#d97706',
  medium: '#ca8a04',
  low: '#2563eb',
  info: '#6b7280',
}

const SEVERITY_MUI: Record<string, 'error' | 'warning' | 'info' | 'default'> = {
  critical: 'error',
  high: 'warning',
  medium: 'warning',
  low: 'info',
  info: 'default',
}

const CATEGORY_LABELS: Record<string, string> = {
  exposed_service: 'Exposed Service',
  permissive_rule: 'Permissive Rule',
  weak_protocol: 'Weak Protocol',
  missing_hardening: 'Missing Hardening',
  firmware: 'Firmware',
  authentication: 'Authentication',
}

function gradeColor(grade: string) {
  if (grade === 'A') return '#059669'
  if (grade === 'B') return '#16a34a'
  if (grade === 'C') return '#ca8a04'
  if (grade === 'D') return '#d97706'
  return '#dc2626'
}

function ScoreGauge({ score, grade }: { score: number; grade: string }) {
  const color = gradeColor(grade)
  return (
    <Box sx={{ textAlign: 'center', py: 2 }}>
      <Typography variant="h1" fontWeight={800} sx={{ color, lineHeight: 1 }}>
        {score}
      </Typography>
      <Typography variant="h4" fontWeight={700} sx={{ color, mt: 0.5 }}>
        {grade}
      </Typography>
      <Typography variant="body2" color="text.secondary" mt={1}>
        Fleet Security Score
      </Typography>
    </Box>
  )
}

// ---------------------------------------------------------------------------
// Tab panels
// ---------------------------------------------------------------------------

function TabPanel({ value, index, children }: { value: number; index: number; children: React.ReactNode }) {
  return value === index ? <Box sx={{ pt: 3 }}>{children}</Box> : null
}

// ---------------------------------------------------------------------------
// Overview tab
// ---------------------------------------------------------------------------

function OverviewTab() {
  const { push } = useToastStore()
  const qc = useQueryClient()

  const { data: summary } = useQuery({
    queryKey: ['security-summary'],
    queryFn: getSecuritySummary,
    refetchInterval: 30_000,
  })

  const { data: scores = [] } = useQuery({
    queryKey: ['security-scores'],
    queryFn: listScores,
    refetchInterval: 30_000,
  })

  const scanMut = useMutation({
    mutationFn: () => triggerScan(null),
    onSuccess: () => {
      push('Fleet security scan triggered — results will update shortly')
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['security-summary'] })
        qc.invalidateQueries({ queryKey: ['security-scores'] })
        qc.invalidateQueries({ queryKey: ['security-findings'] })
        qc.invalidateQueries({ queryKey: ['security-scans'] })
      }, 4000)
    },
    onError: () => push('Failed to trigger scan', 'error'),
  })

  const fleetScore = summary?.fleet_score ?? 100
  const fleetGrade = summary?.fleet_grade ?? 'A'
  const bySeverity = summary?.by_severity ?? {}
  const severities = ['critical', 'high', 'medium', 'low', 'info']
  const maxSeverityCount = Math.max(...severities.map((s) => bySeverity[s] ?? 0), 1)

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <Button
          variant="contained"
          startIcon={scanMut.isPending ? <CircularProgress size={16} color="inherit" /> : <PlayArrowIcon />}
          onClick={() => scanMut.mutate()}
          disabled={scanMut.isPending}
          color="primary"
        >
          Scan Now
        </Button>
      </Box>

      <Grid container spacing={3}>
        {/* Score card */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <ScoreGauge score={fleetScore} grade={fleetGrade} />
              <Box sx={{ mt: 2, textAlign: 'center' }}>
                <Chip
                  label={`${summary?.total_open ?? 0} open findings`}
                  color={summary?.total_open ? 'error' : 'success'}
                  size="small"
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Severity breakdown */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" fontWeight={600} mb={2}>Findings by Severity</Typography>
              {severities.map((sev) => {
                const count = bySeverity[sev] ?? 0
                const pct = (count / maxSeverityCount) * 100
                return (
                  <Box key={sev} sx={{ mb: 1.5 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="caption" sx={{ textTransform: 'capitalize', color: SEVERITY_COLOR[sev] }}>
                        {sev}
                      </Typography>
                      <Typography variant="caption" fontWeight={600}>{count}</Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={pct}
                      sx={{
                        height: 6, borderRadius: 3,
                        bgcolor: 'grey.200',
                        '& .MuiLinearProgress-bar': { bgcolor: SEVERITY_COLOR[sev], borderRadius: 3 },
                      }}
                    />
                  </Box>
                )
              })}
            </CardContent>
          </Card>
        </Grid>

        {/* Category breakdown */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" fontWeight={600} mb={2}>Findings by Category</Typography>
              {Object.entries(summary?.by_category ?? {}).length === 0 && (
                <Typography variant="body2" color="text.secondary">No open findings.</Typography>
              )}
              {Object.entries(summary?.by_category ?? {}).map(([cat, count]) => (
                <Box key={cat} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.75, borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="body2">{CATEGORY_LABELS[cat] ?? cat}</Typography>
                  <Chip label={count} size="small" />
                </Box>
              ))}
            </CardContent>
          </Card>
        </Grid>

        {/* Per-device scores */}
        <Grid item xs={12}>
          <Typography variant="h6" fontWeight={600} mb={2}>Device Security Scores</Typography>
          <Grid container spacing={2}>
            {scores.length === 0 && (
              <Grid item xs={12}>
                <Typography variant="body2" color="text.secondary">
                  No scores yet — run a scan to populate device scores.
                </Typography>
              </Grid>
            )}
            {scores.map((s) => (
              <Grid item xs={12} sm={6} md={4} lg={3} key={s.id}>
                <Card variant="outlined">
                  <CardContent sx={{ pb: '12px !important' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <Typography variant="body2" fontWeight={600} noWrap sx={{ maxWidth: 140 }}>
                        {s.device_name}
                      </Typography>
                      <Typography variant="h5" fontWeight={800} sx={{ color: gradeColor(s.grade) }}>
                        {s.grade}
                      </Typography>
                    </Box>
                    <Typography variant="h4" fontWeight={700} sx={{ color: gradeColor(s.grade), mt: 0.5 }}>
                      {s.score}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, mt: 1, flexWrap: 'wrap' }}>
                      {s.critical_findings > 0 && (
                        <Chip label={`${s.critical_findings} critical`} size="small" color="error" />
                      )}
                      {s.high_findings > 0 && (
                        <Chip label={`${s.high_findings} high`} size="small" color="warning" />
                      )}
                      {s.open_findings === 0 && (
                        <Chip label="Clean" size="small" color="success" />
                      )}
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Grid>
      </Grid>
    </Box>
  )
}

// ---------------------------------------------------------------------------
// Finding context dialog — full details + live config section
// ---------------------------------------------------------------------------

function FindingContextDialog({
  findingId,
  onClose,
}: {
  findingId: string | null
  onClose: () => void
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['security-finding-context', findingId],
    queryFn: () => getFindingContext(findingId!),
    enabled: !!findingId,
  })

  const f = data?.finding
  const section = data?.section
  const config = data?.config

  // Render config as a nicely formatted section-aware view
  function renderConfig() {
    if (!config) return null
    if ((config as any)._error) {
      return (
        <Alert severity="error" sx={{ mt: 1 }}>
          Could not fetch config: {(config as any)._error}
        </Alert>
      )
    }

    // For list-type sections (firewall_rules, nat, service_objects, etc.) render a table-like view
    if (Array.isArray(config)) {
      if (config.length === 0) {
        return <Typography variant="body2" color="text.secondary">No entries in this section.</Typography>
      }
      return (
        <Stack spacing={0.75} sx={{ mt: 1 }}>
          {(config as Record<string, unknown>[]).map((item, i) => (
            <Box
              key={i}
              sx={{
                p: 1.5, borderRadius: 1, border: '1px solid',
                borderColor: 'divider', bgcolor: 'background.paper',
                fontFamily: 'monospace', fontSize: 12,
                display: 'flex', flexWrap: 'wrap', gap: 1,
              }}
            >
              {Object.entries(item).map(([k, v]) => (
                <Box key={k}>
                  <Typography component="span" variant="caption" color="text.secondary">{k}: </Typography>
                  <Typography component="span" variant="caption" fontWeight={600}>
                    {v === null ? 'null' : v === true ? 'true' : v === false ? 'false' : String(v)}
                  </Typography>
                </Box>
              ))}
            </Box>
          ))}
        </Stack>
      )
    }

    // For object sections, render key-value pairs
    return (
      <Box
        component="pre"
        sx={{
          mt: 1, p: 1.5, borderRadius: 1, border: '1px solid',
          borderColor: 'divider', bgcolor: 'action.hover',
          fontSize: 12, fontFamily: 'monospace',
          overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          maxHeight: 300, overflowY: 'auto',
        }}
      >
        {JSON.stringify(config, null, 2)}
      </Box>
    )
  }

  return (
    <Dialog open={!!findingId} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        Finding Details
        {f && (
          <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
            <Chip
              label={f.severity}
              size="small"
              color={SEVERITY_MUI[f.severity] ?? 'default'}
              sx={{ textTransform: 'capitalize' }}
            />
            <Chip label={CATEGORY_LABELS[f.category] ?? f.category} size="small" variant="outlined" />
            <Chip
              label={f.status}
              size="small"
              color={f.status === 'open' ? 'error' : f.status === 'suppressed' ? 'warning' : 'success'}
              variant="outlined"
              sx={{ textTransform: 'capitalize' }}
            />
          </Box>
        )}
      </DialogTitle>

      <DialogContent dividers>
        {isLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        )}
        {isError && <Alert severity="error">Failed to load finding details.</Alert>}

        {f && (
          <Stack spacing={2}>
            {/* Core fields */}
            <Box>
              <Typography variant="subtitle2" fontWeight={700}>{f.title}</Typography>
              <Typography variant="caption" color="text.secondary">
                Device: {f.device_name ?? f.device_id}
                {f.first_seen && ` · First seen: ${new Date(f.first_seen).toLocaleString()}`}
                {f.last_seen && ` · Last seen: ${new Date(f.last_seen).toLocaleString()}`}
              </Typography>
            </Box>

            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                <strong>Description</strong>
              </Typography>
              <Typography variant="body2">{f.description}</Typography>
            </Box>

            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                <strong>Recommendation</strong>
              </Typography>
              <Typography variant="body2">{f.recommendation}</Typography>
            </Box>

            {f.config_path && (
              <Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  <strong>Config path</strong>
                </Typography>
                <Typography variant="body2" fontFamily="monospace" sx={{ bgcolor: 'action.hover', px: 1, py: 0.5, borderRadius: 1, display: 'inline-block' }}>
                  {f.config_path}
                </Typography>
              </Box>
            )}

            {f.compliance_refs && f.compliance_refs.length > 0 && (
              <Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  <strong>Compliance references</strong>
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {f.compliance_refs.map((ref) => (
                    <Chip key={ref} label={ref} size="small" variant="outlined" />
                  ))}
                </Box>
              </Box>
            )}

            {f.suppressed_reason && (
              <Alert severity="warning">
                <strong>Suppression reason:</strong> {f.suppressed_reason}
              </Alert>
            )}

            {/* Live config section */}
            <Divider />
            <Box>
              <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                Active Configuration
                {section && (
                  <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                    (section: <code>{section}</code>)
                  </Typography>
                )}
              </Typography>
              {isLoading
                ? <CircularProgress size={20} />
                : renderConfig()
              }
            </Box>
          </Stack>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}


// ---------------------------------------------------------------------------
// Findings tab
// ---------------------------------------------------------------------------

function FindingsTab() {
  const navigate = useNavigate()
  const { push } = useToastStore()
  const qc = useQueryClient()

  const [filterSeverity, setFilterSeverity] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterStatus, setFilterStatus] = useState('open')
  const [filterDevice, setFilterDevice] = useState('')
  const [suppressDialogOpen, setSuppressDialogOpen] = useState(false)
  const [suppressTarget, setSuppressTarget] = useState<SecurityFinding | null>(null)
  const [suppressReason, setSuppressReason] = useState('')
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [contextFindingId, setContextFindingId] = useState<string | null>(null)

  const { data: findings = [], isLoading } = useQuery({
    queryKey: ['security-findings', filterSeverity, filterCategory, filterStatus, filterDevice],
    queryFn: () => listFindings({
      severity: filterSeverity || undefined,
      category: filterCategory || undefined,
      status: filterStatus || undefined,
      device_id: filterDevice || undefined,
    }),
    refetchInterval: 30_000,
  })

  const { data: devices = [] } = useQuery({ queryKey: ['devices'], queryFn: listDevices })

  const suppressMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => suppressFinding(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['security-findings'] })
      qc.invalidateQueries({ queryKey: ['security-summary'] })
      push('Finding suppressed')
      setSuppressDialogOpen(false)
      setSuppressReason('')
    },
    onError: () => push('Failed to suppress finding', 'error'),
  })

  const reopenMut = useMutation({
    mutationFn: (id: string) => reopenFinding(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['security-findings'] })
      qc.invalidateQueries({ queryKey: ['security-summary'] })
      push('Finding reopened')
    },
    onError: () => push('Failed to reopen finding', 'error'),
  })

  const remediateMut = useMutation({
    mutationFn: (id: string) => remediateFinding(id),
    onSuccess: (data) => {
      push('Remediation job created')
      navigate('/bulk')
    },
    onError: () => push('Failed to create remediation job', 'error'),
  })

  const columns: GridColDef[] = [
    {
      field: 'severity', headerName: 'Severity', width: 110,
      renderCell: (p) => (
        <Chip
          label={p.value}
          size="small"
          color={SEVERITY_MUI[p.value] ?? 'default'}
          sx={{ textTransform: 'capitalize' }}
        />
      ),
    },
    {
      field: 'category', headerName: 'Category', width: 160,
      valueGetter: (v) => CATEGORY_LABELS[v] ?? v,
    },
    { field: 'title', headerName: 'Title', flex: 1, minWidth: 200 },
    {
      field: 'device_name', headerName: 'Device', width: 150,
      valueGetter: (v) => v ?? '—',
    },
    {
      field: 'status', headerName: 'Status', width: 110,
      renderCell: (p) => (
        <Chip
          label={p.value}
          size="small"
          color={p.value === 'open' ? 'error' : p.value === 'suppressed' ? 'warning' : 'success'}
          variant={p.value === 'resolved' ? 'outlined' : 'filled'}
          sx={{ textTransform: 'capitalize' }}
        />
      ),
    },
    {
      field: 'first_seen', headerName: 'First Seen', width: 165,
      valueGetter: (v) => new Date(v).toLocaleString(),
    },
    {
      field: 'last_seen', headerName: 'Last Seen', width: 165,
      valueGetter: (v) => new Date(v).toLocaleString(),
    },
    {
      field: 'actions', headerName: '', width: 160, sortable: false,
      renderCell: (p) => {
        const f: SecurityFinding = p.row
        return (
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Tooltip title="View details & active config">
              <IconButton size="small" color="info" onClick={() => setContextFindingId(f.id)}>
                <InfoOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Expand summary">
              <IconButton size="small" onClick={() => setExpandedRow(expandedRow === f.id ? null : f.id)}>
                {expandedRow === f.id ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
            {f.status === 'open' && (
              <Tooltip title="Suppress (false positive)">
                <IconButton
                  size="small"
                  onClick={() => { setSuppressTarget(f); setSuppressDialogOpen(true) }}
                >
                  <VisibilityOffIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {f.status === 'suppressed' && (
              <Tooltip title="Re-open">
                <IconButton size="small" onClick={() => reopenMut.mutate(f.id)}>
                  <RestoreIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {f.remediation_patch && f.status === 'open' && (
              <Tooltip title="Create remediation job">
                <IconButton
                  size="small"
                  color="primary"
                  onClick={() => remediateMut.mutate(f.id)}
                  disabled={remediateMut.isPending}
                >
                  <BuildIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        )
      },
    },
  ]

  return (
    <Box>
      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>Severity</InputLabel>
          <Select label="Severity" value={filterSeverity} onChange={(e) => setFilterSeverity(e.target.value)}>
            <MenuItem value="">All</MenuItem>
            {['critical', 'high', 'medium', 'low', 'info'].map((s) => (
              <MenuItem key={s} value={s} sx={{ textTransform: 'capitalize' }}>{s}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>Category</InputLabel>
          <Select label="Category" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            <MenuItem value="">All</MenuItem>
            {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
              <MenuItem key={v} value={v}>{l}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>Status</InputLabel>
          <Select label="Status" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <MenuItem value="">All</MenuItem>
            {['open', 'suppressed', 'resolved'].map((s) => (
              <MenuItem key={s} value={s} sx={{ textTransform: 'capitalize' }}>{s}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Device</InputLabel>
          <Select label="Device" value={filterDevice} onChange={(e) => setFilterDevice(e.target.value)}>
            <MenuItem value="">All Devices</MenuItem>
            {devices.map((d) => (
              <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {/* Expanded row detail */}
      {expandedRow && (() => {
        const f = findings.find((x) => x.id === expandedRow)
        if (!f) return null
        return (
          <Card sx={{ mb: 2, bgcolor: 'action.hover' }}>
            <CardContent>
              <Typography variant="subtitle2" gutterBottom>{f.title}</Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                <strong>Description:</strong> {f.description}
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                <strong>Recommendation:</strong> {f.recommendation}
              </Typography>
              {f.config_path && (
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  <strong>Config path:</strong> <code>{f.config_path}</code>
                </Typography>
              )}
              {f.compliance_refs && f.compliance_refs.length > 0 && (
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 1 }}>
                  {f.compliance_refs.map((ref) => (
                    <Chip key={ref} label={ref} size="small" variant="outlined" />
                  ))}
                </Box>
              )}
              {f.suppressed_reason && (
                <Typography variant="body2" color="warning.main" mt={1}>
                  <strong>Suppression reason:</strong> {f.suppressed_reason}
                </Typography>
              )}
            </CardContent>
          </Card>
        )
      })()}

      <Paper>
        <DataGrid
          rows={findings}
          columns={columns}
          loading={isLoading}
          autoHeight
          pageSizeOptions={[25, 50, 100]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          disableRowSelectionOnClick
          getRowClassName={(p) =>
            p.row.status === 'suppressed' || p.row.status === 'resolved'
              ? 'finding-dimmed'
              : ''
          }
          sx={{
            '& .finding-dimmed': { opacity: 0.55 },
          }}
        />
      </Paper>

      {/* Finding context dialog */}
      <FindingContextDialog
        findingId={contextFindingId}
        onClose={() => setContextFindingId(null)}
      />

      {/* Suppress dialog */}
      <Dialog open={suppressDialogOpen} onClose={() => setSuppressDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Suppress Finding</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {suppressTarget?.title}
          </Typography>
          <TextField
            label="Reason (required)"
            value={suppressReason}
            onChange={(e) => setSuppressReason(e.target.value)}
            fullWidth
            multiline
            rows={3}
            sx={{ mt: 1 }}
            placeholder="e.g. Accepted risk — monitored by external IDS"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSuppressDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="warning"
            disabled={!suppressReason || suppressMut.isPending}
            onClick={() => suppressTarget && suppressMut.mutate({ id: suppressTarget.id, reason: suppressReason })}
          >
            Suppress
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

// ---------------------------------------------------------------------------
// Scan detail panel (expanded)
// ---------------------------------------------------------------------------

function ScanDetail({ scan }: { scan: SecurityScan }) {
  const { data: findings = [], isLoading } = useQuery({
    queryKey: ['security-findings-scan', scan.id],
    queryFn: () => listFindings({ scan_id: scan.id }),
  })

  // Group findings by device
  const byDevice = useMemo(() => {
    const map: Record<string, { device_id: string; device_name: string; findings: SecurityFinding[] }> = {}
    for (const f of findings) {
      if (!map[f.device_id]) {
        map[f.device_id] = { device_id: f.device_id, device_name: f.device_name ?? f.device_id, findings: [] }
      }
      map[f.device_id].findings.push(f)
    }
    return Object.values(map).sort((a, b) => a.device_name.localeCompare(b.device_name))
  }, [findings])

  // Human-readable description sentence
  const scope = scan.device_id
    ? `device "${scan.device_name ?? scan.device_id}"`
    : `all devices (fleet scan)`
  const trigger = scan.triggered_by === 'scheduled'
    ? 'Scheduled automatically'
    : scan.triggered_by_username
      ? `Triggered manually by ${scan.triggered_by_username}`
      : 'Triggered manually'
  const duration = scan.completed_at
    ? (() => {
        const ms = new Date(scan.completed_at).getTime() - new Date(scan.started_at).getTime()
        return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`
      })()
    : null

  const severityOrder = ['critical', 'high', 'medium', 'low', 'info']

  return (
    <Box sx={{ px: 3, pb: 3, pt: 1 }}>
      {/* Description paragraph */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: 'action.hover' }}>
        <Typography variant="body2">
          <strong>{trigger}</strong> on {scope}.{' '}
          Started at {new Date(scan.started_at).toLocaleString()}.
          {duration && ` Completed in ${duration}.`}
          {scan.status === 'failed' && !duration && ' Did not complete.'}
        </Typography>
        {scan.findings_count > 0 && (
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            Found <strong>{scan.findings_count}</strong> issue{scan.findings_count !== 1 ? 's' : ''}
            {scan.critical_count > 0 && ` — ${scan.critical_count} critical`}
            {scan.high_count > 0 && `, ${scan.high_count} high`}
            {scan.medium_count > 0 && `, ${scan.medium_count} medium`}
            {scan.low_count > 0 && `, ${scan.low_count} low`}
            {scan.info_count > 0 && `, ${scan.info_count} info`}
            {'. '}
            Risk score: <strong>{scan.risk_score}</strong>.
          </Typography>
        )}
        {scan.findings_count === 0 && scan.status === 'completed' && (
          <Typography variant="body2" sx={{ mt: 0.5, color: 'success.main' }}>
            No issues found — all checks passed.
          </Typography>
        )}
        {scan.error && (
          <Alert severity="error" sx={{ mt: 1 }}>{scan.error}</Alert>
        )}
      </Paper>

      {/* Per-device results */}
      {isLoading && <CircularProgress size={20} />}
      {!isLoading && byDevice.length === 0 && scan.status === 'completed' && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'success.main' }}>
          <CheckCircleOutlineIcon fontSize="small" />
          <Typography variant="body2">No findings recorded for this scan.</Typography>
        </Box>
      )}
      {byDevice.map(({ device_id, device_name, findings: dFindings }) => {
        const countBySev = severityOrder.reduce<Record<string, number>>((acc, s) => {
          acc[s] = dFindings.filter((f) => f.severity === s).length
          return acc
        }, {})
        return (
          <Box key={device_id} sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Typography variant="subtitle2" fontWeight={600}>{device_name}</Typography>
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                {severityOrder.map((sev) =>
                  countBySev[sev] > 0 ? (
                    <Chip
                      key={sev}
                      label={`${countBySev[sev]} ${sev}`}
                      size="small"
                      color={SEVERITY_MUI[sev] ?? 'default'}
                      sx={{ textTransform: 'capitalize', fontSize: 11 }}
                    />
                  ) : null
                )}
                {dFindings.length === 0 && (
                  <Chip label="clean" size="small" color="success" sx={{ fontSize: 11 }} />
                )}
              </Box>
            </Box>
            <Stack spacing={0.5}>
              {dFindings.map((f) => (
                <Box
                  key={f.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    py: 0.75,
                    px: 1.5,
                    borderRadius: 1,
                    bgcolor: 'background.paper',
                    border: '1px solid',
                    borderColor: 'divider',
                    opacity: f.status !== 'open' ? 0.6 : 1,
                  }}
                >
                  <Chip
                    label={f.severity}
                    size="small"
                    color={SEVERITY_MUI[f.severity] ?? 'default'}
                    sx={{ textTransform: 'capitalize', minWidth: 72, justifyContent: 'center' }}
                  />
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={500} noWrap>{f.title}</Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {CATEGORY_LABELS[f.category] ?? f.category}
                      {f.config_path && ` · ${f.config_path}`}
                    </Typography>
                  </Box>
                  <Chip
                    label={f.status}
                    size="small"
                    variant="outlined"
                    color={f.status === 'open' ? 'error' : f.status === 'suppressed' ? 'warning' : 'success'}
                    sx={{ textTransform: 'capitalize', flexShrink: 0 }}
                  />
                </Box>
              ))}
            </Stack>
          </Box>
        )
      })}
    </Box>
  )
}


// ---------------------------------------------------------------------------
// Scans tab
// ---------------------------------------------------------------------------

function ScansTab() {
  const { push } = useToastStore()
  const qc = useQueryClient()

  const [scanDevice, setScanDevice] = useState('')
  const [expandedScan, setExpandedScan] = useState<string | null>(null)

  const { data: scans = [], isLoading } = useQuery({
    queryKey: ['security-scans'],
    queryFn: listScans,
    refetchInterval: 15_000,
  })

  const { data: devices = [] } = useQuery({ queryKey: ['devices'], queryFn: listDevices })

  const scanMut = useMutation({
    mutationFn: () => triggerScan(scanDevice || null),
    onSuccess: () => {
      push('Scan triggered')
      setTimeout(() => qc.invalidateQueries({ queryKey: ['security-scans'] }), 3000)
    },
    onError: () => push('Failed to trigger scan', 'error'),
  })

  function toggleExpand(id: string) {
    setExpandedScan((prev) => (prev === id ? null : id))
  }

  function durationStr(scan: SecurityScan) {
    if (!scan.completed_at) return '—'
    const ms = new Date(scan.completed_at).getTime() - new Date(scan.started_at).getTime()
    return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`
  }

  return (
    <Box>
      {/* Trigger controls */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, alignItems: 'center', flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>Device (optional)</InputLabel>
          <Select label="Device (optional)" value={scanDevice} onChange={(e) => setScanDevice(e.target.value)}>
            <MenuItem value="">Fleet (all devices)</MenuItem>
            {devices.map((d) => (
              <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button
          variant="contained"
          startIcon={scanMut.isPending ? <CircularProgress size={16} color="inherit" /> : <PlayArrowIcon />}
          onClick={() => scanMut.mutate()}
          disabled={scanMut.isPending}
        >
          Trigger Scan
        </Button>
      </Box>

      {isLoading && <CircularProgress size={24} />}

      {!isLoading && scans.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          No scans yet — trigger one above.
        </Typography>
      )}

      {/* Scan list */}
      <Stack spacing={1}>
        {scans.map((scan) => {
          const isExpanded = expandedScan === scan.id
          const scope = scan.device_id ? scan.device_name ?? scan.device_id : 'Fleet'
          const triggerLabel = scan.triggered_by === 'scheduled'
            ? 'Scheduled'
            : scan.triggered_by_username
              ? `Manual · ${scan.triggered_by_username}`
              : 'Manual'

          return (
            <Paper key={scan.id} variant="outlined">
              {/* Header row */}
              <Box
                sx={{
                  display: 'flex', alignItems: 'center', gap: 1.5,
                  px: 2, py: 1.5, cursor: 'pointer',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
                onClick={() => toggleExpand(scan.id)}
              >
                {/* Expand chevron */}
                <IconButton size="small" sx={{ flexShrink: 0 }}>
                  {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                </IconButton>

                {/* Date + scope */}
                <Box sx={{ minWidth: 200 }}>
                  <Typography variant="body2" fontWeight={600}>
                    {new Date(scan.started_at).toLocaleString()}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {scope} · {triggerLabel}
                  </Typography>
                </Box>

                {/* Status */}
                <Chip
                  label={scan.status}
                  size="small"
                  color={scan.status === 'completed' ? 'success' : scan.status === 'running' ? 'info' : 'error'}
                  sx={{ textTransform: 'capitalize', flexShrink: 0 }}
                />

                {/* Severity counts */}
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', flexGrow: 1 }}>
                  {scan.critical_count > 0 && (
                    <Chip label={`${scan.critical_count} critical`} size="small" color="error" />
                  )}
                  {scan.high_count > 0 && (
                    <Chip label={`${scan.high_count} high`} size="small" color="warning" />
                  )}
                  {scan.medium_count > 0 && (
                    <Chip label={`${scan.medium_count} medium`} size="small" sx={{ bgcolor: '#ca8a04', color: '#fff' }} />
                  )}
                  {scan.low_count > 0 && (
                    <Chip label={`${scan.low_count} low`} size="small" color="info" />
                  )}
                  {scan.info_count > 0 && (
                    <Chip label={`${scan.info_count} info`} size="small" />
                  )}
                  {scan.findings_count === 0 && scan.status === 'completed' && (
                    <Chip label="No findings" size="small" color="success" variant="outlined" />
                  )}
                </Box>

                {/* Score + duration */}
                <Box sx={{ textAlign: 'right', flexShrink: 0, minWidth: 80 }}>
                  <Typography variant="body2" fontWeight={700} sx={{ color: gradeColor(
                    scan.risk_score >= 90 ? 'A' : scan.risk_score >= 75 ? 'B' : scan.risk_score >= 50 ? 'C' : scan.risk_score >= 25 ? 'D' : 'F'
                  ) }}>
                    Score {scan.risk_score}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {durationStr(scan)}
                  </Typography>
                </Box>
              </Box>

              {/* Expanded detail */}
              <Collapse in={isExpanded} unmountOnExit>
                <Divider />
                <ScanDetail scan={scan} />
              </Collapse>
            </Paper>
          )
        })}
      </Stack>
    </Box>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function SecurityAdvisor() {
  const [tab, setTab] = useState(0)
  const qc = useQueryClient()
  const [refreshing, setRefreshing] = useState(false)

  async function handleRefresh() {
    setRefreshing(true)
    await qc.invalidateQueries({ queryKey: ['security-summary'] })
    await qc.invalidateQueries({ queryKey: ['security-scores'] })
    await qc.invalidateQueries({ queryKey: ['security-findings'] })
    await qc.invalidateQueries({ queryKey: ['security-scans'] })
    setRefreshing(false)
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <SecurityIcon color="error" />
        <Typography variant="h5" fontWeight={700}>Security Advisor</Typography>
        <Box sx={{ flexGrow: 1 }} />
        <Tooltip title="Refresh">
          <IconButton onClick={handleRefresh} disabled={refreshing}>
            <RefreshIcon sx={{ transition: 'transform 0.4s', transform: refreshing ? 'rotate(360deg)' : 'none' }} />
          </IconButton>
        </Tooltip>
      </Box>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 1, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="Overview" />
        <Tab label="Findings" />
        <Tab label="Scan History" />
      </Tabs>

      <TabPanel value={tab} index={0}><OverviewTab /></TabPanel>
      <TabPanel value={tab} index={1}><FindingsTab /></TabPanel>
      <TabPanel value={tab} index={2}><ScansTab /></TabPanel>
    </Box>
  )
}
