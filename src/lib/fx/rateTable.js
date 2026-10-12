/*
 * M2B.1: the FX history table, the document stored in the dedicated cache key
 * (cost-manager-pro:fx:ecb:v1). Pure functions only: no storage, no network.
 *
 * Three different dates are never mixed:
 *   - the EXPENSE date (not stored here),
 *   - the OBSERVATION date (the key of each observation, an ECB date),
 *   - the FETCH time (`fetches[id].at`, when this app cached it).
 *
 * Document (schemaVersion 1):
 * {
 *   format, schemaVersion, provider: "ECB", base: "EUR",
 *   nextFetchId,
 *   fetches:      { "<id>": { at, kind, quotes, from?, to?, date?, status, error? } },
 *   observations: { "<QUOTE>": { "<YYYY-MM-DD>": ["<decimal rate>", <fetchId>] } },
 *   coverage:     { "<QUOTE>": [ { from, to, status, fetch } ] },
 *   pendingRevisions: [ { quote, date, accepted, acceptedFetch, candidate, candidateFetch } ],
 *   revisionLog:      [ { quote, date, previous, previousFetch, current, currentFetch } ],
 *   provider_meta: { startDate, endDate, publishesMissed, cadence, checkedAt } | null,
 *   checksum
 * }
 * Rates are exact decimal text. A missing rate is simply absent; it is never
 * stored as 0 or 1. EUR (the base) has no observations: it is 1 by definition.
 *
 * COVERAGE is per currency and per observation-date range, because a currency
 * can be available when another is not. An entry means "the provider was
 * asked about every observation date in [from, to] for this currency":
 *   valid           observations in the range were received and validated;
 *   confirmed-empty the provider answered, validly, with no observation for
 *                   this currency in the range;
 *   partial         the answer was incomplete or failed validation: ignored
 *                   for selection;
 *   failed          the request failed (network, HTTP): ignored for selection.
 * No entry at all means "never fetched". Only valid and confirmed-empty ranges
 * count when proving a selection (see observationSelection.js).
 *
 * REVISIONS: an accepted observation is never silently changed. A later fetch
 * that disagrees creates a pending revision and keeps the accepted value
 * until applyPendingRevision() is called; the replaced value is kept in
 * revisionLog.
 */
import { normalizeAmount } from '../money/decimal.js';
import {
  cacheLimits,
  ecbFirstObservationDate,
  fxBaseCurrency,
  fxCacheFormat,
  fxCacheSchemaVersion,
  fxProvider,
  fxQuoteCurrencies,
  maxRateSignificantDigits
} from './constants.js';
import { addDays, isValidIsoDate } from './ecbParser.js';
import { FxError, fxErrorCodes as codes } from './fxErrors.js';

export const coverageStatuses = {
  valid: 'valid',
  confirmedEmpty: 'confirmed-empty',
  partial: 'partial',
  failed: 'failed'
};

const countedStatuses = new Set([coverageStatuses.valid, coverageStatuses.confirmedEmpty]);
const allStatuses = new Set(Object.values(coverageStatuses));

export function isCountedCoverage(status) {
  return countedStatuses.has(status);
}

export function createEmptyTable() {
  return {
    format: fxCacheFormat,
    schemaVersion: fxCacheSchemaVersion,
    provider: fxProvider,
    base: fxBaseCurrency,
    nextFetchId: 1,
    fetches: {},
    observations: Object.fromEntries(fxQuoteCurrencies.map((quote) => [quote, {}])),
    coverage: Object.fromEntries(fxQuoteCurrencies.map((quote) => [quote, []])),
    pendingRevisions: [],
    revisionLog: [],
    provider_meta: null
  };
}

// ---------------------------------------------------------------------------
// Deterministic serialization and integrity check
// ---------------------------------------------------------------------------

function sortKeysDeep(value) {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeysDeep(value[key])]));
  }

  return value;
}

// FNV-1a, 32 bit. It detects truncation, accidental edits and bit rot; it is
// not a defence against deliberate tampering (the cache is not a secret and
// holds public data).
function checksumOf(text) {
  let hash = 0x811c9dc5;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash.toString(16).padStart(8, '0');
}

