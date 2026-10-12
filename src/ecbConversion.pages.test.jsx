import { CssBaseline } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockEcbFailure, mockEcbFetch, seedEcbCache } from '../tests/helpers/ecb.js';
import { costsDatabase, costsDatabaseName, costsDatabaseVersion } from './lib/costsDatabase.js';
import { getCostsStorageKey } from './lib/db.js';
import { fxCacheKey } from './lib/fx/constants.js';
import ChartsPage from './pages/ChartsPage.jsx';
import MonthlyReportPage from './pages/MonthlyReportPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import YearlyReportPage from './pages/YearlyReportPage.jsx';
import * as excelExportService from './services/export/excelExportService.js';
import * as pdfExportService from './services/export/pdfExportService.js';
import { setCustomExchangeRatesUrl, getCustomExchangeRatesUrl } from './services/settingsService.js';
import theme from './theme.js';
import * as chartCapture from './utils/chartCapture.js';

/*
 * M2B.2: every screen and export that shows converted figures says they come
 * from dated ECB reference rates, says nothing about rates when none were
 * used, and says plainly when the figure is unavailable. These tests drive
 * the real pages with real stored costs and a scripted (offline) provider.
 * The legacy "demo rates" disclosure tests were retired with the demo-rate
 * reporting path they described (ADR-050).
 *
 * Synthetic data: USD 100 + ILS 34 on 2026-08-10. With the test rates
 * (USD 1.25, ILS 5 per EUR) 34 ILS is 8.50 USD, so the USD total is 108.50.
 */
const originalFetch = globalThis.fetch;
const originalResizeObserver = globalThis.ResizeObserver;

class TestResizeObserver {
  observe() {}

  unobserve() {}

  disconnect() {}
}

function renderPage(page) {
  return render(
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {page}
    </ThemeProvider>
  );
}

function addCost(cost, { month = 8, day = 10 } = {}) {
  vi.setSystemTime(new Date(2026, month - 1, day, 12, 0, 0));
  costsDatabase.addCost({ category: 'Food', description: 'Item', ...cost });
  vi.setSystemTime(new Date(2026, 7, 22, 12, 0, 0));
}

function seedMixedCurrencies() {
  addCost({ sum: 100, currency: 'USD' });
  addCost({ sum: 34, currency: 'ILS' });
}

function seedUsdOnly() {
  addCost({ sum: 100, currency: 'USD' });
  addCost({ sum: 20, currency: 'USD' });
}

function readStoredCosts() {
  return localStorage.getItem(getCostsStorageKey(costsDatabaseName, costsDatabaseVersion));
}

const sectionOf = (element) => element.closest('section');
const ecbNote = () => screen.queryByRole('note', { name: 'ECB reference rates' });

