import { useState } from 'react'
import {
  Box, Typography, Button, Card, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, List, ListItem, ListItemText, IconButton, Chip, Snackbar,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listGroups, createGroup, deleteGroup } from '../api/groups'

export default function Groups() {
  const qc = useQueryClient()
  const { data: groups = [] } = useQuery({ queryKey: ['groups'], queryFn: listGroups })
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', description: '' })
  const [snack, setSnack] = useState('')

  const createMut = useMutation({
    mutationFn: () => createGroup(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['groups'] }); setOpen(false); setForm({ name: '', description: '' }); setSnack('Group created') },
  })
  const deleteMut = useMutation({
    mutationFn: deleteGroup,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['groups'] }); setSnack('Group deleted') },
  })

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>Device Groups</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>New Group</Button>
      </Box>
      <Card>
        <List>
          {groups.map((g, i) => (
            <ListItem key={g.id} divider={i < groups.length - 1}
              secondaryAction={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Chip size="small" label={`${g.device_count} device${g.device_count !== 1 ? 's' : ''}`} />
                  <IconButton edge="end" color="error" size="small" onClick={() => deleteMut.mutate(g.id)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              }>
              <ListItemText
                primary={<Typography fontWeight={600}>{g.name}</Typography>}
                secondary={g.description || 'No description'} />
            </ListItem>
          ))}
          {groups.length === 0 && (
            <ListItem><ListItemText secondary="No groups yet. Create one to organise your devices." /></ListItem>
          )}
        </List>
      </Card>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>New Group</DialogTitle>
        <DialogContent>
          <TextField label="Name" fullWidth margin="dense" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
          <TextField label="Description" fullWidth margin="dense" value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => createMut.mutate()} disabled={!form.name}>Create</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!snack} autoHideDuration={3000} onClose={() => setSnack('')} message={snack}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </Box>
  )
}
