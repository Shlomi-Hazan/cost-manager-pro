import { describe, expect, it } from 'vitest';
import {
  createChartPdfBuffer,
  createReportPdfBuffer,
  fitImageWithinBounds
} from '../../src/services/export/pdfExportService.js';
import {
  buildBarChartExportModel,
  buildMonthlyReportExportModel,
  buildPieChartExportModel,
  buildYearlyReportExportModel
} from '../../src/services/export/exportModels.js';

/*
 * TEAM EXTENSION tests: decodes the raw PDF byte buffer back to text so
 * assertions can check for real PDF structure/content (e.g. the "%PDF-"
 * header, embedded text) rather than only checking that some bytes exist.
 */
function decodePdf(buffer) {
  return new TextDecoder().decode(new Uint8Array(buffer));
}

function createCost(description, sum) {
  return {
    id: description,
    sum,
    currency: 'USD',
    category: 'Food',
    description,
    date: {
      day: 2,
      month: 8,
      year: 2026,
      hour: 9,
      minute: 5
    }
  };
}

describe('pdfExportService', () => {
  it('fits landscape images within bounds while preserving aspect ratio', () => {
    const size = fitImageWithinBounds({
      width: 1000,
      height: 500,
      maxWidth: 500,
      maxHeight: 260
    });

    expect(size).toEqual({ width: 500, height: 250 });
  });

  it('fits portrait images within bounds while preserving aspect ratio', () => {
    const size = fitImageWithinBounds({
      width: 500,
      height: 1000,
      maxWidth: 500,
      maxHeight: 260
    });

    expect(size.width).toBe(130);
    expect(size.height).toBe(260);
  });

  it('fits square images without exceeding bounds', () => {
    const size = fitImageWithinBounds({
      width: 600,
      height: 600,
      maxWidth: 500,
      maxHeight: 260
    });

    expect(size.width).toBe(260);
    expect(size.height).toBe(260);
  });

  it('preserves image aspect ratio when fitting', () => {
    const sourceRatio = 1200 / 400;
    const size = fitImageWithinBounds({
      width: 1200,
      height: 400,
      maxWidth: 500,
      maxHeight: 260
    });

    expect(size.width).toBeLessThanOrEqual(500);
    expect(size.height).toBeLessThanOrEqual(260);
    expect(size.width / size.height).toBeCloseTo(sourceRatio);
  });

  it('creates a Monthly report PDF with title, metadata, total, and rows', async () => {
    const model = buildMonthlyReportExportModel({
      report: {
        month: 8,
        year: 2026,
        total: { currency: 'USD', sum: 127.35294117647058 }
      },
      costs: [
        createCost('large', 7.352941176470589),
        createCost('small', 2)
      ]
    });
    const text = decodePdf(await createReportPdfBuffer(model));

    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text).toContain('Monthly Report');
    expect(text).toContain('Period: August 2026');
    // M2A.2 (Policy B): a computed total is rounded once to the currency's minor unit.
    expect(text).toContain('Total: 127.35 USD');
    expect(text).toContain('Number of costs: 2');
    // A stored original sum is shown as stored, never rounded or truncated.
    expect(text).toContain('7.352941176470589');
    expect(text).not.toContain('7.352941 ');
    expect(text.indexOf('large')).toBeLessThan(text.indexOf('small'));
  });

  it('creates a Yearly report PDF with year and date rows', async () => {
    const model = buildYearlyReportExportModel({
      report: {
        year: 2026,
        total: { currency: 'USD', sum: 7.352941176470589 }
      },
      costs: [createCost('year row', 7.352941176470589)]
    });
    const text = decodePdf(await createReportPdfBuffer(model));

    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text).toContain('Yearly Report');
    expect(text).toContain('Year: 2026');
    expect(text).toContain('02/08/2026');
    expect(text).toContain('7.352941176470589');
    expect(text).toContain('Total: 7.35 USD');
  });

  it('creates a Pie chart PDF with supporting data and no-data handling', async () => {
    const model = buildPieChartExportModel({
      report: {
        month: 8,
        year: 2026,
        total: { currency: 'USD', sum: 0 }
      },
      chartData: []
    });
    const text = decodePdf(await createChartPdfBuffer(model, null));

    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text).toContain('Monthly Category Pie Chart');
    expect(text).toContain('No chart visualization is available');
  });

  it('formats Pie chart PDF totals and percentages for presentation', async () => {
    const model = buildPieChartExportModel({
      report: {
        month: 8,
        year: 2026,
        total: { currency: 'USD', sum: 17.35294117647059 }
      },
      chartData: [
        { category: 'Food', total: 7.352941176470589 },
        { category: 'Shopping', total: 10 }
      ]
    });
    const text = decodePdf(await createChartPdfBuffer(model, null));

    expect(text).toContain('7.35');
    expect(text).toContain('42.4%');
    expect(text).not.toContain('7.352941176470589');
  });

  it('creates a Bar chart PDF with all supporting rows', async () => {
    const monthlyTotals = Array.from({ length: 12 }, (_value, index) => ({
      month: index + 1,
      label: `Month ${index + 1}`,
      shortLabel: `M${index + 1}`,
      total: index === 0 ? 7.352941176470589 : 0,
      currency: 'USD'
    }));
    const model = buildBarChartExportModel({
      yearlyResult: {
        year: 2026,
        currency: 'USD',
        monthlyTotals
      }
    });
    const text = decodePdf(await createChartPdfBuffer(model, null));

    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text).toContain('Yearly 12-Month Bar Chart');
    expect(text).toContain('Month 1');
    expect(text).toContain('Month 12');
    expect(text).toContain('7.35');
    expect(text).not.toContain('7.352941176470589');
  });
});
