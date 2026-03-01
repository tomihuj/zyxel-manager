import { useState } from 'react'
import {
  Box, Typography, Card, CardContent, Grid, CircularProgress,
  Chip, LinearProgress, Alert, MenuItem, Select, FormControl, InputLabel,
} from '@mui/material'
import { useQuery } from '@tanstack/react-query'
import { listDevices } from '../api/devices'
import { getDeviceMetrics, getDeviceHealth, getDeviceInterfaces } from '../api/metrics'
import type { Device } from '../types'

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

function MetricsChart({ deviceId, hours }: { deviceId: string; hours: number }) {
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
      <Typography variant="caption" color="text.secondary">
        Uptime: {formatUptime(latest.uptime_seconds)} · {metrics.length} data points
      </Typography>
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
  const { data: devices = [], isLoading } = useQuery({
    queryKey: ['devices'],
    queryFn: listDevices,
  })

  if (isLoading) return <CircularProgress />

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>Device Metrics</Typography>
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
      </Box>

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
                    <HealthCard deviceId={device.id} />
                  </Box>
                </Box>
                <MetricsChart deviceId={device.id} hours={hours} />
                <InterfaceList deviceId={device.id} />
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  )
}
