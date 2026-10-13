// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createFxCache } from '../../src/lib/fx/fxCache.js';
import { createHistoricalConverter, convertCosts } from '../../src/lib/reporting/historicalConversion.js';
import { applyRevision, getChangedUsedRates, keepRevision } from '../../src/services/fxRatesService.js';
import { prepareHistoricalRates } from '../../src/services/historicalRatesService.js';
import { buildFxStatus } from '../../src/lib/reporting/fxAvailability.js';
import { clientResult, createMemoryStorage } from './helpers.js';

/*
 * M2B.3 hardening. (1) A report says "rates changed" only when a rate IT USED
 * now has a different accepted value. (2) "Keep current" is decided against the
 * latest stored table inside the cache's own commit, with the full identity.
 */
const rec = (cache, date, quote, rate, at = '2026-10-10T08:00:00.000Z') =>
  cache.recordObservations(clientResult({ observations: [{ date, quote, rate }], quotes: [quote], from: date, to: date, fetchedAt: at }));
const revise = (cache, date, quote, rate) => rec(cache, date, quote, rate, '2026-10-13T08:00:00.000Z');
const cost = (id, currency, day, month = 10) => ({ id, sum: '120', currency, category: 'Food', date: { day, month, year: 2026, hour: 1, minute: 1 } });
const NOW = () => Date.parse('2026-10-13T08:00:00Z');

async function report(cache, costs, target = 'EUR') {
  const prepared = await prepareHistoricalRates({ costs, targetCurrency: target, referenceDate: '2026-10-13', cache, client: { fetchRange: () => { throw new Error('offline'); } }, now: NOW });
  const converter = createHistoricalConverter({ index: prepared.index, targetCurrency: target, referenceDate: '2026-10-13' });
  const result = convertCosts(costs, converter);
  const status = buildFxStatus({ prepared, items: result.items, summary: result, targetCurrency: target });

  return { prepared, result, status };
}

describe('which rates a report used', () => {
  it('records exactly the (currency, observation date, rate) triples behind the figures', async () => {
    const cache = createFxCache({ storage: createMemoryStorage() });

    rec(cache, '2026-10-09', 'USD', '1.25');
    rec(cache, '2026-10-09', 'GBP', '0.9');
    const { status } = await report(cache, [cost('a', 'USD', 9)]);

    expect(status.usedObservations).toEqual([{ quote: 'USD', date: '2026-10-09', rate: '1.25' }]);
  });

  it('is null when no rate was involved (same-currency report)', async () => {
    const cache = createFxCache({ storage: createMemoryStorage() });
    const { status } = await report(cache, [cost('a', 'EUR', 9)]);

    expect(status.usedObservations).toBeNull();
  });
});

describe('getChangedUsedRates', () => {
  const setup = () => {
    const cache = createFxCache({ storage: createMemoryStorage() });

    ['USD', 'GBP'].forEach((quote) => rec(cache, '2026-10-09', quote, quote === 'USD' ? '1.25' : '0.9'));
    rec(cache, '2026-10-02', 'USD', '1.2');

    return cache;
  };

  it('is false for an unrelated currency or an unrelated date, even after accepted revisions', () => {
    const cache = setup();
    const used = [{ quote: 'USD', date: '2026-10-09', rate: '1.25' }];

    revise(cache, '2026-10-09', 'GBP', '0.95');
    revise(cache, '2026-10-02', 'USD', '1.3');
    applyRevision({ quote: 'GBP', date: '2026-10-09', accepted: '0.9', candidate: '0.95' }, { cache });
    applyRevision({ quote: 'USD', date: '2026-10-02', accepted: '1.2', candidate: '1.3' }, { cache });

    expect(cache.getTable().revisionLog).toHaveLength(2);
    expect(getChangedUsedRates(used, { cache })).toBe(false);
  });

  it('is false while a proposal is only pending, true once the used rate itself is accepted', () => {
    const cache = setup();
    const used = [{ quote: 'USD', date: '2026-10-09', rate: '1.25' }];

    revise(cache, '2026-10-09', 'USD', '1.3');
    expect(getChangedUsedRates(used, { cache })).toBe(false);
    applyRevision({ quote: 'USD', date: '2026-10-09', accepted: '1.25', candidate: '1.3' }, { cache });
    expect(getChangedUsedRates(used, { cache })).toBe(true);
  });

  it('sees a change made through a different cache instance (another tab) on the same storage', () => {
    const storage = createMemoryStorage();
    const mine = createFxCache({ storage });
    const other = createFxCache({ storage });

    rec(mine, '2026-10-09', 'USD', '1.25');
    revise(other, '2026-10-09', 'USD', '1.3');
    applyRevision({ quote: 'USD', date: '2026-10-09', accepted: '1.25', candidate: '1.3' }, { cache: other });

    expect(getChangedUsedRates([{ quote: 'USD', date: '2026-10-09', rate: '1.25' }], { cache: mine })).toBe(true);
  });

  it('is not fooled by an unrelated change that leaves the used value as it was, and ignores a missing observation', () => {
    const cache = setup();

    expect(getChangedUsedRates([{ quote: 'USD', date: '2026-10-09', rate: '1.25' }], { cache })).toBe(false);
    expect(getChangedUsedRates([{ quote: 'ILS', date: '2026-01-01', rate: '3' }], { cache })).toBe(false);
    expect(getChangedUsedRates([], { cache })).toBe(false);
    expect(getChangedUsedRates(null, { cache })).toBe(false);
  });

  it('two reports with disjoint observations: only the affected one is flagged, and both keep their figures', async () => {
    const cache = setup();
    const a = await report(cache, [cost('a', 'USD', 9)]);
    const b = await report(cache, [cost('b', 'USD', 2)]);

    revise(cache, '2026-10-09', 'USD', '1.3');
    applyRevision({ quote: 'USD', date: '2026-10-09', accepted: '1.25', candidate: '1.3' }, { cache });

    expect(getChangedUsedRates(a.status.usedObservations, { cache })).toBe(true);
    expect(getChangedUsedRates(b.status.usedObservations, { cache })).toBe(false);
    // Snapshots: the figures already computed are unchanged.
    expect(a.result.total).toBe('96');
    expect(b.result.total).toBe('100');
  });
});