/**
 * @param {object} table
 * @returns {string} The stored text: stable key order, with a checksum.
 */
export function serializeTable(table) {
  const body = Object.fromEntries(Object.entries(table).filter(([key]) => key !== 'checksum'));
  const sorted = sortKeysDeep(body);

  return JSON.stringify({ ...sorted, checksum: checksumOf(JSON.stringify(sorted)) });
}

function corrupt(reason, details = {}) {
  return new FxError(codes.cacheCorrupt, `The stored exchange-rate history is not usable (${reason}).`, {
    details: { reason, ...details }
  });
}

// ---------------------------------------------------------------------------
// Validation of a stored document
// ---------------------------------------------------------------------------

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateRateText(rate, where) {
  if (typeof rate !== 'string' || !/^\d+(\.\d+)?$/.test(rate)) {
    throw corrupt('invalid-rate', { where });
  }

  if (normalizeAmount(rate) !== rate || rate === '0') {
    throw corrupt('invalid-rate', { where });
  }

  if (rate.replace('.', '').replace(/^0+/, '').length > maxRateSignificantDigits) {
    throw corrupt('invalid-rate-precision', { where });
  }
}

/**
 * Validates a parsed stored document completely and returns it unchanged.
 * @param {unknown} document - Parsed JSON.
 * @returns {object} The same document, now trusted.
 * @throws {FxError} `cache-unsupported-version` for a newer schema;
 *   `cache-corrupt` for anything else that is not exactly a valid table.
 */
export function validateTable(document) {
  if (!isPlainObject(document) || document.format !== fxCacheFormat) {
    throw corrupt('not-a-cache');
  }

  if (!Number.isInteger(document.schemaVersion) || document.schemaVersion < 1) {
    throw corrupt('invalid-schema-version');
  }

  if (document.schemaVersion > fxCacheSchemaVersion) {
    throw new FxError(codes.cacheUnsupportedVersion, 'The stored exchange-rate history was written by a newer version.', {
      details: { schemaVersion: document.schemaVersion }
    });
  }

  if (document.provider !== fxProvider || document.base !== fxBaseCurrency) {
    throw corrupt('wrong-provider-or-base');
  }

  const { checksum, ...body } = document;

  if (typeof checksum !== 'string' || checksum !== checksumOf(JSON.stringify(sortKeysDeep(body)))) {
    throw corrupt('checksum-mismatch');
  }

  if (!Number.isInteger(document.nextFetchId) || document.nextFetchId < 1 || !isPlainObject(document.fetches)) {
    throw corrupt('invalid-fetches');
  }

  Object.entries(document.fetches).forEach(([id, fetch]) => {
    if (!/^\d+$/.test(id) || Number(id) >= document.nextFetchId || !isPlainObject(fetch)) {
      throw corrupt('invalid-fetch-record', { id });
    }

    if (typeof fetch.at !== 'string' || Number.isNaN(Date.parse(fetch.at)) || !['ok', 'failed', 'partial'].includes(fetch.status)) {
      throw corrupt('invalid-fetch-record', { id });
    }
  });

  if (!isPlainObject(document.observations) || !isPlainObject(document.coverage)) {
    throw corrupt('invalid-sections');
  }

  const hasFetch = (id) => Number.isInteger(id) && Object.hasOwn(document.fetches, String(id));

  fxQuoteCurrencies.forEach((quote) => {
    if (!isPlainObject(document.observations[quote]) || !Array.isArray(document.coverage[quote])) {
      throw corrupt('missing-currency-section', { quote });
    }

    Object.entries(document.observations[quote]).forEach(([date, entry]) => {
      if (!isValidIsoDate(date) || date < ecbFirstObservationDate) {
        throw corrupt('invalid-observation-date', { quote, date });
      }

      if (!Array.isArray(entry) || entry.length !== 2 || !hasFetch(entry[1])) {
        throw corrupt('invalid-observation', { quote, date });
      }

      validateRateText(entry[0], `${quote} ${date}`);
    });

    document.coverage[quote].forEach((range, index) => {
      if (
        !isPlainObject(range) ||
        !isValidIsoDate(range.from) ||
        !isValidIsoDate(range.to) ||
        range.from > range.to ||
        !allStatuses.has(range.status) ||
        !hasFetch(range.fetch)
      ) {
        throw corrupt('invalid-coverage', { quote, index });
      }
    });
  });

  Object.keys(document.observations).concat(Object.keys(document.coverage)).forEach((quote) => {
    if (!fxQuoteCurrencies.includes(quote)) {
      throw corrupt('unexpected-currency', { quote });
    }
  });

  [document.pendingRevisions, document.revisionLog].forEach((list) => {
    if (!Array.isArray(list)) {
      throw corrupt('invalid-revisions');
    }
  });

  document.pendingRevisions.forEach((revision) => {
    const accepted = document.observations[revision?.quote]?.[revision?.date];

    if (!accepted || accepted[0] !== revision.accepted || typeof revision.candidate !== 'string') {
      throw corrupt('invalid-pending-revision', { quote: revision?.quote, date: revision?.date });
    }

    validateRateText(revision.candidate, 'pending revision');
  });

  document.revisionLog.forEach((entry) => {
    if (!isPlainObject(entry) || !fxQuoteCurrencies.includes(entry.quote) || !isValidIsoDate(entry.date)) {
      throw corrupt('invalid-revision-log');
    }
  });

  const meta = document.provider_meta;

  if (meta !== null && (!isPlainObject(meta) || !isValidIsoDate(meta.startDate) || !isValidIsoDate(meta.endDate))) {
    throw corrupt('invalid-provider-meta');
  }

  return document;
}

