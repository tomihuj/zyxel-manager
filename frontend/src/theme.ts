import { createTheme } from '@mui/material/styles'

export function createAppTheme(darkMode: boolean) {
  return createTheme({
    palette: {
      mode: darkMode ? 'dark' : 'light',
      primary: { main: '#1a56db' },
      secondary: { main: '#0ea5e9' },
      background: darkMode
        ? { default: '#0f172a', paper: '#1e293b' }
        : { default: '#f4f6f9' },
    },
    typography: {
      fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    },
    shape: { borderRadius: 8 },
    components: {
      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: ({ theme }) => ({
            border: `1px solid ${theme.palette.divider}`,
          }),
        },
      },
      MuiButton: { defaultProps: { disableElevation: true } },
    },
  })
}

// Legacy export for any direct imports
export const theme = createAppTheme(false)
