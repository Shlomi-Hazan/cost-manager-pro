import { CssBaseline } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { render, screen, within } from '@testing-library/react';
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

    expect(screen.getByText('Enter a valid numeric sum.')).toBeInTheDocument();
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
});
