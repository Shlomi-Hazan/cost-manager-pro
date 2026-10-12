/*
 * M2B.2: monthly, yearly and category views, all derived from ONE conversion
 * (convertCosts) so that the monthly total, the yearly months, the pie chart
 * and the exports can never disagree. Pure and synchronous.
 *
 * An empty month is a valid zero. A month whose expenses cannot all be
 * converted is `incomplete` with no amount (never a fake zero). The yearly
 * total exists only when all twelve months are complete, and then it is the
 * exact sum of the exact monthly totals. A category breakdown exists only for a
 * complete conversion, because a share of an unknown total is not truthful.
 */
import { getCategoryDisplayName, getCategoryKey } from '../../utils/category.js';
import { yearlyMonths } from '../../utils/yearlyAggregation.js';
import { amountToNumber, sumAmounts } from '../money/decimal.js';
import { finishCategoryGroups } from '../money/financials.js';
import { convertCosts, mergeObservations } from './historicalConversion.js';

/**
 * @param {object[]} costs - The stored expenses of one month.
 * @param {{convertCost: function}} converter
 * @returns {object} The conversion, plus `status`: 'empty' | 'complete' | 'incomplete'.
 */
export function buildMonthlyConversion(costs, converter) {
  const conversion = convertCosts(costs, converter);

  return { ...conversion, status: costs.length === 0 ? 'empty' : conversion.complete ? 'complete' : 'incomplete' };
}

/**
 * Twelve months of one year (months with no expenses included).
 * @param {object[]} costs - The stored expenses of the year.
 * @param {{convertCost: function, targetCurrency: string}} converter
 * @param {number} year
 * @returns {{months: object[], complete: boolean, totalAmount: string|null,
 *   counts: object, observation: object|null, usesRates: boolean,
 *   unavailable: object[], unavailableMonths: number[]}}
 */
export function buildYearlyConversion(costs, converter, year) {
  const months = yearlyMonths.map((monthOption) => {
    const monthCosts = costs.filter((cost) => cost.date.year === year && cost.date.month === monthOption.month);
    const conversion = buildMonthlyConversion(monthCosts, converter);

    return {
      ...monthOption,
      currency: converter.targetCurrency,
      status: conversion.status,
      // null (not 0) when the month cannot be converted completely.
      amount: conversion.total,
      total: conversion.total === null ? null : amountToNumber(conversion.total),
      conversion
    };
  });
  const complete = months.every((month) => month.amount !== null);
  const conversions = months.map((month) => month.conversion);

  return {
    months,
    complete,
    totalAmount: complete ? sumAmounts(months.map((month) => month.amount)) : null,
    counts: {
      expenses: conversions.reduce((sum, entry) => sum + entry.counts.expenses, 0),
      unavailable: conversions.reduce((sum, entry) => sum + entry.counts.unavailable, 0),
      withRates: conversions.reduce((sum, entry) => sum + entry.counts.withRates, 0),
      provisional: conversions.reduce((sum, entry) => sum + entry.counts.provisional, 0)
    },
    observation: mergeObservations(conversions),
    usesRates: conversions.some((entry) => entry.usesRates),
    unavailable: conversions.flatMap((entry) => entry.unavailable),
    unavailableMonths: months.filter((month) => month.status === 'incomplete').map((month) => month.month)
  };
}

/**
 * Category totals from the same converted items. Grouped case-insensitively
 * like the legacy aggregation. Only a COMPLETE conversion has a breakdown.
 * @param {object} conversion - Result of convertCosts()/buildMonthlyConversion().
 * @returns {{status: string, totalAmount: string|null, entries: object[]}}
 *   status: 'complete' | 'unavailable'.
 */
export function buildCategoryBreakdown(conversion) {
  if (!conversion.complete) {
    return { status: 'unavailable', totalAmount: null, entries: [] };
  }

  const groups = new Map();

  conversion.items.forEach((item) => {
    const key = getCategoryKey(item.category);
    const group = groups.get(key) ?? { category: getCategoryDisplayName(item.category), values: [] };

    group.values.push(item.amount);
    groups.set(key, group);
  });

  return { status: 'complete', ...finishCategoryGroups(Array.from(groups.values())) };
}
