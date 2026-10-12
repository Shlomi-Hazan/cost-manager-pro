import { CssBaseline } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { costsDatabase, costsDatabaseName, costsDatabaseVersion } from './lib/costsDatabase.js';
import { getCostsStorageKey } from './lib/db.js';
import { exchangeRatesCacheKey, setCachedExchangeRates } from './lib/exchangeRatesCache.js';
import ChartsPage from './pages/ChartsPage.jsx';
import MonthlyReportPage from './pages/MonthlyReportPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import YearlyReportPage from './pages/YearlyReportPage.jsx';
import * as excelExportService from './services/export/excelExportService.js';
import * as pdfExportService from './services/export/pdfExportService.js';
import { rateDisclosureContent, rateSourceKinds } from './services/rateDisclosureService.js';
import { setCustomExchangeRatesUrl } from './services/settingsService.js';
import theme from './theme.js';
import * as chartCapture from './utils/chartCapture.js';

/*
 * Pre-M2 hotfix: every screen that shows converted totals must say what kind
 * of rates they use. These tests drive the real pages with real stored costs.
 *
 * Wording is asserted through rateDisclosureContent (and the data-rate-source
 * attribute), not through copied sentences, so rewording does not break them.
 * jsdom cannot evaluate layout, so "fits at 360 px" is checked in a real
 * browser (see the PR), while these tests assert the note is in the
 * accessibility tree and not hidden.
 */
const sampleRates = { USD: 1, GBP: 0.6, EUR: 0.7, ILS: 3.4 };
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

function mockRatesFetch(rates = sampleRates) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(rates)
  });
}

function mockFailedFetch() {
  globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Network error'));
}

