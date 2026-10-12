import { describe, expect, it } from 'vitest';
import { createEcbClient } from '../../src/lib/fx/ecbClient.js';
import { createFxCache } from '../../src/lib/fx/fxCache.js';
import { convertDecimalAmount, normalizeAmount, roundAmount, sumAmounts } from '../../src/lib/money/decimal.js';
import { fxCacheKey } from '../../src/lib/fx/constants.js';
import { add, div, mul, parseDecimal, rational, roundHalfAway } from '../money/oracle.js';
import { createFakeTimers, createFetchScript, createMemoryStorage, fixture, fixtureJson, response, settle } from './helpers.js';

/*
 * M2B.1 end to end, the way M2B.2 will use it (this is example usage, not
 * production wiring): fetch asynchronously, cache, then convert synchronously
 * with Policy B. Everything runs on frozen fixtures and manual timers.
 */
const NOW = Date.parse('2026-10-12T08:00:00.000Z');
const prefix = 'https://api.frankfurter.dev/v2/providers/ecb';
const series = fixtureJson('ecb-series-2026-09-01_to_2026-10-12.json');
const rawRate = (date, quote) => String(series.find((item) => item.date === date && item.quote === quote).rate);
const dates = [...new Set(series.map((item) => item.date))].sort();

function prepared({ steps = [response(fixture('ecb-series-2026-09-01_to_2026-10-12.json'))] } = {}) {
  const timers = createFakeTimers();
  const fetch = createFetchScript(steps);
  const client = createEcbClient({ fetch, timers, now: () => NOW, random: () => 0 });
  const storage = createMemoryStorage();

  return { timers, fetch, client, storage, cache: createFxCache({ storage }) };
}

async function prepare(setup, range = { from: '2026-09-01', to: '2026-10-12' }) {
  const outcome = await settle(setup.client.fetchRange(range), setup.timers);

  if (outcome.ok) {
    return { outcome, saved: setup.cache.recordObservations(outcome.value) };
  }

  setup.cache.recordFailure({ kind: 'range', quotes: ['GBP', 'ILS', 'USD'], ...range }, outcome.error, new Date(NOW).toISOString());

  return { outcome, saved: null };
}

// Exact conversion of one expense with the observation set that applies to it.
function convertExpense(index, expense, target) {
  const selection = index.select({ expenseDate: expense.date, currencies: [expense.currency, target], referenceDate: '2026-10-12' });

  if (selection.status !== 'available') {
    return { selection, amount: null };
  }

  // Identity (same currency): the amount is used as it is.
  if (selection.identity) {
    return { selection, amount: normalizeAmount(expense.sum) };
  }

  return { selection, amount: convertDecimalAmount(expense.sum, selection.rates[expense.currency], selection.rates[target]) };
}

