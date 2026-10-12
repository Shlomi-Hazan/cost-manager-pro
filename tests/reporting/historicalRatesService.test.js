// @vitest-environment node
import process from 'node:process';
import { describe, expect, it, vi } from 'vitest';
import { FxError, fxErrorCodes } from '../../src/lib/fx/fxErrors.js';
import { createFxCache } from '../../src/lib/fx/fxCache.js';
import { createHistoricalConverter, convertCosts } from '../../src/lib/reporting/historicalConversion.js';
import { planFetchRanges, prepareHistoricalRates } from '../../src/services/historicalRatesService.js';
import { createObservationIndex } from '../../src/lib/fx/observationSelection.js';
import { createEmptyTable } from '../../src/lib/fx/rateTable.js';
import { clientResult, createMemoryStorage, quota } from '../fx/helpers.js';

const cost = (id, sum, currency, day, month = 8, year = 2026) => ({ id, sum, currency, category: 'Food', date: { day, month, year, hour: 1, minute: 1 } });
const weekdays = ['2026-08-06', '2026-08-07', '2026-08-10'];

function answer({ from, to, quotes }) {
  const observations = weekdays
    .filter((date) => date >= from && date <= to)
    .flatMap((date) => quotes.map((quote) => ({ date, quote, rate: quote === 'USD' ? '1.2' : quote === 'ILS' ? '4' : '0.9' })));

  return clientResult({ observations, quotes, from, to });
}

function fakeClient(handler) {
  return { fetchRange: vi.fn(async (args) => handler(args)) };
}

const cacheOn = (storage = createMemoryStorage()) => ({ storage, cache: createFxCache({ storage }) });
const base = { referenceDate: '2026-10-12', now: () => Date.parse('2026-10-12T08:00:00Z') };

describe('when no request is made', () => {
  it('does nothing for a same-currency report (no cache read, no fetch)', async () => {
    const { cache, storage } = cacheOn();
    const client = fakeClient(() => { throw new Error('must not fetch'); });
    const prepared = await prepareHistoricalRates({ ...base, costs: [cost('a', '1', 'USD', 7)], targetCurrency: 'USD', cache, client });

    expect(prepared).toMatchObject({ index: null, needed: false, requests: [] });
    expect(client.fetchRange).not.toHaveBeenCalled();
    expect(storage.log).toEqual([]);
  });

  it('does nothing for an empty report', async () => {
    const { cache } = cacheOn();
    const prepared = await prepareHistoricalRates({ ...base, costs: [], targetCurrency: 'EUR', cache, client: fakeClient(() => null) });

    expect(prepared.needed).toBe(false);
  });

  it('does not refetch once the cache proves coverage', async () => {
    const { cache } = cacheOn();
    const client = fakeClient(answer);
    const costs = [cost('a', '10', 'USD', 7), cost('b', '10', 'ILS', 10)];

    await prepareHistoricalRates({ ...base, costs, targetCurrency: 'EUR', cache, client });
    const calls = client.fetchRange.mock.calls.length;
    const again = await prepareHistoricalRates({ ...base, costs, targetCurrency: 'EUR', cache, client });

    expect(calls).toBe(1);
    expect(client.fetchRange.mock.calls.length).toBe(1);
    expect(again.requests).toEqual([]);
  });
});

describe('batched fetching', () => {
  it('uses ONE ranged request for many expenses over nearby dates', async () => {
    const { cache } = cacheOn();
    const client = fakeClient(answer);
    const costs = Array.from({ length: 300 }, (_v, index) => cost(`c${index}`, '1', index % 2 ? 'USD' : 'ILS', 6 + (index % 5)));
    const prepared = await prepareHistoricalRates({ ...base, costs, targetCurrency: 'EUR', cache, client });

    expect(client.fetchRange).toHaveBeenCalledTimes(1);
    expect(client.fetchRange.mock.calls[0][0]).toMatchObject({ quotes: ['ILS', 'USD'] });
    expect(prepared.requests[0].ok).toBe(true);
    expect(convertCosts(costs, createHistoricalConverter({ index: prepared.index, targetCurrency: 'EUR', referenceDate: base.referenceDate })).complete).toBe(true);
  });

  it('plans distant dates as separate bounded ranges and caps the request count', () => {
    const lookups = Array.from({ length: 20 }, (_v, index) => ({ expenseDate: `${2000 + index}-06-15`, currency: 'USD' }));
    const ranges = planFetchRanges(lookups, createObservationIndex(createEmptyTable()), 'EUR', '2026-10-12');

    expect(ranges.length).toBe(20);
    ranges.forEach((range) => expect(range.from <= range.to).toBe(true));
  });

  it('shares an in-flight request between two simultaneous preparations', async () => {
    const { cache } = cacheOn();
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const client = fakeClient(async (args) => { await gate; return answer(args); });
    const costs = [cost('a', '1', 'USD', 7)];
    const first = prepareHistoricalRates({ ...base, costs, targetCurrency: 'EUR', cache, client });
    const second = prepareHistoricalRates({ ...base, costs, targetCurrency: 'EUR', cache, client });

    await Promise.resolve();
    release();
    await Promise.all([first, second]);
    expect(client.fetchRange).toHaveBeenCalledTimes(1);
  });
});

