import { CssBaseline } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { costsDatabase } from '../lib/costsDatabase.js';
import ManageCostsPage from './ManageCostsPage.jsx';
import theme from '../theme.js';

/*
 * TEAM EXTENSION tests (X-002/X-003): drives the real Manage Costs UI
 * (edit dialog, delete confirmation) against real stored costs, protecting
 * that editing/deleting through the UI has the same effect as calling
 * db.js's updateCost/deleteCost directly and that the stable id is never
 * disturbed by an edit.
 */
function renderManageCostsPage() {
  return render(
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ManageCostsPage />
    </ThemeProvider>
  );
}

function setupUser() {
  return userEvent.setup({
    advanceTimers: vi.advanceTimersByTime
  });
}

function setLocalDate(year, month, day, hour = 12, minute = 0) {
  vi.setSystemTime(new Date(year, month - 1, day, hour, minute, 0));
}

function addStoredCost({
  sum = 100,
  currency = 'USD',
  category = 'Food',
  description = 'Lunch',
  year = 2026,
  month = 8,
  day = 24,
  hour = 9,
  minute = 5
} = {}) {
  setLocalDate(year, month, day, hour, minute);

  return costsDatabase.addCost({
    sum,
    currency,
    category,
    description
  });
}

function getDataRows() {
  return screen.getAllByRole('row').slice(1);
}

async function chooseCurrency(user, dialog, currency) {
  await user.click(within(dialog).getByRole('combobox', { name: 'Currency' }));
  await user.click(screen.getByRole('option', { name: currency }));
}

async function openEditDialog(user, row) {
  await user.click(within(row).getByRole('button', { name: 'Edit' }));

  return screen.getByRole('dialog', { name: 'Edit Cost' });
}

async function saveEdit(user, dialog) {
  await user.click(within(dialog).getByRole('button', { name: 'Save Changes' }));
}

async function openDeleteDialog(user, row) {
  await user.click(within(row).getByRole('button', { name: 'Delete' }));

  return screen.getByRole('dialog', { name: 'Delete cost?' });
}

function changeField(dialog, label, value) {
  fireEvent.change(within(dialog).getByLabelText(label), {
    target: {
      value
    }
  });
}

