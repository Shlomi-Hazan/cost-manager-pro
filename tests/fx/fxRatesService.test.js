// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFxCache } from '../../src/lib/fx/fxCache.js';
import { FxError, fxErrorCodes } from '../../src/lib/fx/fxErrors.js';
import { createHistoricalConverter, convertCosts } from '../../src/lib/reporting/historicalConversion.js';
import { applyRevision, checkForNewRates, checkSavedRatesForRevisions, getActiveFxOperation, getFxOverview, keepRevision } from '../../src/services/fxRatesService.js';
import { prepareHistoricalRates } from '../../src/services/historicalRatesService.js';
import { clientResult, createMemoryStorage, quota } from './helpers.js';

/*
 * M2B.3: the explicit operations. Deterministic: scripted provider, in-memory
 * storage, fixed clock. Nothing here may change an accepted rate by itself.
 */
const NOW = () => Date.parse('2026-10-13T08:00:00Z');
const cacheOn = (storage = createMemoryStorage()) => ({ storage, cache: createFxCache({ storage }) });
const seed = (cache, rate = '1.2', date = '2026-10-09', quotes = ['USD']) =>
  cache.recordObservations(clientResult({ observations: quotes.map((quote) => ({ date, quote, rate })), quotes, from: date, to: date, fetchedAt: '2026-10-10T08:00:00.000Z' }));
const latestAnswer = (observations, quotes = ['GBP', 'ILS', 'USD']) => clientResult({ kind: 'latest', observations, quotes, fetchedAt: '2026-10-13T08:00:00.000Z' });
const meta = { startDate: '1999-01-04', endDate: '2026-10-12', publishesMissed: 0, cadence: 'daily' };

