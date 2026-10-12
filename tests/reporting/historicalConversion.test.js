// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createEmptyTable, recordObservations } from '../../src/lib/fx/rateTable.js';
import { createObservationIndex } from '../../src/lib/fx/observationSelection.js';
import { buildCategoryBreakdown, buildMonthlyConversion, buildYearlyConversion } from '../../src/lib/reporting/historicalReports.js';
import { createHistoricalConverter, convertCosts, toIsoDate } from '../../src/lib/reporting/historicalConversion.js';
import { clientResult } from '../fx/helpers.js';

/*
 * M2B.2 core: every figure is compared with an independent oracle that uses
 * BigInt scaled integers and rational arithmetic (no big.js), so a shared
 * mistake in the production decimal code cannot hide.
 */
const FETCHED = '2026-10-12T08:00:00.000Z';

// Frozen EUR-base ECB observations (synthetic values).
const rates = {
  '2026-08-06': { USD: '1.1', ILS: '4', GBP: '0.85' }, // Thursday
  '2026-08-07': { USD: '1.2', ILS: '4.2', GBP: '0.86' }, // Friday
  '2026-08-10': { USD: '1.25', ILS: '4.5', GBP: '0.87' }, // Monday
  '2026-09-01': { USD: '1.3', ILS: '4.8', GBP: '0.88' }
};

function buildTable({ withIls = true, covered = { from: '2026-08-01', to: '2026-09-30' } } = {}) {
  const observations = Object.entries(rates).flatMap(([date, perQuote]) =>
    Object.entries(perQuote)
      .filter(([quote]) => withIls || quote !== 'ILS')
      .map(([quote, rate]) => ({ date, quote, rate }))
  );
  const quotes = withIls ? ['GBP', 'ILS', 'USD'] : ['GBP', 'USD'];

  return recordObservations(createEmptyTable(), clientResult({ observations, quotes, from: covered.from, to: covered.to, fetchedAt: FETCHED })).table;
}

function cost(id, sum, currency, day, month = 8, year = 2026, category = 'Food') {
  return { id, sum, currency, category, description: id, date: { day, month, year, hour: 9, minute: 0 } };
}

const converterFor = (target, table = buildTable(), referenceDate = '2026-10-12') =>
  createHistoricalConverter({ index: createObservationIndex(table), targetCurrency: target, referenceDate });

// ---- independent oracle -------------------------------------------------
function toRational(text) {
  const [whole, fraction = ''] = text.replace('-', '').split('.');
  const sign = text.startsWith('-') ? -1n : 1n;

  return { n: sign * BigInt(whole + fraction), d: 10n ** BigInt(fraction.length) };
}

function oracleConvert(sum, from, to, day) {
  const observation = rates[day];
  const rate = (code) => (code === 'EUR' ? { n: 1n, d: 1n } : toRational(observation[code]));
  const amount = toRational(sum);

  if (from === to) {
    return amount;
  }

  // amount[from] / EURper(from) * EURper(to)
  const f = rate(from);
  const t = rate(to);

  return { n: amount.n * f.d * t.n, d: amount.d * f.n * t.d };
}

function addRational(a, b) {
  return { n: a.n * b.d + b.n * a.d, d: a.d * b.d };
}