describe('ManageCostsPage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({
      toFake: ['Date']
    });
    setLocalDate(2026, 8, 24, 10, 30);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    localStorage.clear();
  });

  it('renders the page heading and empty state when no costs exist', () => {
    renderManageCostsPage();

    expect(screen.getByRole('heading', { name: 'Manage Costs' })).toBeInTheDocument();
    expect(
      screen.getByText('Review, edit, or delete your saved expenses.')
    ).toBeInTheDocument();
    expect(screen.getByText(/No costs have been added yet/)).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Saved costs' })).not.toBeInTheDocument();
  });

  it('lists all stored costs with formatted date, time, actions, and no visible ID column', () => {
    const first = addStoredCost({
      description: 'Lunch',
      year: 2026,
      month: 8,
      day: 4,
      hour: 9,
      minute: 5
    });
    addStoredCost({
      sum: 50,
      currency: 'GBP',
      category: 'Travel',
      description: 'Train',
      year: 2026,
      month: 8,
      day: 24,
      hour: 16,
      minute: 37
    });

    renderManageCostsPage();

    const rows = getDataRows();

    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('04/08/2026')).toBeInTheDocument();
    expect(within(rows[0]).getByText('09:05')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Lunch')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Food')).toBeInTheDocument();
    expect(within(rows[0]).getByText('100.00')).toBeInTheDocument();
    expect(within(rows[0]).getByText('USD')).toBeInTheDocument();
    expect(within(rows[0]).getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(within(rows[0]).getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: 'Saved costs' })).queryByText('ID')).not.toBeInTheDocument();
    expect(screen.queryByText(first.id)).not.toBeInTheDocument();
  });

  it('opens an edit dialog populated from the selected cost', async () => {
    const user = setupUser();
    addStoredCost({
      sum: 125.5,
      currency: 'GBP',
      category: 'Travel',
      description: 'Train ticket',
      year: 2026,
      month: 8,
      day: 4,
      hour: 9,
      minute: 5
    });
    renderManageCostsPage();

    const dialog = await openEditDialog(user, getDataRows()[0]);

    expect(within(dialog).getByLabelText('Sum')).toHaveValue('125.5');
    expect(within(dialog).getByRole('combobox', { name: 'Currency' })).toHaveTextContent('GBP');
    expect(within(dialog).getByRole('combobox', { name: 'Category' })).toHaveValue('Travel');
    expect(within(dialog).getByLabelText('Description')).toHaveValue('Train ticket');
    expect(within(dialog).getByLabelText('Date')).toHaveValue('2026-08-04');
    expect(within(dialog).getByLabelText('Time')).toHaveValue('09:05');
  });

  it('offers common category suggestions while editing', async () => {
    const user = setupUser();
    addStoredCost();
    renderManageCostsPage();

    const dialog = await openEditDialog(user, getDataRows()[0]);

    const categoryInput = within(dialog).getByRole('combobox', { name: 'Category' });

    await user.clear(categoryInput);
    await user.type(categoryInput, 'F');

    expect(screen.getByRole('option', { name: 'Food' })).toBeInTheDocument();

    await user.clear(categoryInput);
    await user.type(categoryInput, 'Tr');

    expect(screen.getByRole('option', { name: 'Travel' })).toBeInTheDocument();

    await user.clear(categoryInput);
    await user.type(categoryInput, 'Ot');

    expect(screen.getByRole('option', { name: 'Other' })).toBeInTheDocument();
  });

  it('saves edits to every editable field, canonicalizes common categories, refreshes the row, and preserves ID', async () => {
    const user = setupUser();
    const original = addStoredCost({
      sum: 100,
      currency: 'USD',
      category: 'Food',
      description: 'Lunch',
      year: 2026,
      month: 8,
      day: 24,
      hour: 10,
      minute: 30
    });
    renderManageCostsPage();

    const dialog = await openEditDialog(user, getDataRows()[0]);

    changeField(dialog, 'Sum', '135.5');
    await chooseCurrency(user, dialog, 'GBP');
    changeField(dialog, 'Category', 'food');
    changeField(dialog, 'Description', ' Updated lunch ');
    changeField(dialog, 'Date', '2026-09-04');
    changeField(dialog, 'Time', '09:07');
    await saveEdit(user, dialog);

    expect(screen.getByText('Cost updated successfully.')).toBeInTheDocument();

    const [updated] = costsDatabase.getAllCosts();

    expect(updated).toEqual({
      id: original.id,
      sum: 135.5,
      currency: 'GBP',
      category: 'Food',
      description: 'Updated lunch',
      date: {
        day: 4,
        month: 9,
        year: 2026,
        hour: 9,
        minute: 7
      }
    });

    const row = getDataRows()[0];

    expect(within(row).getByText('04/09/2026')).toBeInTheDocument();
    expect(within(row).getByText('09:07')).toBeInTheDocument();
    expect(within(row).getByText('Updated lunch')).toBeInTheDocument();
    expect(within(row).getByText('135.50')).toBeInTheDocument();
    expect(within(row).getByText('GBP')).toBeInTheDocument();
  });

  it('saves custom free-text categories without forcing the common list', async () => {
    const user = setupUser();
    addStoredCost();
    renderManageCostsPage();

    const dialog = await openEditDialog(user, getDataRows()[0]);

    changeField(dialog, 'Category', 'Vinyl Records');
    await saveEdit(user, dialog);

    expect(costsDatabase.getAllCosts()[0]).toMatchObject({
      category: 'Vinyl Records'
    });
    expect(screen.getByText('Vinyl Records')).toBeInTheDocument();
  });

  it('cancels editing without persisting changed fields', async () => {
    const user = setupUser();
    const original = addStoredCost({
      description: 'Lunch'
    });
    renderManageCostsPage();

    const dialog = await openEditDialog(user, getDataRows()[0]);

    changeField(dialog, 'Description', 'Changed but cancelled');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog', { name: 'Edit Cost' })).not.toBeInTheDocument();
    expect(costsDatabase.getCostById(original.id)).toMatchObject({
      description: 'Lunch'
    });
    expect(screen.getByText('Lunch')).toBeInTheDocument();
  });

  it('rejects invalid edit fields before persistence', async () => {
    const user = setupUser();
    addStoredCost();
    renderManageCostsPage();

    const dialog = await openEditDialog(user, getDataRows()[0]);

    changeField(dialog, 'Sum', 'not numeric');
    changeField(dialog, 'Category', '   ');
    changeField(dialog, 'Description', '   ');
    changeField(dialog, 'Date', 'not-a-date');
    changeField(dialog, 'Time', '99:99');
    await saveEdit(user, dialog);

    expect(within(dialog).getByText('Enter the sum using digits and an optional decimal point, for example 12.50.')).toBeInTheDocument();
    expect(within(dialog).getByText('Enter a category.')).toBeInTheDocument();
    expect(within(dialog).getByText('Enter a description.')).toBeInTheDocument();
    expect(within(dialog).getByText('Enter a date.')).toBeInTheDocument();
    expect(within(dialog).getByText('Enter a time.')).toBeInTheDocument();
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Could not update cost. Please review the fields and try again.'
    );
  });

  it('rejects missing date and time before persistence', async () => {
    const user = setupUser();
    addStoredCost();
    renderManageCostsPage();

    const dialog = await openEditDialog(user, getDataRows()[0]);

    changeField(dialog, 'Date', '');
    changeField(dialog, 'Time', '');
    await saveEdit(user, dialog);

    expect(screen.getByText('Enter a date.')).toBeInTheDocument();
    expect(screen.getByText('Enter a time.')).toBeInTheDocument();
  });

  it('shows a friendly error for impossible calendar dates rejected by the database', async () => {
    const user = setupUser();
    addStoredCost();
    vi.spyOn(costsDatabase, 'updateCost').mockImplementationOnce(() => {
      throw new Error('date must be a real calendar date.');
    });
    renderManageCostsPage();

    const dialog = await openEditDialog(user, getDataRows()[0]);

    await saveEdit(user, dialog);

    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Enter a real calendar date.'
    );
    expect(screen.getByRole('dialog', { name: 'Edit Cost' })).toBeInTheDocument();
  });

  it('clears edit dialog feedback before opening another cost', async () => {
    const user = setupUser();
    addStoredCost({
      description: 'Lunch'
    });
    addStoredCost({
      description: 'Train'
    });
    vi.spyOn(costsDatabase, 'updateCost').mockImplementationOnce(() => {
      throw new Error('Storage failure');
    });
    renderManageCostsPage();

    const firstDialog = await openEditDialog(user, getDataRows()[0]);

    await saveEdit(user, firstDialog);

    expect(within(firstDialog).getByRole('alert')).toHaveTextContent(
      'Could not update cost. Please review the fields and try again.'
    );

    await user.click(within(firstDialog).getByRole('button', { name: 'Cancel' }));

    const secondDialog = await openEditDialog(user, getDataRows()[1]);

    expect(within(secondDialog).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('handles stale update results by refreshing the list', async () => {
    const user = setupUser();
    addStoredCost();
    const updateSpy = vi
      .spyOn(costsDatabase, 'updateCost')
      .mockReturnValueOnce(null);
    renderManageCostsPage();

    const dialog = await openEditDialog(user, getDataRows()[0]);

    changeField(dialog, 'Description', 'Stale update');
    await saveEdit(user, dialog);

    expect(updateSpy).toHaveBeenCalled();
    expect(
      screen.getByText('This cost no longer exists. The list has been refreshed.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Edit Cost' })).not.toBeInTheDocument();
  });

  it('opens delete confirmation with target details', async () => {
    const user = setupUser();
    addStoredCost({
      sum: 50,
      currency: 'GBP',
      category: 'Travel',
      description: 'Train',
      year: 2026,
      month: 8,
      day: 24,
      hour: 16,
      minute: 37
    });
    renderManageCostsPage();

    const dialog = await openDeleteDialog(user, getDataRows()[0]);

    expect(within(dialog).getByText(/This action cannot be undone/)).toBeInTheDocument();
    expect(within(dialog).getByText('Train')).toBeInTheDocument();
    expect(within(dialog).getByText('Travel')).toBeInTheDocument();
    expect(within(dialog).getByText('50.00 GBP')).toBeInTheDocument();
    expect(within(dialog).getByText('24/08/2026')).toBeInTheDocument();
    expect(within(dialog).getByText('16:37')).toBeInTheDocument();
  });

  it('cancels deletion without removing the cost', async () => {
    const user = setupUser();
    const original = addStoredCost({
      description: 'Lunch'
    });
    renderManageCostsPage();

    const dialog = await openDeleteDialog(user, getDataRows()[0]);

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(costsDatabase.getCostById(original.id)).not.toBeNull();
    expect(screen.getByText('Lunch')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Delete cost?' })).not.toBeInTheDocument();
  });

  it('deletes exactly the selected duplicate-looking cost by ID', async () => {
    const user = setupUser();
    const first = addStoredCost({
      sum: 100,
      currency: 'USD',
      category: 'Food',
      description: 'Lunch'
    });
    const second = addStoredCost({
      sum: 100,
      currency: 'USD',
      category: 'Food',
      description: 'Lunch'
    });
    renderManageCostsPage();

    const dialog = await openDeleteDialog(user, getDataRows()[0]);

    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(screen.getByText('Cost deleted successfully.')).toBeInTheDocument();
    expect(costsDatabase.getCostById(first.id)).toBeNull();
    expect(costsDatabase.getCostById(second.id)).not.toBeNull();
    expect(getDataRows()).toHaveLength(1);
  });

  it('handles stale delete results by refreshing the list', async () => {
    const user = setupUser();
    addStoredCost();
    const deleteSpy = vi
      .spyOn(costsDatabase, 'deleteCost')
      .mockReturnValueOnce(null);
    renderManageCostsPage();

    const dialog = await openDeleteDialog(user, getDataRows()[0]);

    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(deleteSpy).toHaveBeenCalled();
    expect(
      screen.getByText('This cost no longer exists. The list has been refreshed.')
    ).toBeInTheDocument();
  });

  it('reports a friendly error when deletion throws', async () => {
    const user = setupUser();
    addStoredCost();
    vi.spyOn(costsDatabase, 'deleteCost').mockImplementationOnce(() => {
      throw new Error('Storage failure');
    });
    renderManageCostsPage();

    const dialog = await openDeleteDialog(user, getDataRows()[0]);

    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Could not delete cost. Please try again.'
    );
    expect(screen.getByRole('dialog', { name: 'Delete cost?' })).toBeInTheDocument();
  });

  it('clears delete dialog feedback before opening another cost', async () => {
    const user = setupUser();
    addStoredCost({
      description: 'Lunch'
    });
    addStoredCost({
      description: 'Train'
    });
    vi.spyOn(costsDatabase, 'deleteCost').mockImplementationOnce(() => {
      throw new Error('Storage failure');
    });
    renderManageCostsPage();

    const firstDialog = await openDeleteDialog(user, getDataRows()[0]);

    await user.click(within(firstDialog).getByRole('button', { name: 'Delete' }));

    expect(within(firstDialog).getByRole('alert')).toHaveTextContent(
      'Could not delete cost. Please try again.'
    );

    await user.click(within(firstDialog).getByRole('button', { name: 'Cancel' }));

    const secondDialog = await openDeleteDialog(user, getDataRows()[1]);

    expect(within(secondDialog).queryByRole('alert')).not.toBeInTheDocument();
  });
});

