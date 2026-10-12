/*
 * M2B.1: the Frankfurter v2 client for the ECB-specific provider endpoint
 * (https://api.frankfurter.dev/v2/providers/ecb/...). It never calls the
 * blended /v2/rates feed.
 *
 * Dependencies are injected (fetch, timers, random, clock) so every network
 * behaviour is testable deterministically. Nothing here runs at import time,
 * and nothing in the application creates a client yet (dormant, ADR-049).
 *
 * Reliability rules:
 *  - each attempt has a timeout (default 10 s);
 *  - at most 2 retries (3 attempts) for transient failures only: timeout,
 *    network failure, HTTP 429, 502, 503, 504; exponential backoff with a cap;
 *  - Retry-After (seconds or an HTTP date) is honoured; one longer than the
 *    allowed wait is NOT waited for, and the failure carries the delay;
 *  - malformed or empty data, and permanent 4xx errors, are never retried;
 *  - external cancellation (AbortSignal) stops everything at once, including
 *    a pending backoff sleep, and no retry follows;
 *  - identical requests in flight are shared (and only cancelled when every
 *    waiting caller has cancelled).
 * HTTP 200 never proves completeness: an empty list is only accepted where
 * the caller said it expects `any` answer.
 */
import {
  clientDefaults,
  ecbFirstObservationDate,
  ecbProviderPath,
  ecbRatesPath,
  frankfurterOrigin,
  fxBaseCurrency,
  fxQuoteCurrencies,
  maxAnchorDays
} from './constants.js';
import { addDays, isValidIsoDate, parseEcbMetadata, parseEcbObservations } from './ecbParser.js';
import { FxError, fxErrorCodes as codes } from './fxErrors.js';

const retryableStatuses = new Set([429, 502, 503, 504]);

/**
 * Builds the request URL for observations. Only documented parameters are
 * used: base, quotes, date, from, to.
 * @param {object} params
 * @param {string[]} params.quotes - Non-empty subset of the supported quotes.
 * @param {string} [params.date] - One date (not with from/to).
 * @param {string} [params.from] - Range start (needs `to`).
 * @param {string} [params.to] - Range end.
 * @returns {string}
 * @throws {FxError} `invalid-request`.
 */
export function buildEcbRatesUrl({ quotes, date, from, to }) {
  if (!Array.isArray(quotes) || quotes.length === 0 || quotes.some((quote) => !fxQuoteCurrencies.includes(quote))) {
    throw new FxError(codes.invalidRequest, 'Quotes must be a non-empty list of supported currencies.');
  }

  const hasDate = date !== undefined;
  const hasRange = from !== undefined || to !== undefined;

  if (hasDate && hasRange) {
    throw new FxError(codes.invalidRequest, 'Use either a date or a range, not both.');
  }

  [date, from, to].filter((value) => value !== undefined).forEach((value) => {
    if (!isValidIsoDate(value)) {
      throw new FxError(codes.invalidRequest, 'Dates must be real YYYY-MM-DD dates.', { details: { value } });
    }
  });

  if (hasRange && (from === undefined || to === undefined || from > to)) {
    throw new FxError(codes.invalidRequest, 'A range needs from and to, with from not after to.');
  }

  // Built by hand so the commas in `quotes` stay literal, exactly as in the
  // provider's documented examples. Every value is validated above, so none
  // needs escaping.
  const parts = [`base=${fxBaseCurrency}`, `quotes=${[...new Set(quotes)].sort().join(',')}`];

  if (hasDate) {
    parts.push(`date=${date}`);
  } else if (hasRange) {
    parts.push(`from=${from}`, `to=${to}`);
  }

  return `${frankfurterOrigin}${ecbRatesPath}?${parts.join('&')}`;
}

export function buildEcbMetadataUrl() {
  return new URL(ecbProviderPath, frankfurterOrigin).toString();
}

/**
 * @param {string|null} value - A Retry-After header value.
 * @param {number} nowMs - Current time in milliseconds.
 * @returns {number|null} The delay in milliseconds, or null if unusable.
 */
export function parseRetryAfter(value, nowMs) {
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }

  const trimmed = value.trim();

  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed) * 1000;
  }

  const dateMs = Date.parse(trimmed);

  return Number.isNaN(dateMs) ? null : Math.max(0, dateMs - nowMs);
}

const defaultTimers = {
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle)
};

function abortedError() {
  return new FxError(codes.aborted, 'The request was cancelled.');
}

