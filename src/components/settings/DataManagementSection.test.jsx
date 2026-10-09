import { CssBaseline } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { costsDatabase } from '../../lib/costsDatabase.js';
import { downloadBlob } from '../../services/export/downloadService.js';
import theme from '../../theme.js';
import DataManagementSection from './DataManagementSection.jsx';
import {
  appDataKey,
  currentDocument,
  legacyCosts,
  makeCost,
  originalAppKeys
} from '../../../tests/storage/fixtures.js';

vi.mock('../../services/export/downloadService.js', () => ({
  downloadBlob: vi.fn()
}));

/*
 * M1 tests for Settings > "Your data": backup, restore with confirmation,
 * recovery of unreadable data, earlier-version import, and previous data.
 */
function renderSection() {
  return render(
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <DataManagementSection />
    </ThemeProvider>
  );
}

function backupFile(costs, name = 'my-backup.json') {
  const text = JSON.stringify({
    format: 'cost-manager-pro-backup',
    formatVersion: 1,
    exportedAt: '2026-10-01T10:00:00.000Z',
    app: 'Cost Manager Pro',
    costCount: costs.length,
    costs
  });

  return new File([text], name, { type: 'application/json' });
}

function getFileInput() {
  return screen.getByLabelText('Backup file to restore');
}

describe('DataManagementSection', () => {
  beforeEach(() => {
    localStorage.clear();
    downloadBlob.mockClear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('shows how many expenses are stored and downloads a complete backup', async () => {
    const user = userEvent.setup();

    localStorage.setItem(appDataKey, currentDocument(legacyCosts));
    renderSection();

    expect(screen.getByRole('heading', { name: 'Your data' })).toBeInTheDocument();
    expect(screen.getByText('3 expenses stored in this browser.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Download backup' }));

    const [blob, filename] = downloadBlob.mock.calls[0];
    const backup = JSON.parse(await blob.text());

    expect(filename).toMatch(/^cost-manager-pro-backup-\d{4}-\d{2}-\d{2}-\d{4}\.json$/);
    expect(backup.costs).toEqual(legacyCosts);
    expect(screen.getByRole('alert')).toHaveTextContent(`Backup downloaded: ${filename}`);
  });

  it('disables backup when there is nothing to back up', () => {
    renderSection();

    expect(screen.getByText('No expenses are stored in this browser yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download backup' })).toBeDisabled();
  });

  it('asks for confirmation and changes nothing when restore is cancelled', async () => {
    const user = userEvent.setup();
    const before = currentDocument([makeCost()]);

    localStorage.setItem(appDataKey, before);
    renderSection();

    await user.upload(getFileInput(), backupFile(legacyCosts));

    const dialog = await screen.findByRole('dialog', { name: 'Replace your expenses with this backup?' });

    expect(dialog).toHaveTextContent('contains 3 expenses');
    expect(dialog).toHaveTextContent('replace the 1 expense stored in this browser');

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(localStorage.getItem(appDataKey)).toBe(before);
  });

  it('restores after confirmation and offers the replaced data back', async () => {
    const user = userEvent.setup();

    localStorage.setItem(appDataKey, currentDocument([makeCost()]));
    renderSection();

    await user.upload(getFileInput(), backupFile(legacyCosts));
    await user.click(await screen.findByRole('button', { name: 'Replace with backup' }));

    expect(costsDatabase.getAllCosts()).toEqual(legacyCosts);
    // findByRole waits for the closing dialog to stop hiding the page.
    expect(await screen.findByRole('alert')).toHaveTextContent('Restored 3 expenses from the backup.');
    expect(screen.getByText('3 expenses stored in this browser.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Previous data' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Restore previous data…' }));
    await user.click(await screen.findByRole('button', { name: 'Restore previous data' }));

    expect(costsDatabase.getAllCosts()).toEqual([makeCost()]);
  });

  it('rejects an invalid file without opening the confirmation or changing data', async () => {
    const user = userEvent.setup();
    const before = currentDocument([makeCost()]);

    localStorage.setItem(appDataKey, before);
    renderSection();

    await user.upload(
      getFileInput(),
      new File(['{"format": "something-else"}'], 'notes.json', { type: 'application/json' })
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('This file is not a Cost Manager Pro backup.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(localStorage.getItem(appDataKey)).toBe(before);
  });

  it('explains unreadable data and offers safe recovery steps', async () => {
    const user = userEvent.setup();

    localStorage.setItem(appDataKey, '{damaged');
    renderSection();

    expect(screen.getByText(/Your saved expenses cannot be read\./)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Download backup' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Download stored data' }));
    expect(await downloadBlob.mock.calls[0][0].text()).toBe('{damaged');

    await user.click(screen.getByRole('button', { name: 'Start with an empty list…' }));
    await user.click(await screen.findByRole('button', { name: 'Start empty' }));

    expect(costsDatabase.getAllCosts()).toEqual([]);
    expect(screen.getByText(/It cannot be read, but it can be downloaded/)).toBeInTheDocument();
  });

  it('imports a copy of earlier data only after confirmation', async () => {
    const user = userEvent.setup();
    const originalValue = JSON.stringify(legacyCosts);

    localStorage.setItem(originalAppKeys.costs, originalValue);
    renderSection();

    expect(screen.getByText(/This browser has 3 expenses saved by an earlier version/)).toBeInTheDocument();
    expect(costsDatabase.getAllCosts()).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Import a copy…' }));
    await user.click(await screen.findByRole('button', { name: 'Import a copy' }));

    expect(costsDatabase.getAllCosts()).toEqual(legacyCosts);
    expect(localStorage.getItem(originalAppKeys.costs)).toBe(originalValue);
  });

  it('is operable with the keyboard', async () => {
    const user = userEvent.setup();

    localStorage.setItem(appDataKey, currentDocument([makeCost()]));
    renderSection();

    await user.tab();
    expect(screen.getByRole('button', { name: 'Download backup' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(downloadBlob).toHaveBeenCalledTimes(1);

    await user.tab();
    expect(screen.getByRole('button', { name: 'Restore from backup…' })).toHaveFocus();
  });
});
