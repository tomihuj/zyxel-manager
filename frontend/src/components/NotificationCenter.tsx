import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  Badge, IconButton, Popover, Box, Typography, List, ListItem, ListItemButton,
  ListItemIcon, ListItemText, Divider, Tooltip, Button,
} from '@mui/material'
import NotificationsIcon from '@mui/icons-material/Notifications'
import WifiOffIcon from '@mui/icons-material/WifiOff'
import DifferenceIcon from '@mui/icons-material/Difference'
import ErrorIcon from '@mui/icons-material/Error'
import CheckIcon from '@mui/icons-material/Check'
import type { Device, BulkJob } from '../types'
import { useNotificationsStore } from '../store/notifications'

interface Notification {
  key: string
  icon: React.ReactNode
  primary: string
  secondary: string
  path: string
}

export default function NotificationCenter() {
  const [anchor, setAnchor] = useState<null | HTMLElement>(null)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { dismissed, dismiss, dismissAll } = useNotificationsStore()

  const devices: Device[] = qc.getQueryData(['devices']) ?? []
  const jobs: BulkJob[] = qc.getQueryData(['jobs']) ?? []

  const allNotifications: Notification[] = []

  const offlineDevices = devices.filter((d) => d.status === 'offline')
  if (offlineDevices.length > 0) {
    allNotifications.push({
      // Key includes count so a change in offline count re-surfaces the notification
      key: `offline-${offlineDevices.length}`,
      icon: <WifiOffIcon color="error" />,
      primary: `${offlineDevices.length} device${offlineDevices.length > 1 ? 's' : ''} offline`,
      secondary:
        offlineDevices.slice(0, 3).map((d) => d.name).join(', ') +
        (offlineDevices.length > 3 ? ` +${offlineDevices.length - 3} more` : ''),
      path: '/devices',
    })
  }

  const driftDevices = devices.filter((d) => d.drift_detected)
  if (driftDevices.length > 0) {
    allNotifications.push({
      key: `drift-${driftDevices.length}`,
      icon: <DifferenceIcon sx={{ color: 'orange' }} />,
      primary: `${driftDevices.length} device${driftDevices.length > 1 ? 's' : ''} with config drift`,
      secondary:
        driftDevices.slice(0, 3).map((d) => d.name).join(', ') +
        (driftDevices.length > 3 ? ` +${driftDevices.length - 3} more` : ''),
      path: '/devices',
    })
  }

  const failedJobs = jobs.filter((j) => j.status === 'partial' || j.status === 'failed')
  if (failedJobs.length > 0) {
    allNotifications.push({
      key: `jobs-${failedJobs.length}`,
      icon: <ErrorIcon color="warning" />,
      primary: `${failedJobs.length} job${failedJobs.length > 1 ? 's' : ''} with failures`,
      secondary:
        failedJobs.slice(0, 3).map((j) => j.name).join(', ') +
        (failedJobs.length > 3 ? ` +${failedJobs.length - 3} more` : ''),
      path: '/bulk',
    })
  }

  // Only show and count notifications that haven't been acknowledged
  const active = allNotifications.filter((n) => !dismissed.has(n.key))
  const displayed = active.slice(0, 10)

  return (
    <>
      <Tooltip title="Notifications">
        <IconButton
          onClick={(e) => setAnchor(e.currentTarget)}
          color="inherit"
          sx={{ mr: 0.5 }}
        >
          <Badge badgeContent={active.length} color="error" max={99}>
            <NotificationsIcon />
          </Badge>
        </IconButton>
      </Tooltip>

      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ width: 380 }}>
          {/* Header */}
          <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="subtitle1" fontWeight={600}>
              Notifications
            </Typography>
            {active.length > 0 && (
              <Button
                size="small"
                startIcon={<CheckIcon fontSize="small" />}
                onClick={() => dismissAll(active.map((n) => n.key))}
                sx={{ textTransform: 'none', fontSize: 12 }}
              >
                Acknowledge all
              </Button>
            )}
          </Box>

          <Divider />

          {displayed.length === 0 ? (
            <Box sx={{ px: 2, py: 3, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                No new notifications
              </Typography>
            </Box>
          ) : (
            <List dense disablePadding>
              {displayed.map((n) => (
                <ListItem
                  key={n.key}
                  disablePadding
                  secondaryAction={
                    <Tooltip title="Acknowledge">
                      <IconButton
                        edge="end"
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation()
                          dismiss(n.key)
                        }}
                        sx={{ mr: 0.5, color: 'text.disabled', '&:hover': { color: 'success.main' } }}
                      >
                        <CheckIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  }
                >
                  <ListItemButton
                    onClick={() => {
                      setAnchor(null)
                      navigate(n.path)
                    }}
                    sx={{ py: 1, pr: 5 }}
                  >
                    <ListItemIcon sx={{ minWidth: 36 }}>{n.icon}</ListItemIcon>
                    <ListItemText
                      primary={n.primary}
                      secondary={n.secondary}
                      primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }}
                      secondaryTypographyProps={{ variant: 'caption' }}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          )}
        </Box>
      </Popover>
    </>
  )
}