describe('keep current is decided inside the commit against the latest table', () => {
  const full = { quote: 'USD', date: '2026-10-09', accepted: '1.25', candidate: '1.3' };

  function twoTabs() {
    const storage = createMemoryStorage();
    const first = createFxCache({ storage });
    const second = createFxCache({ storage });

    rec(first, '2026-10-09', 'USD', '1.25');
    revise(first, '2026-10-09', 'USD', '1.3');

    return { first, second };
  }

  it('dismisses the proposal when the identity still matches', () => {
    const { first } = twoTabs();

    expect(keepRevision(full, { cache: first }).outcome).toBe('kept');
    expect(first.listPendingRevisions()).toEqual([]);
    expect(first.getTable().revisionLog).toEqual([]);
  });

  it('a stale Keep (list drawn before another tab replaced the proposal) does NOT remove the newer proposal', () => {
    const { first, second } = twoTabs();

    // Tab 1 drew the list with candidate 1.3. Tab 2 then dismisses it and a newer proposal (1.4) arrives.
    second.discardPendingRevision({ ...full });
    revise(second, '2026-10-09', 'USD', '1.4');

    // Tab 1 now clicks Keep on the OLD row.
    const result = keepRevision(full, { cache: first });

    expect(result.outcome).toBe('conflict');
    expect(first.listPendingRevisions()).toMatchObject([{ candidate: '1.4' }]);
    expect(second.listPendingRevisions()).toMatchObject([{ candidate: '1.4' }]);
  });

  it('the check happens in the cache commit itself: a stale view of the proposal cannot dismiss a newer one', () => {
    const { first, second } = twoTabs();

    // The caller holds a stale view (candidate 1.3) while the stored table has 1.4 only.
    second.discardPendingRevision({ ...full });
    revise(second, '2026-10-09', 'USD', '1.4');
    const direct = first.discardPendingRevision({ ...full });

    expect(direct.outcome).toBe('conflict');
    expect(first.listPendingRevisions()).toMatchObject([{ candidate: '1.4' }]);
  });

  it('reports not-found when the proposal was already handled, and never touches other proposals', () => {
    const { first, second } = twoTabs();

    rec(first, '2026-10-02', 'USD', '1.2');
    revise(first, '2026-10-02', 'USD', '1.21');
    second.discardPendingRevision({ ...full });

    expect(keepRevision(full, { cache: first }).outcome).toBe('not-found');
    expect(first.listPendingRevisions()).toMatchObject([{ date: '2026-10-02', candidate: '1.21' }]);
  });

  it('keeping one candidate leaves a different pending candidate for the same date alone', () => {
    const { first } = twoTabs();

    revise(first, '2026-10-09', 'USD', '1.4');
    expect(first.listPendingRevisions()).toHaveLength(2);
    expect(keepRevision(full, { cache: first }).outcome).toBe('kept');
    expect(first.listPendingRevisions()).toMatchObject([{ candidate: '1.4' }]);
  });

  it('a stale Keep after the accepted value changed is a conflict (nothing removed)', () => {
    const { first, second } = twoTabs();

    applyRevision(full, { cache: second });
    revise(second, '2026-10-09', 'USD', '1.5');

    expect(keepRevision(full, { cache: first }).outcome).toBe('conflict');
    expect(keepRevision({ ...full, accepted: '1.25', candidate: '1.5' }, { cache: first }).outcome).toBe('conflict');
    expect(first.listPendingRevisions()).toMatchObject([{ accepted: '1.3', candidate: '1.5' }]);
    expect(first.getTable().revisionLog).toHaveLength(1);
  });

  it('Apply semantics are unchanged: identity-checked, history kept, never automatic', () => {
    const { first } = twoTabs();

    expect(first.getTable().observations.USD['2026-10-09'][0]).toBe('1.25');
    expect(applyRevision({ ...full, candidate: '9' }, { cache: first }).outcome).toBe('conflict');
    expect(applyRevision(full, { cache: first }).outcome).toBe('applied');
    expect(first.getTable().revisionLog).toMatchObject([{ previous: '1.25', current: '1.3' }]);
  });
});
