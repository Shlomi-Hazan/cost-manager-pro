import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fxCacheKey } from '../../src/lib/fx/constants.js';
import { FxError } from '../../src/lib/fx/fxErrors.js';
import { parseEcbObservations } from '../../src/lib/fx/ecbParser.js';
import { createFxCache } from '../../src/lib/fx/fxCache.js';
import { serializeTable, createEmptyTable, recordObservations } from '../../src/lib/fx/rateTable.js';
import { clientResult, createMemoryStorage, fixture, quota } from './helpers.js';
import { quotaError } from '../storage/fixtures.js';

/*
 * M2B.1 storage-bound cache: persistence, failure injection, in-memory
 * fallback, simulated concurrent tabs. Uses an in-memory storage unless a
 * test says otherwise, so no real localStorage is touched.
 */
const all = ['GBP', 'ILS', 'USD'];
const obs = (date, quote, rate) => ({ date, quote, rate });
const SECOND_RESULT = () => clientResult({ observations: [obs('2026-10-09', 'USD', '1.1206')], quotes: ['USD'], from: '2026-10-01', to: '2026-10-09', fetchedAt: '2026-10-12T08:00:00.000Z' });

function seriesResult() {
  const { observations } = parseEcbObservations(fixture('ecb-series-2026-09-01_to_2026-10-12.json'), { quotes: all });

  return clientResult({ observations, quotes: all, from: '2026-09-01', to: '2026-10-12', fetchedAt: '2026-10-12T08:00:00.000Z' });
}

function newCache(storage = createMemoryStorage(), options = {}) {
  return { storage, cache: createFxCache({ storage, ...options }) };
}

describe('reading', () => {
  it('starts empty, and reading writes nothing', () => {
    const { cache, storage } = newCache();

    expect(cache.inspect()).toMatchObject({ status: 'empty', persistence: 'storage', error: null });
    expect(cache.getTable().observations.USD).toEqual({});
    cache.select({ expenseDate: '2026-10-07', currencies: ['EUR', 'USD'], referenceDate: '2026-10-12' });
    expect(storage.writes()).toBe(0);
    expect(storage.data.size).toBe(0);
  });

  it('uses the dedicated, versioned namespace', () => {
    expect(fxCacheKey).toBe('cost-manager-pro:fx:ecb:v1');
    expect(fxCacheKey).not.toBe('cost-manager-pro:exchange-rates-cache');
    expect(fxCacheKey.startsWith('cost-manager-pro:costsdb')).toBe(false);
  });
});

describe('persisting', () => {
  it('writes one document under the FX key, readable by another instance', () => {
    const { cache, storage } = newCache();
    const outcome = cache.recordObservations(seriesResult());

    expect(outcome).toMatchObject({ persisted: true, reason: null, added: 87, unchanged: 0, revisions: 0 });
    expect([...storage.data.keys()]).toEqual([fxCacheKey]);
    expect(new Set(storage.log.filter(([operation]) => operation === 'write').map(([, key]) => key))).toEqual(new Set([fxCacheKey]));

    const reader = createFxCache({ storage });

    expect(reader.inspect().status).toBe('ready');
    expect(reader.select({ expenseDate: '2026-10-07', currencies: ['ILS', 'USD'], referenceDate: '2026-10-12' }).status).toBe('available');
  });

  it('answers synchronously from the local table (no network, no await)', () => {
    const { cache } = newCache();

    cache.recordObservations(seriesResult());
    const result = cache.select({ expenseDate: '2026-09-12', currencies: ['ILS', 'USD'], referenceDate: '2026-10-12' });

    expect(result).not.toBeInstanceOf(Promise);
    expect(result.selectedDate).toBe('2026-09-11');
  });

  it('accumulates: a second fetch adds to the first', () => {
    const { cache } = newCache();

    cache.recordObservations(SECOND_RESULT());
    cache.recordObservations(clientResult({ observations: [obs('2026-10-08', 'USD', '1.12')], quotes: ['USD'], from: '2026-10-01', to: '2026-10-09', fetchedAt: '2026-10-12T09:00:00.000Z' }));

    expect(Object.keys(cache.getTable().observations.USD)).toEqual(['2026-10-08', '2026-10-09']);
  });

  it('records failures so "tried and failed" shows up, and ignores cancellation', () => {
    const { cache } = newCache();

    cache.recordFailure({ kind: 'range', quotes: ['USD'], from: '2026-10-01', to: '2026-10-09' }, new FxError('timeout', 'x'), '2026-10-12T08:00:00.000Z');
    cache.recordFailure({ kind: 'range', quotes: ['ILS'], from: '2026-10-01', to: '2026-10-09' }, new FxError('aborted', 'x'), '2026-10-12T08:00:00.000Z');
    cache.recordFailure({ kind: 'range', quotes: ['GBP'], from: '2026-10-01', to: '2026-10-09' }, new FxError('invalid-rate', 'x'), '2026-10-12T08:00:00.000Z');

    const table = cache.getTable();

    expect(table.coverage.USD[0].status).toBe('failed');
    expect(table.coverage.ILS).toEqual([]);
    expect(table.coverage.GBP[0].status).toBe('partial');
  });

  it('stores provider metadata', () => {
    const { cache } = newCache();

    cache.recordProviderMetadata({ startDate: '1999-01-04', endDate: '2026-10-09', publishesMissed: 0, cadence: 'daily' }, '2026-10-12T08:00:00.000Z');
    expect(cache.getTable().provider_meta.endDate).toBe('2026-10-09');
  });
});

