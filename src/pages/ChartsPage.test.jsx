import { CssBaseline } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { costsDatabaseName, costsDatabaseVersion } from '../lib/costsDatabase.js';
import { getCostsStorageKey } from '../lib/db.js';
import { setCachedExchangeRates } from '../lib/exchangeRatesCache.js';
import { costsDatabase } from '../lib/costsDatabase.js';
import * as excelExportService from '../services/export/excelExportService.js';
import * as pdfExportService from '../services/export/pdfExportService.js';
import * as chartCapture from '../utils/chartCapture.js';
import ChartsPage from './ChartsPage.jsx';
import theme from '../theme.js';

/*
 * Course requirement (R-070/R-071): drives the real Pie Chart page (filter
 * selection, generation, rendering) against real stored costs. Export
 * functions are mocked (excelExportService/pdfExportService/chartCapture)
 * only to avoid exercising real file generation in a UI test — their own
 * behavior is protected separately in tests/exports/.
 */
const validRates = {
  USD: 1,
  GBP: 0.5,
  EURO: 0.8,
  ILS: 4
};

const originalFetch = globalThis.fetch;
const originalResizeObserver = globalThis.ResizeObserver;

class TestResizeObserver {
  observe() {}

  unobserve() {}

  disconnect() {}
}

function renderChartsPage() {
  return render(
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ChartsPage />
    </ThemeProvider>
  );
}

