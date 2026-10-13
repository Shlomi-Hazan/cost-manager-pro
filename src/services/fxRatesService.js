/*
 * M2B.3: the explicit, user-controlled operations on the saved ECB rates. They
 * are deliberately SEPARATE actions (ADR-051):
 *   1. checkForNewRates          fetch the newest ECB data (+ provider metadata)
 *   2. checkSavedRatesForRevisions   re-ask the provider about dates already saved
 *   3. applyRevision / keepRevision  the user's decision about one proposed change
 *   4. (regenerating a report is a fourth, separate action on the report pages)
 * Nothing here runs by itself: no startup call, no polling, no timers. Nothing
 * here touches expenses or reports on screen. A rate the provider now reports
 * differently is only ever a pending revision until the user accepts it.
 */
import { addDays, fxCacheKey, fxQuoteCurrencies, getLastCheckedAt, isFxError } from '../lib/fx/index.js';
import { describeFailure } from '../lib/reporting/fxAvailability.js';
import { getSharedEcbClient, getSharedFxCache } from './historicalRatesService.js';

/** The storage key of the saved rates, for `storage` events from other tabs. */
export { fxCacheKey };

export const recentCheckDays = 90;
export const maxCheckRequests = 4;
export const maxCheckRangeDays = 366;

// Pages that show a report listen for this so they can say "rates changed"
// without rewriting what is on screen.
export const fxChangedEvent = 'cost-manager:fx-changed';

function announceChange() {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new Event(fxChangedEvent));
  }
}

// Only one provider operation at a time (a second click cannot double-send).
let activeOperation = null;

/** @returns {string|null} The running operation's name, if any. */
export function getActiveFxOperation() {
  return activeOperation;
}

function browserIsOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function failedStep(name, error) {
  if (!isFxError(error)) {
    throw error;
  }

  return { name, ok: false, code: error.code, cause: describeFailure(error.code, browserIsOffline()) };
}

async function runExclusive(operation, work) {
  if (activeOperation) {
    return { operation, status: 'busy', busyWith: activeOperation, steps: [], newObservations: 0, revisionsFound: 0, persisted: true };
  }

  activeOperation = operation;

  try {
    return await work();
  } finally {
    activeOperation = null;
  }
}

function finish(operation, steps, totals, signal) {
  const failed = steps.filter((step) => !step.ok && step.code !== 'aborted');
  const cancelled = signal?.aborted || steps.some((step) => step.code === 'aborted');

  return {
    operation,
    status: cancelled ? 'cancelled' : failed.length === 0 ? 'ok' : failed.length === steps.length ? 'failed' : 'partial',
    steps,
    cause: failed[0]?.cause ?? null,
    newObservations: totals.added,
    revisionsFound: totals.revisions,
    persisted: totals.persisted
  };
}

/**
 * Fetches the newest ECB observations and the provider's own metadata (its
 * newest observation date, which lets older recent dates be proven final).
 * Adds data; never changes an accepted rate (a differing value becomes a
 * pending revision).
 * @param {object} [options]
 * @param {AbortSignal} [options.signal]
 * @param {object} [options.cache] - Test seam.
 * @param {object} [options.client] - Test seam.
 * @param {function} [options.now]
 */
export function checkForNewRates({ signal, cache = getSharedFxCache(), client = getSharedEcbClient(), now = Date.now } = {}) {
  return runExclusive('check-new', async () => {
    const steps = [];
    const totals = { added: 0, revisions: 0, persisted: true };

    try {
      const { metadata, fetchedAt } = await client.fetchMetadata({ signal });
      const saved = cache.recordProviderMetadata(metadata, fetchedAt);

      totals.persisted &&= saved.persisted;
      steps.push({ name: 'provider-info', ok: true });
    } catch (error) {
      steps.push(failedStep('provider-info', error));
    }

    if (!signal?.aborted) {
      try {
        const result = await client.fetchLatest({ quotes: fxQuoteCurrencies, signal });
        const saved = cache.recordObservations(result);

        totals.added += saved.added;
        totals.revisions += saved.revisions;
        totals.persisted &&= saved.persisted;
        steps.push({ name: 'latest-rates', ok: true });
      } catch (error) {
        if (isFxError(error) && error.code !== 'aborted') {
          cache.recordFailure({ kind: 'latest', quotes: fxQuoteCurrencies }, error, new Date(now()).toISOString());
        }

        steps.push(failedStep('latest-rates', error));
      }
    }

    return finish('check-new', steps, totals, signal);
  });
}

// Bounded windows over the dates already saved, newest first.
function planRevisionWindows(table, scope) {
  const dates = [...new Set(fxQuoteCurrencies.flatMap((quote) => Object.keys(table.observations[quote])))].sort();

  if (dates.length === 0) {
    return [];
  }

  const newest = dates.at(-1);
  const oldest = scope === 'all' ? dates[0] : [addDays(newest, -recentCheckDays), dates[0]].sort().at(-1);
  const windows = [];

  for (let to = newest; to >= oldest && windows.length < maxCheckRequests; to = addDays(to, -maxCheckRangeDays - 1)) {
    const from = [addDays(to, -maxCheckRangeDays + 1), oldest].sort().at(-1);
    const quotes = fxQuoteCurrencies.filter((quote) => Object.keys(table.observations[quote]).some((date) => date >= from && date <= to));

    if (quotes.length > 0) {
      windows.push({ from, to, quotes });
    }
  }

  return windows;
}

