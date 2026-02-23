import { useState } from 'react'
import {
  Box, Typography, Card, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Checkbox, FormControlLabel, Chip, IconButton,
  Tab, Tabs, List, ListItem, ListItemText, Snackbar,
} from '@mui/material'
import { DataGrid, type GridColDef } from '@mui/x-data-grid'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listUsers, createUser, deleteUser, listRoles, createRole } from '../api/users'
import type { User, Role } from '../types'

const defaultUser = { email: '', username: '', full_name: '', password: '', is_superuser: false }
const defaultRole = { name: '', description: '' }

export default function Users() {
  const qc = useQueryClient()
  const { data: users = [], isLoading } = useQuery({ queryKey: ['users'], queryFn: listUsers })
  const { data: roles = [] } = useQuery({ queryKey: ['roles'], queryFn: listRoles })
  const [tab, setTab] = useState(0)
  const [openUser, setOpenUser] = useState(false)
  const [openRole, setOpenRole] = useState(false)
  const [snack, setSnack] = useState('')
  const [userForm, setUserForm] = useState(defaultUser)
  const [roleForm, setRoleForm] = useState(defaultRole)

  const createUserMut = useMutation({
    mutationFn: () => createUser(userForm),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setOpenUser(false); setUserForm(defaultUser); setSnack('User created') },
    onError: () => setSnack('Failed to create user'),
  })
  const deleteUserMut = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setSnack('User deleted') },
  })
  const createRoleMut = useMutation({
    mutationFn: () => createRole(roleForm),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['roles'] }); setOpenRole(false); setRoleForm(defaultRole); setSnack('Role created') },
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
      field: 'actions', headerName: '', width: 60, sortable: false,
      renderCell: (p) => (
        <IconButton size="small" color="error" onClick={() => deleteUserMut.mutate(p.row.id)}>
          <DeleteIcon fontSize="small" />
        </IconButton>
      ),
    },
  ]

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} mb={3}>Users & Roles</Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
        <Tab label={`Users (${users.length})`} />
        <Tab label={`Roles (${roles.length})`} />
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
                <ListItem key={r.id} divider={i < roles.length - 1}>
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

      <Snackbar open={!!snack} autoHideDuration={3000} onClose={() => setSnack('')} message={snack}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </Box>
  )
}
