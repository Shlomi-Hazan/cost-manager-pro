import { describe, expect, it } from 'vitest';
import {
  reportSortDirections,
  reportSortKeys,
  sortReportCosts
} from '../../src/utils/reportSorting.js';

/*
 * TEAM EXTENSION tests (X-006): protects that sorting is correct per
 * column type (chronological for date/time, numeric for sum, alphabetical
 * for text), stable for equal values (preserves original order on ties),
 * and never mutates the input array — since report totals must remain
 * correct regardless of how rows are currently sorted on screen.
 */
function createCost(id, overrides) {
  const { date: dateOverrides = {}, ...costOverrides } = overrides;

  return {
    id,
    description: id,
    category: 'General',
    sum: 1,
    currency: 'USD',
    ...costOverrides,
    date: {
      day: 1,
      month: 1,
      year: 2026,
      hour: 12,
      minute: 0,
      ...dateOverrides
    }
  };
}

function sortIds(costs, sortKey, sortDirection = reportSortDirections.asc) {
  return sortReportCosts(costs, { sortKey, sortDirection }).map((cost) => cost.id);
}

describe('reportSorting', () => {
  it('preserves original order when no sort is active', () => {
    const costs = [
      createCost('first', {}),
      createCost('second', {}),
      createCost('third', {})
    ];

    expect(sortReportCosts(costs).map((cost) => cost.id)).toEqual([
      'first',
      'second',
      'third'
    ]);
  });

  it('sorts Date ascending chronologically', () => {
    const costs = [
      createCost('day-2', { date: { day: 2 } }),
      createCost('day-10', { date: { day: 10 } }),
      createCost('day-1', { date: { day: 1 } })
    ];

    expect(sortIds(costs, reportSortKeys.date)).toEqual([
      'day-1',
      'day-2',
      'day-10'
    ]);
  });

  it('sorts Date descending chronologically', () => {
    const costs = [
      createCost('jan', { date: { month: 1, day: 5 } }),
      createCost('dec', { date: { month: 12, day: 3 } }),
      createCost('feb', { date: { month: 2, day: 10 } })
    ];

    expect(sortIds(costs, reportSortKeys.date, reportSortDirections.desc)).toEqual([
      'dec',
      'feb',
      'jan'
    ]);
  });

  it('keeps same-date rows stable', () => {
    const costs = [
      createCost('first', { date: { day: 10 } }),
      createCost('second', { date: { day: 10 } }),
      createCost('third', { date: { day: 10 } })
    ];

    expect(sortIds(costs, reportSortKeys.date)).toEqual([
      'first',
      'second',
      'third'
    ]);
    expect(sortIds(costs, reportSortKeys.date, reportSortDirections.desc)).toEqual([
      'first',
      'second',
      'third'
    ]);
  });

  it('sorts Time ascending chronologically', () => {
    const costs = [
      createCost('09:07', { date: { hour: 9, minute: 7 } }),
      createCost('16:37', { date: { hour: 16, minute: 37 } }),
      createCost('00:05', { date: { hour: 0, minute: 5 } })
    ];

    expect(sortIds(costs, reportSortKeys.time)).toEqual([
      '00:05',
      '09:07',
      '16:37'
    ]);
  });

  it('sorts Time descending chronologically', () => {
    const costs = [
      createCost('09:07', { date: { hour: 9, minute: 7 } }),
      createCost('16:37', { date: { hour: 16, minute: 37 } }),
      createCost('00:05', { date: { hour: 0, minute: 5 } })
    ];

    expect(sortIds(costs, reportSortKeys.time, reportSortDirections.desc)).toEqual([
      '16:37',
      '09:07',
      '00:05'
    ]);
  });

  it('sorts Description ascending alphabetically', () => {
    const costs = [
      createCost('banana', { description: 'banana' }),
      createCost('Apple', { description: 'Apple' }),
      createCost('car', { description: 'car' })
    ];

    expect(sortIds(costs, reportSortKeys.description)).toEqual([
      'Apple',
      'banana',
      'car'
    ]);
  });

  it('sorts Description descending alphabetically', () => {
    const costs = [
      createCost('banana', { description: 'banana' }),
      createCost('Apple', { description: 'Apple' }),
      createCost('car', { description: 'car' })
    ];

    expect(
      sortIds(costs, reportSortKeys.description, reportSortDirections.desc)
    ).toEqual(['car', 'banana', 'Apple']);
  });

  it('compares Description case-insensitively', () => {
    const costs = [
      createCost('lower', { description: 'apple' }),
      createCost('upper', { description: 'Apple' }),
      createCost('banana', { description: 'banana' })
    ];

    expect(sortIds(costs, reportSortKeys.description)).toEqual([
      'lower',
      'upper',
      'banana'
    ]);
  });

  it('sorts Category ascending alphabetically', () => {
    const costs = [
      createCost('travel', { category: 'Travel' }),
      createCost('food', { category: 'food' }),
      createCost('bills', { category: 'Bills' })
    ];

    expect(sortIds(costs, reportSortKeys.category)).toEqual([
      'bills',
      'food',
      'travel'
    ]);
  });

  it('sorts Category descending alphabetically', () => {
    const costs = [
      createCost('travel', { category: 'Travel' }),
      createCost('food', { category: 'food' }),
      createCost('bills', { category: 'Bills' })
    ];

    expect(sortIds(costs, reportSortKeys.category, reportSortDirections.desc)).toEqual([
      'travel',
      'food',
      'bills'
    ]);
  });

  it('sorts Sum ascending numerically', () => {
    const costs = [
      createCost('2', { sum: 2 }),
      createCost('10', { sum: 10 }),
      createCost('100', { sum: 100 }),
      createCost('25.5', { sum: 25.5 })
    ];

    expect(sortIds(costs, reportSortKeys.sum)).toEqual([
      '2',
      '10',
      '25.5',
      '100'
    ]);
  });

  it('sorts Sum descending numerically', () => {
    const costs = [
      createCost('2', { sum: 2 }),
      createCost('10', { sum: 10 }),
      createCost('100', { sum: 100 }),
      createCost('25.5', { sum: 25.5 })
    ];

    expect(sortIds(costs, reportSortKeys.sum, reportSortDirections.desc)).toEqual([
      '100',
      '25.5',
      '10',
      '2'
    ]);
  });

  it('sorts Currency ascending alphabetically', () => {
    const costs = [
      createCost('USD', { currency: 'USD' }),
      createCost('EUR', { currency: 'EUR' }),
      createCost('GBP', { currency: 'GBP' }),
      createCost('ILS', { currency: 'ILS' })
    ];

    expect(sortIds(costs, reportSortKeys.currency)).toEqual([
      'EUR',
      'GBP',
      'ILS',
      'USD'
    ]);
  });

  it('sorts Currency descending alphabetically', () => {
    const costs = [
      createCost('USD', { currency: 'USD' }),
      createCost('EUR', { currency: 'EUR' }),
      createCost('GBP', { currency: 'GBP' }),
      createCost('ILS', { currency: 'ILS' })
    ];

    expect(sortIds(costs, reportSortKeys.currency, reportSortDirections.desc)).toEqual([
      'USD',
      'ILS',
      'GBP',
      'EUR'
    ]);
  });

  it('does not mutate the source array', () => {
    const costs = [
      createCost('100', { sum: 100 }),
      createCost('2', { sum: 2 }),
      createCost('25.5', { sum: 25.5 })
    ];
    const sourceOrder = costs.map((cost) => cost.id);

    sortReportCosts(costs, { sortKey: reportSortKeys.sum });

    expect(costs.map((cost) => cost.id)).toEqual(sourceOrder);
  });

  it('does not mutate cost objects', () => {
    const cost = createCost('mutable-check', {
      description: 'banana',
      date: { day: 10, hour: 16, minute: 37 }
    });
    const before = structuredClone(cost);

    sortReportCosts([cost], { sortKey: reportSortKeys.description });

    expect(cost).toEqual(before);
  });

  it('preserves source order for equal values', () => {
    const costs = [
      createCost('first', { sum: 10 }),
      createCost('second', { sum: 10 }),
      createCost('third', { sum: 10 })
    ];

    expect(sortIds(costs, reportSortKeys.sum)).toEqual([
      'first',
      'second',
      'third'
    ]);
    expect(sortIds(costs, reportSortKeys.sum, reportSortDirections.desc)).toEqual([
      'first',
      'second',
      'third'
    ]);
  });
});
