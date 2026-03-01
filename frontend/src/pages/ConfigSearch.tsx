import { useState } from 'react'
import {
  Box, Typography, Card, CardContent, TextField, Button, CircularProgress,
  Accordion, AccordionSummary, AccordionDetails, Chip, Alert, InputAdornment,
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { useQuery } from '@tanstack/react-query'
import { searchConfig, type ConfigSearchResult } from '../api/configSearch'

export default function ConfigSearch() {
  const [q, setQ] = useState('')
  const [submitted, setSubmitted] = useState('')

  const { data = [], isLoading, isFetching } = useQuery<ConfigSearchResult[]>({
    queryKey: ['config-search', submitted],
    queryFn: () => searchConfig(submitted),
    enabled: submitted.length > 0,
  })

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (q.trim()) setSubmitted(q.trim())
  }

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} mb={3}>
        Config Search
      </Typography>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box component="form" onSubmit={handleSearch} sx={{ display: 'flex', gap: 2 }}>
            <TextField
              fullWidth
              placeholder="Search across all device configs — e.g. 8.8.8.8, ntp, hostname..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
            />
            <Button
              type="submit"
              variant="contained"
              disabled={isLoading || isFetching || !q.trim()}
              sx={{ minWidth: 120 }}
            >
              {(isLoading || isFetching) ? <CircularProgress size={20} /> : 'Search'}
            </Button>
          </Box>
        </CardContent>
      </Card>

      {submitted && !isLoading && !isFetching && data.length === 0 && (
        <Alert severity="info">No matches found for "{submitted}"</Alert>
      )}

      {data.map((result) => (
        <Accordion key={`${result.device_id}-${result.section}`} sx={{ mb: 1 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography fontWeight={600}>{result.device_name}</Typography>
              <Chip label={result.section} size="small" variant="outlined" />
              <Chip label={`v${result.snapshot_version}`} size="small" color="primary" variant="outlined" />
              <Chip label={`${result.matches.length} match${result.matches.length !== 1 ? 'es' : ''}`} size="small" color="success" />
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'monospace', fontSize: 13 }}>
              <Box component="thead">
                <Box component="tr">
                  <Box component="th" sx={{ textAlign: 'left', p: 0.5, borderBottom: '1px solid', borderColor: 'divider', width: '50%' }}>
                    Key Path
                  </Box>
                  <Box component="th" sx={{ textAlign: 'left', p: 0.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                    Value
                  </Box>
                </Box>
              </Box>
              <Box component="tbody">
                {result.matches.map((m, i) => (
                  <Box component="tr" key={i} sx={{ '&:hover': { bgcolor: 'action.hover' } }}>
                    <Box component="td" sx={{ p: 0.5, color: 'primary.main' }}>{m.key}</Box>
                    <Box component="td" sx={{ p: 0.5, wordBreak: 'break-all' }}>{m.value}</Box>
                  </Box>
                ))}
              </Box>
            </Box>
          </AccordionDetails>
        </Accordion>
      ))}
    </Box>
  )
}
