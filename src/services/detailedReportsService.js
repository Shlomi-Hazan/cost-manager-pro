/*
 * LEGACY (pre-M2B.2). These builders convert with the single flat demo-rate
 * table and are NO LONGER USED by the application: reports and charts now
 * come from historicalReportService.js (dated ECB rates). They are kept,
 * with their tests, as the documented flat-rate behaviour of the course
 * getReport() contract; a guard test makes sure no application module
 * imports them again.
 */
/*
 * TEAM EXTENSION: our db.js's required getReport() returns each cost with
 * only { day } in its date, matching the official report-item example.
 * OQ-002 is resolved — the lecturer confirmed this { day }-only shape is
 * correct (see docs/REQUIREMENTS.md) — and with the row's own sum/currency
 * un-converted. The team's Monthly/Yearly report screens want the FULL
 * stored date/time for display and sorting, so this module reads the raw
 * costs via db.js's getAllCosts() extension for the row data, while still
 * getting the required total from getReport() itself — the required
 * getReport() contract and its return shape are never modified.
 */
import { getCachedExchangeRates } from '../lib/exchangeRatesCache.js';
import { amountToNumber, normalizeAmount } from '../lib/money/decimal.js';
import { buildYearlyFinancials, sumCostsExact } from '../lib/money/financials.js';

// Exact total behind a getReport() result. Real results carry their cost
// rows, so the exact sum is rebuilt from them with the same canonical
// calculation getReport() used; a report with no rows is its reported total (0 for a real
// getReport(); a test double may report a total only).
function getExactMonthlyTotal(monthlyReport, currency) {
  return monthlyReport.costs?.length
    ? sumCostsExact(monthlyReport.costs, currency, getCachedExchangeRates())
    : normalizeAmount(monthlyReport.total.sum);
}

// Full-detail copy (all date/time fields) for the app's own report tables,
// as opposed to db.js's own toReportCost() which intentionally exposes only
// { day } to match the official report shape.
function copyDetailedCost(cost) {
  return {
    id: cost.id,
    sum: cost.sum,
    currency: cost.currency,
    category: cost.category,
    description: cost.description,
    // Full internal date/time, needed for display/sorting in report tables.
    date: {
      day: cost.date.day,
      month: cost.date.month,
      year: cost.date.year,
      hour: cost.date.hour,
      minute: cost.date.minute
    }
  };
}

/**
 * Course-required total (R-050 to R-053), presented with team-extension row
 * detail. `total` is copied straight from the required getReport() output,
 * so the required conversion/rounding behavior is never duplicated here.
 * @param {object} database - db.js database object (from openCostsDB()).
 * @param {string} currency - Currency to report the total in.
 * @param {number} year - Report year.
 * @param {number} month - Report month (1-12).
 * @returns {{year: number, month: number, costs: object[], total: object}}
 */
export function buildDetailedMonthlyReport(database, currency, year, month) {
  const costs = database
    .getAllCosts()
    .filter((cost) => cost.date.year === year && cost.date.month === month)
    .map(copyDetailedCost);
  // Required total, unmodified: getAllCosts()'s filter above is only for
  // the team's own row display, never fed back into the total itself.
  const monthlyReport = database.getReport(currency, year, month);

  return {
    year,
    month,
    costs,
    total: {
      currency: monthlyReport.total.currency,
      sum: monthlyReport.total.sum
    },
    // M2A.2: the exact (unrounded) decimal total the displayed and exported
    // figure is rounded from. `total.sum` stays the legacy Number.
    totalAmount: getExactMonthlyTotal(monthlyReport, currency)
  };
}

/**
 * TEAM EXTENSION (X-005): a full-year report, built on top of the required
 * per-month getReport() calls — the yearly total is just the sum of 12
 * required monthly totals, each already correctly converted to `currency`.
 * @param {object} database - db.js database object (from openCostsDB()).
 * @param {string} currency - Currency to report the total in.
 * @param {number} year - Report year.
 * @returns {{year: number, costs: object[], total: object}}
 */
export function buildDetailedYearlyReport(database, currency, year) {
  const costs = database
    .getAllCosts()
    .filter((cost) => cost.date.year === year)
    .map(copyDetailedCost);
  // M2A.2: the yearly total is the exact sum of the twelve exact monthly
  // totals (never of rounded ones); `total.sum` is the legacy Number of it.
  const yearly = buildYearlyFinancials(
    (reportCurrency, reportYear, reportMonth) =>
      database.getReport(reportCurrency, reportYear, reportMonth),
    currency,
    year,
    getCachedExchangeRates()
  );

  return {
    year,
    costs,
    total: {
      currency,
      sum: amountToNumber(yearly.totalAmount)
    },
    totalAmount: yearly.totalAmount
  };
}
