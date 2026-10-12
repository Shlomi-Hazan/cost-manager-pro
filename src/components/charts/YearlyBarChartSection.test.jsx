import { CssBaseline } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockEcbFailure, mockEcbFetch, seedEcbCache } from '../../../tests/helpers/ecb.js';
import { costsDatabase } from '../../lib/costsDatabase.js';
import * as excelExportService from '../../services/export/excelExportService.js';
import * as pdfExportService from '../../services/export/pdfExportService.js';
import theme from '../../theme.js';
import * as chartCapture from '../../utils/chartCapture.js';
import { formatPositiveBarValueLabel } from '../../utils/chartPresentation.js';
import YearlyBarChartSection from './YearlyBarChartSection.jsx';

/*
 * Course requirement (R-080/R-081): drives the real yearly Bar Chart end
 * to end, protecting that the on-screen chart always represents exactly
 * 12 months with correct zero-filling for empty ones — the same structural
 * guarantee tests/charts/yearlyAggregation.test.js checks at the pure-
 * function level, verified here through the actual rendered component.
 */
const monthNames = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
];

const originalFetch = globalThis.fetch;
const originalResizeObserver = globalThis.ResizeObserver;

class TestResizeObserver {
  observe() {}

  unobserve() {}

  disconnect() {}
}

function renderYearlyBarChartSection() {
  return render(
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <YearlyBarChartSection />
    </ThemeProvider>
  );
}