describe('corrupt stored data is never trusted', () => {
  it('reports corruption, serves an empty table, and leaves the raw value alone until a write', () => {
    const storage = createMemoryStorage({ [fxCacheKey]: '{"format": "cost-manager-pro-fx-cache", "oops"' });
    const { cache } = newCache(storage);
    const state = cache.inspect();

    expect(state.status).toBe('corrupt');
    expect(state.error.code).toBe('cache-corrupt');
    expect(state.table.observations.USD).toEqual({});
    expect(cache.select({ expenseDate: '2026-10-07', currencies: ['EUR', 'USD'], referenceDate: '2026-10-12' }).status).toBe('needs-fetch');
    expect(storage.writes()).toBe(0);
    expect(storage.data.get(fxCacheKey)).toContain('oops');
  });

  it('detects a valid-looking document whose content was altered', () => {
    const storage = createMemoryStorage();
    const { cache } = newCache(storage);

    cache.recordObservations(seriesResult());
    const document = JSON.parse(storage.data.get(fxCacheKey));

    document.observations.USD['2026-10-09'][0] = '99.9';
    storage.data.set(fxCacheKey, JSON.stringify(document));

    expect(createFxCache({ storage }).inspect().status).toBe('corrupt');
    expect(createFxCache({ storage }).select({ expenseDate: '2026-10-09', currencies: ['EUR', 'USD'], referenceDate: '2026-10-12' }).status).toBe('needs-fetch');
  });

  it('replaces a corrupt cache on the next successful fetch (it is rebuildable public data)', () => {
    const storage = createMemoryStorage({ [fxCacheKey]: 'garbage' });
    const { cache } = newCache(storage);

    expect(cache.recordObservations(SECOND_RESULT()).persisted).toBe(true);
    expect(createFxCache({ storage }).inspect().status).toBe('ready');
  });

  it('rejects a document with a different provider or base even if it is well formed', () => {
    const table = createEmptyTable();
    const text = serializeTable({ ...table, base: 'USD' });

    expect(createFxCache({ storage: createMemoryStorage({ [fxCacheKey]: text }) }).inspect().status).toBe('corrupt');
  });
});

describe('a newer schema is never overwritten', () => {
  const future = () => JSON.stringify({ format: 'cost-manager-pro-fx-cache', schemaVersion: 2, anything: true });

  it('reports unsupported and refuses to persist, keeping results in memory for the session', () => {
    const storage = createMemoryStorage({ [fxCacheKey]: future() });
    const { cache } = newCache(storage);

    expect(cache.inspect().status).toBe('unsupported');
    const outcome = cache.recordObservations(SECOND_RESULT());

    expect(outcome).toMatchObject({ persisted: false, reason: 'unsupported' });
    expect(storage.data.get(fxCacheKey)).toBe(future());
    expect(storage.writes()).toBe(0);
    expect(cache.inspect().persistence).toBe('memory-only');
    expect(cache.select({ expenseDate: '2026-10-09', currencies: ['EUR', 'USD'], referenceDate: '2026-10-12' }).status).toBe('available');
  });
});