/**
 * Asks the provider again about dates that are already saved, to find values
 * it now reports differently. Differences become PENDING revisions; nothing is
 * replaced. `scope` 'recent' covers the newest 90 days of saved dates; 'all'
 * covers every saved date, in at most 4 requests of up to a year each.
 * @param {object} [options]
 * @param {'recent'|'all'} [options.scope]
 */
export function checkSavedRatesForRevisions({ scope = 'recent', signal, cache = getSharedFxCache(), client = getSharedEcbClient(), now = Date.now } = {}) {
  return runExclusive('check-revisions', async () => {
    const steps = [];
    const totals = { added: 0, revisions: 0, persisted: true };
    const windows = planRevisionWindows(cache.getTable(), scope);

    for (const window of windows) {
      if (signal?.aborted) {
        break;
      }

      try {
        const result = await client.fetchRange({ from: window.from, to: window.to, quotes: window.quotes, signal });
        const saved = cache.recordObservations(result);

        totals.added += saved.added;
        totals.revisions += saved.revisions;
        totals.persisted &&= saved.persisted;
        steps.push({ name: `range ${window.from}..${window.to}`, ok: true });
      } catch (error) {
        if (isFxError(error) && error.code !== 'aborted') {
          cache.recordFailure({ kind: 'range', quotes: window.quotes, from: window.from, to: window.to }, error, new Date(now()).toISOString());
        }

        steps.push(failedStep(`range ${window.from}..${window.to}`, error));

        // A failing provider is not asked again for the next window.
        break;
      }
    }

    return finish('check-revisions', steps, totals, signal);
  });
}

/**
 * Everything the Settings panel shows, from one read of the cache.
 * @param {{cache?: object}} [options]
 */
export function getFxOverview({ cache = getSharedFxCache() } = {}) {
  const snapshot = cache.inspect();
  const { table } = snapshot;
  const dates = fxQuoteCurrencies.flatMap((quote) => Object.keys(table.observations[quote])).sort();
  const fetchedAt = (id) => table.fetches[String(id)]?.at ?? null;

  return {
    cacheStatus: snapshot.status,
    persistence: snapshot.persistence,
    lastCheckedAt: getLastCheckedAt(table),
    providerNewest: table.provider_meta?.endDate ?? null,
    firstDate: dates[0] ?? null,
    lastDate: dates.at(-1) ?? null,
    observationCount: dates.length,
    revisionCount: table.revisionLog.length,
    pendingRevisions: table.pendingRevisions.map((revision) => ({
      quote: revision.quote,
      date: revision.date,
      accepted: revision.accepted,
      candidate: revision.candidate,
      acceptedFetchedAt: fetchedAt(revision.acceptedFetch),
      candidateFetchedAt: fetchedAt(revision.candidateFetch)
    }))
  };
}

/**
 * The user accepts ONE proposed change. The values the user was shown must
 * still match, otherwise nothing is applied (conflict). Reports already on
 * screen are not touched; the new value is used only by reports generated
 * afterwards.
 * @param {{quote: string, date: string, accepted: string, candidate: string}} target
 * @returns {{outcome: string, persisted: boolean}} outcome: 'applied' | 'not-found' | 'conflict'
 */
export function applyRevision(target, { cache = getSharedFxCache() } = {}) {
  const { outcome, persisted } = cache.applyPendingRevision({ quote: target.quote, date: target.date, accepted: target.accepted, candidate: target.candidate });

  if (outcome === 'applied') {
    announceChange();
  }

  return { outcome, persisted };
}

/**
 * The user keeps the accepted value and dismisses ONE proposal. The decision
 * is checked against the latest stored table inside the cache's own commit
 * (quote, date, accepted and candidate), so a stale button can neither dismiss
 * a newer proposal nor a different one.
 * @returns {{outcome: string, persisted: boolean}} outcome: 'kept' | 'not-found' | 'conflict'
 */
export function keepRevision(target, { cache = getSharedFxCache() } = {}) {
  const { outcome, persisted } = cache.discardPendingRevision({ quote: target.quote, date: target.date, accepted: target.accepted, candidate: target.candidate });

  return { outcome: outcome === 'discarded' ? 'kept' : outcome, persisted };
}

/**
 * Did any accepted rate that a report USED change since it was generated?
 * Compares each (currency, observation date, rate) the report used with what
 * is accepted now. A pending proposal, an unrelated currency or date, or a
 * missing observation never counts. Read-only.
 * @param {{quote: string, date: string, rate: string}[]|null} used
 * @returns {boolean}
 */
export function getChangedUsedRates(used, { cache = getSharedFxCache() } = {}) {
  if (!Array.isArray(used) || used.length === 0) {
    return false;
  }

  const { observations } = cache.inspect().table;

  return used.some(({ quote, date, rate }) => {
    const current = observations[quote]?.[date]?.[0];

    return current !== undefined && current !== rate;
  });
}
