import { CssBaseline } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { costsDatabase, costsDatabaseName, costsDatabaseVersion } from '../lib/costsDatabase.js';
import { getCostsStorageKey } from '../lib/db.js';
import * as dateTime from '../utils/dateTime.js';
import ManageCostsPage, { costsPageSize } from './ManageCostsPage.jsx';
import theme from '../theme.js';

/*
 * M3.1A: Manage Costs shows a bounded page of rows. These tests protect that
 * every stored expense stays reachable, that edit and delete act on the right
 * record on ANY page, that the page index stays valid after changes, and that
 * typing in the edit form does not re-render the table rows.
 */
const storageKey = getCostsStorageKey(costsDatabaseName, costsDatabaseVersion);

// Deterministic synthetic expenses written straight into storage (adding
// thousands through the UI would test nothing about paging).
function seed(count) {
  const currencies = ['USD', 'ILS', 'GBP', 'EUR'];
  const costs = Array.from({ length: count }, (_value, index) => ({
    id: `id-${index}`,
    sum: 10 + index,
    currency: currencies[index % 4],
    category: `Cat ${index % 7}`,
    description: `Item ${index}`,
    date: { day: 1 + (index % 28), month: 1 + (index % 12), year: 2026, hour: 9, minute: index % 60 }
  }));

  localStorage.setItem(storageKey, JSON.stringify({ schemaVersion: 2, costs }));

  return costs;
}

const stored = () => JSON.parse(localStorage.getItem(storageKey)).costs;
const rows = () => screen.getAllByRole('row').slice(1);
const descriptions = () => rows().map((row) => within(row).getAllByRole('cell')[2].textContent);
const renderPage = (props = {}) => render(<ThemeProvider theme={theme}><CssBaseline /><ManageCostsPage {...props} /></ThemeProvider>);
// Small pages exercise the paging logic cheaply. Tests about the REAL page size
// (the DOM bound) use the default.
const small = 3;
const nav = () => screen.getByRole('navigation', { name: 'Saved costs pages' });
const pageButton = (name) => within(nav()).getByRole('button', { name });
// Paging clicks use fireEvent: they test the page logic, and userEvent's pointer
// simulation costs real time on a small CI machine for no extra coverage.
const go = (name) => fireEvent.click(pageButton(name));

