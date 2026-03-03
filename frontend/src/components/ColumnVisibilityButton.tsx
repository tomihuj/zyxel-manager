import { useState } from 'react'
import {
  IconButton, Popover, FormGroup, FormControlLabel, Checkbox,
  Typography, Box, Tooltip,
} from '@mui/material'
import ViewColumnIcon from '@mui/icons-material/ViewColumn'
import { useColumnVisibilityStore } from '../store/columnVisibility'

export interface ColumnDef {
  field: string
  headerName: string
  hideable?: boolean
}

interface Props {
  tableId: string
  columns: ColumnDef[]
}

export default function ColumnVisibilityButton({ tableId, columns }: Props) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null)
  const { visibility, setVisibility } = useColumnVisibilityStore()
  const model = visibility[tableId] ?? {}

  const isVisible = (field: string) => model[field] !== false

  const toggle = (field: string) => {
    setVisibility(tableId, { ...model, [field]: !isVisible(field) })
  }

  const toggleable = columns.filter((c) => c.hideable !== false)

  return (
    <>
      <Tooltip title="Columns">
        <IconButton size="small" onClick={(e) => setAnchor(e.currentTarget)}>
          <ViewColumnIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Box sx={{ p: 1.5, minWidth: 180 }}>
          <Typography variant="caption" fontWeight={600} color="text.secondary" display="block" mb={0.5}>
            Columns
          </Typography>
          <FormGroup>
            {toggleable.map((col) => (
              <FormControlLabel
                key={col.field}
                control={
                  <Checkbox
                    size="small"
                    checked={isVisible(col.field)}
                    onChange={() => toggle(col.field)}
                  />
                }
                label={<Typography variant="body2">{col.headerName}</Typography>}
                sx={{ ml: 0 }}
              />
            ))}
          </FormGroup>
        </Box>
      </Popover>
    </>
  )
}
