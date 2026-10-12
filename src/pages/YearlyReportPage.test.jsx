import { CssBaseline } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockEcbFailure, mockEcbFetch, seedEcbCache } from '../../tests/helpers/ecb.js';
import { costsDatabase } from '../lib/costsDatabase.js';
import * as excelExportService from '../services/export/excelExportService.js';
import * as pdfExportService from '../services/export/pdfExportService.js';
import YearlyReportPage from './YearlyReportPage.jsx';
import theme from '../theme.js';

/*
 * TEAM EXTENSION tests (X-005): drives the real Yearly Report page end to
 * end, following the same pattern as MonthlyReportPage.test.jsx, to
 * protect that the app's own full-year report stays consistent with the
 * required per-month getReport() totals it is built from.
 */
const originalFetch = globalThis.fetch;

function renderYearlyReportPage() {
  return render(
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <YearlyReportPage />
    </ThemeProvider>
  );
}

function setLocalDate(year, month, day, hour = 12, minute = 0) {
  vi.setSystemTime(new Date(year, month - 1, day, hour, minute, 0));
}

function setupUser() {
  return userEvent.setup();
}

// M2B.2: converted figures use dated ECB observations. These stand-ins keep
// every test offline; the rates keep the ratios the old flat table had.
function mockSuccessfulRatesFetch() {
  return mockEcbFetch();
}

function mockFailedRatesFetch() {
  return mockEcbFailure();
}

function addCostOnDate({
  year = 2026,
  month,
  day,
  hour = 12,
  minute = 0,
  cost
}) {
  setLocalDate(year, month, day, hour, minute);
  costsDatabase.addCost(cost);
}

async function chooseCurrency(user, currency) {
  await user.click(screen.getByRole('combobox', { name: 'Currency' }));
  await user.click(screen.getByRole('option', { name: currency }));
}

async function setYear(user, year) {
  await user.clear(screen.getByLabelText('Year'));
  await user.type(screen.getByLabelText('Year'), year);
}

async function generateReport(user) {
  await user.click(screen.getByRole('button', { name: 'Generate Yearly Report' }));
}

function getReportTable() {
  return screen.getByRole('table', { name: 'Yearly report costs' });
}

function expectYearlyRow({
  description,
  category,
  sum,
  currency,
  date,
  time
}) {
  const row = within(getReportTable()).getByRole('row', {
    name: new RegExp(description)
  });

  expect(within(row).getByText(date)).toBeInTheDocument();
  expect(within(row).getByText(time)).toBeInTheDocument();
  expect(within(row).getByText(description)).toBeInTheDocument();
  expect(within(row).getByText(category)).toBeInTheDocument();
  expect(within(row).getByText(Number(sum).toFixed(2))).toBeInTheDocument();
  expect(within(row).getByText(currency)).toBeInTheDocument();
}

function getYearlyRows() {
  return within(screen.getByRole('table', { name: 'Yearly report costs' }))
    .getAllByRole('row')
    .slice(1);
}

function getColumnValues(columnIndex) {
  return getYearlyRows().map((row) => row.cells[columnIndex].textContent);
}

async function sortBy(user, columnName) {
  await user.click(screen.getByRole('button', { name: columnName }));
}

function addSortableYearlyCosts() {
  addCostOnDate({
    month: 12,
    day: 5,
    hour: 21,
    minute: 14,
    cost: {
      sum: 25.5,
      currency: 'EUR',
      category: 'Shopping',
      description: 'car'
    }
  });
  addCostOnDate({
    month: 1,
    day: 10,
    hour: 16,
    minute: 37,
    cost: {
      sum: 100,
      currency: 'USD',
      category: 'Food',
      description: 'banana'
    }
  });
  addCostOnDate({
    month: 8,
    day: 24,
    hour: 9,
    minute: 5,
    cost: {
      sum: 2,
      currency: 'GBP',
      category: 'Travel',
      description: 'Apple'
    }
  });
  // Entering a cost moves the clock to its date; reports must run "today"
  // after every expense, because a future-dated expense has no rate yet.
  setLocalDate(2026, 12, 31);
}