/**
 * @param {string} text - Stored text.
 * @returns {object} A validated table.
 * @throws {FxError} `cache-corrupt` or `cache-unsupported-version`.
 */
export function parseTable(text) {
  let document;

  try {
    document = JSON.parse(text);
  } catch (error) {
    throw new FxError(codes.cacheCorrupt, 'The stored exchange-rate history is not valid JSON.', {
      details: { reason: 'invalid-json' },
      cause: error
    });
  }

  return validateTable(document);
}

// ---------------------------------------------------------------------------
// Merging (union) and recording results
// ---------------------------------------------------------------------------

function fetchIdentity(fetch) {
  return [fetch.at, fetch.kind, fetch.from ?? '', fetch.to ?? '', fetch.date ?? '', fetch.quotes.join(','), fetch.status, fetch.error ?? ''].join('|');
}

/**
 * Union of two tables. Neither input is modified. Known-good observations are
 * never lost, and an observation present in both with different rates is NOT
 * overwritten: it becomes a pending revision (the `base` value stays
 * accepted). Fetch ids are renumbered where the two tables assigned the same
 * id to different fetches (two tabs can do that).
 * @param {object} base - The accepted table.
 * @param {object} incoming - Another table (another tab, memory, a fetch).
 * @returns {object} A new table.
 */
