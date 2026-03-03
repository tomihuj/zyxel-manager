import { useMemo, useState } from 'react'
import {
  Box, Typography, Card, CardContent, Chip, Table, TableHead, TableRow,
  TableCell, TableBody, LinearProgress, Tooltip, Button, Dialog,
  DialogTitle, DialogContent, DialogActions, TextField, IconButton, Stack,
} from '@mui/material'
import AttachFileIcon from '@mui/icons-material/AttachFile'
import RouterIcon from '@mui/icons-material/Router'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import WarningIcon from '@mui/icons-material/Warning'
import SystemUpdateAltIcon from '@mui/icons-material/SystemUpdateAlt'
import CancelIcon from '@mui/icons-material/Cancel'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listDevices } from '../api/devices'
import { listUpgrades, createUpgrade, cancelUpgrade } from '../api/firmware'
import type { FirmwareUpgrade } from '../api/firmware'
import { useToastStore } from '../store/toast'
import ColumnVisibilityButton from '../components/ColumnVisibilityButton'
import { useColumnVisibilityStore } from '../store/columnVisibility'

const FIRMWARE_DEVICES_COLUMNS = [
  { field: 'name', headerName: 'Name' },
  { field: 'model', headerName: 'Model' },
  { field: 'mgmt_ip', headerName: 'IP' },
  { field: 'status', headerName: 'Status' },
  { field: 'last_seen', headerName: 'Last Seen' },
  { field: 'actions', headerName: 'Actions', hideable: false },
]

const FIRMWARE_HISTORY_COLUMNS = [
  { field: 'device', headerName: 'Device' },
  { field: 'previous_version', headerName: 'From Version' },
  { field: 'target_version', headerName: 'To Version' },
  { field: 'status', headerName: 'Status' },
  { field: 'started_at', headerName: 'Started' },
  { field: 'duration', headerName: 'Duration' },
  { field: 'error', headerName: 'Error' },
  { field: 'actions', headerName: 'Actions', hideable: false },
]

function UpgradeStatusChip({ status }: { status: string }) {
  const color = status === 'completed' ? 'success'
    : status === 'failed' ? 'error'
    : status === 'running' ? 'warning'
    : status === 'cancelled' ? 'default'
    : 'info'
  return <Chip size="small" label={status} color={color as any} />
}

