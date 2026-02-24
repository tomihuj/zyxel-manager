import { useRef, useEffect, useState } from 'react'
import { Box, Typography, Chip, IconButton } from '@mui/material'
import ClearAllIcon from '@mui/icons-material/ClearAll'
import { useDiagStore, type DiagEntry } from '../store/diag'

const METHOD_COLORS: Record<string, string> = {
  GET: '#60a5fa',
  POST: '#34d399',
  PUT: '#fbbf24',
  PATCH: '#f97316',
  DELETE: '#f87171',
}

function statusColor(status?: number): 'success' | 'warning' | 'error' | 'default' {
  if (!status) return 'default'
  if (status < 300) return 'success'
  if (status < 500) return 'warning'
  return 'error'
}

function formatBody(val: unknown): string {
  if (val === undefined || val === null) return ''
  if (typeof val === 'string') return val
  return JSON.stringify(val, null, 2)
}

function EntryRow({ entry }: { entry: DiagEntry }) {
  const [expanded, setExpanded] = useState(false)
  const reqBody = formatBody(entry.requestBody)
  const resBody = formatBody(entry.responseBody)

  return (
    <Box
      onClick={() => setExpanded((v) => !v)}
      sx={{
        cursor: 'pointer',
        borderBottom: '1px solid #1e293b',
        px: 1.5,
        py: 1,
        '&:hover': { bgcolor: '#1e293b' },
      }}
    >
      {/* Summary row */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography
          variant="caption"
          sx={{ fontFamily: 'monospace', fontWeight: 700, color: METHOD_COLORS[entry.method] ?? '#94a3b8', flexShrink: 0 }}
        >
          {entry.method}
        </Typography>
        <Typography
          variant="caption"
          sx={{
            fontFamily: 'monospace',
            color: '#cbd5e1',
            flexGrow: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={entry.url}
        >
          {entry.url}
        </Typography>
        {entry.status ? (
          <Chip label={entry.status} color={statusColor(entry.status)} size="small" sx={{ height: 18, fontSize: 11 }} />
        ) : (
          <Chip label="pending" size="small" sx={{ height: 18, fontSize: 11 }} />
        )}
        {entry.duration_ms !== undefined && (
          <Typography variant="caption" sx={{ color: '#64748b', flexShrink: 0 }}>
            {entry.duration_ms}ms
          </Typography>
        )}
      </Box>

      {/* Timestamp row */}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 0.25 }}>
        <Typography variant="caption" sx={{ color: '#475569', fontSize: 10 }}>
          {entry.timestamp.replace('T', ' ').replace('Z', '')}
        </Typography>
        {entry.error && (
          <Typography variant="caption" sx={{ color: '#f87171', fontSize: 10 }}>
            {entry.error}
          </Typography>
        )}
        {!entry.status && !entry.error && (
          <Typography variant="caption" sx={{ color: '#475569', fontSize: 10 }}>
            pending…
          </Typography>
        )}
      </Box>

      {/* Expanded detail */}
      {expanded && (
        <Box onClick={(e) => e.stopPropagation()} sx={{ mt: 1 }}>
          {reqBody && (
            <Box sx={{ mb: 1 }}>
              <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700, display: 'block', mb: 0.5 }}>
                REQUEST BODY
              </Typography>
              <Box
                component="pre"
                sx={{
                  m: 0,
                  p: 1,
                  bgcolor: '#0a0f1a',
                  borderRadius: 1,
                  fontSize: 11,
                  fontFamily: 'monospace',
                  color: '#94a3b8',
                  maxHeight: 150,
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {reqBody}
              </Box>
            </Box>
          )}
          {resBody && (
            <Box>
              <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700, display: 'block', mb: 0.5 }}>
                RESPONSE BODY
              </Typography>
              <Box
                component="pre"
                sx={{
                  m: 0,
                  p: 1,
                  bgcolor: '#0a0f1a',
                  borderRadius: 1,
                  fontSize: 11,
                  fontFamily: 'monospace',
                  color: '#94a3b8',
                  maxHeight: 200,
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {resBody}
              </Box>
            </Box>
          )}
        </Box>
      )}
    </Box>
  )
}

export default function DiagPanel() {
  const { logs, clear } = useDiagStore()
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs.length])

  return (
    <Box
      sx={{
        width: 440,
        flexShrink: 0,
        height: '100%',
        bgcolor: '#0f172a',
        borderLeft: '1px solid #1e293b',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 2,
          py: 1,
          borderBottom: '1px solid #1e293b',
          flexShrink: 0,
        }}
      >
        <Typography variant="subtitle2" sx={{ color: '#e2e8f0', fontWeight: 700, flexGrow: 1 }}>
          Diagnostic Log
        </Typography>
        <Chip label={logs.length} size="small" sx={{ height: 18, fontSize: 11, bgcolor: '#1e293b', color: '#94a3b8' }} />
        <IconButton size="small" onClick={clear} title="Clear log" sx={{ color: '#64748b', '&:hover': { color: '#e2e8f0' } }}>
          <ClearAllIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Log list */}
      <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
        {logs.length === 0 && (
          <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', color: '#334155', mt: 4 }}>
            No requests yet
          </Typography>
        )}
        {logs.map((entry) => (
          <EntryRow key={entry.id} entry={entry} />
        ))}
        <div ref={bottomRef} />
      </Box>
    </Box>
  )
}
