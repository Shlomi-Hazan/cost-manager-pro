import { describe, expect, it } from 'vitest';
import {
  createBarChartWorkbookBlob,
  createPieChartWorkbookBlob,
  createReportWorkbookBlob,
  createWorkbookSheets
} from '../../src/services/export/excelExportService.js';
import {
  buildBarChartExportModel,
  buildMonthlyReportExportModel,
  buildPieChartExportModel,
  buildYearlyReportExportModel
} from '../../src/services/export/exportModels.js';

/*
 * TEAM EXTENSION tests: an .xlsx file is a real ZIP archive under the hood
 * ("PK" magic bytes) — checking the actual file signature (below) is
 * stronger evidence of a genuine spreadsheet than just checking the Blob's
 * declared MIME type, which a renamed CSV could fake.
 */
async function getBlobSignature(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());

  return String.fromCharCode(bytes[0], bytes[1]);
}

function cellValue(cell) {
  return cell?.value ?? cell;
}

function rowValues(row) {
  return row.map(cellValue);
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

describe('excelExportService', () => {
  it('creates a real Monthly XLSX Blob and passes sorted numeric cost rows', async () => {
    const model = buildMonthlyReportExportModel({
      report: {
        month: 8,
        year: 2026,
        total: { currency: 'USD', sum: 127.5 }
      },
      costs: [
        createCost('small', 2),
        createCost('middle', 25.5),
        createCost('large', 100)
      ]
    });
    const sheets = createWorkbookSheets({
      model,
      rowsSheetName: 'Costs'
    });
    const blob = await createReportWorkbookBlob(model);

    expect(await getBlobSignature(blob)).toBe('PK');
    expect(blob.size).toBeGreaterThan(0);
    expect(sheets.map((sheet) => sheet.sheet)).toEqual(['Summary', 'Costs']);
    expect(cellValue(sheets[0].data[0][0])).toBe('COST MANAGER');
    expect(sheets[0].data[0][0]).toMatchObject({
      columnSpan: 2,
      fontWeight: 'bold'
    });
    expect(cellValue(sheets[0].data[1][0])).toBe('Monthly Report');
    expect(rowValues(sheets[0].data[3])).toEqual(['Field', 'Value']);
    expect(sheets[0].data[3][0]).toMatchObject({
      backgroundColor: '#2563EB',
      fontWeight: 'bold',
      textColor: '#FFFFFF'
    });
    expect(rowValues(sheets[0].data[4])).toEqual(['Period', 'August 2026']);
    expect(rowValues(sheets[0].data[7])).toEqual(['Number of Costs', 3]);
    expect(sheets[0].data[6][1]).toMatchObject({
      value: 127.5,
      type: Number,
      format: '#,##0.00######'
    });
    expect(sheets[1].stickyRowsCount).toBe(1);
    expect(rowValues(sheets[1].data[0])).toEqual([
      'Day',
      'Time',
      'Description',
      'Category',
      'Sum',
      'Currency'
    ]);
    expect(sheets[1].data[0][0]).toMatchObject({
      backgroundColor: '#2563EB',
      fontWeight: 'bold',
      textColor: '#FFFFFF'
    });
    expect(sheets[1].columns.map((column) => column.width)).toEqual([
      10,
      10,
      36,
      22,
      16,
      14
    ]);
    expect(sheets[1].data.slice(1).map(rowValues)).toEqual([
      [2, '09:05', 'small', 'Food', 2, 'USD'],
      [2, '09:05', 'middle', 'Food', 25.5, 'USD'],
      [2, '09:05', 'large', 'Food', 100, 'USD']
    ]);
    expect(sheets[1].data[1][4]).toMatchObject({
      value: 2,
      type: Number,
      format: '#,##0.00######'
    });
    expect(sheets[1].data[1][2]).toMatchObject({ wrap: true });
  });

  it('creates a Yearly XLSX Blob with full Date rows', async () => {
    const model = buildYearlyReportExportModel({
      report: {
        year: 2026,
        total: { currency: 'USD', sum: 100 }
      },
      costs: [createCost('January', 100)]
    });
    const sheets = createWorkbookSheets({
      model,
      rowsSheetName: 'Costs'
    });
    const blob = await createReportWorkbookBlob(model);

    expect(await getBlobSignature(blob)).toBe('PK');
    expect(rowValues(sheets[0].data[4])).toEqual(['Year', 2026]);
    expect(sheets[0].data[4][1]).toMatchObject({
      value: 2026,
      type: Number,
      format: '0'
    });
    expect(rowValues(sheets[0].data[7])).toEqual(['Number of Costs', 1]);
    expect(cellValue(sheets[1].data[1][0])).toBe('02/08/2026');
    expect(sheets[1].data[1][4]).toMatchObject({
      value: 100,
      type: Number,
      format: '#,##0.00######'
    });
  });

  it('creates Pie chart XLSX category totals with numeric totals', async () => {
    const model = buildPieChartExportModel({
      report: {
        month: 8,
        year: 2026,
        total: { currency: 'USD', sum: 125 }
      },
      chartData: [{ category: 'Food', total: 125 }]
    });
    const sheets = createWorkbookSheets({
      model,
      rowsSheetName: 'Category Totals'
    });
    const blob = await createPieChartWorkbookBlob(model);

    expect(await getBlobSignature(blob)).toBe('PK');
    expect(sheets[1].sheet).toBe('Category Totals');
    expect(rowValues(sheets[0].data[4])).toEqual(['Period', 'August 2026']);
    expect(rowValues(sheets[0].data[7])).toEqual(['Number of Categories', 1]);
    expect(rowValues(sheets[1].data[0])).toEqual([
      'Category',
      'Total',
      'Share',
      'Currency'
    ]);
    expect(rowValues(sheets[1].data[1])).toEqual(['Food', 125, 1, 'USD']);
    expect(sheets[1].data[1][1]).toMatchObject({
      value: 125,
      type: Number,
      format: '#,##0.00######'
    });
    expect(sheets[1].data[1][2]).toMatchObject({
      value: 1,
      type: Number,
      format: '0.0%'
    });
  });

  it('creates Bar chart XLSX with all 12 monthly rows including zeros', async () => {
    const monthlyTotals = Array.from({ length: 12 }, (_value, index) => ({
      month: index + 1,
      label: `Month ${index + 1}`,
      shortLabel: `M${index + 1}`,
      total: index === 0 ? 100 : 0,
      currency: 'USD'
    }));
    const model = buildBarChartExportModel({
      yearlyResult: {
        year: 2026,
        currency: 'USD',
        monthlyTotals
      }
    });
    const sheets = createWorkbookSheets({
      model,
      rowsSheetName: 'Monthly Totals'
    });
    const blob = await createBarChartWorkbookBlob(model);

    expect(await getBlobSignature(blob)).toBe('PK');
    expect(rowValues(sheets[0].data[6])).toEqual(['Annual Total', 100]);
    expect(rowValues(sheets[0].data[7])).toEqual(['Months With Costs', 1]);
    expect(sheets[1].data).toHaveLength(13);
    expect(rowValues(sheets[1].data[1])).toEqual(['Month 1', 100, 'USD']);
    expect(cellValue(sheets[1].data[2][1])).toBe(0);
    expect(cellValue(sheets[1].data[12][1])).toBe(0);
    expect(sheets[1].data[1][1]).toMatchObject({
      value: 100,
      type: Number,
      format: '#,##0.00######'
    });
  });
});
