import { useState } from 'react'
import {
  Grid, Card, CardContent, Typography, Box, Chip, LinearProgress,
  IconButton, Tooltip, Menu, MenuItem, Checkbox, ListItemText, Divider,
} from '@mui/material'
import RouterIcon from '@mui/icons-material/Router'
import FolderIcon from '@mui/icons-material/Folder'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import TuneIcon from '@mui/icons-material/Tune'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import SecurityIcon from '@mui/icons-material/Security'
import { listDevices } from '../api/devices'
import { listGroups } from '../api/groups'
import { listJobs } from '../api/bulk'
import { getSecuritySummary } from '../api/security'
import { useDashboardWidgetsStore, WIDGET_LABELS, type WidgetId } from '../store/dashboardWidgets'

function StatCard({ title, value, icon, color }: {
  title: string; value: number; icon: React.ReactNode; color: string
}) {
  return (
    <Card>
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: color + '20', color, display: 'flex' }}>
          {icon}
        </Box>
        <Box>
          <Typography variant="h4" fontWeight={700}>{value}</Typography>
          <Typography variant="body2" color="text.secondary">{title}</Typography>
        </Box>
      </CardContent>
    </Card>
  )
}

function StatusBar({ label, count, total, color }: {
  label: string; count: number; total: number; color: string
}) {
  const pct = total > 0 ? (count / total) * 100 : 0
  return (
    <Box sx={{ mb: 1.5 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
        <Typography variant="caption" fontWeight={600}>{count} / {total}</Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={pct}
        sx={{
          height: 6, borderRadius: 3,
          bgcolor: 'grey.200',
          '& .MuiLinearProgress-bar': { bgcolor: color, borderRadius: 3 },
        }}
      />
    </Box>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null)
  const { visible, toggle, reset } = useDashboardWidgetsStore()

  const { data: devices = [] } = useQuery({
    queryKey: ['devices'],
    queryFn: listDevices,
    refetchInterval: 30_000,
  })
  const { data: groups = [] } = useQuery({ queryKey: ['groups'], queryFn: listGroups })
  const { data: jobs = [] } = useQuery({ queryKey: ['jobs'], queryFn: listJobs })
  const { data: securitySummary } = useQuery({
    queryKey: ['security-summary'],
    queryFn: getSecuritySummary,
    refetchInterval: 60_000,
  })

  const online = devices.filter((d) => d.status === 'online').length
  const offline = devices.filter((d) => d.status === 'offline').length
  const unknown = devices.filter((d) => d.status === 'unknown').length
  const failedJobs = jobs.filter((j) => j.status === 'failed').length

  const recentJobs = [...jobs]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)

  const widgetIds = Object.keys(WIDGET_LABELS) as WidgetId[]

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>Dashboard</Typography>
        <Tooltip title="Customize widgets">
          <IconButton onClick={(e) => setMenuAnchor(e.currentTarget)}>
            <TuneIcon />
          </IconButton>
        </Tooltip>
      </Box>

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
      >
        <Typography variant="caption" sx={{ px: 2, py: 0.5, display: 'block', color: 'text.secondary' }}>
          Toggle widgets
        </Typography>
        <Divider />
        {widgetIds.map((id) => (
          <MenuItem key={id} dense onClick={() => toggle(id)} sx={{ gap: 1 }}>
            <Checkbox size="small" checked={visible[id]} disableRipple sx={{ p: 0 }} />
            <ListItemText primary={WIDGET_LABELS[id]} />
          </MenuItem>
        ))}
        <Divider />
        <MenuItem dense onClick={reset}>
          <ListItemText primary="Reset to defaults" primaryTypographyProps={{ color: 'text.secondary', fontSize: 13 }} />
        </MenuItem>
      </Menu>

      {visible.statCards && (
        <Grid container spacing={3} mb={4}>
          <Grid item xs={12} sm={6} md={2.4}>
            <StatCard title="Total Devices" value={devices.length} icon={<RouterIcon />} color="#1a56db" />
          </Grid>
          <Grid item xs={12} sm={6} md={2.4}>
            <StatCard title="Online" value={online} icon={<CheckCircleIcon />} color="#059669" />
          </Grid>
          <Grid item xs={12} sm={6} md={2.4}>
            <StatCard title="Groups" value={groups.length} icon={<FolderIcon />} color="#7c3aed" />
          </Grid>
          <Grid item xs={12} sm={6} md={2.4}>
            <StatCard title="Bulk Jobs" value={jobs.length} icon={<PlayArrowIcon />} color="#d97706" />
          </Grid>
          <Grid item xs={12} sm={6} md={2.4}>
            <StatCard
              title="Failed Jobs"
              value={failedJobs}
              icon={<ErrorIcon />}
              color={failedJobs > 0 ? '#dc2626' : '#6b7280'}
            />
          </Grid>
        </Grid>
      )}

      {(visible.deviceStatus || visible.recentActivity) && (
        <Grid container spacing={3} mb={3}>
          {visible.deviceStatus && (
            <Grid item xs={12} md={visible.recentActivity ? 4 : 12}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="h6" fontWeight={600} mb={2}>Device Status</Typography>
                  <StatusBar label="Online" count={online} total={devices.length} color="#059669" />
                  <StatusBar label="Offline" count={offline} total={devices.length} color="#dc2626" />
                  <StatusBar label="Unknown" count={unknown} total={devices.length} color="#9ca3af" />
                </CardContent>
              </Card>
            </Grid>
          )}
          {visible.recentActivity && (
            <Grid item xs={12} md={visible.deviceStatus ? 8 : 12}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="h6" fontWeight={600} mb={2}>Recent Activity</Typography>
                  {recentJobs.length === 0 && (
                    <Typography variant="body2" color="text.secondary">No jobs yet.</Typography>
                  )}
                  {recentJobs.map((j) => (
                    <Box key={j.id} sx={{
                      display: 'flex', justifyContent: 'space-between',
                      alignItems: 'center', py: 1.5, borderBottom: '1px solid #f0f0f0',
                    }}>
                      <Box>
                        <Typography variant="body2" fontWeight={500}>{j.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {j.section} · {new Date(j.created_at).toLocaleString()}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="caption" color="text.secondary">
                          {j.success_count}/{j.target_count}
                        </Typography>
                        <Chip
                          size="small"
                          label={j.status}
                          color={
                            j.status === 'completed' ? 'success' :
                            j.status === 'partial' ? 'warning' :
                            j.status === 'failed' ? 'error' :
                            j.status === 'running' ? 'info' : 'default'
                          }
                        />
                      </Box>
                    </Box>
                  ))}
                </CardContent>
              </Card>
            </Grid>
          )}
        </Grid>
      )}

      {visible.securityScore && securitySummary && (
        <Card sx={{ mb: 3, cursor: 'pointer' }} onClick={() => navigate('/security')}>
          <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: '#dc262620', color: '#dc2626', display: 'flex' }}>
              <SecurityIcon />
            </Box>
            <Box sx={{ flexGrow: 1 }}>
              <Typography variant="h4" fontWeight={700}>{securitySummary.fleet_score}</Typography>
              <Typography variant="body2" color="text.secondary">
                Security Score · Grade {securitySummary.fleet_grade}
              </Typography>
            </Box>
            {(securitySummary.by_severity?.critical ?? 0) > 0 && (
              <Chip
                label={`${securitySummary.by_severity.critical} critical`}
                color="error"
                size="small"
              />
            )}
            {securitySummary.total_open > 0 && (
              <Chip
                label={`${securitySummary.total_open} open`}
                color="warning"
                size="small"
              />
            )}
            {securitySummary.total_open === 0 && (
              <Chip label="Clean" color="success" size="small" />
            )}
          </CardContent>
        </Card>
      )}

      {visible.deviceList && (
        <Card>
          <CardContent>
            <Typography variant="h6" fontWeight={600} mb={2}>Device Status</Typography>
            {devices.length === 0 && (
              <Typography variant="body2" color="text.secondary">No devices yet. Add one on the Devices page.</Typography>
            )}
            {devices.map((d) => (
              <Box key={d.id} sx={{ display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', py: 1.5, borderBottom: '1px solid #f0f0f0' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {d.label_color && (
                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: d.label_color, flexShrink: 0 }} />
                  )}
                  <Box>
                    <Typography variant="body2" fontWeight={500}>{d.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {d.mgmt_ip} · {d.model}
                      {d.firmware_version ? ` · ${d.firmware_version}` : ''}
                    </Typography>
                  </Box>
                </Box>
                <Chip size="small" label={d.status}
                  color={d.status === 'online' ? 'success' : d.status === 'offline' ? 'error' : 'default'} />
              </Box>
            ))}
          </CardContent>
        </Card>
      )}
    </Box>
  )
}
