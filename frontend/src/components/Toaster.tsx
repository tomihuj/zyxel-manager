import { Stack, Snackbar, Alert } from '@mui/material'
import { useToastStore } from '../store/toast'

export default function Toaster() {
  const { toasts, dismiss } = useToastStore()

  return (
    <Stack spacing={1} sx={{ position: 'fixed', bottom: 24, right: 24, zIndex: 2000 }}>
      {toasts.map((t) => (
        <Snackbar
          key={t.id}
          open
          autoHideDuration={t.duration}
          onClose={() => dismiss(t.id)}
          sx={{ position: 'relative', bottom: 'auto', right: 'auto', left: 'auto', top: 'auto' }}
        >
          <Alert severity={t.severity} onClose={() => dismiss(t.id)} variant="filled">
            {t.msg}
          </Alert>
        </Snackbar>
      ))}
    </Stack>
  )
}
