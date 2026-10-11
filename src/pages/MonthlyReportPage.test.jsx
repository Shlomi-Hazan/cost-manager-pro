import { CssBaseline } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setCachedExchangeRates } from '../lib/exchangeRatesCache.js';
import { costsDatabase } from '../lib/costsDatabase.js';
import * as excelExportService from '../services/export/excelExportService.js';
import * as pdfExportService from '../services/export/pdfExportService.js';
import MonthlyReportPage from './MonthlyReportPage.jsx';
import theme from '../theme.js';

/*
 * Course requirement (R-050 to R-053): drives the real Monthly Report page
 * end to end (filters -> generate -> displayed rows/total) against real
 * stored costs and a real (mocked-fetch) exchange-rate flow, protecting
 * that the UI's numbers genuinely match what getReport() calculates.
 */
const validRates = {
  USD: 1,
  GBP: 0.5,
  EUR: 0.8,
  ILS: 4
};

const originalFetch = globalThis.fetch;

function renderMonthlyReportPage() {
  return render(
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <MonthlyReportPage />
    </ThemeProvider>
  );
}

function setLocalDate(year, month, day, hour = 12, minute = 0) {
  vi.setSystemTime(new Date(year, month - 1, day, hour, minute, 0));
}

function setupUser() {
  return userEvent.setup();
}

function mockSuccessfulRatesFetch(rates = validRates) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(rates)
  });
}

function mockFailedRatesFetch() {
  globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Network error'));
}

async function chooseMonth(user, monthName) {
  await user.click(screen.getByRole('combobox', { name: 'Month' }));
  await user.click(screen.getByRole('option', { name: monthName }));
}

async function chooseCurrency(user, currency) {
  await user.click(screen.getByRole('combobox', { name: 'Currency' }));
  await user.click(screen.getByRole('option', { name: currency }));
}

async function generateReport(user) {
  await user.click(screen.getByRole('button', { name: 'Generate Report' }));
}

function addCostOnDate({
  year = 2026,
  month = 8,
  day,
  hour = 12,
  minute = 0,
  cost
}) {
  setLocalDate(year, month, day, hour, minute);
  costsDatabase.addCost(cost);
}

function expectReportRow({ description, category, sum, currency, day, time }) {
  const table = screen.getByRole('table', { name: 'Monthly report costs' });
  const row = within(table).getByRole('row', { name: new RegExp(description) });

  expect(within(row).getByText(String(day))).toBeInTheDocument();
  expect(within(row).getByText(time)).toBeInTheDocument();
  expect(within(row).getByText(description)).toBeInTheDocument();
  expect(within(row).getByText(category)).toBeInTheDocument();
  expect(within(row).getByText(Number(sum).toFixed(2))).toBeInTheDocument();
  expect(within(row).getByText(currency)).toBeInTheDocument();
}

function getReportRows() {
  return within(screen.getByRole('table', { name: 'Monthly report costs' }))
    .getAllByRole('row')
    .slice(1);
}

function getColumnValues(columnIndex) {
  return getReportRows().map((row) => row.cells[columnIndex].textContent);
}

async function sortBy(user, columnName) {
  await user.click(screen.getByRole('button', { name: columnName }));
}

function addSortableMonthlyCosts() {
  addCostOnDate({
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
    day: 2,
    hour: 9,
    minute: 7,
    cost: {
      sum: 2,
      currency: 'USD',
      category: 'Travel',
      description: 'Apple'
    }
  });
  addCostOnDate({
    day: 24,
    hour: 0,
    minute: 5,
    cost: {
      sum: 25.5,
      currency: 'USD',
      category: 'Shopping',
      description: 'car'
    }
  });
}