function setLocalDate(year, month, day) {
  vi.setSystemTime(new Date(year, month - 1, day, 12, 0, 0));
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

function addCostOnDate({ year = 2026, month, day = 1, cost }) {
  setLocalDate(year, month, day);
  costsDatabase.addCost(cost);
}

async function chooseYearlyCurrency(user, currency) {
  await user.click(screen.getByRole('combobox', { name: 'Yearly Chart Currency' }));
  await user.click(screen.getByRole('option', { name: currency }));
}

async function generateYearlyChart(user) {
  await user.click(screen.getByRole('button', { name: 'Generate Yearly Chart' }));
}

function getYearlyTotalsTable() {
  return screen.getByRole('table', { name: 'Yearly monthly totals' });
}

function getYearlyTotalRows() {
  return within(getYearlyTotalsTable()).getAllByRole('row').slice(1);
}

function expectUnavailableMonth(monthName) {
  const table = getYearlyTotalsTable();
  const row = within(table).getByRole('row', { name: new RegExp(monthName) });

  expect(within(row).getByText('Unavailable')).toBeInTheDocument();
}

function expectMonthTotal(monthName, total, currency) {
  const table = getYearlyTotalsTable();
  const row = within(table).getByRole('row', { name: new RegExp(monthName) });

  expect(within(row).getByText(monthName)).toBeInTheDocument();
  expect(within(row).getByText(Number(total).toFixed(2))).toBeInTheDocument();
  expect(within(row).getByText(currency)).toBeInTheDocument();
}

describe('YearlyBarChartSection', () => {
  beforeEach(() => {
    localStorage.clear();
    globalThis.ResizeObserver = TestResizeObserver;
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

    if (originalResizeObserver === undefined) {
      delete globalThis.ResizeObserver;
    } else {
      globalThis.ResizeObserver = originalResizeObserver;
    }
  });

  it('renders the yearly controls with current defaults', () => {
    renderYearlyBarChartSection();

    expect(
      screen.getByRole('heading', { name: 'Yearly 12-Month Bar Chart' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Yearly Chart Year')).toHaveValue('2026');
    expect(
      screen.getByRole('combobox', { name: 'Yearly Chart Currency' })
    ).toHaveTextContent('USD');
    expect(
      screen.getByRole('button', { name: 'Generate Yearly Chart' })
    ).toBeInTheDocument();
  });

  it('formats positive bar labels and suppresses zero labels', () => {
    expect(formatPositiveBarValueLabel(Number('17.352941176470589'))).toBe(
      '17.35'
    );
    expect(formatPositiveBarValueLabel(20)).toBe('20.00');
    expect(formatPositiveBarValueLabel(0)).toBe('');
  });

  it('renders a Bar Chart region and exactly 12 calendar-ordered rows', async () => {
    const user = setupUser();
    mockSuccessfulRatesFetch();
    addCostOnDate({
      month: 1,
      cost: {
        sum: 100,
        currency: 'USD',
        category: 'Food',
        description: 'January groceries'
      }
    });
    setLocalDate(2026, 12, 31);

    renderYearlyBarChartSection();
    await generateYearlyChart(user);

    expect(
      screen.getByRole('img', { name: 'Yearly monthly bar chart' })
    ).toBeInTheDocument();
    expect(getYearlyTotalRows()).toHaveLength(12);
    expect(getYearlyTotalRows().map((row) => row.cells[0].textContent)).toEqual(
      monthNames
    );
  });

  it('exports generated Bar chart data and chart image metadata', async () => {
    const user = setupUser();
    const excelSpy = vi
      .spyOn(excelExportService, 'downloadBarChartWorkbook')
      .mockResolvedValue(undefined);
    const pdfSpy = vi
      .spyOn(pdfExportService, 'downloadChartPdf')
      .mockResolvedValue(undefined);

    vi.spyOn(chartCapture, 'captureChartSvgAsPngDataUrl').mockResolvedValue(
      'data:image/png;base64,bar'
    );
    mockSuccessfulRatesFetch();
    addCostOnDate({
      month: 1,
      cost: {
        sum: 100,
        currency: 'USD',
        category: 'Food',
        description: 'January groceries'
      }
    });

    renderYearlyBarChartSection();
    await generateYearlyChart(user);
    await user.click(screen.getByRole('button', { name: 'Export Excel' }));

    expect(excelSpy.mock.calls[0][0].rows).toHaveLength(12);
    expect(excelSpy.mock.calls[0][0].rows[0]).toEqual({
      month: 'January',
      total: 100,
      currency: 'USD'
    });
    expect(excelSpy.mock.calls[0][1]).toBe('cost-manager-bar-chart-2026-usd.xlsx');

    await user.click(screen.getByRole('button', { name: 'Export PDF' }));

    expect(pdfSpy.mock.calls[0][0].rows).toHaveLength(12);
    expect(pdfSpy.mock.calls[0][1]).toBe('cost-manager-bar-chart-2026-usd.pdf');
    expect(pdfSpy.mock.calls[0][2]).toBe('data:image/png;base64,bar');
  });

  it('displays Bar chart export errors', async () => {
    const user = setupUser();

    vi.spyOn(chartCapture, 'captureChartSvgAsPngDataUrl').mockResolvedValue(null);
    mockSuccessfulRatesFetch();

    renderYearlyBarChartSection();
    await generateYearlyChart(user);
    await user.click(screen.getByRole('button', { name: 'Export PDF' }));

    expect(
      await screen.findByText('Could not export the chart PDF. Please try again.')
    ).toBeInTheDocument();
  });

  it('keeps zero months visible with zero totals', async () => {
    const user = setupUser();
    mockSuccessfulRatesFetch();
    addCostOnDate({
      month: 1,
      cost: {
        sum: 100,
        currency: 'USD',
        category: 'Food',
        description: 'January groceries'
      }
    });
    setLocalDate(2026, 12, 31);

    renderYearlyBarChartSection();
    await generateYearlyChart(user);

    expectMonthTotal('January', 100, 'USD');
    expectMonthTotal('February', 0, 'USD');
    expectMonthTotal('December', 0, 'USD');
  });

  it('displays the selected currency', async () => {
    const user = setupUser();
    mockSuccessfulRatesFetch();

    renderYearlyBarChartSection();
    await chooseYearlyCurrency(user, 'ILS');
    await generateYearlyChart(user);

    expect(screen.getByText('Chart currency: ILS')).toBeInTheDocument();
    expectMonthTotal('January', 0, 'ILS');
  });

  it('uses converted getReport totals for a mixed-currency year', async () => {
    const user = setupUser();
    mockSuccessfulRatesFetch();
    addCostOnDate({
      month: 1,
      cost: {
        sum: 100,
        currency: 'USD',
        category: 'Food',
        description: 'January groceries'
      }
    });
    addCostOnDate({
      month: 2,
      cost: {
        sum: 50,
        currency: 'GBP',
        category: 'Travel',
        description: 'February train'
      }
    });
    setLocalDate(2026, 12, 31);

    renderYearlyBarChartSection();
    await generateYearlyChart(user);

    expect(getYearlyTotalRows()).toHaveLength(12);
    expectMonthTotal('January', 100, 'USD');
    expectMonthTotal('February', 100, 'USD');
    expectMonthTotal('March', 0, 'USD');
  });

  it('renders an empty year as 12 zero months', async () => {
    const user = setupUser();
    mockSuccessfulRatesFetch();

    renderYearlyBarChartSection();
    await generateYearlyChart(user);

    expect(screen.getByText('No costs found for this year.')).toBeInTheDocument();
    expect(getYearlyTotalRows()).toHaveLength(12);
    expect(
      getYearlyTotalRows().every((row) => row.cells[1].textContent === '0.00')
    ).toBe(true);
  });

  it('uses an existing valid rate cache when refresh fails', async () => {
    const user = setupUser();
    seedEcbCache();
    mockFailedRatesFetch();
    addCostOnDate({
      month: 1,
      cost: {
        sum: 100,
        currency: 'USD',
        category: 'Food',
        description: 'Cached groceries'
      }
    });
    addCostOnDate({
      month: 2,
      cost: {
        sum: 50,
        currency: 'GBP',
        category: 'Travel',
        description: 'Cached train'
      }
    });
    setLocalDate(2026, 12, 31);

    renderYearlyBarChartSection();
    await generateYearlyChart(user);

    expectMonthTotal('January', 100, 'USD');
    expectMonthTotal('February', 100, 'USD');
  });

  it('works for same-currency yearly data when refresh fails and no cache exists', async () => {
    const user = setupUser();
    mockFailedRatesFetch();
    addCostOnDate({
      month: 1,
      cost: {
        sum: 75,
        currency: 'USD',
        category: 'Food',
        description: 'Same currency lunch'
      }
    });
    setLocalDate(2026, 12, 31);

    renderYearlyBarChartSection();
    await generateYearlyChart(user);

    expectMonthTotal('January', 75, 'USD');
    expectMonthTotal('February', 0, 'USD');
  });

  it('shows a conversion error when mixed-currency rates are unavailable', async () => {
    const user = setupUser();
    mockFailedRatesFetch();
    addCostOnDate({
      month: 1,
      cost: {
        sum: 100,
        currency: 'USD',
        category: 'Food',
        description: 'No-rate groceries'
      }
    });
    addCostOnDate({
      month: 2,
      cost: {
        sum: 50,
        currency: 'GBP',
        category: 'Travel',
        description: 'No-rate train'
      }
    });
    setLocalDate(2026, 12, 31);

    renderYearlyBarChartSection();
    await generateYearlyChart(user);

    // Honest incomplete state: months that cannot be converted are marked,
    // never drawn as zero, and nothing claims a complete year.
    expect(screen.getByText('Total unavailable')).toBeInTheDocument();
    expectMonthTotal('January', 100, 'USD');
    expectUnavailableMonth('February');
    expectMonthTotal('March', 0, 'USD');
  });

  it('rejects invalid years before requesting rates', async () => {
    const user = setupUser();
    mockSuccessfulRatesFetch();

    renderYearlyBarChartSection();
    await user.clear(screen.getByLabelText('Yearly Chart Year'));
    await user.type(screen.getByLabelText('Yearly Chart Year'), '2026.5');
    await generateYearlyChart(user);

    expect(screen.getByText('Enter a whole chart year.')).toBeInTheDocument();
    expect(
      screen.getByText('Please correct the highlighted yearly chart filters.')
    ).toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('disables Generate Yearly Chart and shows loading feedback while rates load', async () => {
    const user = setupUser();
    let resolveFetch;

    addCostOnDate({
      month: 1,
      cost: { sum: 100, currency: 'GBP', category: 'Food', description: 'Loading groceries' }
    });
    setLocalDate(2026, 12, 31);
    const ecbFetch = mockSuccessfulRatesFetch();

    globalThis.fetch = vi.fn().mockImplementation((url) => {
      return new Promise((resolve) => {
        resolveFetch = () => resolve(ecbFetch(url));
      });
    });
    renderYearlyBarChartSection();

    await generateYearlyChart(user);

    const loadingButton = screen.getByRole('button', { name: 'Generating...' });

    expect(loadingButton).toBeDisabled();

    resolveFetch();

    expect(await screen.findByRole('table', { name: 'Yearly monthly totals' })).toBeInTheDocument();
    expectMonthTotal('January', 200, 'USD');
    expect(
      screen.getByRole('button', { name: 'Generate Yearly Chart' })
    ).toBeEnabled();
  });

  it('does not leave a partial yearly chart after a month failure', async () => {
    const user = setupUser();
    mockFailedRatesFetch();
    addCostOnDate({
      month: 1,
      cost: {
        sum: 100,
        currency: 'USD',
        category: 'Food',
        description: 'January groceries'
      }
    });
    addCostOnDate({
      month: 8,
      cost: {
        sum: 50,
        currency: 'GBP',
        category: 'Travel',
        description: 'August train'
      }
    });
    setLocalDate(2026, 12, 31);

    renderYearlyBarChartSection();
    await generateYearlyChart(user);

    // The convertible month is shown; the other is explicitly unavailable;
    // there is no annual figure that pretends to be complete.
    expect(screen.getByText('Total unavailable')).toBeInTheDocument();
    expectMonthTotal('January', 100, 'USD');
    expectUnavailableMonth('August');
    expect(screen.queryByText(/Annual total/i)).not.toBeInTheDocument();
  });
});
