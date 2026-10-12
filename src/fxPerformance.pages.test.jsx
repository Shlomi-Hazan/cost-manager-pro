import { CssBaseline } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clientResult } from '../tests/fx/helpers.js';
import { addDays } from './lib/fx/ecbParser.js';
import { createFxCache } from './lib/fx/fxCache.js';
import SettingsPage from './pages/SettingsPage.jsx';
import { getFxOverview } from './services/fxRatesService.js';
import { prepareHistoricalRates } from './services/historicalRatesService.js';
import theme from './theme.js';

/*
 * M2B.3 performance: a full ECB history is cached; reports, the overview and a
 * 200-row revision list must stay responsive. Bounds are loose (CI is slow);
 * the measured values are logged and reported in the PR.
 */
describe('performance with a full saved history', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('cache-only report preparation, the overview, and a 200-row revision list stay fast', async () => {
    const cache = createFxCache();
    const quotes = ['GBP', 'ILS', 'USD'];
    const observations = [];

    for (let date = '2020-01-01'; date <= '2026-10-12'; date = addDays(date, 1)) {
      quotes.forEach((quote) => observations.push({ date, quote, rate: quote === 'USD' ? '1.1' : '0.9' }));
    }

    cache.recordObservations(clientResult({ observations, quotes, from: '2020-01-01', to: '2026-10-12', fetchedAt: '2026-10-13T00:00:00.000Z' }));

    // One answer that disagrees with 200 saved USD dates: 200 pending revisions.
    const changed = Array.from({ length: 200 }, (_value, day) => ({ date: addDays('2026-01-01', day), quote: 'USD', rate: '1.2' }));

    cache.recordObservations(clientResult({ observations: changed, quotes: ['USD'], from: '2026-01-01', to: addDays('2026-01-01', 199), fetchedAt: '2026-10-13T01:00:00.000Z' }));

    const costs = Array.from({ length: 2000 }, (_value, index) => ({ id: String(index), sum: '10', currency: ['USD', 'ILS', 'GBP'][index % 3], category: 'Food', date: { day: 1 + (index % 28), month: 1 + (index % 12), year: 2026, hour: 1, minute: 1 } }));
    const t0 = performance.now();
    const prepared = await prepareHistoricalRates({ costs, targetCurrency: 'EUR', referenceDate: '2026-10-13', client: { fetchRange: () => { throw new Error('no request expected'); } } });
    const t1 = performance.now();
    const overview = getFxOverview();
    const t2 = performance.now();

    expect(prepared.requests).toEqual([]);
    expect(overview.pendingRevisions).toHaveLength(200);
    render(<ThemeProvider theme={theme}><CssBaseline /><SettingsPage /></ThemeProvider>);
    const t3 = performance.now();

    expect(screen.getByRole('heading', { name: /Rate changes to review \(200\)/ })).toBeInTheDocument();
    console.info(`cache-only prepare (2000 expenses, 6.8y history): ${(t1 - t0).toFixed(0)} ms; overview: ${(t2 - t1).toFixed(0)} ms; Settings render with 200 revisions: ${(t3 - t2).toFixed(0)} ms`);
    expect(t1 - t0).toBeLessThan(3000);
    expect(t2 - t1).toBeLessThan(1000);
    expect(t3 - t2).toBeLessThan(8000);
  });
});