// M2A.3: editing an old record must never rewrite its stored amount unless
// the user changes the amount itself.
describe('ManageCostsPage legacy amounts', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ toFake: ['Date'] });
    setLocalDate(2026, 8, 24, 10, 30);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    localStorage.clear();
  });

  // Legacy amounts (zero, negative, extra decimals...) are STORED data: they
  // come from migration, restore or import, not from addCost(), which now
  // enforces the strict new-input policy. So they are seeded directly.
  function addStoredCost({ sum, currency = 'USD', year = 2026, month = 8, day = 24, hour = 9, minute = 5 }) {
    const key = 'cost-manager-pro:costsdb:v2:costs';
    const existing = JSON.parse(localStorage.getItem(key) ?? '{"costs":[]}').costs;

    localStorage.setItem(
      key,
      JSON.stringify({
        schemaVersion: 2,
        costs: [
          ...existing,
          { id: `legacy-${existing.length}`, sum, currency, category: 'Food', description: 'Lunch', date: { day, month, year, hour, minute } }
        ]
      })
    );
  }

  function storedSums() {
    return costsDatabase.getAllCosts().map((cost) => cost.sum);
  }

  it.each([[0], [-5.5], [12.345], [1e-21], [1234.56789]])(
    'saving an edit to the description keeps the stored amount %s exactly',
    async (sum) => {
      const user = setupUser();
      addStoredCost({ sum });
      renderManageCostsPage();

      const dialog = await openEditDialog(user, getDataRows()[0]);

      changeField(dialog, 'Description', 'Renamed');
      await saveEdit(user, dialog);

      expect(screen.getByText('Cost updated successfully.')).toBeInTheDocument();
      expect(storedSums()).toEqual([sum]);
      expect(Object.is(storedSums()[0], sum)).toBe(true);
      expect(costsDatabase.getAllCosts()[0].description).toBe('Renamed');
    }
  );

  it('explains, without blocking, that a legacy amount is kept as stored', async () => {
    const user = setupUser();
    addStoredCost({ sum: -5.5 });
    renderManageCostsPage();

    const dialog = await openEditDialog(user, getDataRows()[0]);

    expect(within(dialog).getByText(/kept exactly as stored/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps a legacy amount when only the currency is changed', async () => {
    const user = setupUser();
    addStoredCost({ sum: 12.345, currency: 'USD' });
    renderManageCostsPage();

    const dialog = await openEditDialog(user, getDataRows()[0]);

    await chooseCurrency(user, dialog, 'EUR');
    await saveEdit(user, dialog);

    expect(costsDatabase.getAllCosts()[0]).toMatchObject({ sum: 12.345, currency: 'EUR' });
  });

  it('applies the strict rules as soon as the amount itself is edited', async () => {
    const user = setupUser();
    addStoredCost({ sum: 12.345 });
    renderManageCostsPage();

    const dialog = await openEditDialog(user, getDataRows()[0]);

    changeField(dialog, 'Sum', '0');
    await saveEdit(user, dialog);
    expect(within(dialog).getByText('Enter an amount greater than zero.')).toBeInTheDocument();

    changeField(dialog, 'Sum', '12.346');
    await saveEdit(user, dialog);
    expect(within(dialog).getByText('Use at most 2 decimal places.')).toBeInTheDocument();
    expect(storedSums()).toEqual([12.345]);

    changeField(dialog, 'Sum', '12.34');
    await saveEdit(user, dialog);
    expect(storedSums()).toEqual([12.34]);
  });

  it('keeps an old date and time that the user did not touch', async () => {
    const user = setupUser();
    addStoredCost({ sum: 5, year: 2026, month: 2, day: 28, hour: 23, minute: 59 });
    renderManageCostsPage();

    const dialog = await openEditDialog(user, getDataRows()[0]);

    changeField(dialog, 'Description', 'Only the note changed');
    await saveEdit(user, dialog);

    expect(costsDatabase.getAllCosts()[0].date).toEqual({ day: 28, month: 2, year: 2026, hour: 23, minute: 59 });
  });
  // Impossible dates (30 February...) are covered in tests/validation: a date
  // input cannot even carry such a value, so the form never reaches them.
});
