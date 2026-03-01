import { useState } from 'react'
import {
  Box, Typography, Card, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Checkbox, FormControlLabel, Chip, IconButton,
  Tab, Tabs, List, ListItem, ListItemText, Snackbar, Alert, CircularProgress,
} from '@mui/material'
import { DataGrid, type GridColDef } from '@mui/x-data-grid'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listUsers, createUser, updateUser, deleteUser, listRoles, createRole, deleteRole } from '../api/users'
import { listTokens, createToken, revokeToken } from '../api/tokens'
import { totpSetup, totpVerify, totpDisable } from '../api/totp'
import { listSessions, revokeSession, revokeAllSessions } from '../api/sessions'
import type { User, Role, ApiToken, Session } from '../types'
import ConfirmDialog from '../components/ConfirmDialog'

const defaultUser = { email: '', username: '', full_name: '', password: '', is_superuser: false }
const defaultRole = { name: '', description: '' }

export default function Users() {
  const qc = useQueryClient()
  const { data: users = [], isLoading } = useQuery({ queryKey: ['users'], queryFn: listUsers })
  const { data: roles = [] } = useQuery({ queryKey: ['roles'], queryFn: listRoles })
  const { data: tokens = [], isLoading: tokensLoading } = useQuery({
    queryKey: ['api-tokens'],
    queryFn: listTokens,
  })
  const [tab, setTab] = useState(0)
  const [openUser, setOpenUser] = useState(false)
  const [openRole, setOpenRole] = useState(false)
  const [openToken, setOpenToken] = useState(false)
  const [snack, setSnack] = useState('')
  const [userForm, setUserForm] = useState(defaultUser)
  const [roleForm, setRoleForm] = useState(defaultRole)
  const [tokenForm, setTokenForm] = useState({ name: '', expires_at: '' })
  const [newTokenValue, setNewTokenValue] = useState<string | null>(null)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [editForm, setEditForm] = useState({ email: '', full_name: '', password: '', is_active: true, is_superuser: false })
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null)
  const [deleteRoleId, setDeleteRoleId] = useState<string | null>(null)
  const [revokeTokenId, setRevokeTokenId] = useState<string | null>(null)
  const [totpStep, setTotpStep] = useState<'idle' | 'setup' | 'disable'>('idle')
  const [totpUri, setTotpUri] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [revokeSessionId, setRevokeSessionId] = useState<string | null>(null)

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery({
    queryKey: ['sessions'],
    queryFn: listSessions,
    enabled: tab === 4,
  })

  const createUserMut = useMutation({
    mutationFn: () => createUser(userForm),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      setOpenUser(false)
      setUserForm(defaultUser)
      setSnack('User created')
    },
    onError: () => setSnack('Failed to create user'),
  })
  const updateUserMut = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        email: editForm.email,
        full_name: editForm.full_name,
        is_active: editForm.is_active,
        is_superuser: editForm.is_superuser,
      }
      if (editForm.password) body.password = editForm.password
      return updateUser(editUser!.id, body)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      setEditUser(null)
      setSnack('User updated')
    },
    onError: () => setSnack('Failed to update user'),
  })
  const deleteUserMut = useMutation({
    mutationFn: () => deleteUser(deleteUserId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      setDeleteUserId(null)
      setSnack('User deleted')
    },
  })
  const createRoleMut = useMutation({
    mutationFn: () => createRole(roleForm),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles'] })
      setOpenRole(false)
      setRoleForm(defaultRole)
      setSnack('Role created')
    },
  })
  const deleteRoleMut = useMutation({
    mutationFn: () => deleteRole(deleteRoleId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles'] })
      setDeleteRoleId(null)
      setSnack('Role deleted')
    },
  })
  const createTokenMut = useMutation({
    mutationFn: () =>
      createToken(tokenForm.name, tokenForm.expires_at || undefined),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['api-tokens'] })
      setNewTokenValue(data.token)
      setTokenForm({ name: '', expires_at: '' })
    },
    onError: () => setSnack('Failed to create token'),
  })
  const revokeTokenMut = useMutation({
    mutationFn: () => revokeToken(revokeTokenId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['api-tokens'] })
      setRevokeTokenId(null)
      setSnack('Token revoked')
    },
    onError: () => setSnack('Failed to revoke token'),
  })

  const userColumns: GridColDef<User>[] = [
    { field: 'username', headerName: 'Username', flex: 1 },
    { field: 'email', headerName: 'Email', flex: 1 },
    { field: 'full_name', headerName: 'Full Name', flex: 1 },
    {
      field: 'is_superuser', headerName: 'Superuser', width: 110,
      renderCell: (p) => p.value ? <Chip size="small" label="Yes" color="error" /> : null,
    },
    {
      field: 'is_active', headerName: 'Active', width: 80,
      renderCell: (p) => <Chip size="small" label={p.value ? 'Yes' : 'No'} color={p.value ? 'success' : 'default'} />,
    },
    {
      field: 'actions', headerName: '', width: 100, sortable: false,
      renderCell: (p) => (
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <IconButton size="small" onClick={() => {
            setEditUser(p.row)
            setEditForm({ email: p.row.email, full_name: p.row.full_name ?? '', password: '', is_active: p.row.is_active, is_superuser: p.row.is_superuser })
          }}>
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" color="error" onClick={() => setDeleteUserId(p.row.id)}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      ),
    },
  ]

  const tokenColumns: GridColDef<ApiToken>[] = [
    { field: 'name', headerName: 'Name', flex: 1 },
    { field: 'prefix', headerName: 'Prefix', width: 110 },
    {
      field: 'expires_at', headerName: 'Expires', width: 160,
      valueGetter: (v) => v ? new Date(v).toLocaleString() : 'Never',
    },
    {
      field: 'last_used_at', headerName: 'Last Used', width: 160,
      valueGetter: (v) => v ? new Date(v).toLocaleString() : '—',
    },
    {
      field: 'revoked', headerName: 'Status', width: 100,
      renderCell: (p) => (
        <Chip
          size="small"
          label={p.value ? 'Revoked' : 'Active'}
          color={p.value ? 'error' : 'success'}
        />
      ),
    },
    {
      field: 'created_at', headerName: 'Created', width: 160,
      valueGetter: (v) => new Date(v).toLocaleString(),
    },
    {
      field: 'actions', headerName: '', width: 80, sortable: false,
      renderCell: (p) => (
        !p.row.revoked ? (
          <IconButton size="small" color="error" onClick={() => setRevokeTokenId(p.row.id)}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        ) : null
      ),
    },
  ]

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} mb={3}>Users & Roles</Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
        <Tab label={`Users (${users.length})`} />
        <Tab label={`Roles (${roles.length})`} />
        <Tab label={`API Tokens (${tokens.length})`} />
        <Tab label="2FA (TOTP)" />
        <Tab label="Sessions" />
      </Tabs>

      {tab === 0 && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpenUser(true)}>New User</Button>
          </Box>
          <Card>
            <DataGrid rows={users} columns={userColumns} loading={isLoading} autoHeight
              getRowId={(r) => r.id} pageSizeOptions={[25]} sx={{ border: 0 }} />
          </Card>
        </Box>
      )}

      {tab === 1 && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpenRole(true)}>New Role</Button>
          </Box>
          <Card>
            <List>
              {roles.map((r: Role, i: number) => (
                <ListItem
                  key={r.id}
                  divider={i < roles.length - 1}
                  secondaryAction={
                    <IconButton size="small" color="error" onClick={() => setDeleteRoleId(r.id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  }
                >
                  <ListItemText
                    primary={<Typography fontWeight={600}>{r.name}</Typography>}
                    secondary={r.description || 'No description'} />
                </ListItem>
              ))}
              {roles.length === 0 && (
                <ListItem><ListItemText secondary="No roles yet. Create one to assign permissions." /></ListItem>
              )}
            </List>
          </Card>
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" color="text.secondary">
              To configure permissions for a role, use the API: <code>PUT /api/v1/users/roles/{'{role_id}'}/permissions</code>
            </Typography>
          </Box>
        </Box>
      )}

      {tab === 2 && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => { setNewTokenValue(null); setTokenForm({ name: '', expires_at: '' }); setOpenToken(true) }}
            >
              New Token
            </Button>
          </Box>
          <Card>
            <DataGrid
              rows={tokens}
              columns={tokenColumns}
              loading={tokensLoading}
              autoHeight
              getRowId={(r) => r.id}
              pageSizeOptions={[25]}
              sx={{ border: 0 }}
            />
          </Card>
        </Box>
      )}

      {tab === 3 && (
        <Box>
          <Typography variant="h6" mb={2}>Two-Factor Authentication (TOTP)</Typography>
          <Card sx={{ p: 3, maxWidth: 480 }}>
            {totpStep === 'idle' && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Alert severity="info">
                  Protect your account with a time-based one-time password (TOTP) authenticator app.
                </Alert>
                <Button
                  variant="contained"
                  onClick={async () => {
                    try {
                      const r = await totpSetup()
                      setTotpUri(r.uri)
                      setTotpStep('setup')
                    } catch { setSnack('Failed to set up TOTP') }
                  }}
                >
                  Set Up 2FA
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  onClick={() => setTotpStep('disable')}
                >
                  Disable 2FA
                </Button>
              </Box>
            )}
            {totpStep === 'setup' && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Alert severity="info">
                  Scan the QR code with your authenticator app, then enter the 6-digit code below.
                </Alert>
                <Box sx={{ bgcolor: 'grey.100', p: 2, borderRadius: 1, wordBreak: 'break-all', fontFamily: 'monospace', fontSize: 12 }}>
                  {totpUri}
                </Box>
                <TextField
                  label="TOTP Code"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  placeholder="123456"
                  inputProps={{ maxLength: 6 }}
                />
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button onClick={() => { setTotpStep('idle'); setTotpCode('') }}>Cancel</Button>
                  <Button
                    variant="contained"
                    disabled={totpCode.length !== 6}
                    onClick={async () => {
                      try {
                        await totpVerify(totpCode)
                        setSnack('2FA enabled successfully')
                        setTotpStep('idle')
                        setTotpCode('')
                      } catch { setSnack('Invalid TOTP code') }
                    }}
                  >
                    Verify & Enable
                  </Button>
                </Box>
              </Box>
            )}
            {totpStep === 'disable' && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Alert severity="warning">Enter your current TOTP code to disable 2FA.</Alert>
                <TextField
                  label="TOTP Code"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  placeholder="123456"
                  inputProps={{ maxLength: 6 }}
                />
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button onClick={() => { setTotpStep('idle'); setTotpCode('') }}>Cancel</Button>
                  <Button
                    variant="contained"
                    color="error"
                    disabled={totpCode.length !== 6}
                    onClick={async () => {
                      try {
                        await totpDisable(totpCode)
                        setSnack('2FA disabled')
                        setTotpStep('idle')
                        setTotpCode('')
                      } catch { setSnack('Invalid TOTP code') }
                    }}
                  >
                    Disable 2FA
                  </Button>
                </Box>
              </Box>
            )}
          </Card>
        </Box>
      )}

      {tab === 4 && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">Active Sessions</Typography>
            <Button
              variant="outlined"
              color="error"
              size="small"
              onClick={async () => {
                try {
                  await revokeAllSessions()
                  qc.invalidateQueries({ queryKey: ['sessions'] })
                  setSnack('All sessions revoked')
                } catch { setSnack('Failed to revoke sessions') }
              }}
            >
              Revoke All
            </Button>
          </Box>
          {sessionsLoading ? (
            <CircularProgress size={24} />
          ) : sessions.length === 0 ? (
            <Alert severity="info">No active sessions found.</Alert>
          ) : (
            <Card>
              <List>
                {(sessions as Session[]).map((s: Session, i: number) => (
                  <ListItem
                    key={s.id}
                    divider={i < sessions.length - 1}
                    secondaryAction={
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => setRevokeSessionId(s.id)}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    }
                  >
                    <ListItemText
                      primary={s.user_agent ?? 'Unknown client'}
                      secondary={
                        `IP: ${s.ip_address ?? '—'} · Created: ${new Date(s.created_at).toLocaleString()} · Expires: ${new Date(s.expires_at).toLocaleString()}`
                      }
                    />
                  </ListItem>
                ))}
              </List>
            </Card>
          )}
        </Box>
      )}

      {/* Edit User Dialog */}
      <Dialog open={!!editUser} onClose={() => setEditUser(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit User — {editUser?.username}</DialogTitle>
        <DialogContent>
          <TextField label="Email" type="email" fullWidth margin="dense" value={editForm.email}
            onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
          <TextField label="Full Name" fullWidth margin="dense" value={editForm.full_name}
            onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })} />
          <TextField label="New Password" type="password" fullWidth margin="dense" value={editForm.password}
            onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
            helperText="Leave blank to keep current password" />
          <FormControlLabel label="Active" control={
            <Checkbox checked={editForm.is_active}
              onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })} />
          } />
          <FormControlLabel label="Superuser (full access)" control={
            <Checkbox checked={editForm.is_superuser}
              onChange={(e) => setEditForm({ ...editForm, is_superuser: e.target.checked })} />
          } />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditUser(null)}>Cancel</Button>
          <Button variant="contained" onClick={() => updateUserMut.mutate()}
            disabled={updateUserMut.isPending || !editForm.email}>
            {updateUserMut.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* New User Dialog */}
      <Dialog open={openUser} onClose={() => setOpenUser(false)} maxWidth="sm" fullWidth>
        <DialogTitle>New User</DialogTitle>
        <DialogContent>
          <TextField label="Email" type="email" fullWidth margin="dense" value={userForm.email}
            onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} />
          <TextField label="Username" fullWidth margin="dense" value={userForm.username}
            onChange={(e) => setUserForm({ ...userForm, username: e.target.value })} />
          <TextField label="Full Name" fullWidth margin="dense" value={userForm.full_name}
            onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })} />
          <TextField label="Password" type="password" fullWidth margin="dense" value={userForm.password}
            onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} />
          <FormControlLabel label="Superuser (full access)" control={
            <Checkbox checked={userForm.is_superuser}
              onChange={(e) => setUserForm({ ...userForm, is_superuser: e.target.checked })} />
          } />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenUser(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => createUserMut.mutate()}
            disabled={createUserMut.isPending || !userForm.email || !userForm.username || !userForm.password}>
            {createUserMut.isPending ? 'Creating…' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* New Role Dialog */}
      <Dialog open={openRole} onClose={() => setOpenRole(false)} maxWidth="xs" fullWidth>
        <DialogTitle>New Role</DialogTitle>
        <DialogContent>
          <TextField label="Name" fullWidth margin="dense" value={roleForm.name}
            onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })} autoFocus />
          <TextField label="Description" fullWidth margin="dense" value={roleForm.description}
            onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenRole(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => createRoleMut.mutate()} disabled={!roleForm.name}>Create</Button>
        </DialogActions>
      </Dialog>

      {/* New Token Dialog */}
      <Dialog open={openToken} onClose={() => setOpenToken(false)} maxWidth="sm" fullWidth>
        <DialogTitle>New API Token</DialogTitle>
        <DialogContent>
          {newTokenValue ? (
            <Box>
              <Alert severity="success" sx={{ mb: 2 }}>
                Token created successfully. Copy it now — it won't be shown again.
              </Alert>
              <TextField
                label="Your API Token"
                fullWidth
                value={newTokenValue}
                InputProps={{ readOnly: true }}
                helperText="Use this as: Authorization: Bearer <token>"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
            </Box>
          ) : (
            <>
              <TextField
                label="Token Name"
                fullWidth
                margin="dense"
                value={tokenForm.name}
                onChange={(e) => setTokenForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
              <TextField
                label="Expires At (optional)"
                fullWidth
                margin="dense"
                type="datetime-local"
                value={tokenForm.expires_at}
                onChange={(e) => setTokenForm((f) => ({ ...f, expires_at: e.target.value }))}
                InputLabelProps={{ shrink: true }}
                helperText="Leave blank for no expiry"
              />
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenToken(false)}>{newTokenValue ? 'Close' : 'Cancel'}</Button>
          {!newTokenValue && (
            <Button
              variant="contained"
              onClick={() => createTokenMut.mutate()}
              disabled={!tokenForm.name || createTokenMut.isPending}
            >
              {createTokenMut.isPending ? 'Creating…' : 'Create'}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Confirm delete user */}
      <ConfirmDialog
        open={!!deleteUserId}
        title="Delete User"
        message="Are you sure you want to delete this user? This action cannot be undone."
        onConfirm={() => deleteUserMut.mutate()}
        onClose={() => setDeleteUserId(null)}
        loading={deleteUserMut.isPending}
      />

      {/* Confirm delete role */}
      <ConfirmDialog
        open={!!deleteRoleId}
        title="Delete Role"
        message="Are you sure you want to delete this role? Users assigned this role will lose its permissions."
        onConfirm={() => deleteRoleMut.mutate()}
        onClose={() => setDeleteRoleId(null)}
        loading={deleteRoleMut.isPending}
      />

      {/* Confirm revoke token */}
      <ConfirmDialog
        open={!!revokeTokenId}
        title="Revoke API Token"
        message="Are you sure you want to revoke this token? Any client using it will lose access immediately."
        confirmLabel="Revoke"
        confirmColor="warning"
        onConfirm={() => revokeTokenMut.mutate()}
        onClose={() => setRevokeTokenId(null)}
        loading={revokeTokenMut.isPending}
      />

      <ConfirmDialog
        open={!!revokeSessionId}
        title="Revoke Session"
        message="Are you sure you want to revoke this session? That client will be logged out."
        confirmLabel="Revoke"
        confirmColor="warning"
        onConfirm={async () => {
          if (!revokeSessionId) return
          await revokeSession(revokeSessionId)
          qc.invalidateQueries({ queryKey: ['sessions'] })
          setRevokeSessionId(null)
          setSnack('Session revoked')
        }}
        onClose={() => setRevokeSessionId(null)}
      />

      <Snackbar open={!!snack} autoHideDuration={3000} onClose={() => setSnack('')} message={snack}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </Box>
  )
}
