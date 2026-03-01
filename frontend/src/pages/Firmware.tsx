import { useMemo } from 'react'
import {
  Box, Typography, Card, CardContent, Chip, Table, TableHead, TableRow,
  TableCell, TableBody, LinearProgress, Tooltip,
} from '@mui/material'
import RouterIcon from '@mui/icons-material/Router'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import WarningIcon from '@mui/icons-material/Warning'
import { useQuery } from '@tanstack/react-query'
import { listDevices } from '../api/devices'

export default function Firmware() {
  const { data: devices = [], isLoading } = useQuery({
    queryKey: ['devices'],
    queryFn: listDevices,
    refetchInterval: 60_000,
  })

  // Group by firmware version
  const groups = useMemo(() => {
    const map = new Map<string, typeof devices>()
    for (const d of devices) {
      const v = d.firmware_version ?? '(unknown)'
      if (!map.has(v)) map.set(v, [])
      map.get(v)!.push(d)
    }
    // Sort by device count descending, unknown last
    return [...map.entries()].sort(([va, da], [vb, db]) => {
      if (va === '(unknown)') return 1
      if (vb === '(unknown)') return -1
      return db.length - da.length
    })
  }, [devices])

  // The most common non-unknown version is considered "latest"
  const latestVersion = groups.find(([v]) => v !== '(unknown)')?.[0] ?? null

  const withFirmware = devices.filter((d) => d.firmware_version).length
  const unknown = devices.filter((d) => !d.firmware_version).length

  if (isLoading) {
    return (
      <Box>
        <Typography variant="h5" fontWeight={700} mb={3}>Firmware Tracking</Typography>
        <LinearProgress />
      </Box>
    )
  }

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} mb={1}>Firmware Tracking</Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        {devices.length} device{devices.length !== 1 ? 's' : ''} total &bull; {withFirmware} with known firmware &bull; {unknown} unknown
      </Typography>

      {groups.length === 0 && (
        <Card>
          <CardContent>
            <Typography color="text.secondary">No devices found.</Typography>
          </CardContent>
        </Card>
      )}

      {groups.map(([version, devs]) => {
        const isLatest = version === latestVersion
        const isUnknown = version === '(unknown)'
        return (
          <Card key={version} sx={{ mb: 2 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                <Typography variant="h6" fontWeight={600} fontFamily="monospace">
                  {version}
                </Typography>
                {isLatest && (
                  <Chip
                    size="small"
                    icon={<CheckCircleIcon fontSize="small" />}
                    label="Latest"
                    color="success"
                  />
                )}
                {!isLatest && !isUnknown && latestVersion && (
                  <Chip
                    size="small"
                    icon={<WarningIcon fontSize="small" />}
                    label="Outdated"
                    color="warning"
                  />
                )}
                {isUnknown && (
                  <Chip size="small" label="Unknown" color="default" variant="outlined" />
                )}
                <Chip
                  size="small"
                  icon={<RouterIcon fontSize="small" />}
                  label={`${devs.length} device${devs.length !== 1 ? 's' : ''}`}
                  variant="outlined"
                />
              </Box>

              <Table size="small">
                <TableHead>
                  <TableRow sx={{ '& th': { fontWeight: 600, fontSize: 12 } }}>
                    <TableCell>Name</TableCell>
                    <TableCell>Model</TableCell>
                    <TableCell>IP</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Last Seen</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {devs.map((d) => (
                    <TableRow key={d.id} sx={{ '&:hover': { bgcolor: 'action.hover' } }}>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {d.label_color && (
                            <Box sx={{
                              width: 10, height: 10, borderRadius: '50%',
                              bgcolor: d.label_color, flexShrink: 0,
                            }} />
                          )}
                          <Typography variant="body2" fontWeight={500}>{d.name}</Typography>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ fontSize: 12 }}>{d.model}</TableCell>
                      <TableCell sx={{ fontSize: 12, fontFamily: 'monospace' }}>{d.mgmt_ip}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={d.status}
                          color={
                            d.status === 'online' ? 'success' :
                            d.status === 'offline' ? 'error' : 'default'
                          }
                        />
                      </TableCell>
                      <TableCell sx={{ fontSize: 12, color: 'text.secondary' }}>
                        {d.last_seen
                          ? new Date(d.last_seen).toLocaleString()
                          : <Tooltip title="Never polled"><span>—</span></Tooltip>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )
      })}
    </Box>
  )
}
