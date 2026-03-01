import { useMemo } from 'react'
import {
  Box, Typography, Card, CardContent, Chip, CircularProgress, Alert, Tooltip,
} from '@mui/material'
import RouterIcon from '@mui/icons-material/Router'
import HubIcon from '@mui/icons-material/Hub'
import { useQuery } from '@tanstack/react-query'
import { listDevices } from '../api/devices'
import { listGroups } from '../api/groups'
import type { Device, DeviceGroup } from '../types'

// Simple force-free static layout topology

function DeviceNode({ device }: { device: Device }) {
  const color =
    device.status === 'online' ? '#22c55e' :
    device.status === 'offline' ? '#ef4444' : '#94a3b8'

  return (
    <Tooltip title={`${device.name} (${device.mgmt_ip}) — ${device.status}`}>
      <Box sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        cursor: 'default',
        gap: 0.5,
        '&:hover .node-icon': { transform: 'scale(1.15)', transition: 'transform 0.15s' },
      }}>
        <Box className="node-icon" sx={{
          width: 52, height: 52,
          borderRadius: '50%',
          border: `3px solid ${color}`,
          bgcolor: 'background.paper',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 0 0 2px ${color}33`,
        }}>
          <RouterIcon sx={{ color, fontSize: 28 }} />
        </Box>
        <Typography variant="caption" fontWeight={600} textAlign="center" sx={{ maxWidth: 80, lineHeight: 1.2 }}>
          {device.name}
        </Typography>
        <Chip
          label={device.status}
          size="small"
          sx={{
            height: 16, fontSize: 10,
            bgcolor: color + '22',
            color,
            border: `1px solid ${color}`,
          }}
        />
      </Box>
    </Tooltip>
  )
}

export default function Topology() {
  const { data: devices = [], isLoading: devicesLoading } = useQuery({
    queryKey: ['devices'],
    queryFn: listDevices,
  })
  const { data: groups = [], isLoading: groupsLoading } = useQuery({
    queryKey: ['groups'],
    queryFn: listGroups,
  })

  const ungrouped = useMemo(() => {
    const inGroup = new Set(groups.flatMap((g: DeviceGroup & { device_ids?: string[] }) => g.device_ids ?? []))
    return devices.filter((d: Device) => !inGroup.has(d.id))
  }, [devices, groups])

  if (devicesLoading || groupsLoading) return <CircularProgress />

  const onlineCount = devices.filter((d: Device) => d.status === 'online').length
  const offlineCount = devices.filter((d: Device) => d.status === 'offline').length

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>Network Topology</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Chip label={`${onlineCount} online`} color="success" size="small" />
          <Chip label={`${offlineCount} offline`} color="error" size="small" />
          <Chip label={`${devices.length} total`} size="small" />
        </Box>
      </Box>

      {devices.length === 0 && (
        <Alert severity="info">No devices found. Add devices first.</Alert>
      )}

      {/* Cloud/Internet hub */}
      {devices.length > 0 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 4 }}>
          <Box sx={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5,
            px: 3, py: 1.5, borderRadius: 2,
            border: '2px dashed', borderColor: 'primary.main',
            bgcolor: 'primary.main' + '11',
          }}>
            <HubIcon sx={{ color: 'primary.main', fontSize: 36 }} />
            <Typography variant="caption" fontWeight={700} color="primary">INTERNET / CLOUD</Typography>
          </Box>
        </Box>
      )}

      {/* Groups */}
      {groups.map((group: any) => {
        const groupDevices = devices.filter((d: Device) => d.group_ids?.includes(group.id))
        if (groupDevices.length === 0) return null
        return (
          <Card key={group.id} sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={600} mb={2} color="text.secondary">
                {group.name} ({groupDevices.length} devices)
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                {groupDevices.map((device: Device) => (
                  <DeviceNode key={device.id} device={device} />
                ))}
              </Box>
            </CardContent>
          </Card>
        )
      })}

      {/* Ungrouped */}
      {ungrouped.length > 0 && (
        <Card>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={600} mb={2} color="text.secondary">
              Ungrouped Devices ({ungrouped.length})
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
              {ungrouped.map((device: Device) => (
                <DeviceNode key={device.id} device={device} />
              ))}
            </Box>
          </CardContent>
        </Card>
      )}
    </Box>
  )
}
