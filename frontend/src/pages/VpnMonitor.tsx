import { useState } from 'react'
import {
  Box, Typography, Chip, LinearProgress, MenuItem, Select,
  FormControl, InputLabel, Card, CardContent,
} from '@mui/material'
import { DataGrid, type GridColDef } from '@mui/x-data-grid'
import VpnKeyIcon from '@mui/icons-material/VpnKey'
import { useQuery } from '@tanstack/react-query'
import { listVpnTunnels, getVpnSummary } from '../api/vpn'
import { listDevices } from '../api/devices'
import TableConfigToolbar from '../components/TableConfigToolbar'
import { useColumnVisibilityStore } from '../store/columnVisibility'

export default function VpnMonitor() {
  const { visibility, setVisibility } = useColumnVisibilityStore()
  const [filterDevice, setFilterDevice] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const { data: tunnels = [], isLoading } = useQuery({
    queryKey: ['vpn-tunnels', filterDevice, filterStatus],
    queryFn: () => listVpnTunnels({
      device_id: filterDevice || undefined,
      status: filterStatus || undefined,
    }),
    refetchInterval: 30_000,
  })

  const { data: summary } = useQuery({
    queryKey: ['vpn-summary'],
    queryFn: getVpnSummary,
    refetchInterval: 30_000,
  })

  const { data: devices = [] } = useQuery({
    queryKey: ['devices'],
    queryFn: listDevices,
  })

  const columns: GridColDef[] = [
    { field: 'device_name', headerName: 'Device', flex: 1, minWidth: 140 },
    { field: 'tunnel_name', headerName: 'Tunnel Name', flex: 1, minWidth: 140 },
    { field: 'tunnel_type', headerName: 'Type', width: 80,
      renderCell: ({ value }) => <Chip size="small" label={value} variant="outlined" /> },
    { field: 'remote_gateway', headerName: 'Remote Gateway', flex: 1, minWidth: 130 },
    { field: 'local_subnet', headerName: 'Local Subnet', flex: 1, minWidth: 130 },
    { field: 'remote_subnet', headerName: 'Remote Subnet', flex: 1, minWidth: 130 },
    {
      field: 'status', headerName: 'Status', width: 100,
      renderCell: ({ value }) => (
        <Chip
          size="small"
          label={value}
          color={value === 'up' ? 'success' : value === 'down' ? 'error' : 'default'}
        />
      ),
    },
    {
      field: 'collected_at', headerName: 'Last Updated', width: 170,
      valueFormatter: (value: string) => value ? new Date(value).toLocaleString() : '—',
    },
  ]

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
        <VpnKeyIcon color="primary" />
        <Typography variant="h5" fontWeight={700}>VPN Monitor</Typography>
      </Box>

      {/* Summary chips */}
      {summary && (
        <Box sx={{ display: 'flex', gap: 1.5, mb: 3 }}>
          <Chip label={`${summary.up} Up`} color="success" />
          <Chip label={`${summary.down} Down`} color="error" />
          <Chip label={`${summary.unknown} Unknown`} color="default" />
          <Chip label={`${summary.total} Total`} variant="outlined" />
        </Box>
      )}

      {/* Filters */}
      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ pb: '12px !important', display: 'flex', gap: 2 }}>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Device</InputLabel>
            <Select label="Device" value={filterDevice} onChange={(e) => setFilterDevice(e.target.value)}>
              <MenuItem value="">All Devices</MenuItem>
              {devices.map((d) => (
                <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Status</InputLabel>
            <Select label="Status" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <MenuItem value="">All</MenuItem>
              <MenuItem value="up">Up</MenuItem>
              <MenuItem value="down">Down</MenuItem>
              <MenuItem value="unknown">Unknown</MenuItem>
            </Select>
          </FormControl>
        </CardContent>
      </Card>

      {isLoading ? (
        <LinearProgress />
      ) : (
        <DataGrid
          rows={tunnels}
          columns={columns}
          autoHeight
          pageSizeOptions={[25, 50, 100]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          disableRowSelectionOnClick
          density="compact"
          slots={{ toolbar: TableConfigToolbar }}
          columnVisibilityModel={visibility['vpn-tunnels'] ?? {}}
          onColumnVisibilityModelChange={(model) => setVisibility('vpn-tunnels', model)}
          sx={{ bgcolor: 'background.paper', borderRadius: 1 }}
        />
      )}
    </Box>
  )
}
