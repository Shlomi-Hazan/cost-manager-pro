import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCachedExchangeRates, setCachedExchangeRates } from '../../src/lib/exchangeRatesCache.js';
import { db, getCostsStorageKey } from '../../src/lib/db.js';
import { convertDecimalAmount, roundAmount, sumAmounts } from '../../src/lib/money/decimal.js';
import {
  buildCategoryFinancials,
  buildYearlyFinancials,
  sumCostsExact
} from '../../src/lib/money/financials.js';
import { formatAmount, roundForCurrency } from '../../src/lib/money/format.js';
import { buildDetailedMonthlyReport, buildDetailedYearlyReport } from '../../src/services/detailedReportsService.js';
import { createWorkbookSheets } from '../../src/services/export/excelExportService.js';
import {
  buildBarChartExportModel,
  buildMonthlyReportExportModel,
  buildPieChartExportModel,
  buildYearlyReportExportModel,
  getModelRowsForPdf
} from '../../src/services/export/exportModels.js';
import { createRandom } from './oracle.js';

/*
 * M2A.2 Policy B: exact decimals through every conversion and sum; one
 * rounding, half away from zero, at presentation/export.
 */
const rates = { USD: 1, GBP: 0.6, EURO: 0.7, ILS: 3.4 };

function openDatabase(name) {
  return db.openCostsDB(name, 1);
}

function addAll(ob, entries) {
  entries.forEach(([sum, currency, category = 'Food']) =>
    ob.addCost({ sum, currency, category, description: `${sum} ${currency}` })
  );
}

