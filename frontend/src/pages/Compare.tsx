import { useState } from 'react'
import {
  Box, Typography, Button, Chip, Card, Table, TableHead, TableRow, TableCell,
  TableBody, CircularProgress, Alert, Select, MenuItem, FormControl, InputLabel,
  Autocomplete, TextField, Switch, FormControlLabel,
} from '@mui/material'
import CompareArrowsIcon from '@mui/icons-material/CompareArrows'
import { useQuery } from '@tanstack/react-query'
import { listDevices, getDeviceConfig } from '../api/devices'
import type { Device } from '../types'
import { buildRows, sectionLabel } from '../utils/configDiff'

const SECTIONS = [
  'system', 'interfaces', 'routing', 'nat', 'nat_snat', 'firewall_rules',
  'vpn', 'dns', 'ntp', 'address_objects', 'service_objects', 'users',
]

export default function Compare() {
  const [selectedDevices, setSelectedDevices] = useState<Device[]>([])
  const [section, setSection] = useState('interfaces')
  const [configs, setConfigs] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [diffsOnly, setDiffsOnly] = useState(false)

  const { data: devices = [] } = useQuery({ queryKey: ['devices'], queryFn: listDevices })

  const handleCompare = async () => {
    if (selectedDevices.length < 2) return
    setLoading(true)
    setError('')
    setConfigs({})
    try {
      const results = await Promise.all(
        selectedDevices.map(d => getDeviceConfig(d.id, section).then(data => ({ id: d.id, data })))
      )
      const map: Record<string, any> = {}
      results.forEach(({ id, data }) => { map[id] = data })
      setConfigs(map)
    } catch (e: any) {
      setError(e?.message || 'Failed to fetch configs')
    } finally {
      setLoading(false)
    }
  }

  const selectedIds = selectedDevices.map(d => d.id)
  const rows = Object.keys(configs).length > 0 ? buildRows(section, selectedIds, configs) : []
  const visibleRows = diffsOnly ? rows.filter(r => r.differs) : rows
  const diffCount = rows.filter(r => r.differs).length

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>Compare</Typography>

      <Card sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Autocomplete
            multiple
            options={devices}
            getOptionLabel={(d) => `${d.name} (${d.mgmt_ip})`}
            value={selectedDevices}
            onChange={(_, v) => setSelectedDevices(v)}
            renderTags={(value, getTagProps) =>
              value.map((d, i) => (
                <Chip
                  label={d.name}
                  {...getTagProps({ index: i })}
                  size="small"
                  color={d.status === 'online' ? 'success' : 'default'}
                />
              ))
            }
            renderInput={(params) => (
              <TextField {...params} label="Select devices (2 or more)" size="small" />
            )}
            sx={{ minWidth: 360, flex: 1 }}
            limitTags={5}
          />
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Section</InputLabel>
            <Select value={section} label="Section" onChange={(e) => setSection(e.target.value)}>
              {SECTIONS.map(s => (
                <MenuItem key={s} value={s}>{sectionLabel(s)}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            variant="contained"
            startIcon={loading ? undefined : <CompareArrowsIcon />}
            onClick={handleCompare}
            disabled={selectedDevices.length < 2 || loading}
          >
            {loading ? <CircularProgress size={18} sx={{ mr: 1 }} /> : null}
            {loading ? 'Comparing…' : 'Compare'}
          </Button>
        </Box>
      </Card>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {rows.length > 0 && (
        <>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                {rows.length} field{rows.length !== 1 ? 's' : ''}
              </Typography>
              {diffCount > 0
                ? <Chip size="small" label={`${diffCount} difference${diffCount !== 1 ? 's' : ''}`} color="warning" />
                : <Chip size="small" label="Identical" color="success" />
              }
            </Box>
            <FormControlLabel
              control={<Switch checked={diffsOnly} onChange={(e) => setDiffsOnly(e.target.checked)} size="small" />}
              label="Differences only"
              sx={{ mr: 0 }}
            />
          </Box>

          <Card>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ '& th': { fontWeight: 700, fontSize: 12, bgcolor: 'grey.50', borderBottom: 2, borderColor: 'divider' } }}>
                    <TableCell sx={{ minWidth: 240, position: 'sticky', left: 0, bgcolor: 'grey.50', zIndex: 1 }}>
                      Field
                    </TableCell>
                    {selectedDevices.map(d => (
                      <TableCell key={d.id} sx={{ minWidth: 180 }}>
                        <Typography fontWeight={700} fontSize={12}>{d.name}</Typography>
                        <Typography fontSize={11} color="text.secondary">{d.mgmt_ip}</Typography>
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visibleRows.map((row, i) => (
                    <TableRow
                      key={i}
                      sx={{
                        bgcolor: row.differs ? 'warning.50' : undefined,
                        '&:hover': { bgcolor: row.differs ? 'warning.100' : 'action.hover' },
                      }}
                    >
                      <TableCell sx={{
                        fontSize: 12,
                        fontWeight: row.differs ? 600 : 400,
                        color: row.differs ? 'warning.dark' : 'text.primary',
                        position: 'sticky',
                        left: 0,
                        bgcolor: row.differs ? 'warning.50' : 'background.paper',
                        zIndex: 1,
                        borderRight: '1px solid',
                        borderColor: 'divider',
                      }}>
                        {row.label}
                      </TableCell>
                      {row.values.map((val, j) => (
                        <TableCell key={j} sx={{ fontSize: 12, fontFamily: 'monospace' }}>
                          {val === null
                            ? <Chip size="small" label="missing" color="error" variant="outlined" sx={{ fontSize: 11 }} />
                            : val
                          }
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                  {visibleRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={selectedDevices.length + 1} align="center" sx={{ py: 4, color: 'text.secondary', fontSize: 13 }}>
                        {diffsOnly ? 'No differences found — all values are identical.' : 'No data.'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Box>
          </Card>
        </>
      )}
    </Box>
  )
}
