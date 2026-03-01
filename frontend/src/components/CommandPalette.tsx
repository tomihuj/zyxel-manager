import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  Dialog, DialogContent, TextField, List, ListItemButton,
  ListItemIcon, ListItemText, Typography, Box, Chip, InputAdornment,
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import DashboardIcon from '@mui/icons-material/Dashboard'
import RouterIcon from '@mui/icons-material/Router'
import FolderIcon from '@mui/icons-material/Folder'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import PeopleIcon from '@mui/icons-material/People'
import BackupIcon from '@mui/icons-material/Backup'
import ArticleIcon from '@mui/icons-material/Article'
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive'
import FactCheckIcon from '@mui/icons-material/FactCheck'
import BarChartIcon from '@mui/icons-material/BarChart'
import SystemUpdateAltIcon from '@mui/icons-material/SystemUpdateAlt'
import SettingsIcon from '@mui/icons-material/Settings'
import type { Device } from '../types'

interface CommandEntry {
  id: string
  label: string
  secondary?: string
  icon: React.ReactNode
  path: string
  type: 'nav' | 'device'
}

const NAV_ENTRIES: CommandEntry[] = [
  { id: 'nav-/', label: 'Dashboard', icon: <DashboardIcon />, path: '/', type: 'nav' },
  { id: 'nav-/devices', label: 'Devices', icon: <RouterIcon />, path: '/devices', type: 'nav' },
  { id: 'nav-/groups', label: 'Groups', icon: <FolderIcon />, path: '/groups', type: 'nav' },
  { id: 'nav-/bulk', label: 'Bulk Actions', icon: <PlayArrowIcon />, path: '/bulk', type: 'nav' },
  { id: 'nav-/users', label: 'Users & Roles', icon: <PeopleIcon />, path: '/users', type: 'nav' },
  { id: 'nav-/backups', label: 'Backups', icon: <BackupIcon />, path: '/backups', type: 'nav' },
  { id: 'nav-/logs', label: 'Logs', icon: <ArticleIcon />, path: '/logs', type: 'nav' },
  { id: 'nav-/alerts', label: 'Alerts', icon: <NotificationsActiveIcon />, path: '/alerts', type: 'nav' },
  { id: 'nav-/compliance', label: 'Compliance', icon: <FactCheckIcon />, path: '/compliance', type: 'nav' },
  { id: 'nav-/metrics', label: 'Metrics', icon: <BarChartIcon />, path: '/metrics', type: 'nav' },
  { id: 'nav-/firmware', label: 'Firmware Tracking', icon: <SystemUpdateAltIcon />, path: '/firmware', type: 'nav' },
  { id: 'nav-/settings', label: 'Settings', icon: <SettingsIcon />, path: '/settings', type: 'nav' },
]

interface Props {
  open: boolean
  onClose: () => void
}

export default function CommandPalette({ open, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const devices: Device[] = qc.getQueryData(['devices']) ?? []

  // Reset state when opened
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelected(0)
    }
  }, [open])

  const entries = useMemo<CommandEntry[]>(() => {
    const q = query.toLowerCase().trim()
    const deviceEntries: CommandEntry[] = devices.map((d) => ({
      id: `device-${d.id}`,
      label: d.name,
      secondary: `${d.mgmt_ip} · ${d.model} · ${d.status}`,
      icon: (
        <Box sx={{
          width: 8, height: 8, borderRadius: '50%', mt: 0.5,
          bgcolor: d.status === 'online' ? 'success.main' : d.status === 'offline' ? 'error.main' : 'grey.400',
        }} />
      ),
      path: `/devices/${d.id}/config`,
      type: 'device' as const,
    }))

    const all = [...NAV_ENTRIES, ...deviceEntries]
    if (!q) return all
    return all.filter((e) =>
      e.label.toLowerCase().includes(q) ||
      (e.secondary?.toLowerCase().includes(q) ?? false)
    )
  }, [query, devices])

  const handleSelect = (entry: CommandEntry) => {
    onClose()
    navigate(entry.path)
  }

  useEffect(() => {
    setSelected(0)
  }, [query])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((s) => Math.min(s + 1, entries.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((s) => Math.max(s - 1, 0))
    } else if (e.key === 'Enter') {
      if (entries[selected]) handleSelect(entries[selected])
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { mt: '10vh', verticalAlign: 'top', borderRadius: 2 } }}
    >
      <DialogContent sx={{ p: 0 }}>
        <TextField
          autoFocus
          fullWidth
          placeholder="Search pages or devices…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          variant="outlined"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon color="action" />
              </InputAdornment>
            ),
            sx: {
              borderRadius: '8px 8px 0 0',
              '& fieldset': { border: 'none', borderBottom: '1px solid', borderColor: 'divider' },
            },
          }}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px 8px 0 0' } }}
        />

        <Box sx={{ maxHeight: 400, overflowY: 'auto' }}>
          {entries.length === 0 ? (
            <Box sx={{ py: 3, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">No results for "{query}"</Typography>
            </Box>
          ) : (
            <List dense disablePadding>
              {entries.map((entry, i) => (
                <ListItemButton
                  key={entry.id}
                  selected={i === selected}
                  onClick={() => handleSelect(entry)}
                  onMouseEnter={() => setSelected(i)}
                  sx={{ px: 2, py: 1 }}
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>{entry.icon}</ListItemIcon>
                  <ListItemText
                    primary={entry.label}
                    secondary={entry.secondary}
                    primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }}
                    secondaryTypographyProps={{ variant: 'caption' }}
                  />
                  <Chip
                    size="small"
                    label={entry.type === 'nav' ? 'Page' : 'Device'}
                    variant="outlined"
                    sx={{ fontSize: 10, height: 18 }}
                  />
                </ListItemButton>
              ))}
            </List>
          )}
        </Box>

        <Box sx={{ px: 2, py: 1, borderTop: '1px solid', borderColor: 'divider', display: 'flex', gap: 2 }}>
          <Typography variant="caption" color="text.secondary">
            ↑↓ navigate &nbsp; ↵ select &nbsp; Esc close
          </Typography>
        </Box>
      </DialogContent>
    </Dialog>
  )
}