describe('write failures keep a safe in-memory copy', () => {
  it('survives a full quota: not persisted, still usable, nothing stored half-way', () => {
    const storage = createMemoryStorage();
    const { cache } = newCache(storage);

    storage.failures.write = () => quota();
    const outcome = cache.recordObservations(seriesResult());

    expect(outcome).toMatchObject({ persisted: false, reason: 'quota-exceeded', added: 87 });
    expect(storage.data.size).toBe(0);
    expect(cache.inspect()).toMatchObject({ persistence: 'memory-only' });
    expect(cache.select({ expenseDate: '2026-10-07', currencies: ['ILS', 'USD'], referenceDate: '2026-10-12' }).status).toBe('available');
  });

  it('persists the in-memory results on the next successful write', () => {
    const storage = createMemoryStorage();
    const { cache } = newCache(storage);

    storage.failures.write = () => quota();
    cache.recordObservations(seriesResult());
    storage.failures.write = null;
    const next = cache.recordObservations(clientResult({ observations: [obs('2026-10-12', 'USD', '1.12')], quotes: ['USD'], kind: 'latest', fetchedAt: '2026-10-12T15:30:00.000Z' }));

    expect(next.persisted).toBe(true);
    expect(cache.inspect().persistence).toBe('storage');
    const reloaded = createFxCache({ storage }).getTable();

    expect(Object.keys(reloaded.observations.ILS)).toHaveLength(29);
    expect(reloaded.observations.USD['2026-10-12']).toBeDefined();
  });

  it('treats a generic write failure the same way', () => {
    const storage = createMemoryStorage();
    const { cache } = newCache(storage);

    storage.failures.write = () => new Error('disk');
    expect(cache.recordObservations(SECOND_RESULT())).toMatchObject({ persisted: false, reason: 'write-failed' });
  });

  it('works when storage cannot be read at all', () => {
    const storage = createMemoryStorage();
    const { cache } = newCache(storage);

    storage.failures.read = new Error('blocked');
    expect(cache.inspect()).toMatchObject({ status: 'unavailable' });
    expect(cache.recordObservations(SECOND_RESULT())).toMatchObject({ persisted: false, reason: 'unavailable' });
    expect(cache.select({ expenseDate: '2026-10-09', currencies: ['EUR', 'USD'], referenceDate: '2026-10-12' }).status).toBe('available');
  });

  it('does not trust a write that cannot be read back', () => {
    const storage = createMemoryStorage();
    const { cache } = newCache(storage);
    const realWrite = storage.write;

    storage.write = (key, value) => { realWrite.call(storage, key, `${value} `); };

    expect(cache.recordObservations(SECOND_RESULT())).toMatchObject({ persisted: false, reason: 'verify-failed' });
    expect(cache.inspect().persistence).toBe('memory-only');
  });

  it('keeps the previous good document when a later write fails', () => {
    const storage = createMemoryStorage();
    const { cache } = newCache(storage);

    cache.recordObservations(SECOND_RESULT());
    const good = storage.data.get(fxCacheKey);

    storage.failures.write = () => quota();
    cache.recordObservations(clientResult({ observations: [obs('2026-10-08', 'USD', '1.1')], quotes: ['USD'], from: '2026-10-01', to: '2026-10-09', fetchedAt: '2026-10-12T09:00:00.000Z' }));
    expect(storage.data.get(fxCacheKey)).toBe(good);
  });
});

describe('size limit', () => {
  it('prunes the oldest dates when the document would exceed the cap', () => {
    const { cache, storage } = newCache(createMemoryStorage(), { maxSerializedLength: 2000 });

    cache.recordObservations(seriesResult());
    expect(storage.data.get(fxCacheKey).length).toBeLessThanOrEqual(2000);
    const table = cache.getTable();
    const dates = Object.keys(table.observations.USD);

    expect(dates.length).toBeGreaterThan(0);
    expect(dates.length).toBeLessThan(29);
    expect(dates).toContain('2026-10-09');
  });
});

