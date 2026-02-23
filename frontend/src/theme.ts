import { createTheme } from '@mui/material/styles'

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#1a56db' },
    secondary: { main: '#0ea5e9' },
    background: { default: '#f4f6f9' },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
  },
  shape: { borderRadius: 8 },
  components: {
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: { root: { border: '1px solid #e5e7eb' } },
    },
    MuiButton: { defaultProps: { disableElevation: true } },
  },
})