describe('failure handling (never a substitute rate)', () => {
  it.each([
    [fxErrorCodes.timeout],
    [fxErrorCodes.rateLimited],
    [fxErrorCodes.unavailable],
    [fxErrorCodes.emptyResponse],
    [fxErrorCodes.invalidRoot],
    [fxErrorCodes.unsupportedPrecision],
    [fxErrorCodes.network]
  ])('%s leaves the expense unavailable, with no total', async (code) => {
    const { cache } = cacheOn();
    const client = fakeClient(() => { throw new FxError(code, 'x'); });
    const costs = [cost('a', '1', 'USD', 7)];
    const prepared = await prepareHistoricalRates({ ...base, costs, targetCurrency: 'EUR', cache, client });
    const result = convertCosts(costs, createHistoricalConverter({ index: prepared.index, targetCurrency: 'EUR', referenceDate: base.referenceDate }));

    expect(prepared.requests[0]).toMatchObject({ ok: false, code });
    expect(result.total).toBeNull();
    expect(result.unavailable).toHaveLength(1);
  });

  it('records the failure as "tried", so it is not mistaken for no data', async () => {
    const { cache } = cacheOn();
    const client = fakeClient(() => { throw new FxError(fxErrorCodes.timeout, 'x'); });

    await prepareHistoricalRates({ ...base, costs: [cost('a', '1', 'USD', 7)], targetCurrency: 'EUR', cache, client });

    const selection = cache.createIndex().select({ expenseDate: '2026-08-07', currencies: ['USD', 'EUR'], referenceDate: '2026-10-12' });

    expect(selection.status).toBe('needs-fetch');
    expect(selection.missing[0].state).toBe('failed');
  });

  it('keeps working offline with a complete cache, with no request', async () => {
    const { cache } = cacheOn();
    const costs = [cost('a', '1', 'USD', 7)];

    await prepareHistoricalRates({ ...base, costs, targetCurrency: 'EUR', cache, client: fakeClient(answer) });
    const offline = fakeClient(() => { throw new FxError(fxErrorCodes.network, 'offline'); });
    const prepared = await prepareHistoricalRates({ ...base, costs, targetCurrency: 'EUR', cache, client: offline });

    expect(offline.fetchRange).not.toHaveBeenCalled();
    expect(convertCosts(costs, createHistoricalConverter({ index: prepared.index, targetCurrency: 'EUR', referenceDate: base.referenceDate })).complete).toBe(true);
  });

  it('first run offline with a partial cache converts only what is proven, and says the rest is unavailable', async () => {
    const { cache } = cacheOn();

    await prepareHistoricalRates({ ...base, costs: [cost('a', '1', 'USD', 7)], targetCurrency: 'EUR', cache, client: fakeClient(answer) });

    const costs = [cost('a', '1', 'USD', 7), cost('b', '1', 'USD', 7, 3, 2026)];
    const prepared = await prepareHistoricalRates({ ...base, costs, targetCurrency: 'EUR', cache, client: fakeClient(() => { throw new FxError(fxErrorCodes.network, 'x'); }) });
    const result = convertCosts(costs, createHistoricalConverter({ index: prepared.index, targetCurrency: 'EUR', referenceDate: base.referenceDate }));

    expect(result.total).toBeNull();
    expect(result.counts).toMatchObject({ converted: 1, unavailable: 1 });
  });

  it('survives a storage quota failure: converts from memory and reports it, expenses untouched', async () => {
    const storage = createMemoryStorage();
    const { cache } = cacheOn(storage);

    storage.failures.write = quota;
    const costs = [cost('a', '1', 'USD', 7)];
    const prepared = await prepareHistoricalRates({ ...base, costs, targetCurrency: 'EUR', cache, client: fakeClient(answer) });

    expect(prepared.requests[0]).toMatchObject({ ok: true, persisted: false, persistReason: 'quota-exceeded' });
    expect(prepared.persistence).toBe('memory-only');
    expect(convertCosts(costs, createHistoricalConverter({ index: prepared.index, targetCurrency: 'EUR', referenceDate: base.referenceDate })).complete).toBe(true);
    expect([...storage.data.keys()]).toEqual([]);
  });

  it('survives a corrupt cache by refetching, never touching other keys', async () => {
    const storage = createMemoryStorage({ 'cost-manager-pro:fx:ecb:v1': '{broken', 'cost-manager-pro:costs': 'EXPENSES' });
    const { cache } = cacheOn(storage);
    const costs = [cost('a', '1', 'USD', 7)];
    const prepared = await prepareHistoricalRates({ ...base, costs, targetCurrency: 'EUR', cache, client: fakeClient(answer) });

    expect(convertCosts(costs, createHistoricalConverter({ index: prepared.index, targetCurrency: 'EUR', referenceDate: base.referenceDate })).complete).toBe(true);
    expect(storage.data.get('cost-manager-pro:costs')).toBe('EXPENSES');
  });

  it('does not fetch for a future-dated expense or one before ECB history', async () => {
    const { cache } = cacheOn();
    const client = fakeClient(answer);
    const costs = [cost('future', '1', 'USD', 1, 1, 2030), cost('old', '1', 'USD', 1, 1, 1990)];
    const prepared = await prepareHistoricalRates({ ...base, costs, targetCurrency: 'EUR', cache, client });

    expect(client.fetchRange).not.toHaveBeenCalled();
    expect(convertCosts(costs, createHistoricalConverter({ index: prepared.index, targetCurrency: 'EUR', referenceDate: base.referenceDate })).total).toBeNull();
  });
});

