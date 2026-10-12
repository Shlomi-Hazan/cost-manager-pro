// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { FxError, fxErrorCodes } from '../../src/lib/fx/fxErrors.js';
import { createFxCache } from '../../src/lib/fx/fxCache.js';
import { createHistoricalConverter, convertCosts } from '../../src/lib/reporting/historicalConversion.js';
import { prepareHistoricalRates } from '../../src/services/historicalRatesService.js';
import { clientResult, createMemoryStorage, quota } from '../fx/helpers.js';

const cost = (id, currency, day, month = 8, year = 2026) => ({ id, sum: '120', currency, category: 'Food', date: { day, month, year, hour: 1, minute: 1 } });
const base = { referenceDate: '2026-10-12', now: () => Date.parse('2026-10-12T08:00:00Z') };
const cacheOn = (storage = createMemoryStorage()) => ({ storage, cache: createFxCache({ storage }) });
const convert = (costs, prepared) => convertCosts(costs, createHistoricalConverter({ index: prepared.index, targetCurrency: 'EUR', referenceDate: base.referenceDate }));

// A provider with ONE observation (2026-08-01, USD 1.2) and nothing after it
// until 2026-09-15: a gap far longer than the 7-day lookback.
function gappedClient() {
  const data = [{ date: '2026-08-01', quote: 'USD', rate: '1.2' }, { date: '2026-09-15', quote: 'USD', rate: '1.5' }];

  return {
    fetchRange: vi.fn(async ({ from, to, quotes }) => {
      const observations = data.filter((o) => o.date >= from && o.date <= to && quotes.includes(o.quote));

      if (observations.length === 0) {
        throw new FxError(fxErrorCodes.emptyResponse, 'none');
      }

      return clientResult({ observations, quotes, from, to });
    })
  };
}

describe('lookback longer than a week', () => {
  it('uses an earlier observation across a 19-day gap, never a later one, in bounded requests', async () => {
    const { cache } = cacheOn();
    const client = gappedClient();
    const costs = [cost('a', 'USD', 20)];
    const prepared = await prepareHistoricalRates({ ...base, costs, targetCurrency: 'EUR', cache, client });
    const result = convert(costs, prepared);

    expect(result.items[0]).toMatchObject({ status: 'converted', observationDate: '2026-08-01' });
    expect(result.total).toBe('100');
    expect(client.fetchRange.mock.calls.length).toBeLessThanOrEqual(3);

    // A second report is served from the cache.
    const calls = client.fetchRange.mock.calls.length;

    await prepareHistoricalRates({ ...base, costs, targetCurrency: 'EUR', cache, client });
    expect(client.fetchRange.mock.calls.length).toBe(calls);
  });

  it('stays unavailable (no invented rate, bounded requests) when no observation exists in the extended window', async () => {
    const { cache } = cacheOn();
    const client = gappedClient();
    const costs = [cost('a', 'USD', 20, 3)];
    const prepared = await prepareHistoricalRates({ ...base, costs, targetCurrency: 'EUR', cache, client });

    expect(convert(costs, prepared).total).toBeNull();
    expect(client.fetchRange.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it('does not use an observation after the expense date', async () => {
    const { cache } = cacheOn();
    const costs = [cost('a', 'USD', 10, 9)];
    const prepared = await prepareHistoricalRates({ ...base, costs, targetCurrency: 'EUR', cache, client: gappedClient() });
    const item = convert(costs, prepared).items[0];

    expect(item.observationDate).toBe('2026-08-01');
  });
});

describe('concurrent identical requests', () => {
  const answer = ({ from, to, quotes }) => clientResult({ observations: [{ date: '2026-08-07', quote: 'USD', rate: '1.2' }].filter(() => from <= '2026-08-07' && to >= '2026-08-07'), quotes, from, to });
  const costs = [cost('a', 'USD', 7)];

  it('separate caches each receive the observations', async () => {
    const one = cacheOn();
    const two = cacheOn();
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const client = { fetchRange: vi.fn(async (args) => { await gate; return answer(args); }) };
    const a = prepareHistoricalRates({ ...base, costs, targetCurrency: 'EUR', cache: one.cache, client });
    const b = prepareHistoricalRates({ ...base, costs, targetCurrency: 'EUR', cache: two.cache, client });

    await Promise.resolve();
    release();
    const [ra, rb] = await Promise.all([a, b]);

    expect(convert(costs, ra).total).toBe('100');
    expect(convert(costs, rb).total).toBe('100');
    expect(two.storage.writes()).toBeGreaterThan(0);
  });

  it("one caller's persistence failure is reported only to that caller", async () => {
    const one = cacheOn();
    const bad = cacheOn();

    bad.storage.failures.write = quota;
    const client = { fetchRange: vi.fn(async (args) => answer(args)) };
    const [ra, rb] = await Promise.all([
      prepareHistoricalRates({ ...base, costs, targetCurrency: 'EUR', cache: one.cache, client }),
      prepareHistoricalRates({ ...base, costs, targetCurrency: 'EUR', cache: bad.cache, client })
    ]);

    expect(ra.requests[0].persisted).toBe(true);
    expect(rb.requests[0]).toMatchObject({ persisted: false, persistReason: 'quota-exceeded' });
    expect(convert(costs, rb).total).toBe('100');
  });

  it('a cancelled caller does not break the other', async () => {
    const one = cacheOn();
    const two = cacheOn();
    const controller = new AbortController();
    const client = { fetchRange: vi.fn(async ({ signal, ...args }) => {
      if (signal?.aborted) { throw new FxError(fxErrorCodes.aborted, 'aborted'); }
      return answer(args);
    }) };

    controller.abort();
    const [ra, rb] = await Promise.all([
      prepareHistoricalRates({ ...base, costs, targetCurrency: 'EUR', cache: one.cache, client, signal: controller.signal }),
      prepareHistoricalRates({ ...base, costs, targetCurrency: 'EUR', cache: two.cache, client })
    ]);

    expect(ra.requests).toEqual([]);
    expect(convert(costs, rb).total).toBe('100');
  });
});
