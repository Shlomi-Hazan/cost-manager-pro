// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createEmptyTable, recordObservations } from '../../src/lib/fx/rateTable.js';
import { createObservationIndex } from '../../src/lib/fx/observationSelection.js';
import { addDays } from '../../src/lib/fx/ecbParser.js';
import { createHistoricalConverter } from '../../src/lib/reporting/historicalConversion.js';
import { buildYearlyConversion } from '../../src/lib/reporting/historicalReports.js';
import { clientResult } from '../fx/helpers.js';

/*
 * M2B.2 performance: one index per snapshot, then cheap lookups. The bounds
 * are loose on purpose (CI machines are slow); the measured figures are in
 * the PR. The point of the test is the SHAPE: thousands of expenses must not
 * cost thousands of whole-table validations.
 */
function buildTable() {
  const quotes = ['GBP', 'ILS', 'USD'];
  const observations = [];

  for (let date = '2020-01-01'; date <= '2026-12-31'; date = addDays(date, 1)) {
    quotes.forEach((quote) => observations.push({ date, quote, rate: quote === 'USD' ? '1.1' : quote === 'ILS' ? '4' : '0.85' }));
  }

  return recordObservations(createEmptyTable(), clientResult({ observations, quotes, from: '2020-01-01', to: '2026-12-31', fetchedAt: '2027-01-02T00:00:00.000Z' })).table;
}

const costsOf = (count) =>
  Array.from({ length: count }, (_value, index) => ({
    id: String(index),
    sum: '12.34',
    currency: ['USD', 'ILS', 'GBP', 'EUR'][index % 4],
    category: `Cat ${index % 7}`,
    description: 'x',
    date: { day: 1 + (index % 28), month: 1 + (index % 12), year: 2026, hour: 1, minute: 1 }
  }));

describe('performance', () => {
  const table = buildTable();

  it('builds one index and converts a year of 5000 expenses quickly', () => {
    const started = performance.now();
    const index = createObservationIndex(table);
    const built = performance.now();
    const result = buildYearlyConversion(costsOf(5000), createHistoricalConverter({ index, targetCurrency: 'EUR', referenceDate: '2027-01-02' }), 2026);
    const finished = performance.now();

    expect(result.complete).toBe(true);
    expect(result.counts.expenses).toBe(5000);
    console.info(`index ${(built - started).toFixed(1)} ms, 5000-expense year ${(finished - built).toFixed(1)} ms`);
    expect(finished - started).toBeLessThan(3000);
  });

  it('converts a month of 500 expenses quickly from a prepared index', () => {
    const index = createObservationIndex(table);
    const started = performance.now();

    buildYearlyConversion(costsOf(500).filter((cost) => cost.date.month === 3), createHistoricalConverter({ index, targetCurrency: 'USD', referenceDate: '2027-01-02' }), 2026);
    expect(performance.now() - started).toBeLessThan(500);
  });
});
