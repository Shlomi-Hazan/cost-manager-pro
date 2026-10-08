import { CssBaseline } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.jsx';
import AddCostPage from './pages/AddCostPage.jsx';
import ManageCostsPage from './pages/ManageCostsPage.jsx';
import theme from './theme.js';
import { appDataKey, quotaError } from '../tests/storage/fixtures.js';

/*
 * M1: storage failures must be explained to the user and must never be
 * presented as "no expenses yet".
 */
function renderWithTheme(element) {
  return render(
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {element}
    </ThemeProvider>
  );
}

describe('storage failures in the UI', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('shows a banner on every page while stored data is unreadable, linking to Settings', async () => {
    const user = userEvent.setup();

    localStorage.setItem(appDataKey, '{damaged');
    renderWithTheme(<App />);

    expect(screen.getByText(/Your saved expenses cannot be read/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Open Settings' }));

    expect(screen.getByRole('heading', { name: 'Your data' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open Settings' })).not.toBeInTheDocument();
  });

  it('shows no banner when storage is healthy', () => {
    renderWithTheme(<App />);

    expect(screen.queryByText(/Your saved expenses cannot be read/)).not.toBeInTheDocument();
  });

  it('hides the banner once the unreadable data has been reset', async () => {
    const user = userEvent.setup();

    localStorage.setItem(appDataKey, '{damaged');
    renderWithTheme(<App />);
    await user.click(screen.getByRole('button', { name: 'Open Settings' }));
    await user.click(screen.getByRole('button', { name: 'Start with an empty list…' }));
    await user.click(await screen.findByRole('button', { name: 'Start empty' }));

    expect(screen.queryByText(/saving is paused to protect them/)).not.toBeInTheDocument();
  });

  it('reports unreadable data in Manage Costs instead of an empty list', () => {
    localStorage.setItem(appDataKey, '{damaged');
    renderWithTheme(<ManageCostsPage />);

    expect(screen.getByText(/Your saved expenses cannot be read, so nothing was changed/)).toBeInTheDocument();
    expect(screen.queryByText(/No costs have been added yet/)).not.toBeInTheDocument();
  });

  it('explains a full storage quota and keeps what the user typed', async () => {
    const user = userEvent.setup();

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw quotaError();
    });
    renderWithTheme(<AddCostPage />);

    await user.type(screen.getByLabelText('Sum'), '42.5');
    await user.type(screen.getByLabelText('Category'), 'Food');
    await user.type(screen.getByLabelText('Description'), 'Dinner');
    await user.click(screen.getByRole('button', { name: 'Add Cost' }));

    expect(screen.getByText(/browser storage for this site is full/)).toBeInTheDocument();
    expect(screen.getByLabelText('Sum')).toHaveValue('42.5');
    expect(screen.getByLabelText('Description')).toHaveValue('Dinner');
    expect(localStorage.getItem(appDataKey)).toBeNull();
  });
});