describe('concurrent tabs', () => {
  const a = () => clientResult({ observations: [obs('2026-10-07', 'USD', '1.1')], quotes: ['USD'], from: '2026-10-05', to: '2026-10-09', fetchedAt: '2026-10-12T08:00:00.000Z' });
  const b = () => clientResult({ observations: [obs('2026-10-08', 'USD', '1.2')], quotes: ['USD'], from: '2026-10-05', to: '2026-10-09', fetchedAt: '2026-10-12T08:05:00.000Z' });

  it('two tabs writing one after the other keep each other\'s data', () => {
    const storage = createMemoryStorage();
    const tabA = createFxCache({ storage });
    const tabB = createFxCache({ storage });

    tabA.recordObservations(a());
    tabB.recordObservations(b());
    expect(Object.keys(createFxCache({ storage }).getTable().observations.USD)).toEqual(['2026-10-07', '2026-10-08']);
  });

  it('a write that finds the value changed since it read it rebuilds from the fresh value', () => {
    const storage = createMemoryStorage();
    const tabA = createFxCache({ storage });
    const tabB = createFxCache({ storage });
    const realRead = storage.read;
    let reads = 0;
    let interleaved = false;

    // Tab B writes between tab A's first read and tab A's pre-write check.
    storage.read = (key) => {
      reads += 1;

      if (reads === 2 && !interleaved) {
        interleaved = true;
        tabB.recordObservations(b());
      }

      return realRead.call(storage, key);
    };

    expect(tabA.recordObservations(a()).persisted).toBe(true);
    expect(interleaved).toBe(true);
    expect(Object.keys(createFxCache({ storage }).getTable().observations.USD)).toEqual(['2026-10-07', '2026-10-08']);
  });

  it('the unavoidable window: a write by another tab right before ours can be lost, and reconcile() restores it', () => {
    const storage = createMemoryStorage();
    const tabA = createFxCache({ storage });
    const tabB = createFxCache({ storage });
    const realWrite = storage.write;
    let armed = true;

    tabB.recordObservations(b());
    // Tab A has not seen B's write yet (its own cache read an empty store),
    // so make the store look empty to A's pre-write check, then let A write
    // over B: the classic lost update that localStorage cannot prevent.
    const snapshot = storage.data.get(fxCacheKey);

    storage.data.delete(fxCacheKey);
    storage.write = (key, value) => {
      if (armed) {
        armed = false;
        storage.data.set(key, snapshot);
        storage.data.set(key, value);

        return;
      }

      realWrite.call(storage, key, value);
    };
    tabA.recordObservations(a());
    storage.data.set(fxCacheKey, serializeTable(createFxCache({ storage: { read: () => storage.data.get(fxCacheKey) ?? null, write: () => {}, remove: () => {} } }).getTable()));
    storage.write = realWrite;

    // B's observation is missing from storage now...
    expect(Object.keys(createFxCache({ storage }).getTable().observations.USD)).toEqual(['2026-10-07']);
    // ...until B (told by the storage event) reconciles what it last wrote.
    expect(tabB.reconcile().persisted).toBe(true);
    expect(Object.keys(createFxCache({ storage }).getTable().observations.USD)).toEqual(['2026-10-07', '2026-10-08']);
  });

  it('reconcile() does nothing when this tab has written nothing', () => {
    const { cache, storage } = newCache();

    expect(cache.reconcile()).toEqual({ persisted: true, reason: null });
    expect(storage.writes()).toBe(0);
  });

  it('gives up retrying after a few conflicts and keeps the work in memory', () => {
    const storage = createMemoryStorage();
    const tab = createFxCache({ storage });
    let counter = 0;
    const realRead = storage.read;

    // Another tab changes the value on every single read.
    storage.read = (key) => {
      counter += 1;
      storage.data.set(key, serializeTable(recordObservations(createEmptyTable(), clientResult({ observations: [obs('2026-10-08', 'USD', '1.2')], quotes: ['USD'], from: '2026-10-05', to: '2026-10-09', fetchedAt: `2026-10-12T08:${String(counter % 60).padStart(2, '0')}:00.000Z` })).table));

      return realRead.call(storage, key);
    };

    expect(tab.recordObservations(a())).toMatchObject({ persisted: false, reason: 'conflict' });
    expect(tab.inspect().persistence).toBe('memory-only');
  });

  it('two tabs that disagree about a rate never overwrite each other: a pending revision appears', () => {
    const storage = createMemoryStorage();
    const tabA = createFxCache({ storage });
    const tabB = createFxCache({ storage });

    tabA.recordObservations(clientResult({ observations: [obs('2026-10-09', 'USD', '1.1206')], quotes: ['USD'], from: '2026-10-05', to: '2026-10-09' }));
    tabB.recordObservations(clientResult({ observations: [obs('2026-10-09', 'USD', '1.1209')], quotes: ['USD'], from: '2026-10-05', to: '2026-10-09', fetchedAt: '2026-10-12T09:00:00.000Z' }));

    const table = createFxCache({ storage }).getTable();

    expect(table.observations.USD['2026-10-09'][0]).toBe('1.1206');
    expect(table.pendingRevisions).toHaveLength(1);
  });
});