export function mergeTables(base, incoming) {
  const merged = structuredClone(base);
  const idMap = new Map();
  const identities = new Map(Object.entries(merged.fetches).map(([id, fetch]) => [fetchIdentity(fetch), Number(id)]));

  Object.entries(incoming.fetches)
    .sort(([a], [b]) => Number(a) - Number(b))
    .forEach(([id, fetch]) => {
      const identity = fetchIdentity(fetch);

      if (identities.has(identity)) {
        idMap.set(Number(id), identities.get(identity));

        return;
      }

      const newId = merged.nextFetchId;

      merged.nextFetchId += 1;
      merged.fetches[String(newId)] = structuredClone(fetch);
      identities.set(identity, newId);
      idMap.set(Number(id), newId);
    });

  const remap = (id) => idMap.get(id) ?? id;

  fxQuoteCurrencies.forEach((quote) => {
    Object.entries(incoming.observations[quote]).forEach(([date, [rate, fetchId]]) => {
      const existing = merged.observations[quote][date];

      if (!existing) {
        merged.observations[quote][date] = [rate, remap(fetchId)];
      } else if (existing[0] !== rate) {
        addPendingRevision(merged, { quote, date, candidate: rate, candidateFetch: remap(fetchId) });
      }
    });

    const seen = new Set(merged.coverage[quote].map((range) => `${range.from}|${range.to}|${range.status}|${range.fetch}`));

    incoming.coverage[quote].forEach((range) => {
      const entry = { from: range.from, to: range.to, status: range.status, fetch: remap(range.fetch) };
      const key = `${entry.from}|${entry.to}|${entry.status}|${entry.fetch}`;

      if (!seen.has(key)) {
        seen.add(key);
        merged.coverage[quote].push(entry);
      }
    });

    merged.coverage[quote].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : a.to < b.to ? -1 : a.to > b.to ? 1 : a.fetch - b.fetch));
  });

  incoming.pendingRevisions.forEach((revision) => {
    const accepted = merged.observations[revision.quote]?.[revision.date];

    if (accepted && accepted[0] !== revision.candidate) {
      addPendingRevision(merged, { ...revision, candidateFetch: remap(revision.candidateFetch) });
    }
  });

  const logSeen = new Set(merged.revisionLog.map((entry) => JSON.stringify(sortKeysDeep(entry))));

  incoming.revisionLog.forEach((entry) => {
    const mapped = { ...entry, previousFetch: remap(entry.previousFetch), currentFetch: remap(entry.currentFetch) };
    const key = JSON.stringify(sortKeysDeep(mapped));

    if (!logSeen.has(key)) {
      logSeen.add(key);
      merged.revisionLog.push(mapped);
    }
  });

  const incomingMeta = incoming.provider_meta;

  if (incomingMeta && (!merged.provider_meta || incomingMeta.checkedAt > merged.provider_meta.checkedAt)) {
    merged.provider_meta = structuredClone(incomingMeta);
  }

  return compact(merged);
}

function addPendingRevision(table, { quote, date, candidate, candidateFetch }) {
  const accepted = table.observations[quote][date];
  const exists = table.pendingRevisions.some((revision) => revision.quote === quote && revision.date === date && revision.candidate === candidate);

  if (!exists) {
    table.pendingRevisions.push({
      quote,
      date,
      accepted: accepted[0],
      acceptedFetch: accepted[1],
      candidate,
      candidateFetch
    });
  }
}

// Keeps the bounded lists bounded: oldest first, and fetch records only
// while something still refers to them.
function compact(table) {
  table.pendingRevisions = table.pendingRevisions.slice(-cacheLimits.maxPendingRevisions);
  table.revisionLog = table.revisionLog.slice(-cacheLimits.maxRevisionLog);

  fxQuoteCurrencies.forEach((quote) => {
    const failures = table.coverage[quote].filter((range) => !isCountedCoverage(range.status));
    const dropped = new Set(failures.slice(0, Math.max(0, failures.length - cacheLimits.maxFailureRecords)));

    table.coverage[quote] = table.coverage[quote].filter((range) => !dropped.has(range));
  });

  const referenced = new Set();

  fxQuoteCurrencies.forEach((quote) => {
    Object.values(table.observations[quote]).forEach(([, id]) => referenced.add(id));
    table.coverage[quote].forEach((range) => referenced.add(range.fetch));
  });
  table.pendingRevisions.forEach((revision) => {
    referenced.add(revision.acceptedFetch);
    referenced.add(revision.candidateFetch);
  });
  table.revisionLog.forEach((entry) => {
    referenced.add(entry.previousFetch);
    referenced.add(entry.currentFetch);
  });

  const ids = Object.keys(table.fetches).map(Number).sort((a, b) => a - b);
  let excess = ids.length - cacheLimits.maxFetchRecords;

  ids.forEach((id) => {
    if (excess > 0 && !referenced.has(id)) {
      delete table.fetches[String(id)];
      excess -= 1;
    }
  });

  return table;
}