describe('MonthlyReportPage', () => {
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

    if (originalFetch === undefined) {
      delete globalThis.fetch;
    } else {
      globalThis.fetch = originalFetch;
    }
  });

  it('renders required filters with current month/year defaults and USD currency', () => {
    renderMonthlyReportPage();

    expect(screen.getByRole('heading', { name: 'Monthly Report' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Month' })).toHaveTextContent(
      'August'
    );
    expect(screen.getByLabelText('Year')).toHaveValue('2026');
    expect(screen.getByRole('combobox', { name: 'Currency' })).toHaveTextContent(
      'USD'
    );
    expect(
      screen.getByRole('button', { name: 'Generate Report' })
    ).toBeInTheDocument();
  });

  it('filters by selected month/year and displays detailed costs with the db total', async () => {
    const user = setupUser();
    mockSuccessfulRatesFetch();
    addCostOnDate({
      day: 10,
      hour: 9,
      minute: 5,
      cost: {
        sum: 100,
        currency: 'USD',
        category: 'FOOD',
        description: 'Groceries'
      }
    });
    addCostOnDate({
      day: 11,
      hour: 16,
      minute: 37,
      cost: {
        sum: 50,
        currency: 'USD',
        category: 'TRAVEL',
        description: 'Bus'
      }
    });
    addCostOnDate({
      month: 9,
      day: 1,
      cost: {
        sum: 999,
        currency: 'USD',
        category: 'OUTSIDE',
        description: 'September cost'
      }
    });
    setLocalDate(2026, 8, 22);

    renderMonthlyReportPage();
    await generateReport(user);

    expect(screen.getByRole('heading', { name: 'August 2026' })).toBeInTheDocument();
    expect(screen.getByText('Report currency: USD')).toBeInTheDocument();
    expect(screen.getByText('Total: 150.00 USD')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Time' })).toBeInTheDocument();
    expectReportRow({
      description: 'Groceries',
      category: 'FOOD',
      sum: 100,
      currency: 'USD',
      day: 10,
      time: '09:05'
    });
    expectReportRow({
      description: 'Bus',
      category: 'TRAVEL',
      sum: 50,
      currency: 'USD',
      day: 11,
      time: '16:37'
    });
    expect(screen.queryByText('September cost')).not.toBeInTheDocument();
  });

  it('shows an empty state and zero total for a selected month without costs', async () => {
    const user = setupUser();
    mockSuccessfulRatesFetch();
    renderMonthlyReportPage();

    await chooseMonth(user, 'September');
    await generateReport(user);

    expect(screen.getByRole('heading', { name: 'September 2026' })).toBeInTheDocument();
    expect(screen.getByText('No costs found for this month.')).toBeInTheDocument();
    expect(screen.getByText('Total: 0.00 USD')).toBeInTheDocument();
  });

  it('displays a selected-currency total while preserving item currencies', async () => {
    const user = setupUser();
    mockSuccessfulRatesFetch();
    addCostOnDate({
      day: 12,
      hour: 9,
      minute: 5,
      cost: {
        sum: 100,
        currency: 'USD',
        category: 'FOOD',
        description: 'Groceries'
      }
    });
    addCostOnDate({
      day: 13,
      hour: 16,
      minute: 37,
      cost: {
        sum: 50,
        currency: 'GBP',
        category: 'TRAVEL',
        description: 'Train'
      }
    });

    renderMonthlyReportPage();
    await chooseCurrency(user, 'ILS');
    await generateReport(user);

    expect(screen.getByText('Report currency: ILS')).toBeInTheDocument();
    expect(screen.getByText('Total: 800.00 ILS')).toBeInTheDocument();
    expectReportRow({
      description: 'Groceries',
      category: 'FOOD',
      sum: 100,
      currency: 'USD',
      day: 12,
      time: '09:05'
    });
    expectReportRow({
      description: 'Train',
      category: 'TRAVEL',
      sum: 50,
      currency: 'GBP',
      day: 13,
      time: '16:37'
    });
  });

  it('uses an existing valid rate cache when refresh fails', async () => {
    const user = setupUser();
    setCachedExchangeRates(validRates);
    mockFailedRatesFetch();
    addCostOnDate({
      day: 14,
      cost: {
        sum: 100,
        currency: 'USD',
        category: 'FOOD',
        description: 'Cached groceries'
      }
    });
    addCostOnDate({
      day: 15,
      cost: {
        sum: 50,
        currency: 'GBP',
        category: 'TRAVEL',
        description: 'Cached train'
      }
    });

    renderMonthlyReportPage();
    await generateReport(user);

    expect(screen.getByText('Total: 200.00 USD')).toBeInTheDocument();
    expect(screen.getByText('Cached train')).toBeInTheDocument();
  });

  it('shows a conversion error when mixed-currency rates are unavailable', async () => {
    const user = setupUser();
    mockFailedRatesFetch();
    addCostOnDate({
      day: 16,
      cost: {
        sum: 100,
        currency: 'USD',
        category: 'FOOD',
        description: 'No-rate groceries'
      }
    });
    addCostOnDate({
      day: 17,
      cost: {
        sum: 50,
        currency: 'GBP',
        category: 'TRAVEL',
        description: 'No-rate train'
      }
    });

    renderMonthlyReportPage();
    await generateReport(user);

    expect(
      screen.getByText(
        'Exchange rates are unavailable for converting this report. Please try again.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByText('No-rate groceries')).not.toBeInTheDocument();
  });

  it('still generates a same-currency report when refresh fails and no cache exists', async () => {
    const user = setupUser();
    mockFailedRatesFetch();
    addCostOnDate({
      day: 18,
      cost: {
        sum: 75,
        currency: 'USD',
        category: 'FOOD',
        description: 'Same currency lunch'
      }
    });

    renderMonthlyReportPage();
    await generateReport(user);

    expect(screen.getByText('Same currency lunch')).toBeInTheDocument();
    expect(screen.getByText('Total: 75.00 USD')).toBeInTheDocument();
  });

  it('rejects invalid report years before requesting rates', async () => {
    const user = setupUser();
    mockSuccessfulRatesFetch();
    renderMonthlyReportPage();

    await user.clear(screen.getByLabelText('Year'));
    await user.type(screen.getByLabelText('Year'), '2026.5');
    await generateReport(user);

    expect(screen.getByText('Enter a whole report year.')).toBeInTheDocument();
    expect(
      screen.getByText('Please correct the highlighted report filters.')
    ).toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('disables the generate button and shows loading feedback while rates load', async () => {
    const user = setupUser();
    let resolveFetch;

    globalThis.fetch = vi.fn().mockImplementation(() => {
      return new Promise((resolve) => {
        resolveFetch = resolve;
      });
    });
    renderMonthlyReportPage();

    await generateReport(user);

    const loadingButton = screen.getByRole('button', { name: 'Generating...' });

    expect(loadingButton).toBeDisabled();

    resolveFetch({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(validRates)
    });

    expect(await screen.findByText('No costs found for this month.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate Report' })).toBeEnabled();
  });

  it('sorts by Day ascending and descending without changing the total', async () => {
    const user = setupUser();
    mockSuccessfulRatesFetch();
    addSortableMonthlyCosts();

    renderMonthlyReportPage();
    await generateReport(user);

    expect(getColumnValues(2)).toEqual(['banana', 'Apple', 'car']);
    expect(screen.getByText('Total: 127.50 USD')).toBeInTheDocument();

    await sortBy(user, 'Day');

    expect(screen.getByRole('columnheader', { name: 'Day' })).toHaveAttribute(
      'aria-sort',
      'ascending'
    );
    expect(getColumnValues(0)).toEqual(['2', '10', '24']);
    expect(getColumnValues(2)).toEqual(['Apple', 'banana', 'car']);
    expect(screen.getByText('Total: 127.50 USD')).toBeInTheDocument();

    await sortBy(user, 'Day');

    expect(screen.getByRole('columnheader', { name: 'Day' })).toHaveAttribute(
      'aria-sort',
      'descending'
    );
    expect(getColumnValues(0)).toEqual(['24', '10', '2']);
    expect(getColumnValues(2)).toEqual(['car', 'banana', 'Apple']);
    expect(screen.getByText('Total: 127.50 USD')).toBeInTheDocument();
  });

  it('sorts by Time chronologically', async () => {
    const user = setupUser();
    mockSuccessfulRatesFetch();
    addSortableMonthlyCosts();

    renderMonthlyReportPage();
    await generateReport(user);
    await sortBy(user, 'Time');

    expect(getColumnValues(1)).toEqual(['00:05', '09:07', '16:37']);
    expect(getColumnValues(2)).toEqual(['car', 'Apple', 'banana']);
  });

  it('sorts Sum numerically', async () => {
    const user = setupUser();
    mockSuccessfulRatesFetch();
    addSortableMonthlyCosts();

    renderMonthlyReportPage();
    await generateReport(user);
    await sortBy(user, 'Sum');

    expect(getColumnValues(4)).toEqual(['2.00', '25.50', '100.00']);
    expect(getColumnValues(2)).toEqual(['Apple', 'car', 'banana']);
  });

  it('sorts Description alphabetically and starts a new column at ascending', async () => {
    const user = setupUser();
    mockSuccessfulRatesFetch();
    addSortableMonthlyCosts();

    renderMonthlyReportPage();
    await generateReport(user);
    await sortBy(user, 'Sum');
    await sortBy(user, 'Sum');
    await sortBy(user, 'Description');

    expect(screen.getByRole('columnheader', { name: 'Description' }))
      .toHaveAttribute('aria-sort', 'ascending');
    expect(getColumnValues(2)).toEqual(['Apple', 'banana', 'car']);
  });

  it('resets sorting when filters change and the report is regenerated', async () => {
    const user = setupUser();
    mockSuccessfulRatesFetch();
    addSortableMonthlyCosts();
    addCostOnDate({
      month: 9,
      day: 3,
      cost: {
        sum: 100,
        currency: 'USD',
        category: 'Food',
        description: 'September first'
      }
    });
    addCostOnDate({
      month: 9,
      day: 4,
      cost: {
        sum: 2,
        currency: 'USD',
        category: 'Travel',
        description: 'September second'
      }
    });
    setLocalDate(2026, 8, 22);

    renderMonthlyReportPage();
    await generateReport(user);
    await sortBy(user, 'Sum');

    expect(getColumnValues(2)).toEqual(['Apple', 'car', 'banana']);

    await chooseMonth(user, 'September');

    expect(screen.queryByText('banana')).not.toBeInTheDocument();
    expect(
      screen.getByText('Choose filters and generate a detailed monthly report.')
    ).toBeInTheDocument();

    await generateReport(user);

    expect(getColumnValues(2)).toEqual(['September first', 'September second']);
    expect(screen.getByRole('columnheader', { name: 'Sum' })).not.toHaveAttribute(
      'aria-sort'
    );
  });

  it('shows export buttons only after generation and exports the current sorted rows', async () => {
    const user = setupUser();
    const excelSpy = vi
      .spyOn(excelExportService, 'downloadReportWorkbook')
      .mockResolvedValue(undefined);
    const pdfSpy = vi
      .spyOn(pdfExportService, 'downloadReportPdf')
      .mockResolvedValue(undefined);

    mockSuccessfulRatesFetch();
    addSortableMonthlyCosts();

    renderMonthlyReportPage();

    expect(
      screen.queryByRole('button', { name: 'Export Excel' })
    ).not.toBeInTheDocument();

    await generateReport(user);
    await sortBy(user, 'Sum');
    await sortBy(user, 'Sum');
    await user.click(screen.getByRole('button', { name: 'Export Excel' }));

    expect(excelSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          month: 8,
          year: 2026,
          currency: 'USD',
          total: 127.5
        }),
        rows: expect.arrayContaining([
          expect.objectContaining({ description: 'banana', sum: 100 })
        ])
      }),
      'cost-manager-monthly-report-2026-08-usd.xlsx'
    );
    expect(excelSpy.mock.calls[0][0].rows.map((row) => row.description)).toEqual([
      'banana',
      'car',
      'Apple'
    ]);

    await user.click(screen.getByRole('button', { name: 'Export PDF' }));

    expect(pdfSpy.mock.calls[0][0].rows.map((row) => row.description)).toEqual([
      'banana',
      'car',
      'Apple'
    ]);
    expect(pdfSpy.mock.calls[0][1]).toBe(
      'cost-manager-monthly-report-2026-08-usd.pdf'
    );
  });

  it('displays export errors and disables export buttons while exporting', async () => {
    const user = setupUser();
    let rejectExport;
    const exportPromise = new Promise((_resolve, reject) => {
      rejectExport = reject;
    });

    vi.spyOn(excelExportService, 'downloadReportWorkbook').mockReturnValue(
      exportPromise
    );
    mockSuccessfulRatesFetch();
    addSortableMonthlyCosts();

    renderMonthlyReportPage();
    await generateReport(user);
    await user.click(screen.getByRole('button', { name: 'Export Excel' }));

    expect(screen.getByRole('button', { name: 'Exporting...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Export PDF' })).toBeDisabled();

    rejectExport(new Error('download failed'));

    expect(
      await screen.findByText('Could not export the Excel file. Please try again.')
    ).toBeInTheDocument();
  });
});
