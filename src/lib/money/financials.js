/*
 * M2A.2: the canonical report/chart calculations (Policy B). Monthly totals,
 * category totals, and yearly totals all come from here, so every screen and
 * export shows numbers derived from the same exact values:
 *
 * - each quantity is the exact decimal sum of its own set of costs;
 * - nothing is rounded per cost or per component before summing;
 * - rounding happens once, when a quantity is displayed or exported
 *   (roundForCurrency / formatMoney).
 *
 * Consequence (by design, see ADR-040): rounded components can differ from
 * the rounded total by a minor unit (three 0.333 costs total 0.999, shown as
 * 1.00, while each shows as 0.33). No residual is allocated or hidden.
 *
 * Pure functions: no React, no storage writes. Rates are injected.
 */
import { getCategoryDisplayName, getCategoryKey } from '../../utils/category.js';
import { yearlyMonths } from '../../utils/yearlyAggregation.js';
import { amountToNumber, normalizeAmount, percentageOf, sumAmounts } from './decimal.js';
import { convertRecordSum, sumRecordsInCurrency } from './money.js';

export const MIXED_REPORT_RATES_MESSAGE = 'Cross-currency report totals require cached exchange rates.';
export const MIXED_CHART_RATES_MESSAGE =
  'Exchange rates are required for mixed-currency chart aggregation.';

function ratesIfNeeded(costs, currency, rates) {
  return costs.some((cost) => cost.currency !== currency) ? rates : null;
}

/**
 * @param {{sum: number, currency: string}[]} costs
 * @param {string} currency
 * @param {object|null} rates
 * @returns {string} The exact total in `currency` (unrounded).
 */
export function sumCostsExact(costs, currency, rates) {
  return sumRecordsInCurrency(costs, currency, ratesIfNeeded(costs, currency, rates), MIXED_REPORT_RATES_MESSAGE);
}

/**
 * Exact category totals for a set of costs, grouped case-insensitively like
 * the legacy aggregation, with each category's share of the exact total.
 * @param {object[]} costs
 * @param {string} currency
 * @param {object|null} rates
 * @returns {{totalAmount: string, entries: object[]}} Entries carry the
 *   exact `amount`, a Number `total` (chart geometry only), `share` (0-1
 *   Number, geometry/label threshold only), and `percentageText` (1 decimal,
 *   half away from zero, from the exact values).
 */
export function buildCategoryFinancials(costs, currency, rates) {
  const needed = ratesIfNeeded(costs, currency, rates);
  const groups = new Map();

  costs.forEach((cost) => {
    const key = getCategoryKey(cost.category);
    const group = groups.get(key) ?? { category: getCategoryDisplayName(cost.category), values: [] };

    group.values.push(convertRecordSum(cost, currency, needed, MIXED_CHART_RATES_MESSAGE));
    groups.set(key, group);
  });

  const groupAmounts = Array.from(groups.values()).map((group) => ({
    category: group.category,
    amount: sumAmounts(group.values)
  }));
  const totalAmount = sumAmounts(groupAmounts.map((group) => group.amount));

  return {
    totalAmount,
    entries: groupAmounts.map((group) => ({
      category: group.category,
      amount: group.amount,
      total: amountToNumber(group.amount),
      share: amountToNumber(percentageOf(group.amount, totalAmount, 20)) / 100,
      percentageText: percentageOf(group.amount, totalAmount, 1)
    }))
  };
}

/**
 * Twelve months of exact totals (zero months included) and their exact sum.
 * The yearly total is the sum of the exact monthly totals, never of rounded
 * ones.
 * @param {function} getMonthlyReport - (currency, year, month) => report
 *   (normally costsDatabase.getReport; it filters the month's costs).
 * @param {string} currency
 * @param {number} year
 * @param {object|null} rates
 * @returns {{totalAmount: string, months: object[]}} Each month carries the
 *   exact `amount` and a Number `total` for chart geometry.
 */
export function buildYearlyFinancials(getMonthlyReport, currency, year, rates) {
  const months = yearlyMonths.map((monthOption) => {
    const report = getMonthlyReport(currency, year, monthOption.month);
    // A month with no cost rows is its reported total (always 0 for a real
    // getReport(); a stand-in report function may report a total only).
    const amount = report.costs?.length
      ? sumCostsExact(report.costs, currency, rates)
      : normalizeAmount(report.total.sum);

    return {
      ...monthOption,
      currency,
      amount,
      total: amountToNumber(amount)
    };
  });

  return { totalAmount: sumAmounts(months.map((month) => month.amount)), months };
}
