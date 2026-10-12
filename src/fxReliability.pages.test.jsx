import { CssBaseline } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockEcbFailure, mockEcbFetch, mockEcbRouter, seedEcbCache } from '../tests/helpers/ecb.js';
import { clientResult } from '../tests/fx/helpers.js';
import { costsDatabase, costsDatabaseName, costsDatabaseVersion } from './lib/costsDatabase.js';
import { getCostsStorageKey } from './lib/db.js';
import { fxCacheKey } from './lib/fx/constants.js';
import { createFxCache } from './lib/fx/fxCache.js';
import MonthlyReportPage from './pages/MonthlyReportPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import { applyRevision } from './services/fxRatesService.js';
import { setCustomExchangeRatesUrl } from './services/settingsService.js';
import * as excelExportService from './services/export/excelExportService.js';
import theme from './theme.js';

/*
 * M2B.3 user-facing behaviour: availability messages, retry, the explicit
 * check and revision workflow in Settings, and report snapshots that never
 * change under the user. Offline and deterministic (scripted provider).
 *
 * Synthetic data: USD 120 on 2026-10-09, target EUR. With USD 1.25 per EUR the
 * report is 96.00 EUR; after accepting a revision to 1.2 it becomes 100.00.
 */
const originalFetch = globalThis.fetch;
const render_ = (page) => render(<ThemeProvider theme={theme}><CssBaseline />{page}</ThemeProvider>);
const readCosts = () => localStorage.getItem(getCostsStorageKey(costsDatabaseName, costsDatabaseVersion));

function addCost(cost, day = 9) {
  vi.setSystemTime(new Date(2026, 9, day, 12, 0, 0));
  costsDatabase.addCost({ category: 'Food', description: 'Item', ...cost });
  vi.setSystemTime(new Date(2026, 9, 13, 12, 0, 0));
}

// Saved USD rate for 2026-10-09 plus a later disagreeing proposal (pending).
function seedWithPendingRevision() {
  const cache = createFxCache();
  const result = (rate, fetchedAt) => clientResult({ observations: [{ date: '2026-10-09', quote: 'USD', rate }], quotes: ['USD'], from: '2026-10-02', to: '2026-10-09', fetchedAt });

  cache.recordObservations(result('1.25', '2026-10-10T08:00:00.000Z'));
  cache.recordObservations(result('1.2', '2026-10-12T08:00:00.000Z'));

  return cache;
}

async function generateMonthly(user, { currency = 'EUR', month = 'October' } = {}) {
  render_(<MonthlyReportPage />);
  await user.click(screen.getByRole('combobox', { name: 'Month' }));
  await user.click(screen.getByRole('option', { name: month }));
  await user.click(screen.getByRole('combobox', { name: 'Currency' }));
  await user.click(screen.getByRole('option', { name: currency }));
  await user.click(screen.getByRole('button', { name: 'Generate Report' }));
}