describe('explicit revision handling through the cache', () => {
  it('lists, applies and discards pending revisions; nothing changes by itself', () => {
    const { cache } = newCache();

    cache.recordObservations(clientResult({ observations: [obs('2026-10-09', 'USD', '1.1206')], quotes: ['USD'], from: '2026-10-05', to: '2026-10-09' }));
    const outcome = cache.recordObservations(clientResult({ observations: [obs('2026-10-09', 'USD', '1.1209')], quotes: ['USD'], from: '2026-10-05', to: '2026-10-09', fetchedAt: '2026-10-20T08:00:00.000Z' }));

    expect(outcome.revisions).toBe(1);
    expect(cache.listPendingRevisions()).toHaveLength(1);
    expect(cache.select({ expenseDate: '2026-10-09', currencies: ['EUR', 'USD'], referenceDate: '2026-10-20' }).rates.USD).toBe('1.1206');

    cache.applyPendingRevision({ quote: 'USD', date: '2026-10-09' });
    expect(cache.listPendingRevisions()).toEqual([]);
    expect(cache.select({ expenseDate: '2026-10-09', currencies: ['EUR', 'USD'], referenceDate: '2026-10-20' }).rates.USD).toBe('1.1209');
    expect(cache.getTable().revisionLog).toHaveLength(1);

    cache.recordObservations(clientResult({ observations: [obs('2026-10-09', 'USD', '1.13')], quotes: ['USD'], from: '2026-10-05', to: '2026-10-09', fetchedAt: '2026-10-21T08:00:00.000Z' }));
    cache.discardPendingRevision({ quote: 'USD', date: '2026-10-09' });
    expect(cache.listPendingRevisions()).toEqual([]);
    expect(cache.select({ expenseDate: '2026-10-09', currencies: ['EUR', 'USD'], referenceDate: '2026-10-21' }).rates.USD).toBe('1.1209');
  });
});

describe('the cache never trusts its caller', () => {
  it.each([
    ['an un-normalized rate', obs('2026-10-09', 'USD', '1.1300')],
    ['a numeric rate', obs('2026-10-09', 'USD', 1.13)],
    ['a zero rate', obs('2026-10-09', 'USD', '0')],
    ['a negative rate', obs('2026-10-09', 'USD', '-1.1')],
    ['an exponent rate', obs('2026-10-09', 'USD', '1e0')],
    ['a rate with too many digits', obs('2026-10-09', 'USD', '1.123456789012345')],
    ['an impossible date', obs('2026-02-30', 'USD', '1.1')],
    ['a date before the series', obs('1998-12-31', 'USD', '1.1')],
    ['an unsupported currency', obs('2026-10-09', 'EUR', '1')],
    ['an unknown currency', obs('2026-10-09', 'JPY', '130')]
  ])('refuses to store %s, and stores nothing', (_label, observation) => {
    const { cache, storage } = newCache();

    expect(() => cache.recordObservations(clientResult({ observations: [observation], quotes: ['USD'], from: '2026-10-05', to: '2026-10-09' }))).toThrow(
      expect.objectContaining({ code: 'invalid-observation' })
    );
    expect(storage.writes()).toBe(0);
    expect(cache.inspect().status).toBe('empty');
  });

  it('a good cache is never turned corrupt by a later bad record', () => {
    const { cache, storage } = newCache();

    cache.recordObservations(SECOND_RESULT());
    const good = storage.data.get(fxCacheKey);

    expect(() => cache.recordObservations(clientResult({ observations: [obs('2026-10-08', 'USD', '1.10')], quotes: ['USD'], from: '2026-10-05', to: '2026-10-09' }))).toThrow();
    expect(storage.data.get(fxCacheKey)).toBe(good);
    expect(cache.inspect().status).toBe('ready');
  });

  it('refuses to persist a table that would not validate when read back (pre-write validation)', () => {
    const { cache, storage } = newCache();

    cache.recordObservations(SECOND_RESULT());
    const good = storage.data.get(fxCacheKey);
    // A malformed failure record would yield an invalid coverage entry.
    const outcome = cache.recordFailure({ kind: 'range', quotes: ['USD'], from: 'not-a-date', to: '2026-10-09' }, new FxError('timeout', 'x'), '2026-10-12T08:00:00.000Z');

    expect(outcome).toEqual({ persisted: false, reason: 'invalid-table' });
    expect(storage.data.get(fxCacheKey)).toBe(good);
    expect(cache.inspect()).toMatchObject({ status: 'ready', persistence: 'storage' });
  });
});

