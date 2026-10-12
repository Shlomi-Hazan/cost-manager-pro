/*
 * M2B.2: the asynchronous half of historical conversion. It runs BEFORE a
 * report is calculated: it works out which ECB observations the report needs,
 * fetches only what the cache cannot already prove, stores the result safely,
 * and hands back ONE observation index (a single consistent snapshot of the
 * cache). The calculation that follows is synchronous and never fetches.
 *
 * Rules
 *  - No request when every expense is already in the report currency, or when
 *    the cache already proves coverage for every expense.
 *  - Requests are per date RANGE (never per expense): the needed dates are
 *    merged into a few bounded ranges, each at most a year long, and the
 *    number of requests per preparation is capped. Anything beyond the cap, or
 *    any failed request, simply stays unavailable, and the report says so.
 *  - A failed request is recorded as "tried and failed", never as "no data
 *    exists", and never replaced by a made-up or demo rate.
 *  - Accepted observations are never refetched or changed here. A provider
 *    value that disagrees with an accepted one becomes a pending revision that
 *    nothing applies automatically (M2B.1).
 *  - The legacy flat demo/custom rates are not read here.
 */
import { addDays, createEcbClient, createFxCache, createObservationIndex, ecbFirstObservationDate, isFxError, selectionStatus } from '../lib/fx/index.js';
import { toIsoDate } from '../lib/reporting/historicalConversion.js';

// The ECB publishes on business days; the longest gap seen is 5 days, so a
// week before the expense date always contains the observation that applies.
export const lookbackDays = 7;
// Dates closer together than this are fetched in one request.
export const mergeGapDays = 31;
export const maxRangeDays = 366;
export const maxRequestsPerPreparation = 8;

let defaultCache = null;
let defaultClient = null;
const inFlight = new Map();

function getDefaultCache() {
  defaultCache ??= createFxCache();

  return defaultCache;
}

function getDefaultClient() {
  defaultClient ??= createEcbClient();

  return defaultClient;
}

function maxIso(a, b) {
  return a > b ? a : b;
}

function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * Pairs of (expense date, currency) that need a rate: every expense in a
 * currency other than the report currency.
 */
function neededLookups(costs, targetCurrency) {
  const lookups = new Map();

  costs.forEach((cost) => {
    if (cost.currency !== targetCurrency) {
      const expenseDate = toIsoDate(cost.date);

      lookups.set(`${expenseDate}|${cost.currency}`, { expenseDate, currency: cost.currency });
    }
  });

  return [...lookups.values()];
}

/**
 * Turns the cache's "missing" answers into a few merged, bounded fetch ranges.
 * @param {{expenseDate: string, currency: string}[]} lookups
 * @param {{select: function}} index
 * @param {string} targetCurrency
 * @param {string|null} referenceDate
 * @returns {{from: string, to: string, quotes: string[]}[]}
 */
export function planFetchRanges(lookups, index, targetCurrency, referenceDate) {
  const windows = [];

  lookups.forEach(({ expenseDate, currency }) => {
    const selection = index.select({ expenseDate, currencies: [currency, targetCurrency], referenceDate });

    if (selection.status === selectionStatus.needsFetch) {
      windows.push({
        from: maxIso(addDays(expenseDate, -lookbackDays), ecbFirstObservationDate),
        to: expenseDate,
        quotes: selection.quotes
      });
    }
  });

  windows.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));

  const merged = [];

  windows.forEach((window) => {
    const last = merged.at(-1);

    if (last && daysBetween(last.to, window.from) <= mergeGapDays && daysBetween(last.from, window.to) < maxRangeDays) {
      last.to = window.to > last.to ? window.to : last.to;
      last.quotes = [...new Set([...last.quotes, ...window.quotes])];
    } else {
      merged.push({ from: window.from, to: window.to, quotes: [...window.quotes] });
    }
  });

  return merged.map((range) => ({ ...range, quotes: range.quotes.sort() }));
}

async function fetchRange({ range, cache, client, signal, now }) {
  const key = `${range.from}|${range.to}|${range.quotes.join(',')}`;

  // Two reports asking for the same range at once share one request.
  if (inFlight.has(key)) {
    return inFlight.get(key);
  }

  const run = (async () => {
    try {
      const result = await client.fetchRange({ from: range.from, to: range.to, quotes: range.quotes, signal });
      const stored = cache.recordObservations(result);

      return { ...range, ok: true, persisted: stored.persisted, persistReason: stored.reason };
    } catch (error) {
      if (!isFxError(error)) {
        throw error;
      }

      if (error.code !== 'aborted') {
        cache.recordFailure({ kind: 'range', quotes: range.quotes, from: range.from, to: range.to }, error, new Date(now()).toISOString());
      }

      return { ...range, ok: false, code: error.code, persisted: true, persistReason: null };
    }
  })().finally(() => inFlight.delete(key));

  inFlight.set(key, run);

  return run;
}

/**
 * Prepares the rates a set of expenses needs and returns one index snapshot.
 * @param {object} options
 * @param {object[]} options.costs - Stored expenses ({sum, currency, date}).
 * @param {string} options.targetCurrency - The report currency.
 * @param {string} options.referenceDate - The user's LOCAL today (YYYY-MM-DD).
 * @param {AbortSignal} [options.signal]
 * @param {object} [options.cache] - Test seam; defaults to the browser cache.
 * @param {object} [options.client] - Test seam; defaults to the ECB client.
 * @param {function} [options.now] - Clock for failure timestamps.
 * @returns {Promise<{index: object|null, needed: boolean, requests: object[],
 *   cacheStatus: string, persistence: string}>}
 *   `index` is null when no expense needs a rate (nothing was read or fetched).
 */
export async function prepareHistoricalRates({ costs, targetCurrency, referenceDate, signal, cache = getDefaultCache(), client, now = Date.now }) {
  const lookups = neededLookups(costs, targetCurrency);

  if (lookups.length === 0) {
    return { index: null, needed: false, requests: [], cacheStatus: 'not-read', persistence: 'none' };
  }

  const initial = cache.inspect();
  const ranges = planFetchRanges(lookups, createObservationIndex(initial.table), targetCurrency, referenceDate).slice(0, maxRequestsPerPreparation);
  const requests = [];

  if (ranges.length > 0) {
    const ecb = client ?? getDefaultClient();

    for (const range of ranges) {
      if (signal?.aborted) {
        break;
      }

      requests.push(await fetchRange({ range, cache, client: ecb, signal, now }));
    }
  }

  // ONE snapshot for the whole calculation: another tab writing later cannot
  // change figures halfway through.
  const snapshot = cache.inspect();

  return {
    index: createObservationIndex(snapshot.table),
    needed: true,
    requests,
    cacheStatus: snapshot.status,
    persistence: snapshot.persistence
  };
}