/**
 * @param {object} [options]
 * @param {function} [options.fetch] - fetch implementation.
 * @param {object} [options.timers] - { setTimeout, clearTimeout }.
 * @param {function} [options.random] - Returns [0, 1) (backoff jitter).
 * @param {function} [options.now] - Returns the current time in ms.
 * @param {number} [options.timeoutMs]
 * @param {number} [options.maxRetries]
 * @param {number} [options.baseDelayMs]
 * @param {number} [options.maxDelayMs]
 * @param {number} [options.maxRetryAfterMs]
 */
export function createEcbClient(options = {}) {
  const fetchImpl = options.fetch ?? globalThis.fetch?.bind(globalThis);
  const timers = options.timers ?? defaultTimers;
  const random = options.random ?? Math.random;
  const now = options.now ?? Date.now;
  const settings = { ...clientDefaults, ...Object.fromEntries(Object.entries(options).filter(([key]) => key in clientDefaults)) };
  const inFlight = new Map();

  const todayUtc = () => new Date(now()).toISOString().slice(0, 10);

  function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(abortedError());

        return;
      }

      const onAbort = () => {
        timers.clearTimeout(handle);
        reject(abortedError());
      };
      const handle = timers.setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);

      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  // One HTTP attempt. Throws FxError; `retryable` and `retryAfterMs` in
  // details drive the retry loop.
  async function attempt(url, signal, parse) {
    if (signal.aborted) {
      throw abortedError();
    }

    const controller = new AbortController();
    let timedOut = false;
    const onExternalAbort = () => controller.abort();

    signal.addEventListener('abort', onExternalAbort, { once: true });
    const timer = timers.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, settings.timeoutMs);

    try {
      let response;

      try {
        response = await fetchImpl(url, { method: 'GET', headers: { Accept: 'application/json' }, signal: controller.signal });
      } catch (error) {
        if (signal.aborted) {
          throw abortedError();
        }

        if (timedOut) {
          throw new FxError(codes.timeout, 'The provider did not answer in time.', { details: { retryable: true }, cause: error });
        }

        throw new FxError(codes.network, 'The provider could not be reached.', { details: { retryable: true }, cause: error });
      }

      // A redirect must never lead away from the ECB-specific endpoint.
      if (typeof response.url === 'string' && response.url !== '' && !response.url.startsWith(`${frankfurterOrigin}${ecbProviderPath}`)) {
        throw new FxError(codes.unexpectedEndpoint, 'The response did not come from the ECB provider endpoint.', {
          details: { url: response.url }
        });
      }

      if (!response.ok) {
        const retryAfterMs = parseRetryAfter(response.headers?.get?.('Retry-After') ?? null, now());
        const status = response.status;

        if (retryableStatuses.has(status)) {
          throw new FxError(
            status === 429 ? codes.rateLimited : codes.unavailable,
            `The provider answered with HTTP ${status}.`,
            { details: { status, retryable: true, retryAfterMs } }
          );
        }

        throw new FxError(codes.httpError, `The provider answered with HTTP ${status}.`, { details: { status, retryable: false } });
      }

      let text;

      try {
        text = await response.text();
      } catch (error) {
        if (signal.aborted) {
          throw abortedError();
        }

        throw new FxError(timedOut ? codes.timeout : codes.network, 'The provider response could not be read.', {
          details: { retryable: true },
          cause: error
        });
      }

      return parse(text);
    } finally {
      timers.clearTimeout(timer);
      signal.removeEventListener('abort', onExternalAbort);
    }
  }

  function backoffMs(attemptIndex) {
    const exponential = Math.min(settings.maxDelayMs, settings.baseDelayMs * 2 ** attemptIndex);
    const jitter = Math.floor(random() * (settings.baseDelayMs / 2));

    return Math.min(settings.maxDelayMs, exponential + jitter);
  }

  async function runWithRetries(url, signal, parse) {
    for (let index = 0; ; index += 1) {
      try {
        const result = await attempt(url, signal, parse);

        return { ...result, attempts: index + 1 };
      } catch (error) {
        const retryable = error instanceof FxError && error.details?.retryable === true;

        if (!retryable || index >= settings.maxRetries) {
          if (error instanceof FxError && error.details) {
            error.details = { ...error.details, attempts: index + 1 };
          }

          throw error;
        }

        const retryAfterMs = error.details.retryAfterMs ?? null;

        if (retryAfterMs !== null && retryAfterMs > settings.maxRetryAfterMs) {
          error.details = { ...error.details, attempts: index + 1, retryable: false, retryAfterTooLong: true };

          throw error;
        }

        await sleep(retryAfterMs ?? backoffMs(index), signal);
      }
    }
  }

  // Shares identical in-flight requests. The shared request is only
  // cancelled once every caller that asked for it has cancelled.
  function shared(key, signal, parse, url) {
    // A caller that is already cancelled must not start (or join) anything.
    if (signal?.aborted) {
      return Promise.reject(abortedError());
    }

    let entry = inFlight.get(key);

    if (!entry) {
      const controller = new AbortController();

      entry = { controller, waiters: 0, promise: null };
      entry.promise = runWithRetries(url, controller.signal, parse).finally(() => {
        inFlight.delete(key);
      });
      entry.promise.catch(() => {});
      inFlight.set(key, entry);
    }

    entry.waiters += 1;
    const current = entry;

    return new Promise((resolve, reject) => {
      const release = () => {
        current.waiters -= 1;

        if (current.waiters === 0) {
          current.controller.abort();
        }
      };

      const onAbort = () => {
        release();
        reject(abortedError());
      };

      signal?.addEventListener('abort', onAbort, { once: true });
      current.promise.then(
        (value) => {
          signal?.removeEventListener('abort', onAbort);
          resolve(structuredClone(value));
        },
        (error) => {
          signal?.removeEventListener('abort', onAbort);
          reject(error);
        }
      );
    });
  }

  function observationsRequest({ kind, params, quotes, parseOptions, signal }) {
    const url = buildEcbRatesUrl({ quotes, ...params });
    const key = `${url}|${parseOptions.expectation}|${parseOptions.minDate ?? ''}|${parseOptions.maxDate ?? ''}`;

    return shared(
      key,
      signal,
      (text) => ({
        ...parseEcbObservations(text, { quotes, ...parseOptions }),
        expectation: parseOptions.expectation,
        request: { kind, url, quotes: [...new Set(quotes)].sort(), ...params },
        fetchedAt: new Date(now()).toISOString()
      }),
      url
    );
  }

  return {
    /**
     * The newest observations for the given quotes (every quote required).
     * @param {{quotes?: string[], signal?: AbortSignal}} [params]
     */
    fetchLatest({ quotes = fxQuoteCurrencies, signal } = {}) {
      return observationsRequest({
        kind: 'latest',
        params: {},
        quotes,
        // An observation dated after tomorrow (UTC) cannot be genuine.
        parseOptions: { latest: true, maxDate: addDays(todayUtc(), 1), expectation: 'data' },
        signal
      });
    },

    /**
     * Observations over a date range. A series may start with the
     * observation just before `from` (so a holiday start is anchored).
     * @param {{from: string, to: string, quotes?: string[],
     *   expectation?: 'data'|'any', signal?: AbortSignal}} params
     */
    fetchRange({ from, to, quotes = fxQuoteCurrencies, expectation = 'data', signal }) {
      return observationsRequest({
        kind: 'range',
        params: { from, to },
        quotes,
        parseOptions: {
          minDate: maxDate(addDays(from, -maxAnchorDays), ecbFirstObservationDate),
          maxDate: to,
          expectation
        },
        signal
      });
    },

    /**
     * The observation applicable on one date (the provider answers with the
     * latest observation on or before it).
     * @param {{date: string, quotes?: string[], expectation?: 'data'|'any',
     *   signal?: AbortSignal}} params
     */
    fetchOnDate({ date, quotes = fxQuoteCurrencies, expectation = 'data', signal }) {
      return observationsRequest({
        kind: 'date',
        params: { date },
        quotes,
        parseOptions: {
          minDate: maxDate(addDays(date, -maxAnchorDays), ecbFirstObservationDate),
          maxDate: date,
          expectation
        },
        signal
      });
    },

    /**
     * Provider metadata: series start, newest observation date, cadence.
     * @param {{signal?: AbortSignal}} [params]
     */
    fetchMetadata({ signal } = {}) {
      const url = buildEcbMetadataUrl();

      return shared(
        `${url}|metadata`,
        signal,
        (text) => ({ metadata: parseEcbMetadata(text), request: { kind: 'metadata', url }, fetchedAt: new Date(now()).toISOString() }),
        url
      );
    }
  };
}

function maxDate(a, b) {
  return a > b ? a : b;
}