function addCost(cost) {
  vi.setSystemTime(new Date(2026, 7, 10, 12, 0, 0));
  costsDatabase.addCost({ category: 'Food', description: 'Item', ...cost });
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

// The section that holds a generated result, found from a piece of its text.
function sectionOf(element) {
  return element.closest('section');
}

function expectNoDisclosure() {
  expect(screen.queryByRole('note')).not.toBeInTheDocument();
}

function expectDemoDisclosureIn(section) {
  const note = within(section).getByRole('note');

  expect(note).toBeVisible();
  expect(note).toHaveAttribute('data-rate-source', rateSourceKinds.demo);
  expect(note).toHaveTextContent(rateDisclosureContent.demo.title);
}

describe('exchange-rate disclosure on converted outputs', () => {
  let user;

  beforeEach(() => {
    localStorage.clear();
    user = userEvent.setup();
    globalThis.ResizeObserver = TestResizeObserver;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 7, 22, 12, 0, 0));
    mockRatesFetch();
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

    it('shows the demo disclosure beside a converted total on the default source', async () => {
      seedMixedCurrencies();

      const section = await generate();

      // 100 USD + 34 ILS at the sample 3.4 rate: unchanged calculation.
      expect(within(section).getByText(/^Total: 110.00 USD/)).toBeInTheDocument();
      expectDemoDisclosureIn(section);
    });

    it('shows no disclosure when no amount was converted', async () => {
      seedUsdOnly();

      const section = await generate();

      expect(within(section).getByText(/^Total: 120.00 USD/)).toBeInTheDocument();
      expectNoDisclosure();
    });

    it('still shows it when the refresh fails and cached sample rates are used', async () => {
      seedMixedCurrencies();
      setCachedExchangeRates(sampleRates);
      mockFailedFetch();

      const section = await generate();

      expect(within(section).getByText(/^Total: 110.00 USD/)).toBeInTheDocument();
      expectDemoDisclosureIn(section);
    });

    it('is not suppressed by an already cached rate set', async () => {
      seedMixedCurrencies();
      setCachedExchangeRates(sampleRates);

      const section = await generate();

      expectDemoDisclosureIn(section);
    });

    it('labels a custom source as unverified, never as demo or verified', async () => {
      seedMixedCurrencies();
      setCustomExchangeRatesUrl('https://rates.example.com/latest.json');

      const section = await generate();
      const note = within(section).getByRole('note');

      expect(note).toHaveAttribute('data-rate-source', rateSourceKinds.unverified);
      expect(note).toHaveTextContent(rateDisclosureContent.unverified.title);
      expect(note).not.toHaveTextContent(rateDisclosureContent.demo.title);
    });

    it('shows no converted total and no rate note when rates cannot be loaded', async () => {
      seedMixedCurrencies();
      mockFailedFetch();

      renderPage(<MonthlyReportPage />);
      await user.click(screen.getByRole('button', { name: 'Generate Report' }));

      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(screen.queryByText(/^Total:/)).not.toBeInTheDocument();
      expectNoDisclosure();
    });

    it('clears the disclosure when a filter changes and the report is discarded', async () => {
      seedMixedCurrencies();
      await generate();
      expectDemoDisclosureIn(sectionOf(screen.getByText(/^Total:/)));

      await user.click(screen.getByRole('combobox', { name: 'Currency' }));
      await user.click(screen.getByRole('option', { name: 'ILS' }));

      expect(screen.queryByText(/^Total:/)).not.toBeInTheDocument();
      expectNoDisclosure();
    });

    it('does not change stored expenses or the cached rates', async () => {
      seedMixedCurrencies();
      setCachedExchangeRates(sampleRates);
      const costsBefore = readStoredCosts();
      const ratesBefore = localStorage.getItem(exchangeRatesCacheKey);

      await generate();

      expect(readStoredCosts()).toBe(costsBefore);
      expect(localStorage.getItem(exchangeRatesCacheKey)).toBe(ratesBefore);
    });
  });

  describe('Yearly Report', () => {
    async function generate() {
      renderPage(<YearlyReportPage />);
      await user.click(screen.getByRole('button', { name: 'Generate Yearly Report' }));

      return sectionOf(await screen.findByText(/^Total:/));
    }

    it('shows the demo disclosure beside a converted yearly total', async () => {
      seedMixedCurrencies();

      const section = await generate();

      expect(within(section).getByText(/^Total: 110.00 USD/)).toBeInTheDocument();
      expectDemoDisclosureIn(section);
    });

    it('shows no disclosure when no amount was converted', async () => {
      seedUsdOnly();

      await generate();

      expectNoDisclosure();
    });

    it('labels a custom source as unverified', async () => {
      seedMixedCurrencies();
      setCustomExchangeRatesUrl('https://rates.example.com/latest.json');

      const section = await generate();

      expect(within(section).getByRole('note')).toHaveAttribute(
        'data-rate-source',
        rateSourceKinds.unverified
      );
    });
  });

  describe('Charts', () => {
    async function generatePie() {
      renderPage(<ChartsPage />);
      await user.click(screen.getByRole('button', { name: 'Generate Chart' }));

      return sectionOf(await screen.findByText(/^Chart currency:/));
    }

    async function generateBar() {
      renderPage(<ChartsPage />);
      await user.click(screen.getByRole('button', { name: 'Generate Yearly Chart' }));

      return sectionOf(await screen.findByText(/Yearly Costs/));
    }

    it('shows the demo disclosure on the monthly pie chart when amounts were converted', async () => {
      seedMixedCurrencies();

      expectDemoDisclosureIn(await generatePie());
    });

    it('shows no disclosure on a pie chart without converted amounts', async () => {
      seedUsdOnly();

      await generatePie();

      expectNoDisclosure();
    });

    it('shows the demo disclosure on the yearly bar chart when amounts were converted', async () => {
      seedMixedCurrencies();

      expectDemoDisclosureIn(await generateBar());
    });

    it('shows no disclosure on a bar chart without converted amounts', async () => {
      seedUsdOnly();

      await generateBar();

      expectNoDisclosure();
    });

    it('does not use rates from other years to decide the bar chart needs a disclosure', async () => {
      // An ILS expense in a different year does not affect 2026 totals.
      vi.setSystemTime(new Date(2025, 5, 10, 12, 0, 0));
      costsDatabase.addCost({ sum: 50, currency: 'ILS', category: 'Food', description: 'Old' });
      seedUsdOnly();

      await generateBar();

      expectNoDisclosure();
    });

    it('keeps a pie chart disclosure when the refresh fails with cached sample rates', async () => {
      seedMixedCurrencies();
      setCachedExchangeRates(sampleRates);
      mockFailedFetch();

      expectDemoDisclosureIn(await generatePie());
    });

    it('labels a custom source as unverified on charts', async () => {
      seedMixedCurrencies();
      setCustomExchangeRatesUrl('https://rates.example.com/latest.json');

      const section = await generatePie();

      expect(within(section).getByRole('note')).toHaveAttribute(
        'data-rate-source',
        rateSourceKinds.unverified
      );
    });

    it('does not change stored expenses', async () => {
      seedMixedCurrencies();
      const costsBefore = readStoredCosts();

      await generatePie();

      expect(readStoredCosts()).toBe(costsBefore);
    });
  });

  /*
   * Export wiring: these click the real Export buttons and check which model
   * reaches the exporter. (A first version of this change forgot to pass the
   * disclosure from the yearly bar chart to its export; model-builder unit
   * tests alone could not catch that.)
   */
  describe('exports carry the disclosure', () => {
    const exportNote = rateDisclosureContent.demo.exportNote;

    function mockExporters() {
      return {
        excelReport: vi.spyOn(excelExportService, 'downloadReportWorkbook').mockResolvedValue(),
        pdfReport: vi.spyOn(pdfExportService, 'downloadReportPdf').mockResolvedValue(),
        excelPie: vi.spyOn(excelExportService, 'downloadPieChartWorkbook').mockResolvedValue(),
        excelBar: vi.spyOn(excelExportService, 'downloadBarChartWorkbook').mockResolvedValue(),
        pdfChart: vi.spyOn(pdfExportService, 'downloadChartPdf').mockResolvedValue()
      };
    }

    function disclosureRows(model) {
      return model.summary.filter(([label]) => label === 'Exchange rates');
    }

    function expectDisclosed(model, note = exportNote) {
      expect(disclosureRows(model)).toEqual([['Exchange rates', note]]);
      expect(model.metadata.rateDisclosure).toBe(note);
    }

    function expectNotDisclosed(model) {
      expect(disclosureRows(model)).toEqual([]);
      expect(model.metadata.rateDisclosure).toBeUndefined();
    }

    async function exportFrom(section, name) {
      await user.click(within(section).getByRole('button', { name }));
    }

    async function monthlySection() {
      renderPage(<MonthlyReportPage />);
      await user.click(screen.getByRole('button', { name: 'Generate Report' }));

      return sectionOf(await screen.findByText(/^Total:/));
    }

    async function yearlySection() {
      renderPage(<YearlyReportPage />);
      await user.click(screen.getByRole('button', { name: 'Generate Yearly Report' }));

      return sectionOf(await screen.findByText(/^Total:/));
    }

    async function pieSection() {
      vi.spyOn(chartCapture, 'captureChartSvgAsPngDataUrl').mockResolvedValue('data:image/png;base64,AAAA');
      renderPage(<ChartsPage />);
      await user.click(screen.getByRole('button', { name: 'Generate Chart' }));

      return sectionOf(await screen.findByText(/^Chart currency:/));
    }

    async function barSection() {
      vi.spyOn(chartCapture, 'captureChartSvgAsPngDataUrl').mockResolvedValue('data:image/png;base64,AAAA');
      renderPage(<ChartsPage />);
      await user.click(screen.getByRole('button', { name: 'Generate Yearly Chart' }));

      return sectionOf(await screen.findByText(/Yearly Costs/));
    }

    it.each([
      ['monthly report', monthlySection, 'excelReport', 'pdfReport'],
      ['yearly report', yearlySection, 'excelReport', 'pdfReport'],
      ['monthly pie chart', pieSection, 'excelPie', 'pdfChart'],
      ['yearly bar chart', barSection, 'excelBar', 'pdfChart']
    ])('%s: both Excel and PDF exports include the disclosure', async (_name, openSection, excelKey, pdfKey) => {
      seedMixedCurrencies();
      const exporters = mockExporters();
      const section = await openSection();

      await exportFrom(section, 'Export Excel');
      await exportFrom(section, 'Export PDF');

      expect(exporters[excelKey]).toHaveBeenCalledTimes(1);
      expect(exporters[pdfKey]).toHaveBeenCalledTimes(1);
      expectDisclosed(exporters[excelKey].mock.calls[0][0]);
      expectDisclosed(exporters[pdfKey].mock.calls[0][0]);
    });

    it.each([
      ['monthly report', monthlySection, 'excelReport'],
      ['yearly report', yearlySection, 'excelReport'],
      ['monthly pie chart', pieSection, 'excelPie'],
      ['yearly bar chart', barSection, 'excelBar']
    ])('%s: an export with no converted amounts carries no disclosure', async (_name, openSection, excelKey) => {
      seedUsdOnly();
      const exporters = mockExporters();
      const section = await openSection();

      await exportFrom(section, 'Export Excel');

      expectNotDisclosed(exporters[excelKey].mock.calls[0][0]);
    });

    it('uses the neutral wording in exports made from a custom source', async () => {
      seedMixedCurrencies();
      setCustomExchangeRatesUrl('https://rates.example.com/latest.json');
      const exporters = mockExporters();
      const section = await barSection();

      await exportFrom(section, 'Export Excel');

      expectDisclosed(exporters.excelBar.mock.calls[0][0], rateDisclosureContent.unverified.exportNote);
    });

    it('does not change exported numbers: the model still carries the same totals and rows', async () => {
      seedMixedCurrencies();
      const exporters = mockExporters();
      const section = await monthlySection();

      await exportFrom(section, 'Export Excel');

      const model = exporters.excelReport.mock.calls[0][0];

      expect(model.metadata.total).toBe(110);
      expect(model.rows.map((row) => [row.sum, row.currency]).sort()).toEqual([
        [100, 'USD'],
        [34, 'ILS']
      ]);
    });
  });

  describe('Settings', () => {
    function currentNote() {
      return screen.getByRole('note');
    }

    it('explains that the default rates are demonstration values', () => {
      renderPage(<SettingsPage />);

      expect(currentNote()).toHaveAttribute('data-rate-source', rateSourceKinds.demo);
      expect(currentNote()).toHaveTextContent(rateDisclosureContent.demo.settingsDetail);
      expect(currentNote()).toBeVisible();
    });

    it('describes a saved custom source conservatively', () => {
      setCustomExchangeRatesUrl('https://rates.example.com/latest.json');

      renderPage(<SettingsPage />);

      expect(currentNote()).toHaveAttribute('data-rate-source', rateSourceKinds.unverified);
      expect(currentNote()).toHaveTextContent(rateDisclosureContent.unverified.settingsDetail);
      expect(currentNote()).not.toHaveTextContent(rateDisclosureContent.demo.title);
    });

    it('treats a custom URL that points at the bundled file as demonstration data', () => {
      setCustomExchangeRatesUrl('/exchange-rates.json');

      renderPage(<SettingsPage />);

      expect(currentNote()).toHaveAttribute('data-rate-source', rateSourceKinds.demo);
    });

    it('switches the explanation when the source is saved and when the default is restored', async () => {
      renderPage(<SettingsPage />);

      await user.type(
        screen.getByLabelText('Custom exchange-rate source'),
        'https://rates.example.com/latest.json'
      );
      await user.click(screen.getByRole('button', { name: 'Save & Test Source' }));

      expect(await screen.findByText(/saved and validated/i)).toBeInTheDocument();
      expect(currentNote()).toHaveAttribute('data-rate-source', rateSourceKinds.unverified);

      await user.click(screen.getByRole('button', { name: 'Use Default Source' }));

      expect(await screen.findByText(/restored successfully/i)).toBeInTheDocument();
      expect(currentNote()).toHaveAttribute('data-rate-source', rateSourceKinds.demo);
    });

    it('keeps explaining the default when a custom source fails validation', async () => {
      mockFailedFetch();
      renderPage(<SettingsPage />);

      await user.type(
        screen.getByLabelText('Custom exchange-rate source'),
        'https://rates.example.com/latest.json'
      );
      await user.click(screen.getByRole('button', { name: 'Save & Test Source' }));

      expect(await screen.findAllByRole('alert')).not.toHaveLength(0);
      expect(currentNote()).toHaveAttribute('data-rate-source', rateSourceKinds.demo);
    });
  });
});
