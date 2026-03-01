import { useState } from 'react'
import {
  Box, Typography, Card, CardContent, Button, FormGroup, FormControlLabel,
  Checkbox, MenuItem, TextField, CircularProgress,
} from '@mui/material'
import DownloadIcon from '@mui/icons-material/Download'
import { useQuery, useMutation } from '@tanstack/react-query'
import { listGroups } from '../api/groups'
import { generateReport } from '../api/reports'

const ALL_SECTIONS = ['interfaces', 'routing', 'nat', 'firewall_rules', 'vpn',
  'users', 'dns', 'ntp', 'address_objects', 'service_objects', 'system']

export default function Reports() {
  const { data: groups = [] } = useQuery({ queryKey: ['groups'], queryFn: listGroups })
  const [sections, setSections] = useState<string[]>(ALL_SECTIONS)
  const [groupIds, setGroupIds] = useState<string[]>([])
  const [format, setFormat] = useState('json')
  const [result, setResult] = useState<unknown>(null)

  const toggleSection = (s: string) =>
    setSections((sel) => sel.includes(s) ? sel.filter((x) => x !== s) : [...sel, s])
  const toggleGroup = (id: string) =>
    setGroupIds((sel) => sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id])

  const genMut = useMutation({
    mutationFn: () => generateReport({
      sections,
      group_ids: groupIds.length ? groupIds : undefined,
      format,
    }),
    onSuccess: (data) => setResult(data),
  })

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} mb={3}>Reports & Export</Typography>
      <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <Card sx={{ flex: '1 1 320px' }}>
          <CardContent>
            <Typography variant="h6" mb={2}>Generate Report</Typography>
            <Typography variant="body2" color="text.secondary" mb={1}>Config sections to include:</Typography>
            <FormGroup row>
              {ALL_SECTIONS.map((s) => (
                <FormControlLabel key={s} label={s} sx={{ width: '50%' }}
                  control={<Checkbox size="small" checked={sections.includes(s)} onChange={() => toggleSection(s)} />} />
              ))}
            </FormGroup>
            {groups.length > 0 && (
              <>
                <Typography variant="body2" color="text.secondary" mt={2} mb={1}>Filter by group (optional):</Typography>
                {groups.map((g) => (
                  <FormControlLabel key={g.id} label={`${g.name} (${g.device_count})`}
                    control={<Checkbox size="small" checked={groupIds.includes(g.id)} onChange={() => toggleGroup(g.id)} />} />
                ))}
              </>
            )}
            <TextField select label="Export Format" fullWidth margin="dense" value={format}
              onChange={(e) => setFormat(e.target.value)}>
              <MenuItem value="json">JSON (inline)</MenuItem>
              <MenuItem value="csv">CSV (download)</MenuItem>
            </TextField>
            <Button variant="contained" fullWidth sx={{ mt: 2 }} startIcon={<DownloadIcon />}
              onClick={() => genMut.mutate()} disabled={genMut.isPending || sections.length === 0}>
              {genMut.isPending ? <CircularProgress size={20} /> : 'Generate'}
            </Button>
          </CardContent>
        </Card>

        {result != null && format === 'json' && (
          <Card sx={{ flex: '1 1 400px' }}>
            <CardContent>
              <Typography variant="h6" mb={1}>Report Output</Typography>
              <pre style={{ fontSize: 11, maxHeight: 500, overflow: 'auto',
                background: '#f5f5f5', padding: 12, borderRadius: 4, margin: 0 }}>
                {JSON.stringify(result, null, 2)}
              </pre>
            </CardContent>
          </Card>
        )}
      </Box>
    </Box>
  )
}