function assertStorableObservation({ date, quote, rate }) {
  const invalid = (message) => new FxError(codes.invalidObservation, `Cannot store this observation: ${message}`, { details: { date, quote, rate } });

  if (!isValidIsoDate(date) || date < ecbFirstObservationDate) {
    throw invalid('the date is not a valid ECB date.');
  }

  if (!fxQuoteCurrencies.includes(quote)) {
    throw invalid('the currency is not a supported quote.');
  }

  if (typeof rate !== 'string' || !/^\d+(\.\d+)?$/.test(rate) || normalizeAmount(rate) !== rate || rate === '0') {
    throw invalid('the rate is not a normalized positive decimal string.');
  }

  if (rate.replace('.', '').replace(/^0+/, '').length > maxRateSignificantDigits) {
    throw invalid('the rate has more digits than supported.');
  }
}

function newFetchRecord(table, record) {
  const id = table.nextFetchId;

  table.nextFetchId += 1;
  table.fetches[String(id)] = record;

  return id;
}

/**
 * Records a successful provider answer. Does not touch an accepted value: a
 * disagreeing rate becomes a pending revision.
 * @param {object} table
 * @param {object} result - From the client: observations, request, fetchedAt,
 *   plus `expectation` ('data' | 'any').
 * @returns {{table: object, added: number, unchanged: number, revisions: number}}
 */
export function recordObservations(table, result) {
  // The table never trusts its caller: an observation that would not pass
  // validation on the next read would silently turn the whole cache corrupt.
  result.observations.forEach((observation) => assertStorableObservation(observation));

  const next = structuredClone(table);
  const { request, fetchedAt, observations } = result;
  const quotes = request.quotes;
  const record = { at: fetchedAt, kind: request.kind, quotes, status: 'ok' };

  ['from', 'to', 'date'].forEach((key) => {
    if (request[key] !== undefined) {
      record[key] = request[key];
    }
  });

  const fetchId = newFetchRecord(next, record);
  const fetchDate = fetchedAt.slice(0, 10);
  const pendingBefore = next.pendingRevisions.length;
  let added = 0;
  let unchanged = 0;

  observations.forEach(({ date, quote, rate }) => {
    const existing = next.observations[quote][date];

    if (!existing) {
      next.observations[quote][date] = [rate, fetchId];
      added += 1;
    } else if (existing[0] === rate) {
      unchanged += 1;
    } else {
      addPendingRevision(next, { quote, date, candidate: rate, candidateFetch: fetchId });
    }
  });

  quotes.forEach((quote) => {
    const own = observations.filter((observation) => observation.quote === quote);
    const dates = own.map((observation) => observation.date);
    let range;

    if (request.kind === 'latest') {
      // "Newest observation is X" also says nothing newer existed when this
      // was fetched, so the claim extends to the day after the fetch date
      // (an observation dated later than that is rejected by the parser).
      if (dates.length > 0) {
        const newest = dates[dates.length - 1];

        range = { from: newest, to: newest > addDays(fetchDate, 1) ? newest : addDays(fetchDate, 1) };
      }
    } else if (request.kind === 'range') {
      // Cannot claim dates after the fetch moment.
      const limit = addDays(fetchDate, 1);

      range = { from: request.from, to: request.to > limit ? (limit < request.from ? request.from : limit) : request.to };
    } else if (dates.length > 0) {
      // A single-date answer only proves the date it returned.
      range = { from: dates[dates.length - 1], to: dates[dates.length - 1] };
    }

    if (!range) {
      return;
    }

    const status = own.length > 0 ? coverageStatuses.valid : result.expectation === 'any' ? coverageStatuses.confirmedEmpty : coverageStatuses.partial;

    next.coverage[quote].push({ ...range, status, fetch: fetchId });
  });

  const merged = compact(next);

  return {
    table: mergeSorted(merged),
    added,
    unchanged,
    revisions: merged.pendingRevisions.length - pendingBefore
  };
}

function mergeSorted(table) {
  fxQuoteCurrencies.forEach((quote) => {
    table.coverage[quote].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : a.to < b.to ? -1 : a.to > b.to ? 1 : a.fetch - b.fetch));
  });

  return table;
}

/**
 * Records a failed request, so "tried and failed" is distinguishable from
 * "never tried". Failed and partial entries never count as coverage.
 * @param {object} table
 * @param {{kind: string, quotes: string[], from?: string, to?: string,
 *   date?: string, at: string, errorCode: string, partial?: boolean}} failure
 * @returns {object} A new table.
 */