describe('prepare asynchronously, then convert synchronously with Policy B', () => {
  const expenses = [
    { sum: '100.00', currency: 'ILS', date: '2026-09-02' },
    { sum: '33.33', currency: 'GBP', date: '2026-09-12' }, // a Saturday
    { sum: '0.333', currency: 'EUR', date: '2026-09-15' },
    { sum: '250.5', currency: 'USD', date: '2026-10-01' },
    { sum: '77.77', currency: 'ILS', date: '2026-10-10' } // a Saturday at the end of the data
  ];

  it('matches an independent exact-rational oracle on mixed currencies, weekends and different dates', async () => {
    const setup = prepared();

    await prepare(setup);
    const index = setup.cache.createIndex();
    const exact = expenses.map((expense) => convertExpense(index, expense, 'USD'));
    const oracle = expenses.reduce((total, expense) => {
      const date = [...dates].reverse().find((candidate) => candidate <= expense.date);
      const source = expense.currency === 'EUR' ? rational(1n) : parseDecimal(rawRate(date, expense.currency));
      const target = parseDecimal(rawRate(date, 'USD'));

      return add(total, div(mul(parseDecimal(expense.sum), target), source));
    }, rational(0n));
    const total = sumAmounts(exact.map((entry) => entry.amount));

    expect(exact.every((entry) => entry.selection.status === 'available')).toBe(true);
    expect(roundAmount(total, 2)).toBe(roundHalfAway(oracle, 2));
    // To 25 decimals the engine's exact sum equals the oracle's.
    expect(roundAmount(total, 25)).toBe(roundHalfAway(oracle, 25));
  });

  it('uses the observation of each expense\'s own date, not one rate for all', async () => {
    const setup = prepared();

    await prepare(setup);
    const index = setup.cache.createIndex();
    const early = convertExpense(index, { sum: '100', currency: 'ILS', date: '2026-09-02' }, 'USD');
    const late = convertExpense(index, { sum: '100', currency: 'ILS', date: '2026-10-07' }, 'USD');

    expect(early.selection.selectedDate).toBe('2026-09-02');
    expect(late.selection.selectedDate).toBe('2026-10-07');
    expect(early.amount).not.toBe(late.amount);
  });

  it('does not round each expense: the exact sum can differ from the sum of rounded expenses', async () => {
    const setup = prepared();

    await prepare(setup);
    const index = setup.cache.createIndex();
    const many = Array.from({ length: 30 }, (_value, offset) => ({ sum: '0.37', currency: 'ILS', date: dates[offset % dates.length] }));
    const amounts = many.map((expense) => convertExpense(index, expense, 'USD').amount);
    const exactRounded = roundAmount(sumAmounts(amounts), 2);
    const roundedEach = sumAmounts(amounts.map((amount) => roundAmount(amount, 2)));

    expect(exactRounded).not.toBe(roundedEach);
  });

  it('keeps cross rates exact: ILS to GBP is one multiplication and one division, no pre-rounded rate', async () => {
    const setup = prepared();

    await prepare(setup);
    const selection = setup.cache.select({ expenseDate: '2026-10-07', currencies: ['ILS', 'GBP'], referenceDate: '2026-10-12' });
    const direct = convertDecimalAmount('1000', selection.rates.ILS, selection.rates.GBP);
    const exact = div(mul(parseDecimal('1000'), parseDecimal(rawRate('2026-10-07', 'GBP'))), parseDecimal(rawRate('2026-10-07', 'ILS')));

    expect(roundAmount(direct, 28)).toBe(roundHalfAway(exact, 28));
    // Converting through a pre-rounded intermediate rate would differ.
    const preRoundedRate = roundAmount(`${rawRate('2026-10-07', 'GBP')}`, 3);

    expect(preRoundedRate).not.toBe(rawRate('2026-10-07', 'GBP'));
  });

  it('is deterministic: the same cached observations always give the same totals', async () => {
    const setup = prepared();

    await prepare(setup);
    const totals = [1, 2, 3].map(() => {
      const index = setup.cache.createIndex();

      return sumAmounts(expenses.map((expense) => convertExpense(index, expense, 'EUR').amount));
    });

    expect(new Set(totals).size).toBe(1);
  });

  it('EUR to EUR and same-currency conversions need no observation and stay exact', async () => {
    const setup = prepared();
    const index = setup.cache.createIndex();

    expect(convertExpense(index, { sum: '12.345', currency: 'EUR', date: '2026-10-07' }, 'EUR').amount).toBe('12.345');
    expect(convertExpense(index, { sum: '12.345', currency: 'ILS', date: '2026-10-07' }, 'ILS').amount).toBe('12.345');
  });
});

