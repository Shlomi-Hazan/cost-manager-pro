import { describe, expect, it } from 'vitest';
import { aggregateCostsByCategory } from '../../src/utils/chartAggregation.js';

/*
 * Course requirement (R-070/R-071): protects Pie Chart category grouping
 * and currency conversion — multiple categories, repeated category values
 * summed, mixed currencies converted, and an empty month producing a
 * clean empty/no-data result rather than an error.
 */
const validRates = {
  USD: 1,
  GBP: 0.5,
  EURO: 0.8,
  ILS: 4
};

describe('chart aggregation', () => {
  it('returns empty aggregation for an empty cost array', () => {
    expect(aggregateCostsByCategory([], 'USD')).toEqual([]);
  });

  it('aggregates one category in one currency', () => {
    expect(
      aggregateCostsByCategory(
        [
          {
            sum: 100,
            currency: 'USD',
            category: 'Food'
          }
        ],
        'USD'
      )
    ).toEqual([
      {
        category: 'Food',
        total: 100
      }
    ]);
  });

  it('sums multiple costs in the same category', () => {
    expect(
      aggregateCostsByCategory(
        [
          {
            sum: 100,
            currency: 'USD',
            category: 'Food'
          },
          {
            sum: 25,
            currency: 'USD',
            category: 'Food'
          }
        ],
        'USD'
      )
    ).toEqual([
      {
        category: 'Food',
        total: 125
      }
    ]);
  });

  it('keeps multiple category identities separate', () => {
    expect(
      aggregateCostsByCategory(
        [
          {
            sum: 100,
            currency: 'USD',
            category: 'Food'
          },
          {
            sum: 25,
            currency: 'USD',
            category: 'Travel'
          }
        ],
        'USD'
      )
    ).toEqual([
      {
        category: 'Food',
        total: 100
      },
      {
        category: 'Travel',
        total: 25
      }
    ]);
  });

  it('converts mixed currencies with shared rates', () => {
    const aggregation = aggregateCostsByCategory(
      [
        {
          sum: 100,
          currency: 'USD',
          category: 'Food'
        },
        {
          sum: 50,
          currency: 'GBP',
          category: 'Food'
        },
        {
          sum: 25,
          currency: 'USD',
          category: 'Travel'
        }
      ],
      'USD',
      validRates
    );

    expect(aggregation).toEqual([
      {
        category: 'Food',
        total: 200
      },
      {
        category: 'Travel',
        total: 25
      }
    ]);
    expect(aggregation.reduce((sum, category) => sum + category.total, 0)).toBe(
      225
    );
  });

  it('aggregates same-currency costs without rates', () => {
    expect(
      aggregateCostsByCategory(
        [
          {
            sum: 40,
            currency: 'EURO',
            category: 'BOOKS'
          }
        ],
        'EURO'
      )
    ).toEqual([
      {
        category: 'BOOKS',
        total: 40
      }
    ]);
  });

  it('fails when rates are missing and conversion is required', () => {
    expect(() =>
      aggregateCostsByCategory(
        [
          {
            sum: 50,
            currency: 'GBP',
            category: 'Travel'
          }
        ],
        'USD'
      )
    ).toThrow('Exchange rates');
  });

  // M2A.2 (Policy B): this test used to pin the floating-point artifact
  // 0.30000000000000004. Amounts are now summed as exact decimals, so 0.1 +
  // 0.2 is exactly 0.3. Nothing is rounded: the exact value is kept.
  it('preserves decimal precision without rounding', () => {
    expect(
      aggregateCostsByCategory(
        [
          {
            sum: 0.1,
            currency: 'USD',
            category: 'Food'
          },
          {
            sum: 0.2,
            currency: 'USD',
            category: 'Food'
          }
        ],
        'USD'
      )
    ).toEqual([
      {
        category: 'Food',
        total: 0.3
      }
    ]);
  });

  it('does not mutate input costs', () => {
    const costs = [
      {
        sum: 50,
        currency: 'GBP',
        category: 'Food'
      }
    ];

    aggregateCostsByCategory(costs, 'USD', validRates);

    expect(costs).toEqual([
      {
        sum: 50,
        currency: 'GBP',
        category: 'Food'
      }
    ]);
  });

  it('merges common category case variants into the canonical display category', () => {
    expect(
      aggregateCostsByCategory(
        [
          {
            sum: 35,
            currency: 'USD',
            category: 'food'
          },
          {
            sum: 10,
            currency: 'USD',
            category: 'Food'
          },
          {
            sum: 5,
            currency: 'USD',
            category: 'FOOD'
          }
        ],
        'USD'
      )
    ).toEqual([
      {
        category: 'Food',
        total: 50
      }
    ]);
  });

  it('merges common category whitespace variants', () => {
    expect(
      aggregateCostsByCategory(
        [
          {
            sum: 35,
            currency: 'USD',
            category: ' Food '
          },
          {
            sum: 10,
            currency: 'USD',
            category: 'food'
          }
        ],
        'USD'
      )
    ).toEqual([
      {
        category: 'Food',
        total: 45
      }
    ]);
  });

  it('merges custom category case variants using the first cleaned display label', () => {
    expect(
      aggregateCostsByCategory(
        [
          {
            sum: 10,
            currency: 'USD',
            category: 'My Pets'
          },
          {
            sum: 20,
            currency: 'USD',
            category: 'my pets'
          },
          {
            sum: 30,
            currency: 'USD',
            category: 'MY PETS'
          }
        ],
        'USD'
      )
    ).toEqual([
      {
        category: 'My Pets',
        total: 60
      }
    ]);
  });

  it('merges custom category whitespace variants', () => {
    expect(
      aggregateCostsByCategory(
        [
          {
            sum: 10,
            currency: 'USD',
            category: 'Pet   Supplies'
          },
          {
            sum: 20,
            currency: 'USD',
            category: ' pet supplies '
          }
        ],
        'USD'
      )
    ).toEqual([
      {
        category: 'Pet Supplies',
        total: 30
      }
    ]);
  });

  it('merges mixed-case mixed-currency categories while preserving conversion behavior', () => {
    expect(
      aggregateCostsByCategory(
        [
          {
            sum: 100,
            currency: 'USD',
            category: 'food'
          },
          {
            sum: 50,
            currency: 'GBP',
            category: ' Food '
          }
        ],
        'USD',
        validRates
      )
    ).toEqual([
      {
        category: 'Food',
        total: 200
      }
    ]);
  });
});
