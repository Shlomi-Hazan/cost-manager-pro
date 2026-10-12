import { describe, expect, it, vi } from 'vitest';
import {
  yearlyMonths,
  buildYearlyMonthlyTotals
} from '../../src/utils/yearlyAggregation.js';

/*
 * Course requirement (R-080/R-081): protects the yearly Bar Chart's most
 * important structural guarantee — ALWAYS exactly 12 entries, in
 * January-December order, with zero-total months included rather than
 * omitted, using a fake report function so this stays independent of
 * db.js/localStorage.
 */
function createReport(total, currency = 'USD') {
  return {
    year: 2026,
    month: 1,
    costs: [],
    total: {
      currency,
      sum: total
    }
  };
}

describe('yearly aggregation', () => {
  it('returns exactly 12 entries', () => {
    const result = buildYearlyMonthlyTotals(() => createReport(0), 'USD', 2026);

    expect(result).toHaveLength(12);
  });

  it('orders entries from January through December', () => {
    const result = buildYearlyMonthlyTotals(() => createReport(0), 'USD', 2026);

    expect(result.map((entry) => entry.label)).toEqual([
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December'
    ]);
  });

  it('calls the monthly report provider for months 1 through 12', () => {
    const getMonthlyReport = vi.fn(() => createReport(0));

    buildYearlyMonthlyTotals(getMonthlyReport, 'USD', 2026);

    expect(getMonthlyReport.mock.calls.map((call) => call[2])).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
    ]);
  });

  it('passes the selected year to every monthly report call', () => {
    const getMonthlyReport = vi.fn(() => createReport(0));

    buildYearlyMonthlyTotals(getMonthlyReport, 'USD', 2028);

    expect(getMonthlyReport.mock.calls.every((call) => call[1] === 2028)).toBe(
      true
    );
  });

  it('passes the selected currency to every monthly report call', () => {
    const getMonthlyReport = vi.fn(() => createReport(0, 'ILS'));

    buildYearlyMonthlyTotals(getMonthlyReport, 'ILS', 2026);

    expect(getMonthlyReport.mock.calls.every((call) => call[0] === 'ILS')).toBe(
      true
    );
  });

  it('preserves non-zero monthly totals', () => {
    const totalsByMonth = new Map([
      [1, 100],
      [3, 50],
      [12, 25]
    ]);

    const result = buildYearlyMonthlyTotals(
      (_currency, _year, month) => createReport(totalsByMonth.get(month) ?? 0),
      'USD',
      2026
    );

    expect(result[0].total).toBe(100);
    expect(result[2].total).toBe(50);
    expect(result[11].total).toBe(25);
  });

  it('preserves zero monthly totals', () => {
    const result = buildYearlyMonthlyTotals(
      (_currency, _year, month) => createReport(month === 2 ? 0 : month),
      'USD',
      2026
    );

    expect(result[1]).toMatchObject({
      month: 2,
      label: 'February',
      total: 0,
      currency: 'USD'
    });
  });

  it('returns 12 zero entries for a fully empty year', () => {
    const result = buildYearlyMonthlyTotals(() => createReport(0), 'USD', 2026);

    expect(result).toEqual(
      yearlyMonths.map((monthOption) => ({
        ...monthOption,
        total: 0,
        currency: 'USD'
      }))
    );
  });

  it('does not round decimal totals internally', () => {
    const result = buildYearlyMonthlyTotals(
      (_currency, _year, month) =>
        createReport(month === 8 ? 183.33333333333334 : 0),
      'USD',
      2026
    );

    expect(result[7].total).toBe(183.33333333333334);
  });

  it('propagates provider failures instead of returning partial data', () => {
    const getMonthlyReport = vi.fn((_currency, _year, month) => {
      if (month === 8) {
        throw new Error('Missing conversion rates');
      }

      return createReport(month);
    });

    expect(() => buildYearlyMonthlyTotals(getMonthlyReport, 'USD', 2026)).toThrow(
      'Missing conversion rates'
    );
    expect(getMonthlyReport).toHaveBeenCalledTimes(8);
  });

  it('uses the report currency for output currency', () => {
    const result = buildYearlyMonthlyTotals(() => createReport(25, 'EUR'), 'EUR', 2026);

    expect(result.every((entry) => entry.currency === 'EUR')).toBe(true);
  });

  it('does not duplicate or omit any month', () => {
    const result = buildYearlyMonthlyTotals(() => createReport(0), 'USD', 2026);

    expect(new Set(result.map((entry) => entry.month))).toEqual(
      new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    );
  });
});
