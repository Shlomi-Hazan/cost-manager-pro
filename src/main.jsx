import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CssBaseline, ThemeProvider } from '@mui/material';
import App from './App.jsx';
import theme from './theme.js';
import './index.css';

// M2B.2: nothing is fetched at startup. Reports fetch the dated ECB rates
// they need, only when generated and only for dates not already cached
// (src/services/historicalRatesService.js). The legacy flat demo-rate refresh
// that used to run here is no longer part of reporting.

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </StrictMode>
);
