import { useState, useEffect } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  Box, Drawer, AppBar, Toolbar, Typography, List, ListItem,
  ListItemButton, ListItemIcon, ListItemText, IconButton, Avatar,
  Menu, MenuItem, Divider, Tooltip,
} from '@mui/material'
import DashboardIcon from '@mui/icons-material/Dashboard'
import RouterIcon from '@mui/icons-material/Router'
import FolderIcon from '@mui/icons-material/Folder'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import AssessmentIcon from '@mui/icons-material/Assessment'
import PeopleIcon from '@mui/icons-material/People'
import CompareArrowsIcon from '@mui/icons-material/CompareArrows'
import BackupIcon from '@mui/icons-material/Backup'
import ArticleIcon from '@mui/icons-material/Article'
import BugReportIcon from '@mui/icons-material/BugReport'
import LayersIcon from '@mui/icons-material/Layers'
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive'
import FactCheckIcon from '@mui/icons-material/FactCheck'
import SearchIcon from '@mui/icons-material/Search'
import BarChartIcon from '@mui/icons-material/BarChart'
import AccountTreeIcon from '@mui/icons-material/AccountTree'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import LightModeIcon from '@mui/icons-material/LightMode'
import SettingsIcon from '@mui/icons-material/Settings'
import SystemUpdateAltIcon from '@mui/icons-material/SystemUpdateAlt'
import SecurityIcon from '@mui/icons-material/Security'
import { useAuthStore } from '../store/auth'
import { useDiagStore } from '../store/diag'
import { useThemeStore } from '../store/theme'
import DiagPanel from './DiagPanel'
import Toaster from './Toaster'
import NotificationCenter from './NotificationCenter'
import KeyboardShortcuts from './KeyboardShortcuts'
import CommandPalette from './CommandPalette'

const DRAWER_WIDTH = 240

const NAV = [
  { label: 'Dashboard',    path: '/',              icon: <DashboardIcon /> },
  { label: 'Devices',      path: '/devices',       icon: <RouterIcon /> },
  { label: 'Groups',       path: '/groups',        icon: <FolderIcon /> },
  { label: 'Bulk Actions', path: '/bulk',          icon: <PlayArrowIcon /> },
  { label: 'Reports',      path: '/reports',       icon: <AssessmentIcon /> },
  { label: 'Users & Roles',path: '/users',         icon: <PeopleIcon /> },
  { label: 'Compare',      path: '/compare',       icon: <CompareArrowsIcon /> },
  { label: 'Backups',      path: '/backups',       icon: <BackupIcon /> },
  { label: 'Templates',    path: '/templates',     icon: <LayersIcon /> },
  { label: 'Logs',         path: '/logs',          icon: <ArticleIcon /> },
  { label: 'Alerts',       path: '/alerts',        icon: <NotificationsActiveIcon /> },
  { label: 'Compliance',   path: '/compliance',    icon: <FactCheckIcon /> },
  { label: 'Security Advisor', path: '/security', icon: <SecurityIcon /> },
  { label: 'Config Search',path: '/config-search', icon: <SearchIcon /> },
  { label: 'Metrics',      path: '/metrics',       icon: <BarChartIcon /> },
  { label: 'Topology',     path: '/topology',      icon: <AccountTreeIcon /> },
  { label: 'Firmware',     path: '/firmware',      icon: <SystemUpdateAltIcon /> },
  { label: 'Settings',     path: '/settings',      icon: <SettingsIcon /> },
]

export default function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, clearAuth } = useAuthStore()
  const { enabled: diagEnabled, toggle: toggleDiag } = useDiagStore()
  const { darkMode, toggle: toggleDark } = useThemeStore()
  const [anchor, setAnchor] = useState<null | HTMLElement>(null)
  const [cmdOpen, setCmdOpen] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCmdOpen((v) => !v)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Toolbar>
          <RouterIcon sx={{ mr: 1 }} />
          <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 700 }}>
            Zyxel Manager
          </Typography>
          <NotificationCenter />
          <Tooltip title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
            <IconButton onClick={toggleDark} color="inherit">
              {darkMode ? <LightModeIcon /> : <DarkModeIcon />}
            </IconButton>
          </Tooltip>
          <Tooltip title={diagEnabled ? 'Disable Diagnostic Mode' : 'Enable Diagnostic Mode'}>
            <IconButton onClick={toggleDiag} color="inherit" sx={{ opacity: diagEnabled ? 1 : 0.5 }}>
              <BugReportIcon />
            </IconButton>
          </Tooltip>
          <IconButton onClick={(e) => setAnchor(e.currentTarget)} color="inherit">
            <Avatar sx={{ width: 32, height: 32, bgcolor: 'secondary.main', fontSize: 14 }}>
              {user?.username?.[0]?.toUpperCase()}
            </Avatar>
          </IconButton>
          <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
            <MenuItem disabled>
              <Typography variant="body2">{user?.email}</Typography>
            </MenuItem>
            <Divider />
            <MenuItem onClick={() => { clearAuth(); navigate('/login') }}>Logout</MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      <Drawer variant="permanent" sx={{
        width: DRAWER_WIDTH,
        '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
      }}>
        <Toolbar />
        <Box sx={{ overflow: 'auto', mt: 1 }}>
          <List>
            {NAV.map((item) => (
              <ListItem key={item.path} disablePadding>
                <ListItemButton
                  selected={location.pathname === item.path}
                  onClick={() => navigate(item.path)}
                  sx={{ borderRadius: 1, mx: 1, mb: 0.5 }}
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
                  <ListItemText primary={item.label} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Box>
      </Drawer>

      {diagEnabled ? (
        <Box component="main" sx={{ flexGrow: 1, display: 'flex', mt: 8, height: 'calc(100vh - 64px)', overflow: 'hidden' }}>
          <Box sx={{ flex: 1, p: 3, overflowY: 'auto', height: '100%', bgcolor: 'background.default' }}>
            <Outlet />
          </Box>
          <DiagPanel />
        </Box>
      ) : (
        <Box component="main" sx={{ flexGrow: 1, p: 3, mt: 8, bgcolor: 'background.default', minHeight: '100vh' }}>
          <Outlet />
        </Box>
      )}
      <Toaster />
      <KeyboardShortcuts />
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </Box>
  )
}
