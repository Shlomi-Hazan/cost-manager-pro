import { describe, expect, it } from 'vitest';
import { getIncompleteNotice } from '../../src/services/conversionDisclosure.js';
import { createWorkbookSheets } from '../../src/services/export/excelExportService.js';
import {
  buildBarChartExportModel,
  buildMonthlyReportExportModel,
  buildPieChartExportModel,
  getModelRowsForPdf
} from '../../src/services/export/exportModels.js';
import { createChartPdfBuffer, createReportPdfBuffer } from '../../src/services/export/pdfExportService.js';

/*
 * M2B.2: an incomplete report must not be exported as if it were complete.
 * The file says "Unavailable" in the same places a number would be, flags the
 * conversion, and never writes 0.
 */
const notice = getIncompleteNotice({ counts: { unavailable: 2 }, unavailableReasons: ['rates-not-available'] });
const costs = [{ id: 'a', sum: 5, currency: 'GBP', category: 'Food', description: 'Train', date: { day: 2, month: 8, year: 2026, hour: 9, minute: 5 } }];
const report = { month: 8, year: 2026, total: { currency: 'USD', sum: null } };
const text = (buffer) => new TextDecoder().decode(new Uint8Array(buffer));
const cell = (value) => value?.value ?? value;

describe('incomplete exports', () => {
  it('writes Unavailable for the report total, keeps the original rows, and flags the conversion', () => {
    const model = buildMonthlyReportExportModel({ report, costs, totalAmount: null, incompleteNotice: notice });
    const sheets = createWorkbookSheets({ model, rowsSheetName: 'Costs' });
    const summary = sheets[0].data.map((row) => row.map(cell));

    expect(summary).toContainEqual(['Total', 'Unavailable']);
    expect(summary.some(([label, value]) => label === 'Conversion' && /2 expenses could not be converted/.test(value))).toBe(true);
    expect(model.metadata).toMatchObject({ total: 'Unavailable', totalLabel: 'Unavailable', conversionStatus: 'incomplete', unavailableCount: 2 });
    expect(sheets[1].data).toHaveLength(2);
    // No numeric zero is ever written for the total.
    expect(sheets[0].data.flat().filter((entry) => entry?.type === Number).map((entry) => entry.value)).not.toContain(0);
  });

  it('writes Unavailable in the PDF as well', async () => {
    const model = buildMonthlyReportExportModel({ report, costs, totalAmount: null, incompleteNotice: notice });
    const pdf = text(await createReportPdfBuffer(model));

    expect(pdf).toContain('Total: Unavailable');
    expect(pdf).toContain('Conversion:');
  });

  it('exports an unavailable pie as no categories, with Unavailable as the total', async () => {
    const model = buildPieChartExportModel({ report, chartData: [], financials: { status: 'unavailable', totalAmount: null, entries: [] }, incompleteNotice: notice });

    expect(model.rows).toEqual([]);
    expect(model.metadata.total).toBe('Unavailable');
    expect(text(await createChartPdfBuffer(model))).toContain('Total: Unavailable');
  });

  it('exports unavailable bar months as Unavailable (a complete empty month stays 0)', async () => {
    const months = Array.from({ length: 12 }, (_value, index) => ({
      month: index + 1,
      label: `Month ${index + 1}`,
      shortLabel: `M${index + 1}`,
      currency: 'USD',
      amount: index === 7 ? null : '0',
      total: index === 7 ? null : 0
    }));
    const model = buildBarChartExportModel({ yearlyResult: { currency: 'USD', year: 2026, monthlyTotals: months, totalAmount: null }, incompleteNotice: notice });
    const sheets = createWorkbookSheets({ model, rowsSheetName: 'Monthly Totals' });
    const monthRows = sheets[1].data.slice(1).map((row) => row.map(cell));

    expect(monthRows[7][1]).toBe('Unavailable');
    expect(monthRows[0][1]).toBe(0);
    expect(model.metadata.annualTotal).toBe('Unavailable');
    expect(getModelRowsForPdf(model)[7][1]).toBe('Unavailable');
    expect(text(await createChartPdfBuffer(model))).toContain('Annual total: Unavailable');
  });

  it('a complete model is unchanged by the new options (no conversion row)', () => {
    const model = buildMonthlyReportExportModel({ report: { ...report, total: { currency: 'USD', sum: 5 } }, costs, totalAmount: '5' });

    expect(model.summary.some(([label]) => label === 'Conversion' || label === 'Exchange rates')).toBe(false);
    expect(model.metadata.conversionStatus).toBeUndefined();
  });
});