describe('isolation from everything else in localStorage (real storage)', () => {
  const expensesKey = 'cost-manager-pro:costsdb:v2:costs';
  const expensesDocument = JSON.stringify({ schemaVersion: 2, costs: [{ id: 'a', sum: 12.5, currency: 'USD', category: 'Food', description: 'Lunch', date: { day: 1, month: 10, year: 2026, hour: 9, minute: 5 } }] });
  const demoKey = 'cost-manager-pro:exchange-rates-cache';
  const demoCache = JSON.stringify({ USD: 1, GBP: 0.6, EUR: 0.7, ILS: 3.4 });
  const settingsKey = 'cost-manager-pro:settings';
  const settings = JSON.stringify({ exchangeRatesUrl: 'https://example.com/rates.json' });

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(expensesKey, expensesDocument);
    localStorage.setItem(`${expensesKey}:previous`, '{"format":"cost-manager-pro-previous-data"}');
    localStorage.setItem(demoKey, demoCache);
    localStorage.setItem(settingsKey, settings);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  const untouched = () => {
    expect(localStorage.getItem(expensesKey)).toBe(expensesDocument);
    expect(localStorage.getItem(`${expensesKey}:previous`)).toBe('{"format":"cost-manager-pro-previous-data"}');
    expect(localStorage.getItem(demoKey)).toBe(demoCache);
    expect(localStorage.getItem(settingsKey)).toBe(settings);
  };

  it('writes only its own key and leaves expenses, snapshots, the demo cache and settings byte-identical', () => {
    const cache = createFxCache();

    cache.recordObservations(seriesResult());
    cache.recordFailure({ kind: 'range', quotes: ['USD'], from: '2026-10-01', to: '2026-10-09' }, new FxError('timeout', 'x'), '2026-10-12T08:00:00.000Z');
    cache.reconcile();
    untouched();
    expect(Object.keys(localStorage).sort()).toEqual([demoKey, expensesKey, `${expensesKey}:previous`, fxCacheKey, settingsKey].sort());
  });

  it('a real quota failure leaves every expense and setting untouched', () => {
    const realSetItem = Storage.prototype.setItem;

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function setItem(key, value) {
      if (key === fxCacheKey) {
        throw quotaError();
      }

      return realSetItem.call(this, key, value);
    });
    const cache = createFxCache();

    expect(cache.recordObservations(seriesResult())).toMatchObject({ persisted: false, reason: 'quota-exceeded' });
    untouched();
    expect(localStorage.getItem(fxCacheKey)).toBeNull();
  });

  it('a corrupt FX cache never affects expenses, and clear() removes only the FX key', () => {
    localStorage.setItem(fxCacheKey, 'garbage');
    const cache = createFxCache();

    expect(cache.inspect().status).toBe('corrupt');
    cache.recordObservations(SECOND_RESULT());
    cache.clear();
    expect(localStorage.getItem(fxCacheKey)).toBeNull();
    untouched();
  });

  it('never reads the expense or demo keys', () => {
    const reads = [];
    const realGetItem = Storage.prototype.getItem;

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function getItem(key) {
      reads.push(key);

      return realGetItem.call(this, key);
    });
    const cache = createFxCache();

    cache.recordObservations(seriesResult());
    cache.select({ expenseDate: '2026-10-07', currencies: ['EUR', 'USD'], referenceDate: '2026-10-12' });
    expect(new Set(reads)).toEqual(new Set([fxCacheKey]));
  });
});
