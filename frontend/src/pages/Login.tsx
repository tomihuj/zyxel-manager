import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Box, Card, CardContent, TextField, Button, Typography, Alert,
  CircularProgress, Divider, LinearProgress,
} from '@mui/material'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import RouterIcon from '@mui/icons-material/Router'
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined'
import { login, getMe, requestUnlock, confirmUnlock } from '../api/auth'
import { useAuthStore } from '../store/auth'

// Parse "Try again in X seconds" from the 429 detail string
function parseLockTtl(detail: string): number {
  const m = detail.match(/(\d+)\s+second/)
  return m ? parseInt(m[1], 10) : 0
}

export default function Login() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const setAuth = useAuthStore((s) => s.setAuth)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Lock state
  const [locked, setLocked] = useState(false)
  const [lockTtl, setLockTtl] = useState(0)
  const [lockUsername, setLockUsername] = useState('')

  // Unlock-by-email state
  const [unlockStep, setUnlockStep] = useState<'idle' | 'sent' | 'confirmed'>('idle')
  const [unlockLoading, setUnlockLoading] = useState(false)
  const [unlockError, setUnlockError] = useState('')

  // Countdown timer
  useEffect(() => {
    if (!locked || lockTtl <= 0) return
    const id = setInterval(() => {
      setLockTtl((t) => {
        if (t <= 1) { setLocked(false); clearInterval(id); return 0 }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [locked, lockTtl])

  // Auto-confirm unlock token from URL
  useEffect(() => {
    const token = searchParams.get('unlock_token')
    if (!token) return
    confirmUnlock(token)
      .then(() => {
        setUnlockStep('confirmed')
        // Remove token from URL without reload
        window.history.replaceState({}, '', '/login')
      })
      .catch(() => setError('Unlock link is invalid or has expired.'))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setLocked(false)
    try {
      const tokens = await login(username, password)
      useAuthStore.setState({ token: tokens.access_token })
      const user = await getMe()
      setAuth(tokens.access_token, user)
      navigate('/')
    } catch (err: any) {
      const status = err?.response?.status
      const detail: string = err?.response?.data?.detail ?? ''
      if (status === 429) {
        const ttl = parseLockTtl(detail)
        setLocked(true)
        setLockTtl(ttl)
        setLockUsername(username)
        setUnlockStep('idle')
        setUnlockError('')
      } else if (status === 401 || status === 403) {
        setError(detail || 'Invalid username or password')
      } else if (!status) {
        setError(`Network error — cannot reach the server. (${err?.message ?? 'unknown'})`)
      } else {
        setError(`Error ${status}: ${detail || err?.message}`)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSendUnlock = async () => {
    setUnlockLoading(true)
    setUnlockError('')
    try {
      await requestUnlock(lockUsername)
      setUnlockStep('sent')
    } catch (err: any) {
      setUnlockError(err?.response?.data?.detail ?? 'Failed to send unlock email.')
    } finally {
      setUnlockLoading(false)
    }
  }

  const minutes = Math.ceil(lockTtl / 60)

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', bgcolor: 'background.default' }}>
      <Card sx={{ width: 400, p: 2 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
            <RouterIcon color="primary" sx={{ fontSize: 32 }} />
            <Typography variant="h5" fontWeight={700}>Zyxel Manager</Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" mb={3}>
            Sign in to manage your Zyxel USG FLEX firewalls
          </Typography>

          {/* Unlock confirmed banner */}
          {unlockStep === 'confirmed' && (
            <Alert severity="success" sx={{ mb: 2 }}>
              Your account has been unlocked. You can sign in now.
            </Alert>
          )}

          {/* Generic error */}
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          {/* Account locked panel */}
          {locked && (
            <Alert
              severity="warning"
              icon={<LockOutlinedIcon />}
              sx={{ mb: 2 }}
            >
              <Typography variant="body2" fontWeight={600}>
                Account temporarily locked
              </Typography>
              <Typography variant="body2">
                Too many failed attempts. Locked for{' '}
                <strong>{lockTtl > 0 ? `${minutes} min ${lockTtl % 60}s` : 'a moment'}</strong>.
              </Typography>
              {lockTtl > 0 && (
                <LinearProgress
                  variant="determinate"
                  value={(lockTtl / 900) * 100}
                  sx={{ mt: 1, mb: 1, borderRadius: 1 }}
                  color="warning"
                />
              )}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit}>
            <TextField label="Username" fullWidth margin="normal" value={username}
              onChange={(e) => setUsername(e.target.value)} required autoFocus
              disabled={locked} />
            <TextField label="Password" type="password" fullWidth margin="normal"
              value={password} onChange={(e) => setPassword(e.target.value)} required
              disabled={locked} />
            <Button type="submit" variant="contained" fullWidth size="large"
              sx={{ mt: 2 }} disabled={loading || locked}>
              {loading ? <CircularProgress size={24} /> : 'Sign In'}
            </Button>
          </Box>

          {/* Email unlock section */}
          {locked && (
            <>
              <Divider sx={{ my: 2 }}>
                <Typography variant="caption" color="text.secondary">or</Typography>
              </Divider>

              {unlockStep === 'idle' && (
                <>
                  {unlockError && (
                    <Alert severity="error" sx={{ mb: 1 }}>{unlockError}</Alert>
                  )}
                  <Button
                    variant="outlined"
                    fullWidth
                    startIcon={unlockLoading ? <CircularProgress size={18} /> : <EmailOutlinedIcon />}
                    onClick={handleSendUnlock}
                    disabled={unlockLoading}
                  >
                    Send unlock email
                  </Button>
                  <Typography variant="caption" color="text.secondary" display="block" textAlign="center" mt={0.5}>
                    A link will be sent to the email address on file for <strong>{lockUsername}</strong>
                  </Typography>
                </>
              )}

              {unlockStep === 'sent' && (
                <Alert severity="info" icon={<EmailOutlinedIcon />}>
                  Unlock email sent. Check your inbox and click the link to unlock your account.
                </Alert>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </Box>
  )
}