function client(overrides = {}) {
  return {
    fetchMetadata: vi.fn(async () => ({ metadata: meta, fetchedAt: '2026-10-13T08:00:00.000Z', request: { kind: 'metadata' } })),
    fetchLatest: vi.fn(async () => latestAnswer(['GBP', 'ILS', 'USD'].map((quote) => ({ date: '2026-10-12', quote, rate: '1.3' })))),
    fetchRange: vi.fn(async ({ from, to, quotes }) => clientResult({ observations: [{ date: from, quote: quotes[0], rate: '1.2' }], quotes, from, to })),
    ...overrides
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('checkForNewRates', () => {
  it('stores provider info and the newest rates and reports what it found', async () => {
    const { cache } = cacheOn();
    const result = await checkForNewRates({ cache, client: client(), now: NOW });

    expect(result).toMatchObject({ operation: 'check-new', status: 'ok', newObservations: 3, revisionsFound: 0, persisted: true });
    expect(getFxOverview({ cache })).toMatchObject({ providerNewest: '2026-10-12', lastDate: '2026-10-12', lastCheckedAt: '2026-10-13T08:00:00.000Z' });
  });

  it('a differing value becomes a pending revision; the accepted value is kept', async () => {
    const { cache } = cacheOn();

    seed(cache, '1.2', '2026-10-12');
    const result = await checkForNewRates({ cache, client: client(), now: NOW });

    expect(result.revisionsFound).toBe(1);
    expect(cache.getTable().observations.USD['2026-10-12'][0]).toBe('1.2');
    expect(getFxOverview({ cache }).pendingRevisions).toMatchObject([{ quote: 'USD', date: '2026-10-12', accepted: '1.2', candidate: '1.3' }]);
  });

  it('reports a partial result when only one step failed, and classifies the cause', async () => {
    const { cache } = cacheOn();
    const result = await checkForNewRates({ cache, client: client({ fetchLatest: vi.fn(async () => { throw new FxError(fxErrorCodes.rateLimited, 'x'); }) }), now: NOW });

    expect(result.status).toBe('partial');
    expect(result.cause).toMatchObject({ code: 'rate-limited', retryable: true });
  });

  it('says "offline" only for a network failure while the browser reports offline', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const failing = () => client({ fetchMetadata: vi.fn(async () => { throw new FxError(fxErrorCodes.network, 'x'); }), fetchLatest: vi.fn(async () => { throw new FxError(fxErrorCodes.network, 'x'); }) });
    const offline = await checkForNewRates({ cache: cacheOn().cache, client: failing(), now: NOW });

    vi.stubGlobal('navigator', { onLine: true });
    const online = await checkForNewRates({ cache: cacheOn().cache, client: failing(), now: NOW });

    expect(offline).toMatchObject({ status: 'failed', cause: { code: 'offline' } });
    expect(online).toMatchObject({ status: 'failed', cause: { code: 'network' } });
  });

  it('refuses a second operation while one is running, and frees the lock afterwards', async () => {
    const { cache } = cacheOn();
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const slow = client({ fetchMetadata: vi.fn(async () => { await gate; return { metadata: meta, fetchedAt: '2026-10-13T08:00:00.000Z', request: { kind: 'metadata' } }; }) });
    const first = checkForNewRates({ cache, client: slow, now: NOW });
    const second = await checkSavedRatesForRevisions({ cache, client: client(), now: NOW });

    expect(getActiveFxOperation()).toBe('check-new');
    expect(second).toMatchObject({ status: 'busy', busyWith: 'check-new' });
    release();
    await first;
    expect(getActiveFxOperation()).toBeNull();
  });

  it('is cancellable and never records a cancellation as a failure', async () => {
    const { cache } = cacheOn();
    const controller = new AbortController();
    const aborting = client({
      fetchMetadata: vi.fn(async () => { controller.abort(); throw new FxError(fxErrorCodes.aborted, 'aborted'); })
    });
    const result = await checkForNewRates({ cache, client: aborting, signal: controller.signal, now: NOW });

    expect(result.status).toBe('cancelled');
    expect(aborting.fetchLatest).not.toHaveBeenCalled();
    expect(Object.values(cache.getTable().fetches)).toEqual([]);
  });

  it('reports a persistence failure honestly while still holding the data for this session', async () => {
    const storage = createMemoryStorage();
    const { cache } = cacheOn(storage);

    storage.failures.write = quota;
    const result = await checkForNewRates({ cache, client: client(), now: NOW });

    expect(result).toMatchObject({ status: 'ok', persisted: false });
    expect(getFxOverview({ cache }).persistence).toBe('memory-only');
  });
});

describe('checkSavedRatesForRevisions', () => {
  it('re-asks only about saved dates, in a bounded window, and finds a revision without replacing', async () => {
    const { cache } = cacheOn();

    seed(cache, '1.2', '2026-10-09');
    const c = client({ fetchRange: vi.fn(async ({ from, to, quotes }) => clientResult({ observations: [{ date: '2026-10-09', quote: 'USD', rate: '1.25' }], quotes, from, to })) });
    const result = await checkSavedRatesForRevisions({ cache, client: c, now: NOW });

    expect(c.fetchRange).toHaveBeenCalledTimes(1);
    expect(c.fetchRange.mock.calls[0][0]).toMatchObject({ quotes: ['USD'], to: '2026-10-09' });
    expect(result).toMatchObject({ status: 'ok', revisionsFound: 1 });
    expect(cache.getTable().observations.USD['2026-10-09'][0]).toBe('1.2');
  });

  it('does nothing (and requests nothing) with an empty cache', async () => {
    const c = client();
    const result = await checkSavedRatesForRevisions({ cache: cacheOn().cache, client: c, now: NOW });

    expect(c.fetchRange).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'ok', steps: [] });
  });

  it('"all" is capped at 4 requests however long the history, newest first', async () => {
    const { cache } = cacheOn();

    ['2005-06-01', '2008-06-01', '2012-06-01', '2016-06-01', '2020-06-01', '2024-06-03', '2026-10-09'].forEach((date) => seed(cache, '1.2', date));
    const c = client();
    const result = await checkSavedRatesForRevisions({ scope: 'all', cache, client: c, now: NOW });

    expect(c.fetchRange.mock.calls.length).toBeLessThanOrEqual(4);
    expect(c.fetchRange.mock.calls[0][0].to).toBe('2026-10-09');
    expect(result.steps.length).toBe(c.fetchRange.mock.calls.length);
  });

  it('stops at the first failing window and records the failure as "tried"', async () => {
    const { cache } = cacheOn();

    ['2020-06-01', '2026-10-09'].forEach((date) => seed(cache, '1.2', date));
    const c = client({ fetchRange: vi.fn(async () => { throw new FxError(fxErrorCodes.timeout, 'slow'); }) });
    const result = await checkSavedRatesForRevisions({ scope: 'all', cache, client: c, now: NOW });

    expect(c.fetchRange).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ status: 'failed', cause: { code: 'timeout', retryable: true } });
  });
});

