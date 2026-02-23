import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box, Card, CardContent, TextField, Button, Typography, Alert, CircularProgress,
} from '@mui/material'
import RouterIcon from '@mui/icons-material/Router'
import { login, getMe } from '../api/auth'
import { useAuthStore } from '../store/auth'

export default function Login() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const tokens = await login(username, password)
      useAuthStore.setState({ token: tokens.access_token })
      const user = await getMe()
      setAuth(tokens.access_token, user)
      navigate('/')
    } catch {
      setError('Invalid username or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', bgcolor: 'background.default' }}>
      <Card sx={{ width: 380, p: 2 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
            <RouterIcon color="primary" sx={{ fontSize: 32 }} />
            <Typography variant="h5" fontWeight={700}>Zyxel Manager</Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" mb={3}>
            Sign in to manage your Zyxel USG FLEX firewalls
          </Typography>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Box component="form" onSubmit={handleSubmit}>
            <TextField label="Username" fullWidth margin="normal" value={username}
              onChange={(e) => setUsername(e.target.value)} required autoFocus />
            <TextField label="Password" type="password" fullWidth margin="normal"
              value={password} onChange={(e) => setPassword(e.target.value)} required />
            <Button type="submit" variant="contained" fullWidth size="large"
              sx={{ mt: 2 }} disabled={loading}>
              {loading ? <CircularProgress size={24} /> : 'Sign In'}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  )
}
