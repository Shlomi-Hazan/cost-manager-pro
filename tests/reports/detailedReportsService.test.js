import { describe, expect, it, vi } from 'vitest';
import {
  buildDetailedMonthlyReport,
  buildDetailedYearlyReport
} from '../../src/services/detailedReportsService.js';

/*
 * TEAM EXTENSION tests: protects that the app's own full-detail Monthly/
 * Yearly report building (X-005) correctly reuses the required
 * getReport() for totals while adding full date/time detail rows on top —
 * without altering what getReport() itself returns.
 */
function createCost(overrides) {
  const { date: dateOverrides = {}, ...costOverrides } = overrides;

  return {
    id: 'cost-default',
    sum: 100,
    currency: 'USD',
    category: 'Food',
    description: 'Default cost',
    ...costOverrides,
    date: {
      day: 1,
      month: 1,
      year: 2026,
      hour: 9,
      minute: 5,
      ...dateOverrides
    }
  };
}

function createDatabase({ costs, monthlyTotals = new Map() }) {
  return {
    getAllCosts: vi.fn(() => costs),
    getReport: vi.fn((currency, year, month) => ({
      year,
      month,
      costs: [],
      total: {
        currency,
        sum: monthlyTotals.get(month) ?? 0
      }
    }))
  };
}

describe('detailedReportsService', () => {
  it('builds a detailed monthly report with matching full rows and the official total', () => {
    const augustFirst = createCost({
      id: 'aug-1',
      description: 'August groceries',
      date: {
        day: 10,
        month: 8,
        hour: 9,
        minute: 5
      }
    });
    const septemberCost = createCost({
      id: 'sep-1',
      description: 'September groceries',
      date: {
        day: 1,
        month: 9
      }
    });
    const augustSecond = createCost({
      id: 'aug-2',
      sum: 50,
      currency: 'GBP',
      description: 'August train',
      date: {
        day: 24,
        month: 8,
        hour: 16,
        minute: 37
      }
    });
    const database = createDatabase({
      costs: [augustFirst, septemberCost, augustSecond],
      monthlyTotals: new Map([[8, 200]])
    });

    const report = buildDetailedMonthlyReport(database, 'USD', 2026, 8);

    expect(report).toEqual({
      year: 2026,
      month: 8,
      costs: [
        {
          id: 'aug-1',
          sum: 100,
          currency: 'USD',
          category: 'Food',
          description: 'August groceries',
          date: {
            day: 10,
            month: 8,
            year: 2026,
            hour: 9,
            minute: 5
          }
        },
        {
          id: 'aug-2',
          sum: 50,
          currency: 'GBP',
          category: 'Food',
          description: 'August train',
          date: {
            day: 24,
            month: 8,
            year: 2026,
            hour: 16,
            minute: 37
          }
        }
      ],
      total: {
        currency: 'USD',
        sum: 200
      },
      // M2A.2: additive exact decimal total (the double reports no rows, so
      // it is taken at its reported total).
      totalAmount: '200'
    });
    expect(database.getReport).toHaveBeenCalledWith('USD', 2026, 8);
  });

  it('builds a detailed yearly report with matching rows from multiple months', () => {
    const january = createCost({
      id: 'jan',
      description: 'January groceries',
      date: {
        month: 1,
        day: 10,
        hour: 9,
        minute: 5
      }
    });
    const august = createCost({
      id: 'aug',
      sum: 50,
      currency: 'GBP',
      description: 'August train',
      date: {
        month: 8,
        day: 24,
        hour: 16,
        minute: 37
      }
    });
    const previousYear = createCost({
      id: 'old',
      description: 'Previous year',
      date: {
        year: 2025,
        month: 7,
        day: 15
      }
    });
    const december = createCost({
      id: 'dec',
      description: 'December gift',
      date: {
        month: 12,
        day: 5,
        hour: 21,
        minute: 14
      }
    });
    const database = createDatabase({
      costs: [january, august, previousYear, december],
      monthlyTotals: new Map([
        [1, 100],
        [8, 100],
        [12, 80]
      ])
    });

    const report = buildDetailedYearlyReport(database, 'USD', 2026);

    expect(report.costs.map((cost) => cost.id)).toEqual(['jan', 'aug', 'dec']);
    expect(report.costs.map((cost) => cost.description)).toEqual([
      'January groceries',
      'August train',
      'December gift'
    ]);
    expect(report.costs[1]).toMatchObject({
      id: 'aug',
      sum: 50,
      currency: 'GBP',
      date: {
        day: 24,
        month: 8,
        year: 2026,
        hour: 16,
        minute: 37
      }
    });
    expect(report.total).toEqual({
      currency: 'USD',
      sum: 280
    });
  });

  it('uses all 12 monthly getReport totals for the yearly total', () => {
    const database = createDatabase({
      costs: [],
      monthlyTotals: new Map([
        [1, 10],
        [2, 20],
        [12, 120]
      ])
    });

    const report = buildDetailedYearlyReport(database, 'ILS', 2026);

    expect(report.total).toEqual({
      currency: 'ILS',
      sum: 150
    });
    expect(database.getReport).toHaveBeenCalledTimes(12);
    expect(database.getReport.mock.calls.map((call) => call[2])).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
    ]);
    expect(database.getReport.mock.calls.every((call) => call[0] === 'ILS')).toBe(
      true
    );
    expect(database.getReport.mock.calls.every((call) => call[1] === 2026)).toBe(
      true
    );
  });

  it('returns an empty yearly report with a zero selected-currency total', () => {
    const database = createDatabase({
      costs: [createCost({ id: 'old', date: { year: 2025 } })]
    });

    const report = buildDetailedYearlyReport(database, 'EUR', 2026);

    expect(report).toEqual({
      year: 2026,
      costs: [],
      total: {
        currency: 'EUR',
        sum: 0
      },
      // M2A.2: additive exact decimal total.
      totalAmount: '0'
    });
  });

  it('does not sort detailed yearly rows', () => {
    const database = createDatabase({
      costs: [
        createCost({
          id: 'dec',
          description: 'December first in storage',
          date: { month: 12, day: 5 }
        }),
        createCost({
          id: 'jan',
          description: 'January second in storage',
          date: { month: 1, day: 10 }
        })
      ]
    });

    const report = buildDetailedYearlyReport(database, 'USD', 2026);

    expect(report.costs.map((cost) => cost.id)).toEqual(['dec', 'jan']);
  });

  it('copies detailed rows without mutating source cost data', () => {
    const sourceCost = createCost({ id: 'copy-check' });
    const database = createDatabase({
      costs: [sourceCost],
      monthlyTotals: new Map([[1, 100]])
    });

    const report = buildDetailedMonthlyReport(database, 'USD', 2026, 1);

    report.costs[0].date.hour = 23;
    report.costs[0].description = 'Changed';

    expect(sourceCost).toMatchObject({
      id: 'copy-check',
      description: 'Default cost',
      date: {
        hour: 9,
        minute: 5
      }
    });
  });
});