describe('revision decisions', () => {
  const target = { quote: 'USD', date: '2026-10-09', accepted: '1.2', candidate: '1.25' };
  const withPending = () => {
    const { cache } = cacheOn();

    seed(cache, '1.2', '2026-10-09');
    cache.recordObservations(clientResult({ observations: [{ date: '2026-10-09', quote: 'USD', rate: '1.25' }], quotes: ['USD'], from: '2026-10-09', to: '2026-10-09', fetchedAt: '2026-10-13T08:00:00.000Z' }));

    return cache;
  };

  it('applies only when the user explicitly accepts, keeps the history, and clears the proposal', () => {
    const cache = withPending();

    expect(cache.getTable().observations.USD['2026-10-09'][0]).toBe('1.2');
    expect(applyRevision(target, { cache })).toEqual({ outcome: 'applied', persisted: true });
    expect(cache.getTable().observations.USD['2026-10-09'][0]).toBe('1.25');
    expect(cache.getTable().revisionLog).toMatchObject([{ quote: 'USD', date: '2026-10-09', previous: '1.2', current: '1.25' }]);
    expect(cache.listPendingRevisions()).toEqual([]);
  });

  it('refuses a stale decision (conflict) and a missing one (not-found) without changing anything', () => {
    const cache = withPending();
    const before = JSON.stringify(cache.getTable());

    expect(applyRevision({ ...target, candidate: '9.99' }, { cache }).outcome).toBe('conflict');
    expect(applyRevision({ ...target, accepted: '1.1' }, { cache }).outcome).toBe('conflict');
    expect(applyRevision({ ...target, date: '2026-10-08' }, { cache }).outcome).toBe('not-found');
    expect(JSON.stringify(cache.getTable())).toBe(before);
  });

  it('keeps the accepted value when the user declines, and a stale decline does nothing', () => {
    const cache = withPending();

    expect(keepRevision({ ...target, candidate: '9.99' }, { cache }).outcome).toBe('conflict');
    expect(cache.listPendingRevisions()).toHaveLength(1);
    expect(keepRevision(target, { cache }).outcome).toBe('kept');
    expect(cache.getTable().observations.USD['2026-10-09'][0]).toBe('1.2');
    expect(cache.getTable().revisionLog).toEqual([]);
  });

  it('a report made before the acceptance keeps its numbers; a regenerated one uses the accepted rate', async () => {
    const cache = withPending();
    const costs = [{ id: 'a', sum: '120', currency: 'USD', category: 'Food', date: { day: 9, month: 10, year: 2026, hour: 1, minute: 1 } }];
    const base = { costs, targetCurrency: 'EUR', referenceDate: '2026-10-13', cache, client: client(), now: NOW };
    const run = async () => {
      const prepared = await prepareHistoricalRates(base);

      return { prepared, result: convertCosts(costs, createHistoricalConverter({ index: prepared.index, targetCurrency: 'EUR', referenceDate: '2026-10-13' })) };
    };
    const before = await run();

    expect(before.prepared.fx.pendingRevisions).toHaveLength(1);
    applyRevision(target, { cache });
    const stillShown = convertCosts(costs, createHistoricalConverter({ index: before.prepared.index, targetCurrency: 'EUR', referenceDate: '2026-10-13' }));
    const after = await run();

    expect(before.result.total).toBe('100');
    expect(stillShown.total).toBe('100');
    expect(after.result.total).toBe('96');
    expect(after.prepared.fx.revisionCount).toBe(before.prepared.fx.revisionCount + 1);
  });
});
