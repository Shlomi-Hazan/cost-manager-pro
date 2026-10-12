import { CssBaseline } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { costsDatabase } from '../lib/costsDatabase.js';
import AddCostPage from './AddCostPage.jsx';
import theme from '../theme.js';

/*
 * Course requirement (R-030 to R-036): drives the real Add Cost form
 * through Testing Library (typing, selecting, submitting) and asserts
 * against costsDatabase's real localStorage-backed state, rather than
 * mocking db.js — so these tests protect the actual UI-to-storage
 * integration, not just isolated form logic.
 */
function renderAddCostPage() {
  return render(
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AddCostPage />
    </ThemeProvider>
  );
}

function setLocalDate(year, month, day) {
  vi.setSystemTime(new Date(year, month - 1, day, 12, 0, 0));
}

function setupUser() {
  return userEvent.setup();
}

async function chooseCurrency(user, currency) {
  await user.click(screen.getByRole('combobox', { name: 'Currency' }));
  await user.click(screen.getByRole('option', { name: currency }));
}

async function chooseCategory(user, category) {
  await user.click(screen.getByRole('combobox', { name: 'Category' }));
  await user.click(screen.getByRole('option', { name: category }));
}

async function submitCost(user, { sum, currency = 'USD', category, description }) {
  await user.type(screen.getByLabelText('Sum'), sum);

  if (currency !== 'USD') {
    await chooseCurrency(user, currency);
  }

  await user.type(screen.getByLabelText('Category'), category);
  await user.type(screen.getByLabelText('Description'), description);
  await user.click(screen.getByRole('button', { name: 'Add Cost' }));
}

