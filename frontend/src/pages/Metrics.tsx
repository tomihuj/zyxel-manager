import { useState } from 'react'
import {
  Box, Typography, Card, CardContent, Grid, CircularProgress,
  Chip, LinearProgress, Alert, MenuItem, Select, FormControl, InputLabel,
  IconButton, Tooltip, Dialog, DialogTitle, DialogContent, DialogActions,
  Button, FormControlLabel, Checkbox,
} from '@mui/material'
import TuneIcon from '@mui/icons-material/Tune'
import RefreshIcon from '@mui/icons-material/Refresh'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listDevices } from '../api/devices'
import { getDeviceMetrics, getDeviceHealth, getDeviceInterfaces, triggerMetricsCollect } from '../api/metrics'
import { useToastStore } from '../store/toast'
import type { Device } from '../types'
import { useMetricsConfigStore, METRIC_SECTION_LABELS } from '../store/metricsConfig'
import type { MetricSectionId } from '../store/metricsConfig'

function ConfigureDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { visible, toggle, reset } = useMetricsConfigStore()
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Configure Visible Metrics</DialogTitle>
      <DialogContent>
        {(Object.entries(METRIC_SECTION_LABELS) as [MetricSectionId, string][]).map(([id, label]) => (
          <FormControlLabel
            key={id}
            control={<Checkbox checked={visible[id]} onChange={() => toggle(id)} />}
            label={label}
            sx={{ display: 'block' }}
          />
        ))}
      </DialogContent>
      <DialogActions>
        <Button onClick={reset} color="inherit" size="small">Reset to default</Button>
        <Button onClick={onClose} variant="contained" size="small">Done</Button>
      </DialogActions>
    </Dialog>
  )
}

function HealthCard({ deviceId }: { deviceId: string }) {
  const { data: health, isLoading } = useQuery({
    queryKey: ['device-health', deviceId],
    queryFn: () => getDeviceHealth(deviceId),
    refetchInterval: 60_000,
  })

  if (isLoading) return <CircularProgress size={20} />

  const gradeColor: Record<string, 'success' | 'info' | 'warning' | 'error'> = {
    A: 'success', B: 'info', C: 'warning', D: 'error',
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Chip
        label={`Grade ${health.grade}`}
        color={gradeColor[health.grade] ?? 'default'}
        size="small"
      />
      <Typography variant="body2" color="text.secondary">
        {health.score}/100
      </Typography>
    </Box>
  )
}

function MetricsChart({
  deviceId, hours, visible,
}: {
  deviceId: string; hours: number
  visible: Pick<Record<MetricSectionId, boolean>, 'cpu' | 'memory' | 'uptime'>
}) {
  const { data: metrics = [], isLoading } = useQuery({
    queryKey: ['device-metrics', deviceId, hours],
    queryFn: () => getDeviceMetrics(deviceId, hours),
    refetchInterval: 60_000,
  })

  if (isLoading) return <CircularProgress size={24} />
  if (metrics.length === 0) return (
    <Alert severity="info" sx={{ mt: 1 }}>No metrics collected yet. The worker collects every 5 minutes.</Alert>
  )

  const latest = metrics[metrics.length - 1]

  return (
    <Box>
      {visible.cpu && (
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="body2">CPU Usage</Typography>
            <Typography variant="body2" fontWeight={600}>{latest.cpu_pct?.toFixed(1)}%</Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={latest.cpu_pct ?? 0}
            color={latest.cpu_pct > 80 ? 'error' : latest.cpu_pct > 60 ? 'warning' : 'success'}
            sx={{ height: 8, borderRadius: 1 }}
          />
        </Box>
      )}
      {visible.memory && (
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="body2">Memory Usage</Typography>
            <Typography variant="body2" fontWeight={600}>{latest.memory_pct?.toFixed(1)}%</Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={latest.memory_pct ?? 0}
            color={latest.memory_pct > 80 ? 'error' : latest.memory_pct > 60 ? 'warning' : 'success'}
            sx={{ height: 8, borderRadius: 1 }}
          />
        </Box>
      )}
      {visible.uptime && (
        <Typography variant="caption" color="text.secondary">
          Uptime: {formatUptime(latest.uptime_seconds)} · {metrics.length} data points
        </Typography>
      )}
    </Box>
  )
}

function InterfaceList({ deviceId }: { deviceId: string }) {
  const { data: interfaces = [] } = useQuery({
    queryKey: ['device-interfaces', deviceId],
    queryFn: () => getDeviceInterfaces(deviceId),
  })
  if (interfaces.length === 0) return null
  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="caption" fontWeight={600} color="text.secondary">
        INTERFACES
      </Typography>
      {interfaces.map((iface: any, i: number) => (
        <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 0.5 }}>
          <Chip label={iface.name} size="small" variant="outlined" />
          <Typography variant="caption" color="text.secondary">
            {iface.type} · {iface.ip}/{iface.mask}
          </Typography>
        </Box>
      ))}
    </Box>
  )
}

function formatUptime(seconds?: number): string {
  if (!seconds) return 'N/A'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export default function Metrics() {
  const [hours, setHours] = useState(24)
  const [configOpen, setConfigOpen] = useState(false)
  const { visible } = useMetricsConfigStore()
  const { push } = useToastStore()
  const qc = useQueryClient()
  const { data: devices = [], isLoading } = useQuery({
    queryKey: ['devices'],
    queryFn: listDevices,
  })

  const collectMut = useMutation({
    mutationFn: triggerMetricsCollect,
    onSuccess: () => {
      push('Metrics collection started — refreshing in 5s')
      setTimeout(() => qc.invalidateQueries({ queryKey: ['device-metrics'] }), 5000)
    },
    onError: () => push('Failed to trigger metrics collection', 'error'),
  })

  if (isLoading) return <CircularProgress />

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>Device Metrics</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Time Range</InputLabel>
            <Select label="Time Range" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
              <MenuItem value={1}>Last 1 hour</MenuItem>
              <MenuItem value={6}>Last 6 hours</MenuItem>
              <MenuItem value={24}>Last 24 hours</MenuItem>
              <MenuItem value={72}>Last 3 days</MenuItem>
              <MenuItem value={168}>Last 7 days</MenuItem>
            </Select>
          </FormControl>
          <Tooltip title="Collect metrics now">
            <IconButton onClick={() => collectMut.mutate()} disabled={collectMut.isPending}>
              {collectMut.isPending
                ? <CircularProgress size={20} />
                : <RefreshIcon />}
            </IconButton>
          </Tooltip>
          <Tooltip title="Configure metrics">
            <IconButton onClick={() => setConfigOpen(true)}><TuneIcon /></IconButton>
          </Tooltip>
        </Box>
      </Box>

      <ConfigureDialog open={configOpen} onClose={() => setConfigOpen(false)} />

      {devices.length === 0 && (
        <Alert severity="info">No devices found. Add devices first.</Alert>
      )}

      <Grid container spacing={3}>
        {devices.map((device: Device) => (
          <Grid item xs={12} md={6} xl={4} key={device.id}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                  <Box>
                    <Typography variant="h6" fontWeight={600}>{device.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{device.mgmt_ip} · {device.model}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
                    <Chip
                      label={device.status}
                      color={device.status === 'online' ? 'success' : device.status === 'offline' ? 'error' : 'default'}
                      size="small"
                    />
                    {visible.health && <HealthCard deviceId={device.id} />}
                  </Box>
                </Box>
                <MetricsChart deviceId={device.id} hours={hours} visible={visible} />
                {visible.interfaces && <InterfaceList deviceId={device.id} />}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  )
}