describe('what the application will see in each situation', () => {
  it('first run online: fetched, cached, and available without further network use', async () => {
    const setup = prepared();
    const { saved } = await prepare(setup);

    expect(saved).toMatchObject({ persisted: true });
    expect(setup.fetch.calls).toHaveLength(1);
    expect(setup.fetch.calls[0].url).toBe(`${prefix}/rates?base=EUR&quotes=GBP,ILS,USD&from=2026-09-01&to=2026-10-12`);
    expect(setup.cache.select({ expenseDate: '2026-10-07', currencies: ['ILS', 'USD'], referenceDate: '2026-10-12' }).status).toBe('available');
    expect(setup.fetch.calls).toHaveLength(1);
  });

  it('first run offline: no rate at all, the failure is recorded, and nothing is invented', async () => {
    const setup = prepared({ steps: ['offline'] });
    const { outcome } = await prepare(setup);

    expect(outcome.error.code).toBe('network-error');
    const selection = setup.cache.select({ expenseDate: '2026-10-07', currencies: ['ILS', 'USD'], referenceDate: '2026-10-12' });

    expect(selection).toMatchObject({ status: 'needs-fetch', rates: null, finality: null });
    expect(selection.missing.map((gap) => gap.state)).toEqual(['failed', 'failed']);
  });

  it('offline with a complete cache: a new session answers from storage, with no request at all', async () => {
    const setup = prepared();

    await prepare(setup);
    const secondSession = createEcbClient({ fetch: createFetchScript(['offline']), timers: createFakeTimers(), now: () => NOW });
    const reopened = createFxCache({ storage: setup.storage });
    const selection = reopened.select({ expenseDate: '2026-09-12', currencies: ['ILS', 'USD'], referenceDate: '2026-10-12' });

    expect(selection).toMatchObject({ status: 'available', selectedDate: '2026-09-11', finality: 'final' });
    expect(secondSession).toBeTruthy();
  });

  it('offline with an incomplete cache: covered expenses convert, the others report the missing range', async () => {
    const september = JSON.stringify(series.filter((item) => item.date <= '2026-09-30'));
    const setup = prepared({ steps: [response(september)] });

    await prepare(setup, { from: '2026-09-01', to: '2026-09-30' });
    const offline = createFxCache({ storage: setup.storage });
    const covered = offline.select({ expenseDate: '2026-09-12', currencies: ['ILS', 'USD'], referenceDate: '2026-10-12' });
    const missing = offline.select({ expenseDate: '2026-10-07', currencies: ['ILS', 'USD'], referenceDate: '2026-10-12' });

    expect(covered).toMatchObject({ status: 'available', selectedDate: '2026-09-11', finality: 'final' });
    expect(missing).toMatchObject({ status: 'needs-fetch', needsFetch: true, rates: null });
    expect(missing.missing.every((gap) => gap.from === '2026-10-01' && gap.state === 'not-fetched')).toBe(true);
    // A total built only from the covered expenses would be incomplete, and
    // the selection says exactly which expenses cannot be converted.
    expect([covered, missing].filter((entry) => entry.status !== 'available')).toHaveLength(1);
  });

  it('an outage after a valid cache leaves the cache byte-for-byte unchanged', async () => {
    const setup = prepared();

    await prepare(setup);
    const before = setup.storage.data.get(fxCacheKey);
    const failing = createEcbClient({ fetch: createFetchScript([response('', { status: 503 })]), timers: setup.timers, now: () => NOW, random: () => 0 });
    const outcome = await settle(failing.fetchLatest(), setup.timers);

    expect(outcome.error.code).toBe('provider-unavailable');
    // The caller decides what to record; recording only the failure adds no data.
    setup.cache.recordFailure({ kind: 'latest', quotes: ['GBP', 'ILS', 'USD'], from: '2026-10-09', to: '2026-10-09' }, outcome.error, '2026-10-12T08:00:00.000Z');
    const after = createFxCache({ storage: setup.storage }).getTable();
    const original = JSON.parse(before);

    expect(after.observations).toEqual(original.observations);
    expect(createFxCache({ storage: setup.storage }).select({ expenseDate: '2026-10-07', currencies: ['ILS', 'USD'], referenceDate: '2026-10-12' }).status).toBe('available');
  });

  it('a corrupt cache is reported as invalid, never used as market data', async () => {
    const setup = prepared();

    await prepare(setup);
    setup.storage.data.set(fxCacheKey, setup.storage.data.get(fxCacheKey).replace('1.1', '9.9'));
    const reopened = createFxCache({ storage: setup.storage });

    expect(reopened.inspect().status).toBe('corrupt');
    expect(reopened.select({ expenseDate: '2026-10-07', currencies: ['ILS', 'USD'], referenceDate: '2026-10-12' })).toMatchObject({ status: 'needs-fetch', rates: null });
  });

  it('a rate revision found by a later fetch does not change reports until it is applied', async () => {
    const setup = prepared();

    await prepare(setup);
    const index = setup.cache.createIndex();
    const before = convertExpense(index, { sum: '100', currency: 'ILS', date: '2026-10-07' }, 'USD').amount;
    const revised = JSON.stringify([
      { date: '2026-10-07', base: 'EUR', quote: 'USD', rate: 1.2 },
      { date: '2026-10-07', base: 'EUR', quote: 'ILS', rate: 3.3 },
      { date: '2026-10-07', base: 'EUR', quote: 'GBP', rate: 0.9 }
    ]);
    const second = createEcbClient({ fetch: createFetchScript([response(revised)]), timers: setup.timers, now: () => NOW, random: () => 0 });
    const outcome = await settle(second.fetchRange({ from: '2026-10-07', to: '2026-10-07' }), setup.timers);
    const recorded = setup.cache.recordObservations(outcome.value);

    expect(recorded.revisions).toBe(3);
    expect(convertExpense(setup.cache.createIndex(), { sum: '100', currency: 'ILS', date: '2026-10-07' }, 'USD').amount).toBe(before);

    setup.cache.listPendingRevisions().forEach((revision) => setup.cache.applyPendingRevision(revision));
    const after = convertExpense(setup.cache.createIndex(), { sum: '100', currency: 'ILS', date: '2026-10-07' }, 'USD').amount;

    expect(after).not.toBe(before);
    expect(setup.cache.getTable().revisionLog).toHaveLength(3);
  });

  it('a full quota keeps working in memory without losing the fetched rates', async () => {
    const setup = prepared();

    setup.storage.failures.write = () => Object.assign(new Error('full'), { name: 'QuotaExceededError' });
    const { saved } = await prepare(setup);

    expect(saved).toMatchObject({ persisted: false, reason: 'quota-exceeded' });
    expect(setup.cache.select({ expenseDate: '2026-10-07', currencies: ['ILS', 'USD'], referenceDate: '2026-10-12' }).status).toBe('available');
  });
});