function setLocalDate(year, month, day) {
  vi.setSystemTime(new Date(year, month - 1, day, 12, 0, 0));
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

async function generateChart(user) {
  await user.click(screen.getByRole('button', { name: 'Generate Chart' }));
}

function addCostOnDate({ year = 2026, month = 8, day, cost }) {
  setLocalDate(year, month, day);
  costsDatabase.addCost(cost);
}

// Reads the app's real dataset key. Before M1 this helper read the unused
// version 1 key, so the "storage unchanged" assertion compared [] with [].
function readStoredCosts() {
  return localStorage.getItem(getCostsStorageKey(costsDatabaseName, costsDatabaseVersion));
}

function getTotalsTable() {
  return screen.getByRole('table', { name: 'Monthly category totals' });
}

function expectCategoryTotal({ category, total, share, currency }) {
  const table = getTotalsTable();
  const row = within(table).getByRole('row', { name: new RegExp(category) });

  expect(within(row).getByText(category)).toBeInTheDocument();
  expect(within(row).getByText(String(total))).toBeInTheDocument();
  if (share) {
    expect(within(row).getByText(share)).toBeInTheDocument();
  }
  expect(within(row).getByText(currency)).toBeInTheDocument();
}

describe('ChartsPage', () => {
  beforeEach(() => {
    localStorage.clear();
    globalThis.ResizeObserver = TestResizeObserver;
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

    if (originalResizeObserver === undefined) {
      delete globalThis.ResizeObserver;
    } else {
      globalThis.ResizeObserver = originalResizeObserver;
    }
  });

  it('renders the Pie Chart section and required controls with current defaults', () => {
    renderChartsPage();

    expect(screen.getByRole('heading', { name: 'Charts' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Monthly Category Pie Chart' })
    ).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Month' })).toHaveTextContent(
      'August'
    );
    expect(screen.getByLabelText('Year')).toHaveValue('2026');
    expect(screen.getByRole('combobox', { name: 'Currency' })).toHaveTextContent(
      'USD'
    );
    expect(screen.getByRole('button', { name: 'Generate Chart' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Yearly 12-Month Bar Chart' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Generate Yearly Chart' })
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        'Yearly Bar Chart functionality will be implemented in a later milestone.'
      )
    ).not.toBeInTheDocument();
  });

  it('uses the selected month and year for chart data', async () => {
    const user = setupUser();
    mockSuccessfulRatesFetch();
    addCostOnDate({
      day: 10,
      cost: {
        sum: 100,
        currency: 'USD',
        category: 'FOOD',
        description: 'August food'
      }
    });
    addCostOnDate({
      month: 9,
      day: 1,
      cost: {
        sum: 25,
        currency: 'USD',
        category: 'TRAVEL',
        description: 'September travel'
      }
    });
    setLocalDate(2026, 8, 22);

    renderChartsPage();
    await chooseMonth(user, 'September');
    await generateChart(user);

    expect(screen.getByRole('heading', { name: 'September 2026' })).toBeInTheDocument();
    expectCategoryTotal({
      category: 'Travel',
      total: 25,
      currency: 'USD'
    });
    expect(screen.queryByText('Food')).not.toBeInTheDocument();
  });

  it('renders category chart data for a populated month', async () => {
    const user = setupUser();
    mockSuccessfulRatesFetch();
    addCostOnDate({
      day: 12,
      cost: {
        sum: 100,
        currency: 'USD',
        category: 'FOOD',
        description: 'Groceries'
      }
    });
    addCostOnDate({
      day: 13,
      cost: {
        sum: 25,
        currency: 'USD',
        category: 'TRAVEL',
        description: 'Bus'
      }
    });

    renderChartsPage();
    await generateChart(user);

    expect(
      screen.getByRole('img', { name: 'Monthly category pie chart' })
    ).toBeInTheDocument();
    expect(screen.getByText('Chart currency: USD')).toBeInTheDocument();
    expect(
      within(getTotalsTable()).getByRole('columnheader', { name: 'Share' })
    ).toBeInTheDocument();
    expectCategoryTotal({
      category: 'Food',
      total: 100,
      share: '80%',
      currency: 'USD'
    });
    expectCategoryTotal({
      category: 'Travel',
      total: 25,
      share: '20%',
      currency: 'USD'
    });
  });

  it('exports generated Pie chart data and chart image metadata', async () => {
    const user = setupUser();
    const excelSpy = vi
      .spyOn(excelExportService, 'downloadPieChartWorkbook')
      .mockResolvedValue(undefined);
    const pdfSpy = vi
      .spyOn(pdfExportService, 'downloadChartPdf')
      .mockResolvedValue(undefined);
    vi.spyOn(chartCapture, 'captureChartSvgAsPngDataUrl').mockResolvedValue(
      'data:image/png;base64,chart'
    );

    mockSuccessfulRatesFetch();
    addCostOnDate({
      day: 12,
      cost: {
        sum: 100,
        currency: 'USD',
        category: 'FOOD',
        description: 'Groceries'
      }
    });

    renderChartsPage();
    await generateChart(user);
    await user.click(screen.getAllByRole('button', { name: 'Export Excel' })[0]);

    expect(excelSpy.mock.calls[0][0].rows).toEqual([
      { category: 'Food', total: 100, percentage: 1, currency: 'USD' }
    ]);
    expect(excelSpy.mock.calls[0][0].metadata).toMatchObject({
      month: 8,
      year: 2026,
      currency: 'USD'
    });
    expect(excelSpy.mock.calls[0][1]).toBe(
      'cost-manager-pie-chart-2026-08-usd.xlsx'
    );

    await user.click(screen.getAllByRole('button', { name: 'Export PDF' })[0]);

    expect(chartCapture.captureChartSvgAsPngDataUrl).toHaveBeenCalled();
    expect(pdfSpy.mock.calls[0][0].rows).toEqual([
      { category: 'Food', total: 100, percentage: 1, currency: 'USD' }
    ]);
    expect(pdfSpy.mock.calls[0][1]).toBe('cost-manager-pie-chart-2026-08-usd.pdf');
    expect(pdfSpy.mock.calls[0][2]).toBe('data:image/png;base64,chart');
  });

  it('exports an empty Pie result without requiring chart capture', async () => {
    const user = setupUser();
    const excelSpy = vi
      .spyOn(excelExportService, 'downloadPieChartWorkbook')
      .mockResolvedValue(undefined);
    const captureSpy = vi
      .spyOn(chartCapture, 'captureChartSvgAsPngDataUrl')
      .mockResolvedValue('data:image/png;base64,chart');

    mockSuccessfulRatesFetch();

    renderChartsPage();
    await chooseMonth(user, 'September');
    await generateChart(user);
    await user.click(screen.getAllByRole('button', { name: 'Export Excel' })[0]);

    expect(excelSpy.mock.calls[0][0].rows).toEqual([]);
    expect(captureSpy).not.toHaveBeenCalled();
  });

  it('displays Pie chart export errors', async () => {
    const user = setupUser();

    vi.spyOn(excelExportService, 'downloadPieChartWorkbook').mockRejectedValue(
      new Error('download failed')
    );
    mockSuccessfulRatesFetch();
    addCostOnDate({
      day: 12,
      cost: {
        sum: 100,
        currency: 'USD',
        category: 'FOOD',
        description: 'Groceries'
      }
    });

    renderChartsPage();
    await generateChart(user);
    await user.click(screen.getAllByRole('button', { name: 'Export Excel' })[0]);

    expect(
      await screen.findByText('Could not export the Excel file. Please try again.')
    ).toBeInTheDocument();
  });

  it('shows no-data state instead of a chart for an empty month', async () => {
    const user = setupUser();
    mockSuccessfulRatesFetch();
    renderChartsPage();

    await chooseMonth(user, 'September');
    await generateChart(user);

    expect(screen.getByText('No costs found for this month.')).toBeInTheDocument();
    expect(
      screen.queryByRole('img', { name: 'Monthly category pie chart' })
    ).not.toBeInTheDocument();
  });

  it('generates selected-currency mixed-category totals without mutating stored costs', async () => {
    const user = setupUser();
    mockSuccessfulRatesFetch();
    addCostOnDate({
      day: 14,
      cost: {
        sum: 100,
        currency: 'USD',
        category: 'FOOD',
        description: 'Groceries'
      }
    });
    addCostOnDate({
      day: 15,
      cost: {
        sum: 50,
        currency: 'GBP',
        category: 'FOOD',
        description: 'Train snacks'
      }
    });
    addCostOnDate({
      day: 16,
      cost: {
        sum: 25,
        currency: 'USD',
        category: 'TRAVEL',
        description: 'Bus'
      }
    });
    const storedBefore = readStoredCosts();

    renderChartsPage();
    await chooseCurrency(user, 'ILS');
    await generateChart(user);

    expect(screen.getByText('Chart currency: ILS')).toBeInTheDocument();
    expectCategoryTotal({
      category: 'Food',
      total: 800,
      share: '88.9%',
      currency: 'ILS'
    });
    expectCategoryTotal({
      category: 'Travel',
      total: 100,
      share: '11.1%',
      currency: 'ILS'
    });
    expect(readStoredCosts()).toEqual(storedBefore);
  });

  it('uses an existing valid rate cache when refresh fails', async () => {
    const user = setupUser();
    setCachedExchangeRates(validRates);
    mockFailedRatesFetch();
    addCostOnDate({
      day: 17,
      cost: {
        sum: 100,
        currency: 'USD',
        category: 'FOOD',
        description: 'Cached groceries'
      }
    });
    addCostOnDate({
      day: 18,
      cost: {
        sum: 50,
        currency: 'GBP',
        category: 'FOOD',
        description: 'Cached train'
      }
    });

    renderChartsPage();
    await generateChart(user);

    expectCategoryTotal({
      category: 'Food',
      total: 200,
      share: '100%',
      currency: 'USD'
    });
  });

  it('works for same-currency chart data when refresh fails and no cache exists', async () => {
    const user = setupUser();
    mockFailedRatesFetch();
    addCostOnDate({
      day: 19,
      cost: {
        sum: 75,
        currency: 'USD',
        category: 'FOOD',
        description: 'Same currency lunch'
      }
    });

    renderChartsPage();
    await generateChart(user);

    expectCategoryTotal({
      category: 'Food',
      total: 75,
      share: '100%',
      currency: 'USD'
    });
  });

  it('shows a conversion error when mixed-currency rates are unavailable', async () => {
    const user = setupUser();
    mockFailedRatesFetch();
    addCostOnDate({
      day: 20,
      cost: {
        sum: 100,
        currency: 'USD',
        category: 'FOOD',
        description: 'No-rate groceries'
      }
    });
    addCostOnDate({
      day: 21,
      cost: {
        sum: 50,
        currency: 'GBP',
        category: 'TRAVEL',
        description: 'No-rate train'
      }
    });

    renderChartsPage();
    await generateChart(user);

    expect(
      screen.getByText(
        'Exchange rates are unavailable for converting this chart. Please try again.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByText('Food')).not.toBeInTheDocument();
  });

  it('merges case variants into one visible category total', async () => {
    const user = setupUser();
    mockSuccessfulRatesFetch();
    addCostOnDate({
      day: 12,
      cost: {
        sum: 35,
        currency: 'USD',
        category: 'food',
        description: 'Lowercase food'
      }
    });
    addCostOnDate({
      day: 13,
      cost: {
        sum: 10,
        currency: 'USD',
        category: 'Food',
        description: 'Title food'
      }
    });
    addCostOnDate({
      day: 14,
      cost: {
        sum: 5,
        currency: 'USD',
        category: 'FOOD',
        description: 'Uppercase food'
      }
    });
    addCostOnDate({
      day: 15,
      cost: {
        sum: 25,
        currency: 'USD',
        category: 'Travel',
        description: 'Trip'
      }
    });

    renderChartsPage();
    await generateChart(user);

    const table = getTotalsTable();
    const foodRows = within(table).getAllByRole('row').filter((row) => {
      return row.textContent.includes('Food');
    });

    expect(
      screen.getByRole('img', { name: 'Monthly category pie chart' })
    ).toBeInTheDocument();
    expect(foodRows).toHaveLength(1);
    expectCategoryTotal({
      category: 'Food',
      total: 50,
      share: '66.7%',
      currency: 'USD'
    });
    expectCategoryTotal({
      category: 'Travel',
      total: 25,
      share: '33.3%',
      currency: 'USD'
    });
  });

  it('rejects invalid years before requesting rates', async () => {
    const user = setupUser();
    mockSuccessfulRatesFetch();
    renderChartsPage();

    await user.clear(screen.getByLabelText('Year'));
    await user.type(screen.getByLabelText('Year'), '2026.5');
    await generateChart(user);

    expect(screen.getByText('Enter a whole chart year.')).toBeInTheDocument();
    expect(
      screen.getByText('Please correct the highlighted chart filters.')
    ).toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('disables Generate Chart and shows loading feedback while rates load', async () => {
    const user = setupUser();
    let resolveFetch;

    globalThis.fetch = vi.fn().mockImplementation(() => {
      return new Promise((resolve) => {
        resolveFetch = resolve;
      });
    });
    renderChartsPage();

    await generateChart(user);

    const loadingButton = screen.getByRole('button', { name: 'Generating...' });

    expect(loadingButton).toBeDisabled();

    resolveFetch({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(validRates)
    });

    expect(await screen.findByText('No costs found for this month.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate Chart' })).toBeEnabled();
  });
});
