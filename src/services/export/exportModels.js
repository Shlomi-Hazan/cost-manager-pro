/*
 * TEAM EXTENSION: builds one shared, presentation-ready "export model" per
 * report/chart type, consumed by BOTH excelExportService.js and
 * pdfExportService.js. This keeps the two export formats consistent (same
 * rows, same formatted values) without either exporter needing to know how
 * a report/chart's raw data is shaped.
 */
import { formatDateForDisplay, formatTime } from '../../utils/dateTime.js';
import { compareAmounts, percentageToRatio, sumAmounts } from '../../lib/money/decimal.js';
import {
  formatAmount,
  formatRatioAsPercentage,
  formatStoredAmount,
  roundForCurrency
} from '../../lib/money/format.js';
import { buildCategoryFinancials } from '../../lib/money/financials.js';

const monthNames = [
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
];

// month is 1-12, matching db.js's month convention.
export function getMonthName(month) {
  return monthNames[month - 1] ?? String(month);
}

// Shallow copy so PDF cell formatting never mutates the model's own rows.
function copyRows(rows) {
  return rows.map((row) => ({ ...row }));
}

// PDF table cells are plain text, so numeric fields need explicit
// formatting here rather than relying on a spreadsheet's own number types.
function formatPdfCell(key, value, row) {
  // An original stored sum keeps its own precision; a computed total is
  // rounded once to the currency's minor unit. Same formatters as the UI.
  if (key === 'sum') {
    return formatStoredAmount(value, row.currency);
  }

  if (key === 'total') {
    return formatAmount(String(value), row.currency);
  }

  if (key === 'percentage') {
    return formatRatioAsPercentage(value);
  }

  return value;
}

/*
 * M2A.2 export semantics (Policy B). A computed total (report total, category
 * total, month total) is rounded ONCE to the currency's minor unit, half away
 * from zero, and written as that rounded value: a real number in Excel (with
 * a 2-decimal format) and the identical text in the PDF. The exact value it
 * was rounded from is not stored in the file. Original per-cost sums are the
 * stored values, never rounded. Callers that have the exact canonical amount
 * pass it; otherwise the Number given is used as the exact value.
 */
function roundedTotal(exactAmount, currency) {
  return Number(roundForCurrency(exactAmount, currency));
}

function totalLabel(exactAmount, currency) {
  return `${formatAmount(exactAmount, currency)} ${currency}`;
}

// Pre-M2 hotfix: when a figure in an export depends on converted amounts,
// the model carries the exchange-rate disclosure as one extra summary row
// (and as metadata for the PDF). Existing rows, columns, and numeric values
// are not touched; with no disclosure the model is returned unchanged.
function withRateDisclosure(model, rateDisclosure) {
  if (!rateDisclosure) {
    return model;
  }

  return {
    ...model,
    summary: [...model.summary, ['Exchange rates', rateDisclosure.exportNote]],
    metadata: { ...model.metadata, rateDisclosure: rateDisclosure.exportNote }
  };
}

// Reshapes a Monthly Report + its raw costs into the generic { rows,
// summary, columns } model both the Excel and PDF exporters consume.
function createMonthlyReportExportModel({ report, costs, totalAmount = report.total.sum }) {
  const rows = costs.map((cost) => ({
    day: cost.date.day,
    time: formatTime(cost.date),
    description: cost.description,
    category: cost.category,
    sum: cost.sum,
    currency: cost.currency
  }));

  return {
    type: 'monthly-report',
    title: 'Monthly Report',
    // Short human-readable summary lines shown above the data table.
    summary: [
      ['Period', `${getMonthName(report.month)} ${report.year}`],
      ['Report Currency', report.total.currency],
      ['Total', roundedTotal(totalAmount, report.total.currency)],
      ['Number of Costs', rows.length]
    ],
    // metadata mirrors summary's values as machine-readable fields, for
    // exporters that build their own formatting instead of using summary.
    metadata: {
      month: report.month,
      monthLabel: getMonthName(report.month),
      numberOfCosts: rows.length,
      periodLabel: `${getMonthName(report.month)} ${report.year}`,
      year: report.year,
      currency: report.total.currency,
      total: roundedTotal(totalAmount, report.total.currency),
      totalLabel: totalLabel(totalAmount, report.total.currency)
    },
    columns: ['Day', 'Time', 'Description', 'Category', 'Sum', 'Currency'],
    rows
  };
}

