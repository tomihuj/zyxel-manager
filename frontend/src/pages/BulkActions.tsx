import { useState } from 'react'
import {
  Box, Typography, Card, CardContent, Stepper, Step, StepLabel, Button,
  TextField, MenuItem, FormControlLabel, Checkbox, Alert, Chip,
  Table, TableHead, TableRow, TableCell, TableBody, CircularProgress,
} from '@mui/material'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listDevices } from '../api/devices'
import { listJobs, createJob, previewJob, executeJob } from '../api/bulk'

const SECTIONS = ['ntp', 'dns', 'interfaces', 'routing', 'nat',
  'firewall_rules', 'vpn', 'address_objects', 'service_objects']

const SECTION_TEMPLATES: Record<string, object> = {
  ntp: { servers: ['192.168.0.10', 'pool.ntp.org'] },
  dns: { primary: '8.8.8.8', secondary: '8.8.4.4', domain: 'example.com' },
  interfaces: { eth0: { enabled: true, ip: '192.168.1.1', mask: '255.255.255.0', description: 'LAN' } },
  routing: { default_gateway: '192.168.1.1', static_routes: [{ dest: '10.0.0.0/8', gw: '192.168.1.254' }] },
  nat: { rules: [{ name: 'PAT_OUT', type: 'masquerade', outbound_interface: 'eth0' }] },
  firewall_rules: { rules: [{ name: 'Allow_LAN_OUT', src_zone: 'LAN', dst_zone: 'WAN', action: 'allow' }] },
  vpn: { tunnels: [{ name: 'HQ', type: 'ipsec', remote_ip: '203.0.113.1', psk: 'changeme' }] },
  address_objects: { objects: [{ name: 'MGMT_SUBNET', type: 'subnet', ip: '10.0.0.0', mask: '255.255.255.0' }] },
  service_objects: { objects: [{ name: 'CUSTOM_APP', protocol: 'tcp', port_start: 8080, port_end: 8090 }] },
}

const templateFor = (s: string) => JSON.stringify(SECTION_TEMPLATES[s] ?? {}, null, 2)

