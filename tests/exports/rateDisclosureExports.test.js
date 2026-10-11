import { describe, expect, it } from 'vitest';
import {
  createWorkbookSheets
} from '../../src/services/export/excelExportService.js';
import {
  buildBarChartExportModel,
  buildMonthlyReportExportModel,
  buildPieChartExportModel,
  buildYearlyReportExportModel
} from '../../src/services/export/exportModels.js';
import {
  createChartPdfBuffer,
  createReportPdfBuffer
} from '../../src/services/export/pdfExportService.js';
import {
  getRateDisclosure,
  rateDisclosureContent
} from '../../src/services/rateDisclosureService.js';

/*
 * Pre-M2 hotfix: exports that contain converted amounts carry the
 * exchange-rate disclosure inside the file, while the numbers, columns, and
 * structure stay exactly as they were.
 */
const demo = getRateDisclosure(null);
const unverified = getRateDisclosure('https://rates.example.com/latest.json');

function cost(description, sum, currency = 'USD') {
  return {
    id: description,
    sum,
    currency,
    category: 'Food',
    description,
    date: { day: 2, month: 8, year: 2026, hour: 9, minute: 5 }
  };
}

const costs = [cost('Dinner', 100), cost('Coffee', 34, 'ILS')];
const monthlyReport = { month: 8, year: 2026, total: { currency: 'USD', sum: 110 } };
const yearlyReport = { year: 2026, total: { currency: 'USD', sum: 110 } };
const pieInput = {
  report: monthlyReport,
  chartData: [{ category: 'Food', total: 110 }]
};
const barInput = {
  yearlyResult: {
    currency: 'USD',
    year: 2026,
    monthlyTotals: Array.from({ length: 12 }, (_value, index) => ({
      month: index + 1,
      label: `Month ${index + 1}`,
      shortLabel: `M${index + 1}`,
      total: index === 7 ? 110 : 0,
      currency: 'USD'
    }))
  }
};

const builders = [
  ['monthly report', (rateDisclosure) => buildMonthlyReportExportModel({ report: monthlyReport, costs, rateDisclosure }), 'Costs'],
  ['yearly report', (rateDisclosure) => buildYearlyReportExportModel({ report: yearlyReport, costs, rateDisclosure }), 'Costs'],
  ['pie chart', (rateDisclosure) => buildPieChartExportModel({ ...pieInput, rateDisclosure }), 'Category Totals'],
  ['bar chart', (rateDisclosure) => buildBarChartExportModel({ ...barInput, rateDisclosure }), 'Monthly Totals']
];

function cellValue(cell) {
  return cell?.value ?? cell;
}

function pdfText(buffer) {
  return new TextDecoder().decode(new Uint8Array(buffer));
}

describe.each(builders)('%s export model', (_name, build) => {
  it('adds one disclosure row and metadata when a disclosure is given', () => {
    const model = build(demo);

    expect(model.summary.at(-1)).toEqual(['Exchange rates', demo.exportNote]);
    expect(model.metadata.rateDisclosure).toBe(demo.exportNote);
  });

  it('uses the neutral wording for an unverified source', () => {
    const model = build(unverified);

    expect(model.summary.at(-1)).toEqual([
      'Exchange rates',
      rateDisclosureContent.unverified.exportNote
    ]);
  });

  it('is identical to the previous model when no disclosure applies', () => {
    const withoutArgument = build(undefined);
    const withNull = build(null);

    expect(withNull).toEqual(withoutArgument);
    expect(withoutArgument.summary.some(([label]) => label === 'Exchange rates')).toBe(false);
    expect(withoutArgument.metadata.rateDisclosure).toBeUndefined();
  });

  it('keeps every other summary entry, metadata value, column, and row unchanged', () => {
    const plain = build(null);
    const disclosed = build(demo);

    expect(disclosed.summary.slice(0, -1)).toEqual(plain.summary);
    expect(disclosed.columns).toEqual(plain.columns);
    expect(disclosed.rows).toEqual(plain.rows);
    expect({ ...disclosed.metadata, rateDisclosure: undefined }).toEqual({
      ...plain.metadata,
      rateDisclosure: undefined
    });
  });
});

describe.each(builders)('%s Excel export', (_name, build, rowsSheetName) => {
  it('puts the disclosure in the Summary sheet as text and leaves numbers numeric', () => {
    const plain = createWorkbookSheets({ model: build(null), rowsSheetName });
    const disclosed = createWorkbookSheets({ model: build(demo), rowsSheetName });
    const summaryRows = disclosed[0].data.map((row) => row.map(cellValue));

    expect(summaryRows.at(-1)).toEqual(['Exchange rates', demo.exportNote]);
    // The note is plain text and wraps; it never replaces a numeric cell.
    expect(disclosed[0].data.at(-1)[1]).toMatchObject({ wrap: true });
    expect(typeof disclosed[0].data.at(-1)[1].value).toBe('string');

    // Every pre-existing summary row is identical, including numeric cells.
    expect(disclosed[0].data.slice(0, -1)).toEqual(plain[0].data);
    // The detail sheet is untouched.
    expect(disclosed[1]).toEqual(plain[1]);
  });

  it('keeps numeric cells numeric', () => {
    const sheets = createWorkbookSheets({ model: build(demo), rowsSheetName });
    const numericCells = sheets.flatMap((sheet) => sheet.data.flat()).filter((cell) => cell?.type === Number);

    expect(numericCells.length).toBeGreaterThan(0);
    numericCells.forEach((cell) => expect(typeof cell.value).toBe('number'));
  });
});

describe('PDF exports', () => {
  it.each([
    ['monthly report', () => createReportPdfBuffer(buildMonthlyReportExportModel({ report: monthlyReport, costs, rateDisclosure: demo }))],
    ['yearly report', () => createReportPdfBuffer(buildYearlyReportExportModel({ report: yearlyReport, costs, rateDisclosure: demo }))],
    ['pie chart', () => createChartPdfBuffer(buildPieChartExportModel({ ...pieInput, rateDisclosure: demo }))],
    ['bar chart', () => createChartPdfBuffer(buildBarChartExportModel({ ...barInput, rateDisclosure: demo }))]
  ])('%s PDF states the disclosure in the document text', async (_name, create) => {
    const text = pdfText(await create());

    expect(text).toContain('Exchange rates:');
    // The sentence wraps, so check its opening and its closing words.
    expect(text).toContain('Demonstration exchange rates');
    expect(text).toContain('financial decisions');
  });

  it.each([
    ['monthly report', () => createReportPdfBuffer(buildMonthlyReportExportModel({ report: monthlyReport, costs }))],
    ['bar chart', () => createChartPdfBuffer(buildBarChartExportModel(barInput))]
  ])('%s PDF has no disclosure when none applies', async (_name, create) => {
    const text = pdfText(await create());

    expect(text).not.toContain('Exchange rates:');
    expect(text).not.toContain('Demonstration exchange rates');
  });

  it('uses the neutral wording for an unverified source', async () => {
    const text = pdfText(
      await createReportPdfBuffer(
        buildMonthlyReportExportModel({ report: monthlyReport, costs, rateDisclosure: unverified })
      )
    );

    expect(text).toContain('Exchange-rate source not verified');
    expect(text).not.toContain('Demonstration exchange rates');
  });
});