// Same shape as buildMonthlyReportExportModel, minus the month field
// (a yearly report row already carries its own full date).
function createYearlyReportExportModel({ report, costs, totalAmount = report.total.sum }) {
  const rows = costs.map((cost) => ({
    date: formatDateForDisplay(cost.date),
    time: formatTime(cost.date),
    description: cost.description,
    category: cost.category,
    sum: cost.sum,
    currency: cost.currency
  }));

  return {
    type: 'yearly-report',
    title: 'Yearly Report',
    summary: [
      ['Year', report.year],
      ['Report Currency', report.total.currency],
      ['Total', roundedTotal(totalAmount, report.total.currency)],
      ['Number of Costs', rows.length]
    ],
    // Same metadata/summary duplication pattern as the monthly model above.
    metadata: {
      numberOfCosts: rows.length,
      year: report.year,
      currency: report.total.currency,
      total: roundedTotal(totalAmount, report.total.currency),
      totalLabel: totalLabel(totalAmount, report.total.currency)
    },
    columns: ['Date', 'Time', 'Description', 'Category', 'Sum', 'Currency'],
    rows
  };
}

// Rows come from the canonical category calculation. Callers pass the
// `financials` they displayed; without it (older callers) the exact figures
// are rebuilt here from the given Number totals.
function createPieChartExportModel({ report, chartData, financials }) {
  const currency = report.total.currency;
  const canonical =
    financials ??
    buildCategoryFinancials(
      chartData.map((entry) => ({ category: entry.category, sum: entry.total, currency })),
      currency,
      null
    );
  const rows = canonical.entries.map((entry) => ({
    category: entry.category,
    total: roundedTotal(entry.amount, currency),
    // The rounded share (one decimal), as a 0-1 ratio, so the file shows
    // exactly what the screen shows.
    percentage: Number(percentageToRatio(entry.percentageText)),
    currency
  }));
  const total = roundedTotal(canonical.totalAmount, currency);

  return {
    type: 'pie-chart',
    title: 'Monthly Category Pie Chart',
    summary: [
      ['Period', `${getMonthName(report.month)} ${report.year}`],
      ['Currency', report.total.currency],
      ['Total', total],
      ['Number of Categories', rows.length]
    ],
    // total here is computed above from chartData, not copied off `report`.
    metadata: {
      month: report.month,
      monthLabel: getMonthName(report.month),
      categoryCount: rows.length,
      periodLabel: `${getMonthName(report.month)} ${report.year}`,
      year: report.year,
      currency: report.total.currency,
      total,
      totalLabel: totalLabel(canonical.totalAmount, currency)
    },
    columns: ['Category', 'Total', 'Share', 'Currency'],
    rows
  };
}

// Reshapes yearlyResult's 12 monthly totals into the generic model shape.
function createBarChartExportModel({ yearlyResult }) {
  const rows = yearlyResult.monthlyTotals.map((entry) => ({
    month: entry.label,
    total: roundedTotal(entry.amount ?? entry.total, entry.currency),
    currency: entry.currency
  }));
  // The annual total is the exact sum of the exact monthly amounts.
  const annualAmount =
    yearlyResult.totalAmount ??
    sumAmounts(yearlyResult.monthlyTotals.map((entry) => entry.amount ?? entry.total));
  const annualTotal = roundedTotal(annualAmount, yearlyResult.currency);
  const monthsWithCosts = yearlyResult.monthlyTotals.filter(
    (entry) => compareAmounts(entry.amount ?? entry.total, '0') > 0
  ).length;

  return {
    type: 'bar-chart',
    title: 'Yearly 12-Month Bar Chart',
    // R-080: annualTotal/monthsWithCosts are derived from all 12 months,
    // including zero-cost ones (see yearlyResult.monthlyTotals above).
    summary: [
      ['Year', yearlyResult.year],
      ['Currency', yearlyResult.currency],
      ['Annual Total', annualTotal],
      ['Months With Costs', monthsWithCosts]
    ],
    // Same metadata/summary duplication pattern as the report models above.
    metadata: {
      year: yearlyResult.year,
      currency: yearlyResult.currency,
      annualTotal,
      annualTotalLabel: totalLabel(annualAmount, yearlyResult.currency),
      monthsWithCosts
    },
    columns: ['Month', 'Total', 'Currency'],
    rows
  };
}

// Public builders: `rateDisclosure` (from rateDisclosureService.js) is
// optional and only passed when the report or chart used converted amounts.
export function buildMonthlyReportExportModel({ rateDisclosure = null, ...input }) {
  return withRateDisclosure(createMonthlyReportExportModel(input), rateDisclosure);
}

export function buildYearlyReportExportModel({ rateDisclosure = null, ...input }) {
  return withRateDisclosure(createYearlyReportExportModel(input), rateDisclosure);
}

export function buildPieChartExportModel({ rateDisclosure = null, ...input }) {
  return withRateDisclosure(createPieChartExportModel(input), rateDisclosure);
}

export function buildBarChartExportModel({ rateDisclosure = null, ...input }) {
  return withRateDisclosure(createBarChartExportModel(input), rateDisclosure);
}

export function getModelRowsForPdf(model) {
  return copyRows(model.rows).map((row) =>
    Object.entries(row).map(([key, value]) => formatPdfCell(key, value, row))
  );
}