export default function BulkActions() {
  const qc = useQueryClient()
  const { data: devices = [] } = useQuery({ queryKey: ['devices'], queryFn: listDevices })
  const { data: jobs = [] } = useQuery({ queryKey: ['jobs'], queryFn: listJobs })

  const [step, setStep] = useState(0)
  const [selected, setSelected] = useState<string[]>([])
  const [section, setSection] = useState('ntp')
  const [patchText, setPatchText] = useState(templateFor('ntp'))
  const [jobName, setJobName] = useState('New Bulk Job')
  const [createdJobId, setCreatedJobId] = useState<string | null>(null)
  const [previews, setPreviews] = useState<any[]>([])
  const [patchError, setPatchError] = useState('')

  const toggle = (id: string) =>
    setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id])

  const createMut = useMutation({
    mutationFn: () => {
      try {
        const patch = JSON.parse(patchText)
        return createJob({ name: jobName, section, patch, device_ids: selected })
      } catch {
        throw new Error('Invalid JSON patch')
      }
    },
    onSuccess: (job: any) => { setCreatedJobId(job.id); setStep(2) },
    onError: (e: Error) => setPatchError(e.message),
  })

  const previewMut = useMutation({
    mutationFn: () => previewJob(createdJobId!),
    onSuccess: (data: any) => { setPreviews(data); setStep(3) },
  })

  const executeMut = useMutation({
    mutationFn: () => executeJob(createdJobId!),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['jobs'] }); setStep(4) },
  })

  const reset = () => {
    setStep(0); setSelected([]); setCreatedJobId(null)
    setPreviews([]); setPatchError(''); setJobName('New Bulk Job')
  }

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} mb={3}>Bulk Actions</Typography>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stepper activeStep={step} sx={{ mb: 4 }}>
            {['Select Devices', 'Define Change', 'Preview Diff', 'Execute'].map((l) => (
              <Step key={l}><StepLabel>{l}</StepLabel></Step>
            ))}
          </Stepper>

          {step === 0 && (
            <Box>
              <TextField label="Job Name" fullWidth margin="dense" value={jobName}
                onChange={(e) => setJobName(e.target.value)} sx={{ mb: 2 }} />
              <Typography variant="body2" color="text.secondary" mb={1}>Select target devices:</Typography>
              {devices.map((d) => (
                <FormControlLabel key={d.id}
                  label={`${d.name} — ${d.mgmt_ip} (${d.model})`}
                  control={<Checkbox checked={selected.includes(d.id)} onChange={() => toggle(d.id)} />}
                  sx={{ display: 'block' }} />
              ))}
              {devices.length === 0 && <Alert severity="info">No devices found. Add some on the Devices page first.</Alert>}
              <Button variant="contained" sx={{ mt: 2 }} disabled={selected.length === 0}
                onClick={() => setStep(1)}>
                Next ({selected.length} selected)
              </Button>
            </Box>
          )}

          {step === 1 && (
            <Box>
              <TextField select label="Config Section" fullWidth margin="dense" value={section}
                onChange={(e) => { setSection(e.target.value); setPatchText(templateFor(e.target.value)); setPatchError('') }} sx={{ mb: 1 }}>
                {SECTIONS.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </TextField>
              <TextField label="Patch JSON" fullWidth multiline rows={8} margin="dense"
                value={patchText} onChange={(e) => { setPatchText(e.target.value); setPatchError('') }}
                error={!!patchError} helperText={patchError || 'JSON object to merge into the section config'} />
              <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                <Button onClick={() => setStep(0)}>Back</Button>
                <Button variant="contained" onClick={() => createMut.mutate()} disabled={createMut.isPending}>
                  {createMut.isPending ? <CircularProgress size={20} /> : 'Create & Continue'}
                </Button>
              </Box>
            </Box>
          )}

          {step === 2 && (
            <Box>
              <Alert severity="info" sx={{ mb: 2 }}>Job created. Click below to load per-device diff preview.</Alert>
              <Button variant="contained" onClick={() => previewMut.mutate()} disabled={previewMut.isPending}>
                {previewMut.isPending ? <CircularProgress size={20} /> : 'Load Diff Preview'}
              </Button>
            </Box>
          )}

          {step === 3 && (
            <Box>
              <Typography variant="h6" mb={2}>Diff Preview — {previews.length} device(s)</Typography>
              {previews.map((p: any) => (
                <Card key={p.device_id} variant="outlined" sx={{ mb: 2 }}>
                  <CardContent>
                    <Typography fontWeight={600} mb={1}>{p.device_name}</Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                      <Box>
                        <Typography variant="caption" color="error.main" fontWeight={700}>BEFORE</Typography>
                        <pre style={{ fontSize: 11, background: '#fef2f2', padding: 8, borderRadius: 4, overflow: 'auto', margin: 0 }}>
                          {JSON.stringify(p.before, null, 2)}
                        </pre>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="success.main" fontWeight={700}>AFTER</Typography>
                        <pre style={{ fontSize: 11, background: '#f0fdf4', padding: 8, borderRadius: 4, overflow: 'auto', margin: 0 }}>
                          {JSON.stringify(p.after, null, 2)}
                        </pre>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              ))}
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button onClick={() => setStep(1)}>Back</Button>
                <Button variant="contained" color="warning" onClick={() => executeMut.mutate()}
                  disabled={executeMut.isPending}>
                  {executeMut.isPending ? <CircularProgress size={20} /> : `Execute on ${previews.length} device(s)`}
                </Button>
              </Box>
            </Box>
          )}

          {step === 4 && (
            <Alert severity="success" sx={{ display: 'flex', alignItems: 'center' }}>
              Job queued for execution!
              <Button sx={{ ml: 2 }} onClick={reset}>New Job</Button>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Typography variant="h6" fontWeight={600} mb={2}>Job History</Typography>
      <Card>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ '& th': { fontWeight: 600 } }}>
              <TableCell>Name</TableCell>
              <TableCell>Section</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Progress</TableCell>
              <TableCell>Created</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {jobs.map((j) => (
              <TableRow key={j.id} hover>
                <TableCell>{j.name}</TableCell>
                <TableCell><Chip size="small" label={j.section} /></TableCell>
                <TableCell>
                  <Chip size="small" label={j.status}
                    color={j.status === 'completed' ? 'success' : j.status === 'partial' ? 'warning' :
                      j.status === 'running' ? 'info' : j.status === 'failed' ? 'error' : 'default'} />
                </TableCell>
                <TableCell>{j.success_count}/{j.target_count}</TableCell>
                <TableCell>{new Date(j.created_at).toLocaleString()}</TableCell>
              </TableRow>
            ))}
            {jobs.length === 0 && (
              <TableRow><TableCell colSpan={5} align="center" sx={{ color: 'text.secondary' }}>No jobs yet</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </Box>
  )
}
