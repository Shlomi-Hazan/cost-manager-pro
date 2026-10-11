/*
 * Course requirement: the monthly Pie Chart groups a month's costs by
 * category and shows each category's total in a single selected currency
 * (R-070/R-071). This module contains only the aggregation math — no React,
 * no chart-library code — so it can be unit tested independently and reused
 * by both the on-screen chart and its Excel/PDF export.
 */
import { buildCategoryFinancials } from '../lib/money/financials.js';
import { isSupportedCurrency } from './currency.js';

function validateCostForAggregation(cost) {
  if (cost === null || typeof cost !== 'object') {
    throw new TypeError('cost must be an object.');
  }

  if (typeof cost.sum !== 'number' || !Number.isFinite(cost.sum)) {
    throw new TypeError('cost.sum must be a finite number.');
  }

  if (!isSupportedCurrency(cost.currency)) {
    throw new TypeError('cost.currency must be one of USD, ILS, GBP, EURO.');
  }

  if (typeof cost.category !== 'string') {
    throw new TypeError('cost.category must be a string.');
  }
}

/**
 * Sums `costs` into one total per category, converting each cost's amount
 * into targetCurrency along the way (the chart only ever displays converted
 * totals, unlike report rows which keep their original currency). Category
 * names are grouped case-insensitively via getCategoryKey() so "Food" and
 * "food" contribute to the same slice (see category.js), while the category
 * label shown to the user is its normalized display form.
 * @param {object[]} costs - Costs to aggregate.
 * @param {string} targetCurrency - Currency to convert every total into.
 * @param {object} [rates] - Exchange rates; required only if costs mix
 *   currencies.
 * @returns {object[]} One { category, total } entry per distinct category.
 */
export function aggregateCostsByCategory(costs, targetCurrency, rates) {
  if (!Array.isArray(costs)) {
    throw new TypeError('costs must be an array.');
  }

  if (!isSupportedCurrency(targetCurrency)) {
    throw new TypeError('targetCurrency must be one of USD, ILS, GBP, EURO.');
  }

  costs.forEach(validateCostForAggregation);

  // M2A.2: the exact decimal calculation is shared with the charts and
  // exports (src/lib/money/financials.js). This legacy shape keeps a Number
  // `total`, produced only here at the boundary, from the exact sum.
  return buildCategoryFinancials(costs, targetCurrency, rates ?? null).entries.map((entry) => ({
    category: entry.category,
    total: entry.total
  }));
}