describe('AddCostPage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({
      toFake: ['Date']
    });
    setLocalDate(2026, 8, 22);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    localStorage.clear();
  });

  it('renders the required Add Cost form controls with USD as the initial currency', () => {
    renderAddCostPage();

    expect(screen.getByRole('heading', { name: 'Add Cost' })).toBeInTheDocument();
    expect(screen.getByLabelText('Sum')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Currency' })).toHaveTextContent(
      'USD'
    );
    expect(screen.getByRole('combobox', { name: 'Category' })).toBeInTheDocument();
    expect(screen.getByLabelText('Description')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Cost' })).toBeInTheDocument();
  });

  it('submits a valid cost through db.js, persists it, records the date, and resets the form', async () => {
    const user = setupUser();
    renderAddCostPage();

    await submitCost(user, {
      sum: '125.5',
      category: 'Food',
      description: 'Lunch'
    });

    expect(screen.getByText('Cost added successfully.')).toBeInTheDocument();

    const report = costsDatabase.getReport('USD', 2026, 8);

    expect(report.costs).toEqual([
      {
        sum: 125.5,
        currency: 'USD',
        category: 'Food',
        description: 'Lunch',
        date: {
          day: 22
        }
      }
    ]);
    expect(report.total).toEqual({
      currency: 'USD',
      sum: 125.5
    });

    expect(screen.getByLabelText('Sum')).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Currency' })).toHaveTextContent(
      'USD'
    );
    expect(screen.getByRole('combobox', { name: 'Category' })).toHaveValue('');
    expect(screen.getByLabelText('Description')).toHaveValue('');
  });

  it('preserves a selected non-USD currency when saving', async () => {
    const user = setupUser();
    renderAddCostPage();

    await submitCost(user, {
      sum: '44',
      currency: 'GBP',
      category: 'Travel',
      description: 'Train'
    });

    const report = costsDatabase.getReport('GBP', 2026, 8);

    expect(report.costs).toHaveLength(1);
    expect(report.costs[0]).toMatchObject({
      sum: 44,
      currency: 'GBP',
      category: 'Travel',
      description: 'Train'
    });
    expect(report.total).toEqual({
      currency: 'GBP',
      sum: 44
    });
  });

  it('shows required-field validation and does not persist an empty submission', async () => {
    const user = setupUser();
    renderAddCostPage();

    await user.click(screen.getByRole('button', { name: 'Add Cost' }));

    expect(screen.getByText('Please correct the highlighted fields.')).toBeInTheDocument();
    expect(screen.getByText('Enter a cost sum.')).toBeInTheDocument();
    expect(screen.getByText('Enter a category.')).toBeInTheDocument();
    expect(screen.getByText('Enter a description.')).toBeInTheDocument();
    expect(costsDatabase.getReport('USD', 2026, 8).costs).toHaveLength(0);
  });

  it('rejects non-numeric sums before persistence', async () => {
    const user = setupUser();
    renderAddCostPage();

    await user.type(screen.getByLabelText('Sum'), 'not a number');
    await user.type(screen.getByRole('combobox', { name: 'Category' }), 'Food');
    await user.type(screen.getByLabelText('Description'), 'Lunch');
    await user.click(screen.getByRole('button', { name: 'Add Cost' }));

    expect(screen.getByText('Enter the sum using digits and an optional decimal point, for example 12.50.')).toBeInTheDocument();
    expect(costsDatabase.getReport('USD', 2026, 8).costs).toHaveLength(0);
  });

  it('shows an error alert if the database layer rejects the cost', async () => {
    const user = setupUser();
    const addCostSpy = vi
      .spyOn(costsDatabase, 'addCost')
      .mockImplementationOnce(() => {
        throw new Error('Storage unavailable');
      });
    renderAddCostPage();

    await submitCost(user, {
      sum: '22',
      category: 'Food',
      description: 'Snack'
    });

    expect(addCostSpy).toHaveBeenCalledWith({
      sum: 22,
      currency: 'USD',
      category: 'Food',
      description: 'Snack'
    });
    expect(screen.getByText('Could not add cost. Please try again.')).toBeInTheDocument();
  });

  it('offers exactly the required currency identifiers', async () => {
    const user = setupUser();
    renderAddCostPage();

    await user.click(screen.getByRole('combobox', { name: 'Currency' }));

    const listbox = screen.getByRole('listbox');

    expect(within(listbox).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'USD',
      'ILS',
      'GBP',
      'EUR'
    ]);
  });

  it('offers common category suggestions', async () => {
    const user = setupUser();
    renderAddCostPage();

    await user.click(screen.getByRole('combobox', { name: 'Category' }));

    const listbox = screen.getByRole('listbox');

    expect(within(listbox).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Food',
      'Transportation',
      'Housing',
      'Bills',
      'Shopping',
      'Health',
      'Entertainment',
      'Education',
      'Travel',
      'Other'
    ]);
  });

  it('saves a selected common category suggestion', async () => {
    const user = setupUser();
    renderAddCostPage();

    await user.type(screen.getByLabelText('Sum'), '30');
    await chooseCategory(user, 'Food');
    await user.type(screen.getByLabelText('Description'), 'Dinner');
    await user.click(screen.getByRole('button', { name: 'Add Cost' }));

    expect(costsDatabase.getReport('USD', 2026, 8).costs[0]).toMatchObject({
      sum: 30,
      currency: 'USD',
      category: 'Food',
      description: 'Dinner'
    });
  });

  it('canonicalizes lowercase common category input before saving', async () => {
    const user = setupUser();
    renderAddCostPage();

    await submitCost(user, {
      sum: '12',
      category: 'food',
      description: 'Snack'
    });

    expect(costsDatabase.getReport('USD', 2026, 8).costs[0]).toMatchObject({
      category: 'Food'
    });
  });

  it('canonicalizes uppercase common category input before saving', async () => {
    const user = setupUser();
    renderAddCostPage();

    await submitCost(user, {
      sum: '18',
      category: 'FOOD',
      description: 'Lunch'
    });

    expect(costsDatabase.getReport('USD', 2026, 8).costs[0]).toMatchObject({
      category: 'Food'
    });
  });

  it('accepts and saves custom free-text categories', async () => {
    const user = setupUser();
    renderAddCostPage();

    await submitCost(user, {
      sum: '99',
      category: 'Vinyl Records',
      description: 'Album'
    });

    expect(costsDatabase.getReport('USD', 2026, 8).costs[0]).toMatchObject({
      category: 'Vinyl Records'
    });
  });

  it('cleans repeated category whitespace before saving', async () => {
    const user = setupUser();
    renderAddCostPage();

    await submitCost(user, {
      sum: '42',
      category: '  My   Pets  ',
      description: 'Pet supplies'
    });

    expect(costsDatabase.getReport('USD', 2026, 8).costs[0]).toMatchObject({
      category: 'My Pets'
    });
  });

  it('rejects whitespace-only categories after normalization', async () => {
    const user = setupUser();
    renderAddCostPage();

    await user.type(screen.getByLabelText('Sum'), '10');
    await user.type(screen.getByRole('combobox', { name: 'Category' }), '     ');
    await user.type(screen.getByLabelText('Description'), 'Invalid');
    await user.click(screen.getByRole('button', { name: 'Add Cost' }));

    expect(screen.getByText('Enter a category.')).toBeInTheDocument();
    expect(costsDatabase.getReport('USD', 2026, 8).costs).toHaveLength(0);
  });

  // M2A.3: strict new-input policy, shown through the form. The behavior is
  // specified by error code in tests/validation; this checks the wiring.
  describe('strict amount validation for new expenses', () => {
    it.each([
      ['0', 'Enter an amount greater than zero.'],
      ['0.00', 'Enter an amount greater than zero.'],
      ['-5', 'Enter an amount greater than zero.'],
      ['1.234', 'Use at most 2 decimal places.'],
      ['1.230', 'Use at most 2 decimal places.'],
      ['1234567890123', 'Use at most 12 digits before the decimal point.'],
      ['1e5', 'Enter the sum using digits and an optional decimal point, for example 12.50.'],
      ['0x10', 'Enter the sum using digits and an optional decimal point, for example 12.50.'],
      ['1,5', 'Enter the sum using digits and an optional decimal point, for example 12.50.'],
      ['+5', 'Enter the sum using digits and an optional decimal point, for example 12.50.'],
      ['1 000', 'Enter the sum using digits and an optional decimal point, for example 12.50.']
    ])('rejects %j without saving anything', async (sum, message) => {
      const user = setupUser();
      renderAddCostPage();

      await submitCost(user, { sum, category: 'Food', description: 'Lunch' });

      expect(screen.getByText(message)).toBeInTheDocument();
      expect(costsDatabase.getAllCosts()).toEqual([]);
      // The form keeps what was typed.
      expect(screen.getByLabelText('Sum')).toHaveValue(sum);
    });

    it('saves an amount in EUR as the canonical identifier, exactly as typed', async () => {
      const user = setupUser();
      renderAddCostPage();

      await submitCost(user, { sum: '1234.56', currency: 'EUR', category: 'Food', description: 'Dinner' });

      expect(screen.getByText('Cost added successfully.')).toBeInTheDocument();
      const [stored] = costsDatabase.getAllCosts();

      expect(stored).toMatchObject({ sum: 1234.56, currency: 'EUR' });
      expect(localStorage.getItem('cost-manager-pro:costsdb:v2:costs')).not.toContain('EURO');
    });

    it('revalidates an entered amount when the currency changes', async () => {
      const user = setupUser();
      renderAddCostPage();

      await user.type(screen.getByLabelText('Sum'), '0');
      expect(screen.queryByText('Enter an amount greater than zero.')).not.toBeInTheDocument();

      await chooseCurrency(user, 'EUR');
      expect(screen.getByText('Enter an amount greater than zero.')).toBeInTheDocument();
    });

    it('does not show an error for an empty amount just because the currency changed', async () => {
      const user = setupUser();
      renderAddCostPage();

      await chooseCurrency(user, 'GBP');
      expect(screen.queryByText('Enter a cost sum.')).not.toBeInTheDocument();
    });

    it('rejects an over-long category or description', async () => {
      const user = setupUser();
      renderAddCostPage();

      // Long values are set directly: typing 250 characters one key at a
      // time is slow, and the length rules themselves are covered in
      // tests/validation.
      fireEvent.change(screen.getByLabelText('Sum'), { target: { value: '5' } });
      fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'c'.repeat(51) } });
      fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'd'.repeat(201) } });
      await user.click(screen.getByRole('button', { name: 'Add Cost' }));

      expect(screen.getByText('Use at most 50 characters.')).toBeInTheDocument();
      expect(screen.getByText('Use at most 200 characters.')).toBeInTheDocument();
      expect(costsDatabase.getAllCosts()).toEqual([]);
    });
  });
});
