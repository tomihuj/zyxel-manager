import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Dialog, DialogTitle, DialogContent, Table, TableHead, TableRow,
  TableCell, TableBody, Typography,
} from '@mui/material'
import KeyboardIcon from '@mui/icons-material/Keyboard'

const SHORTCUTS = [
  { keys: '⌘K / Ctrl+K', label: 'Open Command Palette' },
  { keys: 'G D', label: 'Go to Dashboard' },
  { keys: 'G V', label: 'Go to Devices' },
  { keys: 'G B', label: 'Go to Bulk Actions' },
  { keys: 'G L', label: 'Go to Logs' },
  { keys: 'G A', label: 'Go to Alerts' },
  { keys: 'G C', label: 'Go to Compliance' },
  { keys: 'G M', label: 'Go to Metrics' },
  { keys: 'G S', label: 'Go to Config Search' },
  { keys: 'G T', label: 'Go to Topology' },
  { keys: '?', label: 'Show this help' },
]

const NAV_MAP: Record<string, string> = {
  d: '/', v: '/devices', b: '/bulk', l: '/logs',
  a: '/alerts', c: '/compliance', m: '/metrics',
  s: '/config-search', t: '/topology',
}

export default function KeyboardShortcuts() {
  const navigate = useNavigate()
  const [showHelp, setShowHelp] = useState(false)
  const [pendingG, setPendingG] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return
      const key = e.key.toLowerCase()

      if (key === '?') {
        setShowHelp((v) => !v)
        return
      }

      if (key === 'escape') {
        setShowHelp(false)
        setPendingG(false)
        return
      }

      if (pendingG) {
        setPendingG(false)
        const path = NAV_MAP[key]
        if (path) navigate(path)
        return
      }

      if (key === 'g') {
        setPendingG(true)
        setTimeout(() => setPendingG(false), 1500)
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [navigate, pendingG])

  return (
    <>
      <Dialog open={showHelp} onClose={() => setShowHelp(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <KeyboardIcon />
          Keyboard Shortcuts
        </DialogTitle>
        <DialogContent>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell><Typography variant="caption" fontWeight={700}>Keys</Typography></TableCell>
                <TableCell><Typography variant="caption" fontWeight={700}>Action</Typography></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {SHORTCUTS.map((s) => (
                <TableRow key={s.keys}>
                  <TableCell>
                    <Typography fontFamily="monospace" fontSize={13} sx={{
                      bgcolor: 'action.hover', px: 1, borderRadius: 1, display: 'inline-block',
                    }}>
                      {s.keys}
                    </Typography>
                  </TableCell>
                  <TableCell>{s.label}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {pendingG && (
            <Typography variant="caption" color="primary" sx={{ mt: 1, display: 'block' }}>
              Waiting for navigation key...
            </Typography>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
