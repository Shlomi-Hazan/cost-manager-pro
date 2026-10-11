/*
 * TEAM EXTENSION: small presentation-only helpers shared by the Pie and Bar
 * charts. None of this affects the underlying aggregated totals — it only
 * decides what gets rendered/labeled and how.
 */
import { compareAmounts, percentageOf, sumAmounts } from '../lib/money/decimal.js';
import { formatAmount } from '../lib/money/format.js';

/**
 * Adds each category's share of the chart's total (0 when the chart total
 * is 0, so an all-zero month renders without dividing by zero) — used for
 * the Pie Chart's legend/tooltip text.
 * @param {object[]} chartData - Category totals from aggregateCostsByCategory.
 * @returns {object[]} chartData entries, each with an added `percentage`.
 */
export function addCategoryShare(chartData) {
  // M2A.2: summed as exact decimals, not floating point.
  const total = sumAmounts(chartData.map((entry) => entry.total));

  return chartData.map((entry) => ({
    ...entry,
    percentage:
      compareAmounts(total, '0') > 0 ? Number(percentageOf(entry.total, total, 20)) / 100 : 0
  }));
}

// Hides in-slice text labels below 5% share, since a very thin Pie slice has
// no room to render readable text without overlapping its neighbors.
export function shouldShowPieSliceLabel(entry) {
  return entry.percentage >= 0.05;
}

// The yearly Bar Chart must still show a zero-valued bar for empty months
// (R-080), but printing a "0" label on every empty bar would clutter the
// chart, so only positive totals get a visible value label.
export function formatPositiveBarValueLabel(value, currency = 'USD') {
  return value > 0 ? formatAmount(String(value), currency) : '';
}