describe('Policy B', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 7, 15, 12, 0, 0));
    setCachedExchangeRates(rates);
  });

  afterEach(() => {
    vi.useRealTimers();
    clearCachedExchangeRates();
    localStorage.clear();
  });

  it('three 0.333 costs total exactly 0.999, display 1.00, while each row shows 0.333', () => {
    const ob = openDatabase('b1');
    addAll(ob, [[0.333, 'USD'], [0.333, 'USD'], [0.333, 'USD']]);

    const report = ob.getReport('USD');
    const exact = sumCostsExact(report.costs, 'USD', null);

    expect(exact).toBe('0.999');
    expect(report.total.sum).toBe(0.999);
    expect(roundForCurrency(exact, 'USD')).toBe('1.00');
    // Rounded components (0.33 x 3 = 0.99) legitimately differ from the
    // rounded total (1.00); no residual is allocated.
    expect(roundForCurrency('0.333', 'USD')).toBe('0.33');
    expect(Number(roundForCurrency('0.333', 'USD')) * 3).toBeCloseTo(0.99, 10);
  });

  it('does not round each converted expense before summing', () => {
    // 3 x 33.33 ILS -> USD at 3.4. Per-row rounding gives 9.80 x 3 = 29.40;
    // the exact sum is 99.99 / 3.4 = 29.4088..., which displays as 29.41.
    const ob = openDatabase('b2');
    addAll(ob, [[33.33, 'ILS'], [33.33, 'ILS'], [33.33, 'ILS']]);

    const report = ob.getReport('USD');
    const exact = sumCostsExact(report.costs, 'USD', rates);

    expect(roundAmount(exact, 2)).toBe('29.41');
    expect(roundAmount(convertDecimalAmount('33.33', 3.4, 1), 2)).toBe('9.80');
    expect(formatAmount(report.total.sum, 'USD')).toBe('29.41');
  });

  it('repeated tiny expenses are not rounded away or inflated', () => {
    expect(sumAmounts(Array(10000).fill('0.001'))).toBe('10');
    expect(sumAmounts(Array(1000).fill('1'))).toBe('1000');
    // 1,000 one-unit expenses at 150 units per USD: 1000 / 150 = 6.67 USD.
    // Rounding each one first would have produced 1000 x 0.01 = 10.00.
    const converted = Array.from({ length: 1000 }, () => convertDecimalAmount('1', 150, 1));

    expect(roundAmount(sumAmounts(converted), 2)).toBe('6.67');
  });

  it('is independent of order and grouping', () => {
    const random = createRandom(4242);
    const values = Array.from({ length: 200 }, () =>
      convertDecimalAmount(String(Math.floor(random() * 100000) / 100), 3.4, 0.7)
    );
    const reference = sumAmounts(values);
    const shuffled = [...values].sort(() => random() - 0.5);
    const chunks = [];

    for (let index = 0; index < values.length; index += 17) {
      chunks.push(sumAmounts(values.slice(index, index + 17)));
    }
    expect(sumAmounts(shuffled)).toBe(reference);
    expect(sumAmounts(chunks)).toBe(reference);
  });

  it('every surface shows the same total from the same exact value', () => {
    const ob = openDatabase('b3');
    addAll(ob, [
      [33.33, 'ILS', 'Food'],
      [33.33, 'ILS', 'Food'],
      [33.33, 'ILS', 'Fun'],
      [12.5, 'GBP', 'Fun'],
      [0.333, 'USD', 'Food']
    ]);
    const report = ob.getReport('USD', 2026, 8);
    const exact = sumCostsExact(report.costs, 'USD', rates);
    const categories = buildCategoryFinancials(report.costs, 'USD', rates);
    const yearly = buildYearlyFinancials((c, y, m) => ob.getReport(c, y, m), 'USD', 2026, rates);
    const detailedMonth = buildDetailedMonthlyReport(ob, 'USD', 2026, 8);
    const detailedYear = buildDetailedYearlyReport(ob, 'USD', 2026);

    expect(categories.totalAmount).toBe(exact);
    expect(yearly.months[7].amount).toBe(exact);
    expect(yearly.totalAmount).toBe(exact);
    expect(detailedMonth.totalAmount).toBe(exact);
    expect(detailedYear.totalAmount).toBe(exact);
    expect(report.total.sum).toBe(Number(exact));

    // Zero months are present and zero.
    expect(yearly.months).toHaveLength(12);
    expect(yearly.months.filter((month) => month.amount === '0')).toHaveLength(11);

    const shown = roundForCurrency(exact, 'USD');
    const monthly = buildMonthlyReportExportModel({
      report,
      costs: detailedMonth.costs,
      totalAmount: detailedMonth.totalAmount
    });
    const pie = buildPieChartExportModel({
      report,
      chartData: [],
      financials: categories
    });
    const bar = buildBarChartExportModel({
      yearlyResult: { currency: 'USD', year: 2026, monthlyTotals: yearly.months, totalAmount: yearly.totalAmount }
    });
    const yearlyReport = buildYearlyReportExportModel({
      report: detailedYear,
      costs: detailedYear.costs,
      totalAmount: detailedYear.totalAmount
    });

    expect(monthly.metadata.total).toBe(Number(shown));
    expect(pie.metadata.total).toBe(Number(shown));
    expect(bar.metadata.annualTotal).toBe(Number(shown));
    expect(yearlyReport.metadata.total).toBe(Number(shown));
    expect(monthly.metadata.totalLabel).toBe(`${shown} USD`);
  });

  it('keeps stored sums intact in the export: original rows are not rounded', () => {
    const ob = openDatabase('b4');
    addAll(ob, [[0.333, 'USD'], [0.333, 'USD'], [0.333, 'USD']]);
    const report = ob.getReport('USD');
    const detailed = buildDetailedMonthlyReport(ob, 'USD', 2026, 8);
    const model = buildMonthlyReportExportModel({
      report,
      costs: detailed.costs,
      totalAmount: detailed.totalAmount
    });
    const sheets = createWorkbookSheets({ model, rowsSheetName: 'Costs' });
    const sumCells = sheets[1].data.slice(1).map((row) => row[4]);

    expect(sumCells.map((cell) => cell.value)).toEqual([0.333, 0.333, 0.333]);
    // The total is a real number: the value rounded once, not a string.
    const totalCell = sheets[0].data.find((row) => row[0]?.value === 'Total')[1];

    expect(totalCell).toMatchObject({ value: 1, type: Number, format: '#,##0.00######' });
    // PDF text equals the on-screen text.
    expect(getModelRowsForPdf(model)[0][4]).toBe('0.333');
    expect(model.metadata.totalLabel).toBe('1.00 USD');
  });

  it('does not fabricate an amount when a needed rate is missing', () => {
    clearCachedExchangeRates();
    const ob = openDatabase('b5');
    addAll(ob, [[10, 'ILS']]);

    expect(() => ob.getReport('USD')).toThrow('Cross-currency report totals require cached exchange rates.');
    expect(() => buildCategoryFinancials([{ sum: 10, currency: 'ILS', category: 'Food' }], 'USD', null)).toThrow(
      'Exchange rates are required for mixed-currency chart aggregation.'
    );
    // Same-currency data still works with no rates at all.
    expect(sumCostsExact([{ sum: 10, currency: 'USD' }], 'USD', null)).toBe('10');
  });

  it('reports, charts, and exports never change stored data', () => {
    const ob = openDatabase('b6');
    addAll(ob, [[33.33, 'ILS', 'Food'], [0.333, 'USD', 'Fun'], [12.5, 'GBP', 'Food']]);
    const key = getCostsStorageKey('b6', 1);
    const before = localStorage.getItem(key);
    const snapshot = JSON.stringify(Object.entries(localStorage));
    const report = ob.getReport('USD');
    const categories = buildCategoryFinancials(report.costs, 'USD', rates);
    const yearly = buildYearlyFinancials((c, y, m) => ob.getReport(c, y, m), 'USD', 2026, rates);
    const detailed = buildDetailedMonthlyReport(ob, 'USD', 2026, 8);

    buildMonthlyReportExportModel({ report, costs: detailed.costs, totalAmount: detailed.totalAmount });
    buildPieChartExportModel({ report, chartData: [], financials: categories });
    buildBarChartExportModel({
      yearlyResult: { currency: 'USD', year: 2026, monthlyTotals: yearly.months, totalAmount: yearly.totalAmount }
    });
    buildDetailedYearlyReport(ob, 'USD', 2026);

    expect(localStorage.getItem(key)).toBe(before);
    expect(JSON.stringify(Object.entries(localStorage))).toBe(snapshot);
    // Stored sums are still the JSON numbers that were stored.
    expect(JSON.parse(before).costs.map((cost) => cost.sum)).toEqual([33.33, 0.333, 12.5]);
  });

  it('percent shares come from the exact values and are not forced to 100', () => {
    const financials = buildCategoryFinancials(
      [
        { sum: 1, currency: 'USD', category: 'A' },
        { sum: 1, currency: 'USD', category: 'B' },
        { sum: 1, currency: 'USD', category: 'C' }
      ],
      'USD',
      null
    );

    expect(financials.entries.map((entry) => entry.percentageText)).toEqual(['33.3', '33.3', '33.3']);
    expect(financials.totalAmount).toBe('3');
  });
});

describe('pie export share cells', () => {
  it('hold the displayed share as a clean ratio with no binary noise', () => {
    const financials = buildCategoryFinancials(
      [
        { sum: 19.6058823529, currency: 'USD', category: 'Food' },
        { sum: 10.8019, currency: 'USD', category: 'Fun' },
        { sum: 20.8333, currency: 'USD', category: 'Travel' }
      ],
      'USD',
      null
    );
    const model = buildPieChartExportModel({
      report: { month: 10, year: 2026, total: { currency: 'USD', sum: 51 } },
      chartData: [],
      financials
    });

    // Number('38.3') / 100 would be 0.38299999999999995.
    expect(model.rows.map((row) => row.percentage)).toEqual([0.383, 0.211, 0.407]);
  });
});
