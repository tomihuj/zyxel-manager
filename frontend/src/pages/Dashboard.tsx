import { Grid, Card, CardContent, Typography, Box, Chip } from '@mui/material'
import RouterIcon from '@mui/icons-material/Router'
import FolderIcon from '@mui/icons-material/Folder'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import { useQuery } from '@tanstack/react-query'
import { listDevices } from '../api/devices'
import { listGroups } from '../api/groups'
import { listJobs } from '../api/bulk'

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

export default function Dashboard() {
  const { data: devices = [] } = useQuery({ queryKey: ['devices'], queryFn: listDevices })
  const { data: groups = [] } = useQuery({ queryKey: ['groups'], queryFn: listGroups })
  const { data: jobs = [] } = useQuery({ queryKey: ['jobs'], queryFn: listJobs })

  const online = devices.filter((d) => d.status === 'online').length

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} mb={3}>Dashboard</Typography>
      <Grid container spacing={3} mb={4}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="Total Devices" value={devices.length} icon={<RouterIcon />} color="#1a56db" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="Online" value={online} icon={<CheckCircleIcon />} color="#059669" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="Groups" value={groups.length} icon={<FolderIcon />} color="#7c3aed" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="Bulk Jobs" value={jobs.length} icon={<PlayArrowIcon />} color="#d97706" />
        </Grid>
      </Grid>
      <Card>
        <CardContent>
          <Typography variant="h6" fontWeight={600} mb={2}>Device Status</Typography>
          {devices.length === 0 && (
            <Typography variant="body2" color="text.secondary">No devices yet. Add one on the Devices page.</Typography>
          )}
          {devices.map((d) => (
            <Box key={d.id} sx={{ display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', py: 1.5, borderBottom: '1px solid #f0f0f0' }}>
              <Box>
                <Typography variant="body2" fontWeight={500}>{d.name}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {d.mgmt_ip} · {d.model}
                  {d.firmware_version ? ` · ${d.firmware_version}` : ''}
                </Typography>
              </Box>
              <Chip size="small" label={d.status}
                color={d.status === 'online' ? 'success' : d.status === 'offline' ? 'error' : 'default'} />
            </Box>
          ))}
        </CardContent>
      </Card>
    </Box>
  )
}
