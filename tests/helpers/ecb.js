import { vi } from 'vitest';
import { addDays } from '../../src/lib/fx/ecbParser.js';
import { createFxCache } from '../../src/lib/fx/fxCache.js';
import { resetDefaultClient } from '../../src/services/historicalRatesService.js';
import { clientResult, fixture, response } from '../fx/helpers.js';

/*
 * Deterministic ECB stand-ins for UI tests: no live network. The default
 * rates are the old test rates (USD 1, GBP 0.5, EUR 0.8, ILS 4 per USD)
 * re-expressed against EUR, so every ratio, and therefore every expected
 * converted total, is unchanged: USD 1.25, GBP 0.625, ILS 5 per EUR.
 */
export const eurRates = { USD: '1.25', GBP: '0.625', ILS: '5' };

function everyDay(from, to) {
  const days = [];

  for (let day = from; day <= to; day = addDays(day, 1)) {
    days.push(day);
  }

  return days;
}

function observationsFor({ from, to, quotes, rates }) {
  return everyDay(from, to).flatMap((date) => quotes.map((quote) => ({ provider: 'ECB', date, base: 'EUR', quote, rate: Number(rates[quote]) })));
}

/** A fetch that answers ECB range requests with the same rates every day. */
export function mockEcbFetch(rates = eurRates) {
  const fetch = vi.fn(async (url) => {
    const params = new URL(url).searchParams;
    const quotes = params.get('quotes').split(',');

    return response(observationsFor({ from: params.get('from'), to: params.get('to'), quotes, rates }));
  });

  globalThis.fetch = fetch;
  resetDefaultClient();

  return fetch;
}

/** A fetch that always fails like a dropped connection. */
export function mockEcbFailure() {
  const fetch = vi.fn().mockRejectedValue(new TypeError('Network error'));

  globalThis.fetch = fetch;
  // No retries: tests must not wait for real backoff delays.
  resetDefaultClient({ maxRetries: 0 });

  return fetch;
}

/** Puts proven ECB coverage for a date range into the browser cache. */
export function seedEcbCache({ from = '2020-01-01', to = '2030-12-31', rates = eurRates, fetchedAt = '2031-01-01T00:00:00.000Z' } = {}) {
  const quotes = Object.keys(rates).sort();
  const observations = observationsFor({ from, to, quotes, rates }).map(({ date, quote }) => ({ date, quote, rate: rates[quote] }));

  createFxCache().recordObservations(clientResult({ observations, quotes, from, to, fetchedAt }));
}

/**
 * A provider stand-in with the three endpoints M2B.3 uses: metadata, latest
 * and ranges. `latest` and `ranges` are rate tables (quote -> rate text).
 * Everything is offline and deterministic.
 */
export function mockEcbRouter({ metadataEnd = '2026-10-12', latestDate = '2026-10-12', latest = { USD: '1.3', GBP: '0.9', ILS: '4' }, ranges = eurRates, gate = null } = {}) {
  const metadata = JSON.parse(fixture('ecb-metadata.json'));

  metadata.end_date = metadataEnd;

  const fetch = vi.fn(async (url) => {
    if (gate) {
      await gate;
    }

    const parsed = new URL(url);
    const params = parsed.searchParams;
    const quotes = (params.get('quotes') ?? '').split(',').filter(Boolean);

    if (parsed.pathname.endsWith('/providers/ecb')) {
      return response(metadata, { url: String(url) });
    }

    if (params.get('from')) {
      return response(observationsFor({ from: params.get('from'), to: params.get('to'), quotes, rates: ranges }));
    }

    return response(quotes.map((quote) => ({ provider: 'ECB', date: latestDate, base: 'EUR', quote, rate: Number(latest[quote]) })));
  });

  globalThis.fetch = fetch;
  resetDefaultClient({ maxRetries: 0 });

  return fetch;
}
