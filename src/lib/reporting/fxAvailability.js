/*
 * M2B.3: ONE small status model for what the user can be told about FX data,
 * derived (never stored) from what a report preparation actually did. Pure.
 *
 * state
 *   not-needed   every expense was already in the report currency: no rate used
 *   cache        every needed rate came from the saved cache (no request made)
 *   fetched      at least one request succeeded during this report
 *   unavailable  some expense could not be converted (see `causes`)
 *
 * flags (independent of state)
 *   provisional        some rate may still be superseded by a later publication
 *   persistenceFailed  a fetched rate could not be saved on this device
 *   cacheProblem       the saved cache was unreadable ('corrupt'|'unsupported'|'unavailable')
 *   pendingRevisions   proposed provider changes that touch rates THIS report used
 *   browserOffline     the browser says it is offline (a hint, never proof)
 *
 * causes are kept apart on purpose: a request that FAILED (retryable), a date
 * the provider cannot serve (not retryable), and rates NEVER FETCHED (retry
 * will try). `navigator.onLine` only changes the wording of a network failure.
 */
export const fxCauses = {
  offline: { code: 'offline', retryable: true },
  network: { code: 'network', retryable: true },
  timeout: { code: 'timeout', retryable: true },
  rateLimited: { code: 'rate-limited', retryable: true },
  providerError: { code: 'provider-error', retryable: true },
  invalidResponse: { code: 'invalid-response', retryable: true },
  notFetched: { code: 'not-fetched', retryable: true },
  providerNoData: { code: 'provider-no-data', retryable: false },
  currencyUnavailable: { code: 'currency-unavailable', retryable: false },
  beforeHistory: { code: 'before-history', retryable: false },
  futureDate: { code: 'future-date', retryable: false },
  noCommonDate: { code: 'no-common-date', retryable: false }
};

const failureCause = {
  timeout: 'timeout',
  'rate-limited': 'rateLimited',
  'provider-unavailable': 'providerError',
  'http-error': 'providerError',
  'unexpected-endpoint': 'invalidResponse',
  'empty-response': 'providerNoData',
  'missing-required-currency': 'providerNoData'
};

const reasonCause = {
  'future-date': 'futureDate',
  'before-provider-history': 'beforeHistory',
  'currency-unavailable': 'currencyUnavailable',
  'no-common-observation-date': 'noCommonDate',
  'rates-not-prepared': 'notFetched',
  'rates-not-available': 'notFetched'
};

/**
 * Maps a provider/client error code to a cause (see fxCauses).
 * @param {string} code
 * @param {boolean} [browserOffline]
 * @returns {{code: string, retryable: boolean}}
 */
export function describeFailure(code, browserOffline = false) {
  return fxCauses[causeOfFailure(code, browserOffline)];
}

function causeOfFailure(code, browserOffline) {
  if (code === 'network-error') {
    return browserOffline ? 'offline' : 'network';
  }

  return failureCause[code] ?? 'invalidResponse';
}

// The unique (currency, date, rate) triples behind a report's figures, or null
// when no rate was involved (nothing can go out of date).
function usedObservations(items) {
  const seen = new Map();

  items.forEach((item) => (item.usedRates ?? []).forEach((used) => seen.set(`${used.quote}|${used.date}`, used)));

  return seen.size === 0 ? null : [...seen.values()];
}

function relevantPending(pending, items, targetCurrency) {
  if (!pending?.length) {
    return 0;
  }

  const used = new Set();

  items.forEach((item) => {
    if (item.status === 'converted' && !item.identity && item.observationDate) {
      [item.currency, targetCurrency].filter((quote) => quote !== 'EUR').forEach((quote) => used.add(`${quote}|${item.observationDate}`));
    }
  });

  return pending.filter((revision) => used.has(`${revision.quote}|${revision.date}`)).length;
}

/**
 * @param {object} input
 * @param {object} input.prepared - Result of prepareHistoricalRates().
 * @param {object[]} input.items - Converted items of the whole report.
 * @param {object} input.summary - { usesRates, observation, counts, unavailableReasons }.
 * @param {string} input.targetCurrency
 * @param {boolean} [input.browserOffline]
 * @returns {object} See the header.
 */
export function buildFxStatus({ prepared, items, summary, targetCurrency, browserOffline = false }) {
  const requests = prepared.requests ?? [];
  const failures = requests.filter((request) => !request.ok);
  const causes = new Map();

  if (summary.counts.unavailable > 0) {
    failures.forEach((request) => causes.set(causeOfFailure(request.code, browserOffline), true));
    summary.unavailableReasons.forEach((reason) => {
      const key = reasonCause[reason];

      // "not fetched" is only a cause when no request explained the gap.
      if (key && !(key === 'notFetched' && failures.length > 0)) {
        causes.set(key, true);
      }
    });
  }

  const state = !prepared.needed
    ? 'not-needed'
    : summary.counts.unavailable > 0
      ? 'unavailable'
      : requests.some((request) => request.ok)
        ? 'fetched'
        : 'cache';

  const cacheProblem = ['corrupt', 'unsupported', 'unavailable'].includes(prepared.cacheStatus) ? prepared.cacheStatus : null;

  return {
    state,
    causes: [...causes.keys()].map((key) => fxCauses[key]),
    retryable: [...causes.keys()].some((key) => fxCauses[key].retryable),
    provisional: Boolean(summary.observation?.provisional),
    persistenceFailed: requests.some((request) => request.ok && request.persisted === false) || prepared.persistence === 'memory-only',
    cacheProblem,
    pendingRevisions: relevantPending(prepared.fx?.pendingRevisions, items, targetCurrency),
    browserOffline,
    lastCheckedAt: prepared.fx?.lastCheckedAt ?? null,
    // null when no rate was involved: there is nothing to go out of date.
    revisionCount: prepared.fx?.revisionCount ?? null,
    // What the report used; the "rates changed" notice compares against these.
    usedObservations: usedObservations(items),
    loadedNow: requests.some((request) => request.ok)
  };
}