describe('YearlyReportPage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({
      toFake: ['Date']
    });
    setLocalDate(2026, 12, 31);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    localStorage.clear();

    if (originalFetch === undefined) {
      delete globalThis.fetch;
    } else {
      globalThis.fetch = originalFetch;
    }
  });

  it('renders yearly filters with current year default and USD currency', () => {
    renderYearlyReportPage();

    expect(screen.getByRole('heading', { name: 'Yearly Report' })).toBeInTheDocument();
    expect(screen.getByLabelText('Year')).toHaveValue('2026');
    expect(screen.getByRole('combobox', { name: 'Currency' })).toHaveTextContent(
      'USD'
    );
    expect(
      screen.getByRole('button', { name: 'Generate Yearly Report' })
    ).toBeInTheDocument();
  });

  it('displays matching yearly detail rows with dates and times in insertion order', async () => {
    const user = setupUser();
    mockSuccessfulRatesFetch();
    addCostOnDate({
      month: 1,
      day: 10,
      hour: 9,
      minute: 5,
      cost: {
        sum: 100,
        currency: 'USD',
        category: 'Food',
        description: 'January groceries'
      }
    });
    addCostOnDate({
      month: 8,
      day: 24,
      hour: 16,
      minute: 37,
      cost: {
        sum: 50,
        currency: 'GBP',
        category: 'Travel',
        description: 'August train'
      }
    });
    addCostOnDate({
      month: 12,
      day: 5,
      hour: 21,
      minute: 14,
      cost: {
        sum: 80,
        currency: 'USD',
        category: 'Shopping',
        description: 'December gift'
      }
    });
    addCostOnDate({
      year: 2025,
      month: 7,
      day: 15,
      hour: 11,
      minute: 20,
      cost: {
        sum: 40,
        currency: 'USD',
        category: 'Other',
        description: 'Previous year'
      }
    });
    setLocalDate(2026, 12, 31);

    renderYearlyReportPage();
    await generateReport(user);

    expect(screen.getByRole('heading', { name: '2026 Yearly Report' })).toBeInTheDocument();
    expect(screen.getByText('Total: 280.00 USD')).toBeInTheDocument();
    expectYearlyRow({
      description: 'January groceries',
      category: 'Food',
      sum: 100,
      currency: 'USD',
      date: '10/01/2026',
      time: '09:05'
    });
    expectYearlyRow({
      description: 'August train',
      category: 'Travel',
      sum: 50,
      currency: 'GBP',
      date: '24/08/2026',
      time: '16:37'
    });
    expectYearlyRow({
      description: 'December gift',
      category: 'Shopping',
      sum: 80,
      currency: 'USD',
      date: '05/12/2026',
      time: '21:14'
    });
    expect(screen.queryByText('Previous year')).not.toBeInTheDocument();
    expect(
      within(getReportTable()).getAllByRole('row').slice(1).map((row) => row.cells[2].textContent)
    ).toEqual(['January groceries', 'August train', 'December gift']);
  });

  it('shows an empty state and zero selected-currency total for an empty year', async () => {
    const user = setupUser();
    mockSuccessfulRatesFetch();
    renderYearlyReportPage();

    await setYear(user, '2031');
    await generateReport(user);

    expect(screen.getByRole('heading', { name: '2031 Yearly Report' })).toBeInTheDocument();
    expect(screen.getByText('Total: 0.00 USD')).toBeInTheDocument();
    expect(screen.getByText('No costs found for this year.')).toBeInTheDocument();
    expect(
      screen.queryByRole('table', { name: 'Yearly report costs' })
    ).not.toBeInTheDocument();
  });

  it('displays a converted yearly total while preserving original item currencies', async () => {
    const user = setupUser();
    mockSuccessfulRatesFetch();
    addCostOnDate({
      month: 8,
      day: 1,
      cost: {
        sum: 100,
        currency: 'USD',
        category: 'Food',
        description: 'Groceries'
      }
    });
    addCostOnDate({
      month: 8,
      day: 2,
      cost: {
        sum: 50,
        currency: 'GBP',
        category: 'Travel',
        description: 'Train'
      }
    });

    renderYearlyReportPage();
    await chooseCurrency(user, 'ILS');
    await generateReport(user);

    expect(screen.getByText('Report currency: ILS')).toBeInTheDocument();
    expect(screen.getByText('Total: 800.00 ILS')).toBeInTheDocument();
    expectYearlyRow({
      description: 'Train',
      category: 'Travel',
      sum: 50,
      currency: 'GBP',
      date: '02/08/2026',
      time: '12:00'
    });
  });

  it('uses existing valid cached rates when refresh fails', async () => {
    const user = setupUser();
    seedEcbCache();
    mockFailedRatesFetch();
    addCostOnDate({
      month: 8,
      day: 1,
      cost: {
        sum: 100,
        currency: 'USD',
        category: 'Food',
        description: 'Cached groceries'
      }
    });
    addCostOnDate({
      month: 8,
      day: 2,
      cost: {
        sum: 50,
        currency: 'GBP',
        category: 'Travel',
        description: 'Cached train'
      }
    });

    renderYearlyReportPage();
    await generateReport(user);

    expect(screen.getByText('Total: 200.00 USD')).toBeInTheDocument();
    expect(screen.getByText('Cached train')).toBeInTheDocument();
  });

  it('still generates same-currency yearly reports when refresh fails and no cache exists', async () => {
    const user = setupUser();
    mockFailedRatesFetch();
    addCostOnDate({
      month: 8,
      day: 1,
      cost: {
        sum: 75,
        currency: 'USD',
        category: 'Food',
        description: 'Same currency lunch'
      }
    });

    renderYearlyReportPage();
    await generateReport(user);

    expect(screen.getByText('Same currency lunch')).toBeInTheDocument();
    expect(screen.getByText('Total: 75.00 USD')).toBeInTheDocument();
  });

  it('shows a conversion error when mixed-currency yearly rates are unavailable', async () => {
    const user = setupUser();
    mockFailedRatesFetch();
    addCostOnDate({
      month: 8,
      day: 1,
      cost: {
        sum: 100,
        currency: 'USD',
        category: 'Food',
        description: 'No-rate groceries'
      }
    });
    addCostOnDate({
      month: 8,
      day: 2,
      cost: {
        sum: 50,
        currency: 'GBP',
        category: 'Travel',
        description: 'No-rate train'
      }
    });

    renderYearlyReportPage();
    await generateReport(user);

    // No partial total and no invented rate; the original rows stay visible.
    expect(screen.getByText('Total: Unavailable')).toBeInTheDocument();
    expect(screen.getByText(/could not be converted/i)).toBeInTheDocument();
    expect(screen.getByText('No-rate groceries')).toBeInTheDocument();
    expect(screen.getByText('No-rate train')).toBeInTheDocument();
  });

  it('rejects invalid report years before requesting rates', async () => {
    const user = setupUser();
    mockSuccessfulRatesFetch();
    renderYearlyReportPage();

    await setYear(user, '2026.5');
    await generateReport(user);

    expect(screen.getByText('Enter a whole report year.')).toBeInTheDocument();
    expect(
      screen.getByText('Please correct the highlighted report filters.')
    ).toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('rejects an empty report year before requesting rates', async () => {
    const user = setupUser();
    mockSuccessfulRatesFetch();
    renderYearlyReportPage();

    await user.clear(screen.getByLabelText('Year'));
    await generateReport(user);

    expect(screen.getByText('Enter a report year.')).toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('disables the generate button and shows loading feedback while rates load', async () => {
    const user = setupUser();
    let resolveFetch;

    addCostOnDate({
      month: 8,
      day: 2,
      cost: { sum: 50, currency: 'GBP', category: 'Travel', description: 'Loading train' }
    });
    setLocalDate(2026, 12, 31);
    const ecbFetch = mockSuccessfulRatesFetch();

    globalThis.fetch = vi.fn().mockImplementation((url) => {
      return new Promise((resolve) => {
        resolveFetch = () => resolve(ecbFetch(url));
      });
    });
    renderYearlyReportPage();

    await generateReport(user);

    const loadingButton = screen.getByRole('button', { name: 'Generating...' });

    expect(loadingButton).toBeDisabled();

    resolveFetch();

    expect(await screen.findByText('Total: 100.00 USD')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Generate Yearly Report' })
    ).toBeEnabled();
  });

  it('clears stale generated report data when filters change', async () => {
    const user = setupUser();
    mockSuccessfulRatesFetch();
    addCostOnDate({
      month: 8,
      day: 1,
      cost: {
        sum: 75,
        currency: 'USD',
        category: 'Food',
        description: 'Stale lunch'
      }
    });

    renderYearlyReportPage();
    await generateReport(user);
    expect(screen.getByText('Stale lunch')).toBeInTheDocument();

    await setYear(user, '2025');

    expect(screen.queryByText('Stale lunch')).not.toBeInTheDocument();
    expect(
      screen.getByText('Choose filters and generate a detailed yearly report.')
    ).toBeInTheDocument();
  });

  it('sorts by Date ascending and descending without changing the total', async () => {
    const user = setupUser();
    mockSuccessfulRatesFetch();
    addSortableYearlyCosts();

    renderYearlyReportPage();
    await generateReport(user);

    expect(getColumnValues(2)).toEqual(['car', 'banana', 'Apple']);
    expect(screen.getByText('Total: 135.88 USD')).toBeInTheDocument();

    await sortBy(user, 'Date');

    expect(screen.getByRole('columnheader', { name: 'Date' })).toHaveAttribute(
      'aria-sort',
      'ascending'
    );
    expect(getColumnValues(0)).toEqual([
      '10/01/2026',
      '24/08/2026',
      '05/12/2026'
    ]);
    expect(getColumnValues(2)).toEqual(['banana', 'Apple', 'car']);
    expect(screen.getByText('Total: 135.88 USD')).toBeInTheDocument();

    await sortBy(user, 'Date');

    expect(screen.getByRole('columnheader', { name: 'Date' })).toHaveAttribute(
      'aria-sort',
      'descending'
    );
    expect(getColumnValues(0)).toEqual([
      '05/12/2026',
      '24/08/2026',
      '10/01/2026'
    ]);
    expect(getColumnValues(2)).toEqual(['car', 'Apple', 'banana']);
  });

  it('sorts by Time chronologically', async () => {
    const user = setupUser();
    mockSuccessfulRatesFetch();
    addSortableYearlyCosts();

    renderYearlyReportPage();
    await generateReport(user);
    await sortBy(user, 'Time');

    expect(getColumnValues(1)).toEqual(['09:05', '16:37', '21:14']);
    expect(getColumnValues(2)).toEqual(['Apple', 'banana', 'car']);
  });

  it('sorts Sum numerically while preserving original currencies', async () => {
    const user = setupUser();
    mockSuccessfulRatesFetch();
    addSortableYearlyCosts();

    renderYearlyReportPage();
    await generateReport(user);
    await sortBy(user, 'Sum');

    expect(getColumnValues(4)).toEqual(['2.00', '25.50', '100.00']);
    expect(getColumnValues(5)).toEqual(['GBP', 'EUR', 'USD']);

    await sortBy(user, 'Sum');

    expect(getColumnValues(4)).toEqual(['100.00', '25.50', '2.00']);
    expect(getColumnValues(5)).toEqual(['USD', 'EUR', 'GBP']);
  });

  it('sorts Category and Currency alphabetically', async () => {
    const user = setupUser();
    mockSuccessfulRatesFetch();
    addSortableYearlyCosts();

    renderYearlyReportPage();
    await generateReport(user);
    await sortBy(user, 'Category');

    expect(getColumnValues(3)).toEqual(['Food', 'Shopping', 'Travel']);
    expect(getColumnValues(2)).toEqual(['banana', 'car', 'Apple']);

    await sortBy(user, 'Currency');

    expect(getColumnValues(5)).toEqual(['EUR', 'GBP', 'USD']);
    expect(getColumnValues(2)).toEqual(['car', 'Apple', 'banana']);
  });

  it('resets sorting when filters change and the report is regenerated', async () => {
    const user = setupUser();
    mockSuccessfulRatesFetch();
    addSortableYearlyCosts();
    addCostOnDate({
      year: 2025,
      month: 1,
      day: 3,
      cost: {
        sum: 100,
        currency: 'USD',
        category: 'Food',
        description: 'Previous first'
      }
    });
    addCostOnDate({
      year: 2025,
      month: 12,
      day: 4,
      cost: {
        sum: 2,
        currency: 'USD',
        category: 'Travel',
        description: 'Previous second'
      }
    });
    setLocalDate(2026, 12, 31);

    renderYearlyReportPage();
    await generateReport(user);
    await sortBy(user, 'Date');
    await sortBy(user, 'Date');

    expect(getColumnValues(2)).toEqual(['car', 'Apple', 'banana']);

    await setYear(user, '2025');

    expect(screen.queryByText('banana')).not.toBeInTheDocument();
    expect(
      screen.getByText('Choose filters and generate a detailed yearly report.')
    ).toBeInTheDocument();

    await generateReport(user);

    expect(getColumnValues(2)).toEqual(['Previous first', 'Previous second']);
    expect(screen.getByRole('columnheader', { name: 'Date' })).not.toHaveAttribute(
      'aria-sort'
    );
  });

  it('exports the current visible Yearly sort order', async () => {
    const user = setupUser();
    const excelSpy = vi
      .spyOn(excelExportService, 'downloadReportWorkbook')
      .mockResolvedValue(undefined);
    const pdfSpy = vi
      .spyOn(pdfExportService, 'downloadReportPdf')
      .mockResolvedValue(undefined);

    mockSuccessfulRatesFetch();
    addSortableYearlyCosts();

    renderYearlyReportPage();
    await generateReport(user);
    await sortBy(user, 'Date');
    await sortBy(user, 'Date');
    await user.click(screen.getByRole('button', { name: 'Export Excel' }));

    expect(excelSpy.mock.calls[0][0].rows.map((row) => row.description)).toEqual([
      'car',
      'Apple',
      'banana'
    ]);
    expect(excelSpy.mock.calls[0][0].metadata).toMatchObject({
      year: 2026,
      currency: 'USD',
      // Policy B: the exported total is rounded once, half away from zero.
      total: 135.88
    });
    expect(excelSpy.mock.calls[0][1]).toBe(
      'cost-manager-yearly-report-2026-usd.xlsx'
    );

    await user.click(screen.getByRole('button', { name: 'Export PDF' }));

    expect(pdfSpy.mock.calls[0][0].rows.map((row) => row.description)).toEqual([
      'car',
      'Apple',
      'banana'
    ]);
    expect(pdfSpy.mock.calls[0][1]).toBe(
      'cost-manager-yearly-report-2026-usd.pdf'
    );
  });

  it('displays Yearly export errors', async () => {
    const user = setupUser();

    vi.spyOn(pdfExportService, 'downloadReportPdf').mockRejectedValue(
      new Error('download failed')
    );
    mockSuccessfulRatesFetch();
    addSortableYearlyCosts();

    renderYearlyReportPage();
    await generateReport(user);
    await user.click(screen.getByRole('button', { name: 'Export PDF' }));

    expect(
      await screen.findByText('Could not export the PDF file. Please try again.')
    ).toBeInTheDocument();
  });
});