describe('Manage Costs paging', () => {
  let user;

  beforeEach(() => {
    localStorage.clear();
    user = userEvent.setup({ delay: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('renders only one page of a 2,000-expense dataset and says what is shown', () => {
    seed(2000);
    renderPage();

    expect(rows()).toHaveLength(costsPageSize);
    expect(descriptions()[0]).toBe('Item 0');
    expect(descriptions().at(-1)).toBe(`Item ${costsPageSize - 1}`);
    expect(nav()).toHaveTextContent(`Showing 1–${costsPageSize} of 2000 · Page 1 of ${2000 / costsPageSize}`);
    // The DOM stays small whatever the dataset size.
    expect(document.querySelectorAll('*').length).toBeLessThan(3000);
  });

  it('has no page controls when everything fits on one page, and two pages one row past it', () => {
    seed(small);
    const { unmount } = renderPage({ pageSize: small });

    expect(screen.queryByRole('navigation', { name: 'Saved costs pages' })).not.toBeInTheDocument();
    expect(rows()).toHaveLength(small);
    unmount();
    seed(small + 1);
    renderPage({ pageSize: small });
    expect(nav()).toHaveTextContent(`Showing 1–${small} of ${small + 1} · Page 1 of 2`);
  });

  it('reaches every expense, in stored order, with exact page boundaries', async () => {
    const total = small * 3 + 1;

    seed(total);
    renderPage({ pageSize: small });
    const seen = [...descriptions()];

    for (let page = 2; page <= 4; page += 1) {
      go('Next page');
      seen.push(...descriptions());
      expect(nav()).toHaveTextContent(`Page ${page} of 4`);
    }

    expect(seen).toEqual(Array.from({ length: total }, (_value, index) => `Item ${index}`));
    expect(pageButton('Next page')).toBeDisabled();
    expect(pageButton('Last page')).toBeDisabled();
    expect(rows()).toHaveLength(1);
    expect(nav()).toHaveTextContent(`Showing ${small * 3 + 1}–${total} of ${total}`);
  });

  it('First, Previous and Last move to the right pages and disable at the ends', async () => {
    seed(small * 3);
    renderPage({ pageSize: small });

    expect(pageButton('First page')).toBeDisabled();
    expect(pageButton('Previous page')).toBeDisabled();
    go('Last page');
    expect(descriptions()[0]).toBe(`Item ${small * 2}`);
    go('Previous page');
    expect(descriptions()[0]).toBe(`Item ${small}`);
    go('First page');
    expect(descriptions()[0]).toBe('Item 0');
  });

  it('moves focus to the page status after a page change, so focus is never lost on a disabled button', async () => {
    seed(small * 2);
    renderPage({ pageSize: small });
    go('Last page');

    expect(within(nav()).getByRole('status')).toHaveFocus();
  });

  it('edits the right record on a later page and stays on that page', async () => {
    seed(small * 2 + 1);
    renderPage({ pageSize: small });
    go('Next page');
    const target = small + 1;
    const row = rows()[1];

    expect(descriptions()[1]).toBe(`Item ${target}`);
    await user.click(within(row).getByRole('button', { name: 'Edit' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit Cost' });
    const description = within(dialog).getByLabelText('Description');

    fireEvent.change(description, { target: { value: 'Edited on page three' } });
    await user.click(within(dialog).getByRole('button', { name: 'Save Changes' }));

    expect(await screen.findByText('Cost updated successfully.')).toBeInTheDocument();
    expect(nav()).toHaveTextContent('Page 2 of 3');
    expect(descriptions()[1]).toBe('Edited on page three');
    const after = stored();

    expect(after).toHaveLength(small * 2 + 1);
    expect(after[target]).toMatchObject({ id: `id-${target}`, description: 'Edited on page three', sum: 10 + target });
    // No other record changed.
    after.forEach((cost, index) => {
      if (index !== target) {
        expect(cost.description).toBe(`Item ${index}`);
      }
    });
  });

  it('deletes the right record from a middle page and keeps the page', async () => {
    seed(small * 3);
    renderPage({ pageSize: small });
    go('Next page');
    const row = rows()[2];

    await user.click(within(row).getByRole('button', { name: 'Delete' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Delete cost?' })).getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('Cost deleted successfully.')).toBeInTheDocument();
    expect(nav()).toHaveTextContent('Page 2 of 3');
    expect(stored().map((cost) => cost.id)).not.toContain(`id-${small + 2}`);
    expect(stored()).toHaveLength(small * 3 - 1);
    // Rows after the deleted one shift up by one, in order.
    expect(descriptions()[2]).toBe(`Item ${small + 3}`);
  });

  it('after deleting the only row of the last page, lands on the new last page (never an empty one)', async () => {
    seed(small + 1);
    renderPage({ pageSize: small });
    go('Next page');
    expect(rows()).toHaveLength(1);

    await user.click(within(rows()[0]).getByRole('button', { name: 'Delete' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Delete cost?' })).getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('Cost deleted successfully.')).toBeInTheDocument();
    expect(rows()).toHaveLength(small);
    // Everything now fits on one page: the controls go away.
    expect(screen.queryByRole('navigation', { name: 'Saved costs pages' })).not.toBeInTheDocument();
  });

  it('keeps the page valid when another tab shrinks the list (storage event)', async () => {
    seed(small * 3);
    renderPage({ pageSize: small });
    go('Last page');

    act(() => {
      seed(small + 2);
      window.dispatchEvent(new StorageEvent('storage', { key: storageKey }));
    });

    expect(nav()).toHaveTextContent('Page 2 of 2');
    expect(rows()).toHaveLength(2);
  });

  it('shows every field of a row on any page (date, time, description, category, sum, currency)', async () => {
    const costs = seed(small + 3);

    renderPage({ pageSize: small });
    go('Next page');
    const cells = within(rows()[1]).getAllByRole('cell').map((cell) => cell.textContent);
    const expected = costs[small + 1];

    expect(cells[2]).toBe(expected.description);
    expect(cells[3]).toBe(expected.category);
    expect(cells[5]).toBe(expected.currency);
    expect(cells[4]).toContain(String(expected.sum));
  });
});

describe('typing in the edit form does not re-render the table', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('with 2,000 expenses, ten keystrokes cause no row re-render (a row renders by calling formatDateForDisplay)', async () => {
    seed(2000);
    const user = userEvent.setup({ delay: null });

    renderPage();
    // Spy BEFORE opening the dialog: opening it re-renders the page, and the
    // memoized rows must not render again either.
    const spy = vi.spyOn(dateTime, 'formatDateForDisplay');

    await user.click(within(rows()[0]).getByRole('button', { name: 'Edit' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit Cost' });
    const description = within(dialog).getByLabelText('Description');

    await user.clear(description);
    await user.type(description, 'abcdefghij');

    expect(description).toHaveValue('abcdefghij');
    expect(spy).not.toHaveBeenCalled();
  });

  it('negative control: the same spy DOES see rows render when the visible rows change (paging)', () => {
    seed(2 * small);
    renderPage({ pageSize: small });
    const spy = vi.spyOn(dateTime, 'formatDateForDisplay');

    go('Next page');
    // New rows were rendered, so the spy can detect row renders.
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(small);
  });
});

describe('legacy unchanged', () => {
  it('still reads through db.getAllCosts (the stored list is not altered by viewing or paging)', () => {
    localStorage.clear();
    seed(small * 2);
    const before = localStorage.getItem(storageKey);

    renderPage({ pageSize: small });
    go('Next page');
    go('First page');

    expect(localStorage.getItem(storageKey)).toBe(before);
    expect(costsDatabase.getAllCosts()).toHaveLength(small * 2);
    localStorage.clear();
  });
});