export default function Firmware() {
  const qc = useQueryClient()
  const toast = useToastStore()
  const { visibility } = useColumnVisibilityStore()
  const [upgradeDialogDevice, setUpgradeDialogDevice] = useState<{ id: string; name: string } | null>(null)
  const [targetVersion, setTargetVersion] = useState('')
  const [firmwareFile, setFirmwareFile] = useState<File | null>(null)

  const { data: devices = [], isLoading } = useQuery({
    queryKey: ['devices'],
    queryFn: listDevices,
    refetchInterval: 60_000,
  })

  const { data: upgrades = [] } = useQuery({
    queryKey: ['firmware-upgrades'],
    queryFn: listUpgrades,
    refetchInterval: 10_000,
  })

  const createMut = useMutation({
    mutationFn: createUpgrade,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['firmware-upgrades'] })
      qc.invalidateQueries({ queryKey: ['devices'] })
      setUpgradeDialogDevice(null)
      setTargetVersion('')
      setFirmwareFile(null)
      toast.push('Firmware upgrade started', 'success')
    },
    onError: () => toast.push('Failed to start upgrade', 'error'),
  })

  const cancelMut = useMutation({
    mutationFn: cancelUpgrade,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['firmware-upgrades'] })
      toast.push('Upgrade cancelled', 'success')
    },
    onError: () => toast.push('Failed to cancel upgrade', 'error'),
  })

  // Group by firmware version
  const groups = useMemo(() => {
    const map = new Map<string, typeof devices>()
    for (const d of devices) {
      const v = d.firmware_version ?? '(unknown)'
      if (!map.has(v)) map.set(v, [])
      map.get(v)!.push(d)
    }
    return [...map.entries()].sort(([va, da], [vb, db]) => {
      if (va === '(unknown)') return 1
      if (vb === '(unknown)') return -1
      return db.length - da.length
    })
  }, [devices])

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
                <Typography variant="h6" fontWeight={600} fontFamily="monospace">{version}</Typography>
                {isLatest && <Chip size="small" icon={<CheckCircleIcon fontSize="small" />} label="Latest" color="success" />}
                {!isLatest && !isUnknown && latestVersion && (
                  <Chip size="small" icon={<WarningIcon fontSize="small" />} label="Outdated" color="warning" />
                )}
                {isUnknown && <Chip size="small" label="Unknown" color="default" variant="outlined" />}
                <Chip size="small" icon={<RouterIcon fontSize="small" />}
                  label={`${devs.length} device${devs.length !== 1 ? 's' : ''}`} variant="outlined" />
                <ColumnVisibilityButton tableId="firmware-devices" columns={FIRMWARE_DEVICES_COLUMNS} sx={{ ml: 'auto' }} />
              </Box>

              <Table size="small">
                <TableHead>
                  <TableRow sx={{ '& th': { fontWeight: 600, fontSize: 12 } }}>
                    {visibility['firmware-devices']?.['name'] !== false && <TableCell>Name</TableCell>}
                    {visibility['firmware-devices']?.['model'] !== false && <TableCell>Model</TableCell>}
                    {visibility['firmware-devices']?.['mgmt_ip'] !== false && <TableCell>IP</TableCell>}
                    {visibility['firmware-devices']?.['status'] !== false && <TableCell>Status</TableCell>}
                    {visibility['firmware-devices']?.['last_seen'] !== false && <TableCell>Last Seen</TableCell>}
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {devs.map((d) => (
                    <TableRow key={d.id} sx={{ '&:hover': { bgcolor: 'action.hover' } }}>
                      {visibility['firmware-devices']?.['name'] !== false && (
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {d.label_color && <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: d.label_color, flexShrink: 0 }} />}
                            <Typography variant="body2" fontWeight={500}>{d.name}</Typography>
                          </Box>
                        </TableCell>
                      )}
                      {visibility['firmware-devices']?.['model'] !== false && <TableCell sx={{ fontSize: 12 }}>{d.model}</TableCell>}
                      {visibility['firmware-devices']?.['mgmt_ip'] !== false && <TableCell sx={{ fontSize: 12, fontFamily: 'monospace' }}>{d.mgmt_ip}</TableCell>}
                      {visibility['firmware-devices']?.['status'] !== false && (
                        <TableCell>
                          <Chip size="small" label={d.status}
                            color={d.status === 'online' ? 'success' : d.status === 'offline' ? 'error' : 'default'} />
                        </TableCell>
                      )}
                      {visibility['firmware-devices']?.['last_seen'] !== false && (
                        <TableCell sx={{ fontSize: 12, color: 'text.secondary' }}>
                          {d.last_seen ? new Date(d.last_seen).toLocaleString() : <Tooltip title="Never polled"><span>—</span></Tooltip>}
                        </TableCell>
                      )}
                      <TableCell align="right">
                        <Button size="small" startIcon={<SystemUpdateAltIcon />}
                          onClick={() => { setUpgradeDialogDevice({ id: d.id, name: d.name }); setTargetVersion('') }}>
                          Upgrade
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )
      })}

      {/* Upgrade History */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 4, mb: 2 }}>
        <Typography variant="h6" fontWeight={600}>Upgrade History</Typography>
        <ColumnVisibilityButton tableId="firmware-history" columns={FIRMWARE_HISTORY_COLUMNS} />
      </Box>
      {upgrades.length === 0 ? (
        <Typography color="text.secondary">No upgrades yet.</Typography>
      ) : (
        <Card>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 600, fontSize: 12 } }}>
                {visibility['firmware-history']?.['device'] !== false && <TableCell>Device</TableCell>}
                {visibility['firmware-history']?.['previous_version'] !== false && <TableCell>From Version</TableCell>}
                {visibility['firmware-history']?.['target_version'] !== false && <TableCell>To Version</TableCell>}
                {visibility['firmware-history']?.['status'] !== false && <TableCell>Status</TableCell>}
                {visibility['firmware-history']?.['started_at'] !== false && <TableCell>Started</TableCell>}
                {visibility['firmware-history']?.['duration'] !== false && <TableCell>Duration</TableCell>}
                {visibility['firmware-history']?.['error'] !== false && <TableCell>Error</TableCell>}
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {upgrades.map((u) => {
                const duration = u.started_at && u.completed_at
                  ? Math.round((new Date(u.completed_at).getTime() - new Date(u.started_at).getTime()) / 1000)
                  : null
                return (
                  <TableRow key={u.id}>
                    {visibility['firmware-history']?.['device'] !== false && <TableCell>{u.device_name ?? u.device_id}</TableCell>}
                    {visibility['firmware-history']?.['previous_version'] !== false && <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{u.previous_version ?? '—'}</TableCell>}
                    {visibility['firmware-history']?.['target_version'] !== false && <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{u.target_version}</TableCell>}
                    {visibility['firmware-history']?.['status'] !== false && <TableCell><UpgradeStatusChip status={u.status} /></TableCell>}
                    {visibility['firmware-history']?.['started_at'] !== false && <TableCell sx={{ fontSize: 12 }}>{u.started_at ? new Date(u.started_at).toLocaleString() : '—'}</TableCell>}
                    {visibility['firmware-history']?.['duration'] !== false && <TableCell sx={{ fontSize: 12 }}>{duration !== null ? `${duration}s` : '—'}</TableCell>}
                    {visibility['firmware-history']?.['error'] !== false && <TableCell sx={{ fontSize: 11, color: 'error.main', maxWidth: 200 }}>{u.error ?? ''}</TableCell>}
                    <TableCell>
                      {u.status === 'pending' && (
                        <IconButton size="small" color="error"
                          onClick={() => cancelMut.mutate(u.id)}
                          disabled={cancelMut.isPending}>
                          <CancelIcon fontSize="small" />
                        </IconButton>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Upgrade Dialog */}
      <Dialog open={!!upgradeDialogDevice} onClose={() => { setUpgradeDialogDevice(null); setFirmwareFile(null) }} maxWidth="xs" fullWidth>
        <DialogTitle>Upgrade Firmware: {upgradeDialogDevice?.name}</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Stack spacing={2}>
            <TextField
              autoFocus label="Target Version" fullWidth size="small" value={targetVersion}
              onChange={(e) => setTargetVersion(e.target.value)}
              placeholder="e.g. V5.38(ABFY.1)"
            />
            <Box>
              <input
                id="firmware-file-input"
                type="file"
                accept=".bin,.zip,.img"
                style={{ display: 'none' }}
                onChange={(e) => setFirmwareFile(e.target.files?.[0] ?? null)}
              />
              <label htmlFor="firmware-file-input">
                <Button component="span" size="small" startIcon={<AttachFileIcon />} variant="outlined">
                  {firmwareFile ? firmwareFile.name : 'Attach firmware file (optional)'}
                </Button>
              </label>
              {firmwareFile && (
                <Typography variant="caption" display="block" color="text.secondary" mt={0.5}>
                  {(firmwareFile.size / 1024 / 1024).toFixed(1)} MB
                </Typography>
              )}
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setUpgradeDialogDevice(null); setFirmwareFile(null) }}>Cancel</Button>
          <Button variant="contained" disabled={!targetVersion || createMut.isPending}
            onClick={() => createMut.mutate({ device_id: upgradeDialogDevice!.id, target_version: targetVersion, firmware_file: firmwareFile })}>
            Start Upgrade
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