export function recordFailure(table, failure) {
  const next = structuredClone(table);
  const status = failure.partial ? coverageStatuses.partial : coverageStatuses.failed;
  const record = {
    at: failure.at,
    kind: failure.kind,
    quotes: [...failure.quotes].sort(),
    status: failure.partial ? 'partial' : 'failed',
    error: failure.errorCode
  };

  ['from', 'to', 'date'].forEach((key) => {
    if (failure[key] !== undefined) {
      record[key] = failure[key];
    }
  });

  const fetchId = newFetchRecord(next, record);
  const from = failure.from ?? failure.date;
  const to = failure.to ?? failure.date;

  if (from && to) {
    record.quotes.forEach((quote) => {
      next.coverage[quote].push({ from, to, status, fetch: fetchId });
    });
  }

  return mergeSorted(compact(next));
}

/**
 * @param {object} table
 * @param {{startDate: string, endDate: string, publishesMissed: number|null,
 *   cadence: string|null}} metadata
 * @param {string} checkedAt - ISO time of the check.
 * @returns {object} A new table.
 */
export function recordProviderMetadata(table, metadata, checkedAt) {
  return {
    ...structuredClone(table),
    provider_meta: {
      startDate: metadata.startDate,
      endDate: metadata.endDate,
      publishesMissed: metadata.publishesMissed,
      cadence: metadata.cadence,
      checkedAt
    }
  };
}

/**
 * Accepts a pending revision: the candidate replaces the accepted value, and
 * the replaced value is kept in the revision log. This is the only way an
 * accepted observation changes. Nothing recalculates automatically.
 * @param {object} table
 * @param {{quote: string, date: string}} target
 * @returns {object} A new table (unchanged if there is no such revision).
 */
export function applyPendingRevision(table, { quote, date }) {
  const next = structuredClone(table);
  const revision = next.pendingRevisions.find((entry) => entry.quote === quote && entry.date === date);

  if (!revision) {
    return next;
  }

  next.observations[quote][date] = [revision.candidate, revision.candidateFetch];
  next.revisionLog.push({
    quote,
    date,
    previous: revision.accepted,
    previousFetch: revision.acceptedFetch,
    current: revision.candidate,
    currentFetch: revision.candidateFetch
  });
  next.pendingRevisions = next.pendingRevisions.filter((entry) => entry !== revision && !(entry.quote === quote && entry.date === date));

  return compact(next);
}

/**
 * Keeps the accepted value and drops a pending revision.
 * @returns {object} A new table.
 */
export function discardPendingRevision(table, { quote, date }) {
  const next = structuredClone(table);

  next.pendingRevisions = next.pendingRevisions.filter((entry) => !(entry.quote === quote && entry.date === date));

  return next;
}

/**
 * Removes the oldest observation dates until the stored text fits `maxLength`,
 * and clips coverage to match, so the cache never claims coverage for data it
 * no longer holds. The cache is rebuildable, so this is safe.
 * @param {object} table
 * @param {number} maxLength
 * @returns {object} A table whose serialization is within the limit.
 */
export function enforceSizeLimit(table, maxLength) {
  let current = table;

  while (serializeTable(current).length > maxLength) {
    const dates = [...new Set(fxQuoteCurrencies.flatMap((quote) => Object.keys(current.observations[quote])))].sort();

    if (dates.length === 0) {
      return current;
    }

    const cutoff = dates[Math.min(dates.length - 1, Math.max(0, Math.ceil(dates.length * 0.1) - 1))];
    const next = structuredClone(current);

    fxQuoteCurrencies.forEach((quote) => {
      Object.keys(next.observations[quote]).forEach((date) => {
        if (date <= cutoff) {
          delete next.observations[quote][date];
        }
      });

      const clipFrom = addDays(cutoff, 1);

      next.coverage[quote] = next.coverage[quote]
        .filter((range) => range.to > cutoff)
        .map((range) => (range.from <= cutoff ? { ...range, from: clipFrom } : range));
    });
    next.pendingRevisions = next.pendingRevisions.filter((revision) => next.observations[revision.quote][revision.date]);
    current = compact(next);
  }

  return current;
}