describe('ECB provenance on converted outputs', () => {
  let user;

  beforeEach(() => {
    localStorage.clear();
    user = userEvent.setup();
    globalThis.ResizeObserver = TestResizeObserver;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 7, 22, 12, 0, 0));
    mockEcbFetch();
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

  describe('Monthly Report', () => {
    async function generate() {
      renderPage(<MonthlyReportPage />);
      await user.click(screen.getByRole('button', { name: 'Generate Report' }));

      return sectionOf(await screen.findByText(/^Total:/));
    }

    it('shows the ECB provenance beside a converted total', async () => {
      seedMixedCurrencies();

      const section = await generate();
      const note = within(section).getByRole('note', { name: 'ECB reference rates' });

      expect(within(section).getByText('Total: 108.50 USD')).toBeInTheDocument();
      expect(note).toHaveAttribute('data-rate-source', 'ecb');
      expect(note).toHaveTextContent('European Central Bank');
      expect(note).toHaveTextContent('Frankfurter');
      expect(note).toHaveTextContent('2026-08-10');
      expect(note).toHaveTextContent(/not necessarily the rate you were charged/i);
      expect(note).toHaveTextContent(/calculated by Cost Manager Pro/i);
      expect(note).not.toHaveTextContent(/demo/i);
    });

    it('shows no rate note and makes no request when nothing was converted', async () => {
      seedUsdOnly();

      const section = await generate();

      expect(within(section).getByText('Total: 120.00 USD')).toBeInTheDocument();
      expect(screen.queryByRole('note')).not.toBeInTheDocument();
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('works fully offline for a same-currency report', async () => {
      seedUsdOnly();
      mockEcbFailure();

      const section = await generate();

      expect(within(section).getByText('Total: 120.00 USD')).toBeInTheDocument();
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('regenerates offline from a complete cache with no new request', async () => {
      seedMixedCurrencies();
      seedEcbCache();
      mockEcbFailure();

      const section = await generate();

      expect(within(section).getByText('Total: 108.50 USD')).toBeInTheDocument();
      expect(ecbNote()).toBeInTheDocument();
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('shows the total as unavailable, with a count, when rates cannot be loaded', async () => {
      seedMixedCurrencies();
      mockEcbFailure();

      const section = await generate();

      expect(within(section).getByText('Total: Unavailable')).toBeInTheDocument();
      expect(within(section).getByText('Total unavailable')).toBeInTheDocument();
      expect(within(section).getByText(/1 expense could not be converted/)).toBeInTheDocument();
      // No ECB claim when no ECB rate was actually used for the figure.
      expect(ecbNote()).not.toBeInTheDocument();
      // The original rows are still listed.
      expect(within(section).getByText('ILS')).toBeInTheDocument();
    });

    it('clears the result when a filter changes', async () => {
      seedMixedCurrencies();
      await generate();
      await user.click(screen.getByRole('combobox', { name: 'Currency' }));
      await user.click(screen.getByRole('option', { name: 'GBP' }));

      expect(screen.queryByText(/^Total:/)).not.toBeInTheDocument();
      expect(ecbNote()).not.toBeInTheDocument();
    });

    it('does not change stored expenses', async () => {
      seedMixedCurrencies();
      const before = readStoredCosts();

      await generate();

      expect(readStoredCosts()).toBe(before);
    });

    it('explains a provisional rate for a day the ECB has not published yet', async () => {
      // Expense on the 22nd (today); the scripted provider returns only up to its range end.
      addCost({ sum: 34, currency: 'ILS' }, { day: 22 });
      globalThis.fetch = vi.fn(async (url) => {
        const params = new URL(url).searchParams;
        const body = [{ provider: 'ECB', date: '2026-08-21', base: 'EUR', quote: 'ILS', rate: 5 }, { provider: 'ECB', date: '2026-08-21', base: 'EUR', quote: 'USD', rate: 1.25 }].filter((entry) => params.get('quotes').split(',').includes(entry.quote));

        return { ok: true, status: 200, url: 'https://api.frankfurter.dev/v2/providers/ecb/rates', headers: { get: () => null }, text: async () => JSON.stringify(body) };
      });

      const section = await generate();

      expect(within(section).getByText('Total: 8.50 USD')).toBeInTheDocument();
      expect(within(section).getByRole('note', { name: 'ECB reference rates' })).toHaveTextContent(/newer one may not be published yet/);
    });
  });

  describe('Yearly Report', () => {
    async function generate() {
      renderPage(<YearlyReportPage />);
      await user.click(screen.getByRole('button', { name: 'Generate Yearly Report' }));

      return sectionOf(await screen.findByText(/^Total:/));
    }

    it('shows the ECB provenance beside a converted yearly total', async () => {
      seedMixedCurrencies();

      const section = await generate();

      expect(within(section).getByText('Total: 108.50 USD')).toBeInTheDocument();
      expect(within(section).getByRole('note', { name: 'ECB reference rates' })).toBeInTheDocument();
    });

    it('shows no rate note when nothing was converted', async () => {
      seedUsdOnly();
      await generate();

      expect(screen.queryByRole('note')).not.toBeInTheDocument();
    });

    it('is unavailable (not partial) when one month cannot be converted', async () => {
      seedUsdOnly();
      addCost({ sum: 5, currency: 'GBP' }, { month: 3, day: 3 });
      mockEcbFailure();

      const section = await generate();

      expect(within(section).getByText('Total: Unavailable')).toBeInTheDocument();
      expect(within(section).getByText(/could not be converted/)).toBeInTheDocument();
    });
  });

  describe('Charts', () => {
    async function pie() {
      renderPage(<ChartsPage />);
      await user.click(screen.getByRole('button', { name: 'Generate Chart' }));

      return sectionOf(await screen.findByText(/^Chart currency:/));
    }

    async function bar() {
      renderPage(<ChartsPage />);
      await user.click(screen.getByRole('button', { name: 'Generate Yearly Chart' }));

      return sectionOf(await screen.findByText(/Yearly Costs/));
    }

    it('shows the ECB provenance on the pie chart and on the bar chart', async () => {
      seedMixedCurrencies();

      expect(within(await pie()).getByRole('note', { name: 'ECB reference rates' })).toBeInTheDocument();
    });

    it('shows the ECB provenance on the bar chart', async () => {
      seedMixedCurrencies();

      expect(within(await bar()).getByRole('note', { name: 'ECB reference rates' })).toBeInTheDocument();
    });

    it('shows no rate note on charts without converted amounts', async () => {
      seedUsdOnly();
      await pie();

      expect(screen.queryByRole('note')).not.toBeInTheDocument();
    });

    it('does not use rates from other years to decide the bar chart needs provenance', async () => {
      addCost({ sum: 5, currency: 'GBP' }, { month: 1, day: 5 });
      vi.setSystemTime(new Date(2027, 0, 5, 12, 0, 0));
      costsDatabase.addCost({ category: 'Food', description: 'Next year', sum: 5, currency: 'USD' });
      vi.setSystemTime(new Date(2027, 11, 31, 12, 0, 0));
      renderPage(<ChartsPage />);
      const year = screen.getByLabelText('Yearly Chart Year');

      await user.clear(year);
      await user.type(year, '2027');
      await user.click(screen.getByRole('button', { name: 'Generate Yearly Chart' }));
      await screen.findByText(/2027 Yearly Costs/);

      expect(screen.queryByRole('note')).not.toBeInTheDocument();
    });

    it('does not draw a false complete pie when expenses cannot be converted', async () => {
      seedMixedCurrencies();
      mockEcbFailure();

      const section = await pie();

      expect(within(section).getByText('Total unavailable')).toBeInTheDocument();
      expect(within(section).queryByRole('img', { name: 'Monthly category pie chart' })).not.toBeInTheDocument();
    });

    it('marks an unconvertible month in the bar chart instead of drawing zero', async () => {
      seedMixedCurrencies();
      mockEcbFailure();

      const section = await bar();
      const table = within(section).getByRole('table', { name: 'Yearly monthly totals' });
      const august = within(table).getByRole('row', { name: /August/ });
      const march = within(table).getByRole('row', { name: /March/ });

      expect(within(august).getByText('Unavailable')).toBeInTheDocument();
      expect(within(march).getByText('0.00')).toBeInTheDocument();
    });
  });

  describe('exports carry the same conversion as the screen', () => {
    function mockExporters() {
      return {
        excelReport: vi.spyOn(excelExportService, 'downloadReportWorkbook').mockResolvedValue(),
        pdfReport: vi.spyOn(pdfExportService, 'downloadReportPdf').mockResolvedValue(),
        excelPie: vi.spyOn(excelExportService, 'downloadPieChartWorkbook').mockResolvedValue(),
        excelBar: vi.spyOn(excelExportService, 'downloadBarChartWorkbook').mockResolvedValue(),
        pdfChart: vi.spyOn(pdfExportService, 'downloadChartPdf').mockResolvedValue()
      };
    }

    const exportFrom = (section, name) => user.click(within(section).getByRole('button', { name }));

    async function monthly() {
      renderPage(<MonthlyReportPage />);
      await user.click(screen.getByRole('button', { name: 'Generate Report' }));

      return sectionOf(await screen.findByText(/^Total:/));
    }

    async function yearly() {
      renderPage(<YearlyReportPage />);
      await user.click(screen.getByRole('button', { name: 'Generate Yearly Report' }));

      return sectionOf(await screen.findByText(/^Total:/));
    }

    async function pie() {
      vi.spyOn(chartCapture, 'captureChartSvgAsPngDataUrl').mockResolvedValue('data:image/png;base64,AAAA');
      renderPage(<ChartsPage />);
      await user.click(screen.getByRole('button', { name: 'Generate Chart' }));

      return sectionOf(await screen.findByText(/^Chart currency:/));
    }

    async function bar() {
      vi.spyOn(chartCapture, 'captureChartSvgAsPngDataUrl').mockResolvedValue('data:image/png;base64,AAAA');
      renderPage(<ChartsPage />);
      await user.click(screen.getByRole('button', { name: 'Generate Yearly Chart' }));

      return sectionOf(await screen.findByText(/Yearly Costs/));
    }

    const cases = [
      ['monthly report', monthly, 'excelReport', 'pdfReport'],
      ['yearly report', yearly, 'excelReport', 'pdfReport'],
      ['monthly pie chart', pie, 'excelPie', 'pdfChart'],
      ['yearly bar chart', bar, 'excelBar', 'pdfChart']
    ];

    it.each(cases)('%s: Excel and PDF carry the ECB provenance', async (_name, open, excelKey, pdfKey) => {
      seedMixedCurrencies();
      const exporters = mockExporters();
      const section = await open();

      await exportFrom(section, 'Export Excel');
      await exportFrom(section, 'Export PDF');

      [exporters[excelKey].mock.calls[0][0], exporters[pdfKey].mock.calls[0][0]].forEach((model) => {
        const rows = model.summary.filter(([label]) => label === 'Exchange rates');

        expect(rows).toHaveLength(1);
        expect(rows[0][1]).toMatch(/European Central Bank/);
        expect(model.metadata.observationFirstDate).toBe('2026-08-10');
        expect(model.metadata.conversionStatus).toBeUndefined();
      });
    });

    it.each(cases)('%s: an export with no converted amounts carries no rate note', async (_name, open, excelKey) => {
      seedUsdOnly();
      const exporters = mockExporters();
      const section = await open();

      await exportFrom(section, 'Export Excel');

      const model = exporters[excelKey].mock.calls[0][0];

      expect(model.summary.some(([label]) => label === 'Exchange rates')).toBe(false);
      expect(model.metadata.rateDisclosure).toBeUndefined();
    });

    it.each(cases)('%s: an incomplete export says Unavailable and is flagged', async (_name, open, excelKey) => {
      seedMixedCurrencies();
      mockEcbFailure();
      const exporters = mockExporters();
      const section = await open();

      await exportFrom(section, 'Export Excel');

      const model = exporters[excelKey].mock.calls[0][0];

      expect(model.metadata.conversionStatus).toBe('incomplete');
      expect(model.metadata.unavailableCount).toBe(1);
      expect(JSON.stringify(model.summary)).toContain('Unavailable');
      expect(model.summary.some(([label]) => label === 'Exchange rates')).toBe(false);
    });

    it('keeps the on-screen total and the exported total identical', async () => {
      seedMixedCurrencies();
      const exporters = mockExporters();
      const section = await monthly();

      await exportFrom(section, 'Export Excel');

      const model = exporters.excelReport.mock.calls[0][0];

      expect(model.metadata.total).toBe(108.5);
      expect(model.rows.map((row) => [row.sum, row.currency]).sort()).toEqual([
        [100, 'USD'],
        [34, 'ILS']
      ]);
    });
  });

  describe('Settings and the legacy source', () => {
    it('says reports use ECB rates and the custom source is retained but not used', () => {
      setCustomExchangeRatesUrl('https://rates.example.com/latest.json');
      renderPage(<SettingsPage />);

      const note = screen.getByRole('note', { name: /Reports use ECB reference rates/ });

      expect(note).toHaveTextContent(/not used for reports/i);
      expect(note).toHaveTextContent(/not verified as ECB data/i);
      expect(screen.getByLabelText('Custom exchange-rate source')).toHaveValue('https://rates.example.com/latest.json');
    });

    it('keeps the custom source saved and never requests it when reports are generated', async () => {
      seedMixedCurrencies();
      setCustomExchangeRatesUrl('https://rates.example.com/latest.json');
      renderPage(<MonthlyReportPage />);
      await user.click(screen.getByRole('button', { name: 'Generate Report' }));
      await screen.findByText('Total: 108.50 USD');

      const urls = globalThis.fetch.mock.calls.map(([url]) => String(url));

      expect(urls.length).toBeGreaterThan(0);
      urls.forEach((url) => expect(url.startsWith('https://api.frankfurter.dev/v2/providers/ecb/')).toBe(true));
      expect(getCustomExchangeRatesUrl()).toBe('https://rates.example.com/latest.json');
      // The report labels itself ECB, never "unverified" or demo.
      expect(ecbNote()).toBeInTheDocument();
      expect(screen.queryByText(/not verified|demonstration/i)).not.toBeInTheDocument();
    });

    it('keeps FX cache failures away from the stored expenses', async () => {
      seedMixedCurrencies();
      localStorage.setItem(fxCacheKey, '{corrupt');
      const before = readStoredCosts();

      renderPage(<MonthlyReportPage />);
      await user.click(screen.getByRole('button', { name: 'Generate Report' }));
      await screen.findByText('Total: 108.50 USD');

      expect(readStoredCosts()).toBe(before);
    });
  });
});