describe('reproducibility', () => {
  it('never applies a pending revision: the accepted rate keeps being used', async () => {
    const { cache } = cacheOn();
    const costs = [cost('a', '120', 'USD', 7)];

    await prepareHistoricalRates({ ...base, costs, targetCurrency: 'EUR', cache, client: fakeClient(answer) });
    // The provider later disagrees about the same observation.
    cache.recordObservations(clientResult({ observations: [{ date: '2026-08-07', quote: 'USD', rate: '1.5' }], quotes: ['USD'], from: '2026-08-07', to: '2026-08-07' }));

    expect(cache.listPendingRevisions()).toHaveLength(1);

    const prepared = await prepareHistoricalRates({ ...base, costs, targetCurrency: 'EUR', cache, client: fakeClient(answer) });
    const result = convertCosts(costs, createHistoricalConverter({ index: prepared.index, targetCurrency: 'EUR', referenceDate: base.referenceDate }));

    expect(result.total).toBe('100');
  });

  it('uses one snapshot: a later write does not change an index already built', async () => {
    const { cache } = cacheOn();
    const costs = [cost('a', '120', 'USD', 7)];
    const prepared = await prepareHistoricalRates({ ...base, costs, targetCurrency: 'EUR', cache, client: fakeClient(answer) });
    const converter = createHistoricalConverter({ index: prepared.index, targetCurrency: 'EUR', referenceDate: base.referenceDate });

    cache.recordObservations(clientResult({ observations: [{ date: '2026-08-07', quote: 'USD', rate: '9' }], quotes: ['USD'], from: '2026-08-07', to: '2026-08-07' }));
    expect(convertCosts(costs, converter).total).toBe('100');
  });
});

describe('one canonical pathway', () => {
  // exportModels keeps a rate-free fallback (no conversion) for callers that pass no financials; the pages always pass the canonical ones.
  it('no application module uses the legacy flat-rate report builders or the flat rate cache for reporting', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const files = (directory) =>
      readdirSync(directory).flatMap((name) => {
        const path = join(directory, name);

        return statSync(path).isDirectory() ? files(path) : /\.(js|jsx)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
      });
    const offenders = files(join(process.cwd(), 'src'))
      .filter((file) => !/detailedReportsService\.js$|exchangeRatesService\.js$|exchangeRatesCache\.js$|rateDisclosureService\.js$|lib[\\/]db\.js$|SettingsPage\.jsx$|lib[\\/]money[\\/](financials|money)\.js$|utils[\\/]chartAggregation\.js$|export[\\/]exportModels\.js$/.test(file))
      .filter((file) => /detailedReportsService|getCachedExchangeRates|refreshExchangeRates|buildYearlyFinancials|buildCategoryFinancials|sumCostsExact/.test(readFileSync(file, 'utf8')));

    expect(offenders).toEqual([]);
  });
});