function roundHalfAwayCents(value) {
  const sign = value.n < 0n ? -1n : 1n;
  const n = value.n < 0n ? -value.n : value.n;
  const cents = (n * 100n * 2n + value.d) / (value.d * 2n);

  return `${sign < 0n && cents !== 0n ? '-' : ''}${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}

function fromAmount(text) {
  return toRational(text);
}

function format(text) {
  return roundHalfAwayCents(fromAmount(text));
}

describe('per-expense dated selection', () => {
  const run = (costs, target = 'EUR', table) => convertCosts(costs, converterFor(target, table));

  it('uses the same-day observation', () => {
    const result = run([cost('a', '120', 'USD', 7)]);

    expect(result.items[0]).toMatchObject({ status: 'converted', observationDate: '2026-08-07' });
    expect(format(result.total)).toBe(roundHalfAwayCents(oracleConvert('120', 'USD', 'EUR', '2026-08-07')));
  });

  it('uses the preceding business day for a Saturday and a Sunday, never a later one', () => {
    const result = run([cost('sat', '120', 'USD', 8), cost('sun', '120', 'USD', 9)]);

    expect(result.items.map((item) => item.observationDate)).toEqual(['2026-08-07', '2026-08-07']);
    expect(result.items.every((item) => item.observationDate <= item.expenseDate)).toBe(true);
  });

  it('converts each expense with its own date (multi-date)', () => {
    const costs = [cost('a', '110', 'USD', 6), cost('b', '120', 'USD', 7), cost('c', '125', 'USD', 10)];
    const result = run(costs);
    const expected = costs.reduce(
      (sum, item, position) => addRational(sum, oracleConvert(item.sum, 'USD', 'EUR', ['2026-08-06', '2026-08-07', '2026-08-10'][position])),
      { n: 0n, d: 1n }
    );

    expect(result.complete).toBe(true);
    expect(format(result.total)).toBe(roundHalfAwayCents(expected));
    expect(result.observation).toMatchObject({ firstDate: '2026-08-06', lastDate: '2026-08-10', provisional: false });
  });

  it.each([
    ['USD', 'ILS'],
    ['ILS', 'USD'],
    ['GBP', 'USD'],
    ['USD', 'GBP'],
    ['EUR', 'ILS'],
    ['ILS', 'EUR']
  ])('crosses %s to %s exactly like the oracle', (from, to) => {
    const result = run([cost('x', '123.45', from, 7)], to);

    expect(format(result.total)).toBe(roundHalfAwayCents(oracleConvert('123.45', from, to, '2026-08-07')));
  });

  it('keeps EUR exactly 1 and same-currency amounts untouched, with no rate lookup', () => {
    const throwing = { select: () => { throw new Error('no lookup expected'); } };
    const converter = createHistoricalConverter({ index: throwing, targetCurrency: 'USD', referenceDate: '2026-10-12' });
    const result = convertCosts([cost('a', '10.005', 'USD', 7), cost('b', '0.1', 'USD', 8)], converter);

    expect(result.total).toBe('10.105');
    expect(result.usesRates).toBe(false);
    expect(result.observation).toBeNull();
  });

  it('works for same-currency reports with no rate index at all (offline)', () => {
    const converter = createHistoricalConverter({ index: null, targetCurrency: 'USD' });

    expect(convertCosts([cost('a', '5', 'USD', 7)], converter).total).toBe('5');
  });

  it('does not round per expense (Policy B)', () => {
    // 1/3 USD-ish: three conversions must sum before rounding.
    const costs = [cost('a', '10', 'ILS', 7), cost('b', '10', 'ILS', 7), cost('c', '10', 'ILS', 7)];
    const result = run(costs, 'USD');
    const expected = costs.reduce((sum, item) => addRational(sum, oracleConvert(item.sum, 'ILS', 'USD', '2026-08-07')), { n: 0n, d: 1n });

    expect(format(result.total)).toBe(roundHalfAwayCents(expected));
  });

  it('handles negative, zero and tiny legacy amounts', () => {
    const costs = [cost('n', '-50', 'USD', 7), cost('z', '0', 'USD', 7), cost('t', '0.000001', 'USD', 7)];
    const result = run(costs);
    const expected = costs.reduce((sum, item) => addRational(sum, oracleConvert(item.sum, 'USD', 'EUR', '2026-08-07')), { n: 0n, d: 1n });

    expect(format(result.total)).toBe(roundHalfAwayCents(expected));
  });

  it('marks a current-day conversion provisional when only an earlier observation exists', () => {
    const table = buildTable({ covered: { from: '2026-08-01', to: '2026-09-02' } });
    const result = convertCosts([cost('today', '100', 'USD', 2, 9)], converterFor('EUR', table, '2026-09-02'));

    expect(result.items[0]).toMatchObject({ status: 'converted', observationDate: '2026-09-01', finality: 'provisional' });
    expect(result.observation.provisional).toBe(true);
  });
});

describe('no partial totals, no invented rates', () => {
  it('has NO total when any expense cannot be converted, and lists exactly those', () => {
    const costs = [cost('ok', '100', 'USD', 7), cost('before', '100', 'USD', 7, 1, 1990), cost('future', '100', 'USD', 20, 12, 2026)];
    const result = convertCosts(costs, converterFor('EUR'));

    expect(result.complete).toBe(false);
    expect(result.total).toBeNull();
    expect(result.counts).toMatchObject({ expenses: 3, converted: 1, unavailable: 2 });
    expect(result.unavailable.map((item) => item.id).sort()).toEqual(['before', 'future']);
    expect(result.unavailableReasons).toEqual(['before-provider-history', 'future-date']);
    expect(result.items.find((item) => item.id === 'before').amount).toBeNull();
  });

  it('reports a currency with no history as unavailable, not as 0 or 1', () => {
    const result = convertCosts([cost('a', '100', 'ILS', 7)], converterFor('USD', buildTable({ withIls: false })));

    expect(result.total).toBeNull();
    expect(result.items[0].amount).toBeNull();
  });

  it('treats a missing prepared index as unavailable for cross-currency expenses', () => {
    const converter = createHistoricalConverter({ index: null, targetCurrency: 'EUR' });
    const result = convertCosts([cost('a', '1', 'USD', 7)], converter);

    expect(result.total).toBeNull();
    expect(result.unavailableReasons).toEqual(['rates-not-prepared']);
  });

  it('treats uncovered (never fetched) dates as unavailable', () => {
    const table = buildTable({ covered: { from: '2026-09-01', to: '2026-09-30' } });
    const result = convertCosts([cost('a', '1', 'USD', 7)], converterFor('EUR', table));

    expect(result.total).toBeNull();
    expect(result.unavailableReasons).toEqual(['rates-not-available']);
  });

  it('never modifies the stored expenses', () => {
    const costs = [cost('a', '100', 'USD', 7)];
    const before = JSON.stringify(costs);

    convertCosts(costs, converterFor('EUR'));
    expect(JSON.stringify(costs)).toBe(before);
  });
});

describe('monthly, yearly and category parity', () => {
  const costs = [
    cost('a', '110', 'USD', 6, 8, 2026, 'Food'),
    cost('b', '420', 'ILS', 7, 8, 2026, 'food'),
    cost('c', '85', 'GBP', 10, 8, 2026, 'Rent'),
    cost('d', '130', 'USD', 1, 9, 2026, 'Food')
  ];
  const converter = converterFor('EUR');
  const month = (m) => buildMonthlyConversion(costs.filter((item) => item.date.month === m), converter);
  const year = buildYearlyConversion(costs, converter, 2026);

  it('annual month equals the monthly report, exactly', () => {
    expect(year.months[7].amount).toBe(month(8).total);
    expect(year.months[8].amount).toBe(month(9).total);
  });

  it('annual total equals the sum of the months, and matches the oracle', () => {
    const expected = [
      oracleConvert('110', 'USD', 'EUR', '2026-08-06'),
      oracleConvert('420', 'ILS', 'EUR', '2026-08-07'),
      oracleConvert('85', 'GBP', 'EUR', '2026-08-10'),
      oracleConvert('130', 'USD', 'EUR', '2026-09-01')
    ].reduce(addRational, { n: 0n, d: 1n });

    expect(year.complete).toBe(true);
    expect(format(year.totalAmount)).toBe(roundHalfAwayCents(expected));
  });

  it('the pie reconciles with the monthly report and groups categories case-insensitively', () => {
    const pie = buildCategoryBreakdown(month(8));

    expect(pie.status).toBe('complete');
    expect(pie.totalAmount).toBe(month(8).total);
    expect(pie.entries.map((entry) => entry.category).sort()).toEqual(['Food', 'Rent']);
  });

  it('distinguishes empty months (valid zero) from complete ones', () => {
    expect(year.months[0]).toMatchObject({ status: 'empty', amount: '0' });
    expect(year.months[7].status).toBe('complete');
  });

  it('shows an unavailable month as incomplete with no amount and no annual total', () => {
    const broken = buildYearlyConversion([...costs, cost('old', '1', 'USD', 7, 3, 2026)], converter, 2026);

    expect(broken.months[2]).toMatchObject({ status: 'incomplete', amount: null, total: null });
    expect(broken.complete).toBe(false);
    expect(broken.totalAmount).toBeNull();
    expect(broken.unavailableMonths).toEqual([3]);
    expect(broken.months[7].status).toBe('complete');
  });

  it('gives no pie for an incomplete conversion', () => {
    const broken = buildMonthlyConversion([cost('old', '1', 'USD', 7, 3, 2026)], converter);

    expect(buildCategoryBreakdown(broken)).toEqual({ status: 'unavailable', totalAmount: null, entries: [] });
  });
});

describe('helpers', () => {
  it('formats a stored date as an ISO local date', () => {
    expect(toIsoDate({ year: 2026, month: 8, day: 7 })).toBe('2026-08-07');
  });
});