describe('M2B.3 FX reliability UI', () => {
  let user;

  beforeEach(() => {
    localStorage.clear();
    user = userEvent.setup();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 13, 12, 0, 0));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    localStorage.clear();

    if (originalFetch === undefined) {
      delete globalThis.fetch;
    } else {
      globalThis.fetch = originalFetch;
    }
  });

  describe('availability and retry on a report', () => {
    it('says the rates were already saved when a report is served from the cache, and makes no request', async () => {
      addCost({ sum: 120, currency: 'USD' });
      seedEcbCache();
      mockEcbFailure();
      await generateMonthly(user);

      expect(await screen.findByText('Total: 96.00 EUR')).toBeInTheDocument();
      expect(screen.getByRole('note', { name: 'ECB reference rates' })).toHaveTextContent('already saved on this device');
      expect(screen.getByRole('note', { name: 'ECB reference rates' })).toHaveTextContent(/Rates last checked with the ECB: .* UTC/);
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('says some rates were loaded while making the report when it had to fetch', async () => {
      addCost({ sum: 120, currency: 'USD' });
      mockEcbFetch();
      await generateMonthly(user);

      expect(await screen.findByText('Total: 96.00 EUR')).toBeInTheDocument();
      expect(screen.getByRole('note', { name: 'ECB reference rates' })).toHaveTextContent('loaded while making this report');
    });

    it('offers "Try again" after a network failure, and trying again after recovery shows the total', async () => {
      addCost({ sum: 120, currency: 'USD' });
      mockEcbFailure();
      await generateMonthly(user);

      const notice = (await screen.findByText('Total unavailable')).closest('[role=status]');

      expect(screen.getByText('Total: Unavailable')).toBeInTheDocument();
      expect(screen.getByText('Item')).toBeInTheDocument();
      expect(notice).toHaveTextContent(/could not be reached/);

      mockEcbFetch();
      await user.click(screen.getByRole('button', { name: 'Try again' }));

      expect(await screen.findByText('Total: 96.00 EUR')).toBeInTheDocument();
      expect(screen.queryByText('Total unavailable')).not.toBeInTheDocument();
    });

    it('says "offline" only when the browser also reports it, and never offers a demo fallback', async () => {
      addCost({ sum: 120, currency: 'USD' });
      vi.stubGlobal('navigator', { onLine: false });
      mockEcbFailure();
      await generateMonthly(user);

      expect((await screen.findByText('Total unavailable')).closest('[role=status]')).toHaveTextContent(/browser reports that you are offline/);
      expect(screen.queryByText(/demo/i)).not.toBeInTheDocument();
    });

    it('does not offer "Try again" when trying again cannot help (a future-dated expense)', async () => {
      addCost({ sum: 120, currency: 'USD' }, 20);
      mockEcbFetch();
      await generateMonthly(user);

      const notice = (await screen.findByText('Total unavailable')).closest('[role=status]');

      expect(notice).toHaveTextContent(/dated in the future/);
      expect(notice).toHaveTextContent(/will not change this/);
      expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    });

    it('works fully offline for a same-currency report, without any provider call or note', async () => {
      addCost({ sum: 120, currency: 'USD' });
      mockEcbFailure();
      await generateMonthly(user, { currency: 'USD' });

      expect(await screen.findByText('Total: 120.00 USD')).toBeInTheDocument();
      expect(globalThis.fetch).not.toHaveBeenCalled();
      expect(screen.queryByRole('note')).not.toBeInTheDocument();
    });

    it('says when a fetched rate could not be saved on this device', async () => {
      addCost({ sum: 120, currency: 'USD' });
      mockEcbFetch();
      const original = Storage.prototype.setItem;

      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function setItem(key, value) {
        if (key === fxCacheKey) {
          throw new DOMException('full', 'QuotaExceededError');
        }

        return original.call(this, key, value);
      });
      await generateMonthly(user);

      expect(await screen.findByText('Total: 96.00 EUR')).toBeInTheDocument();
      expect(document.querySelector('[data-fx-note="persistence"]')).toHaveTextContent(/could not be saved on this device/);
    });
  });

  describe('exports use the displayed snapshot', () => {
    it('writes the same provenance, last-checked time and total that the screen shows, even after rates changed', async () => {
      addCost({ sum: 120, currency: 'USD' });
      seedWithPendingRevision();
      mockEcbFailure();
      const excel = vi.spyOn(excelExportService, 'downloadReportWorkbook').mockResolvedValue();

      await generateMonthly(user);
      await screen.findByText('Total: 96.00 EUR');
      act(() => {
        applyRevision({ quote: 'USD', date: '2026-10-09', accepted: '1.25', candidate: '1.2' });
      });
      await screen.findByText(/Exchange rates were updated after this was generated/);
      await user.click(screen.getByRole('button', { name: 'Export Excel' }));

      const model = excel.mock.calls[0][0];
      const onScreen = screen.getByRole('note', { name: 'ECB reference rates' }).textContent;

      // The export is the displayed snapshot (96.00), not the newly accepted rate (100.00).
      expect(model.metadata.total).toBe(96);
      expect(onScreen).toContain(model.summary.find(([label]) => label === 'Exchange rates')[1]);
      expect(model.metadata.observationLastDate).toBe('2026-10-09');
    });
  });

  describe('report snapshots and revisions', () => {
    it('mentions a proposed change that touches the report, but keeps the accepted values', async () => {
      addCost({ sum: 120, currency: 'USD' });
      seedWithPendingRevision();
      mockEcbFailure();
      await generateMonthly(user);

      expect(await screen.findByText('Total: 96.00 EUR')).toBeInTheDocument();
      expect(document.querySelector('[data-fx-note="revisions"]')).toHaveTextContent(/different values for 1 rate/);
    });

    it('does not rewrite a displayed report when a revision is accepted; regenerating uses the new rate', async () => {
      addCost({ sum: 120, currency: 'USD' });
      seedWithPendingRevision();
      mockEcbFailure();
      await generateMonthly(user);
      await screen.findByText('Total: 96.00 EUR');

      act(() => {
        expect(applyRevision({ quote: 'USD', date: '2026-10-09', accepted: '1.25', candidate: '1.2' }).outcome).toBe('applied');
      });

      expect(await screen.findByText(/Exchange rates were updated after this was generated/)).toBeInTheDocument();
      // Still the old figure: nothing was recomputed.
      expect(screen.getByText('Total: 96.00 EUR')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Generate again' }));

      expect(await screen.findByText('Total: 100.00 EUR')).toBeInTheDocument();
      expect(screen.queryByText(/Exchange rates were updated after this was generated/)).not.toBeInTheDocument();
    });

    it('does not claim rates changed for a same-currency report', async () => {
      addCost({ sum: 120, currency: 'USD' });
      seedWithPendingRevision();
      await generateMonthly(user, { currency: 'USD' });
      await screen.findByText('Total: 120.00 USD');

      act(() => {
        applyRevision({ quote: 'USD', date: '2026-10-09', accepted: '1.25', candidate: '1.2' });
      });

      expect(screen.queryByText(/Exchange rates were updated/)).not.toBeInTheDocument();
    });
  });

  describe('Settings: checking rates', () => {
    it('shows an honest empty state and disables the revision check until rates are saved', () => {
      render_(<SettingsPage />);

      expect(screen.getByText(/None yet/)).toBeInTheDocument();
      expect(screen.getByText('Never')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Check saved rates for changes' })).toBeDisabled();
    });

    it('checks for new rates explicitly, reports what it found, and updates last checked and newest observation', async () => {
      mockEcbRouter();
      render_(<SettingsPage />);
      await user.click(screen.getByRole('button', { name: 'Check for new rates' }));

      expect(await screen.findByText(/Found 3 new rates/)).toBeInTheDocument();
      expect(screen.getAllByText('2026-10-12').length).toBeGreaterThan(0);
      expect(screen.getByText('Newest ECB observation reported').nextElementSibling).toHaveTextContent('2026-10-12');
      expect(screen.queryByText('Never')).not.toBeInTheDocument();
    });

    it('says plainly when nothing new was found', async () => {
      seedEcbCache({ from: '2026-10-12', to: '2026-10-14', rates: { USD: '1.3', GBP: '0.9', ILS: '4' } });
      mockEcbRouter();
      render_(<SettingsPage />);
      await user.click(screen.getByRole('button', { name: 'Check for new rates' }));

      expect(await screen.findByText(/No new rates since the last check/)).toBeInTheDocument();
    });

    it('explains a failed check, keeps the controls usable, and does not use the custom source', async () => {
      setCustomExchangeRatesUrl('https://rates.example.com/latest.json');
      mockEcbFailure();
      render_(<SettingsPage />);
      await user.click(screen.getByRole('button', { name: 'Check for new rates' }));

      expect(await screen.findByText(/The check did not complete.*could not be reached.*Try again later/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Check for new rates' })).toBeEnabled();
      globalThis.fetch.mock.calls.forEach(([url]) => expect(String(url).startsWith('https://api.frankfurter.dev/v2/providers/ecb')).toBe(true));
    });

    it('prevents a second operation while one runs, and Cancel stops it without changing anything', async () => {
      let release;
      const gate = new Promise((resolve) => { release = resolve; });

      mockEcbRouter({ gate });
      render_(<SettingsPage />);
      const before = localStorage.getItem(fxCacheKey);

      await user.click(screen.getByRole('button', { name: 'Check for new rates' }));

      expect(screen.getByRole('button', { name: 'Checking...' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Check saved rates for changes' })).toBeDisabled();
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      release();

      expect(await screen.findByText(/Cancelled\. Nothing was changed/)).toBeInTheDocument();
      expect(localStorage.getItem(fxCacheKey)).toBe(before);
    });

    it('a revision check lists a changed value without replacing the saved one', async () => {
      seedEcbCache({ from: '2026-10-05', to: '2026-10-12', rates: { USD: '1.25', GBP: '0.9', ILS: '4' } });
      mockEcbRouter({ ranges: { USD: '1.2', GBP: '0.9', ILS: '4' } });
      render_(<SettingsPage />);
      await user.click(screen.getByRole('button', { name: 'Check saved rates for changes' }));

      expect(await screen.findByText(/different values for 8 saved rates.*Nothing was replaced/)).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /Rate changes to review \(8\)/ })).toBeInTheDocument();
      expect(createFxCache().getTable().observations.USD['2026-10-09'][0]).toBe('1.25');
    });
  });

  describe('Settings: reviewing revisions', () => {
    it('lists each proposal with currency, date, both rates and when it was proposed', () => {
      seedWithPendingRevision();
      render_(<SettingsPage />);

      const table = screen.getByRole('table', { name: 'Proposed rate changes' });
      const row = within(table).getByRole('row', { name: /USD.*2026-10-09/ });

      expect(within(row).getByText('1 EUR = 1.25 USD')).toBeInTheDocument();
      expect(within(row).getByText('1 EUR = 1.2 USD')).toBeInTheDocument();
      expect(within(row).getByText(/UTC/)).toBeInTheDocument();
      expect(screen.getByText('Nothing has been replaced')).toBeInTheDocument();
    });

    it('never applies a proposal by itself: rendering and leaving the page change nothing', () => {
      seedWithPendingRevision();
      const before = localStorage.getItem(fxCacheKey);
      const { unmount } = render_(<SettingsPage />);

      unmount();
      expect(localStorage.getItem(fxCacheKey)).toBe(before);
    });

    it('applies one proposal only when asked, with history kept, and says reports are not changed', async () => {
      seedWithPendingRevision();
      render_(<SettingsPage />);
      await user.click(screen.getByRole('button', { name: 'Use new rate for USD on 2026-10-09' }));

      expect(await screen.findByText(/Rate change applied\. Reports that are already open are not changed/)).toBeInTheDocument();
      const table = createFxCache().getTable();

      expect(table.observations.USD['2026-10-09'][0]).toBe('1.2');
      expect(table.revisionLog).toMatchObject([{ previous: '1.25', current: '1.2' }]);
      expect(screen.getByText('Accepted changes so far').nextElementSibling).toHaveTextContent('1');
    });

    it('keeps the current rate when the user declines', async () => {
      seedWithPendingRevision();
      render_(<SettingsPage />);
      await user.click(screen.getByRole('button', { name: 'Keep current rate for USD on 2026-10-09' }));

      expect(await screen.findByText(/Kept the current rate/)).toBeInTheDocument();
      expect(createFxCache().getTable().observations.USD['2026-10-09'][0]).toBe('1.25');
      expect(createFxCache().getTable().revisionLog).toEqual([]);
    });

    it('refuses a stale decision (the proposal changed meanwhile) and refreshes the list', async () => {
      seedWithPendingRevision();
      render_(<SettingsPage />);

      // Another tab replaces the proposal with a different one after the list was drawn.
      const cache = createFxCache();

      cache.discardPendingRevision({ quote: 'USD', date: '2026-10-09' });
      cache.recordObservations(clientResult({ observations: [{ date: '2026-10-09', quote: 'USD', rate: '1.1' }], quotes: ['USD'], from: '2026-10-02', to: '2026-10-09', fetchedAt: '2026-10-13T08:00:00.000Z' }));

      await user.click(screen.getByRole('button', { name: 'Use new rate for USD on 2026-10-09' }));

      expect(await screen.findByText(/updated or already handled, so nothing was applied/)).toBeInTheDocument();
      expect(createFxCache().getTable().observations.USD['2026-10-09'][0]).toBe('1.25');
      expect(screen.getByText('1 EUR = 1.1 USD')).toBeInTheDocument();
    });

    it('does not touch the stored expenses in any of these actions', async () => {
      addCost({ sum: 120, currency: 'USD' });
      seedWithPendingRevision();
      const before = readCosts();

      render_(<SettingsPage />);
      await user.click(screen.getByRole('button', { name: 'Use new rate for USD on 2026-10-09' }));
      await waitFor(() => expect(screen.getByText(/Rate change applied/)).toBeInTheDocument());
      expect(readCosts()).toBe(before);
    });

    it('survives a corrupt cache: says so, offers the checks, and leaves the expenses alone', () => {
      addCost({ sum: 120, currency: 'USD' });
      localStorage.setItem(fxCacheKey, '{corrupt');
      const before = readCosts();

      render_(<SettingsPage />);

      expect(screen.getByText(/saved rate data cannot be read/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Check for new rates' })).toBeEnabled();
      expect(readCosts()).toBe(before);
    });
  });
});
