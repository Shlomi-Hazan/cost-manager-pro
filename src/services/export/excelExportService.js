/*
 * TEAM EXTENSION (X-007): generates real .xlsx workbooks (via
 * write-excel-file, not a renamed CSV) for the Monthly/Yearly reports and
 * Pie/Bar charts. All styling constants below only affect how the exported
 * spreadsheet looks — numeric cells are still written as real numbers (see
 * amountFormatPattern), so the exported file remains usable for further
 * calculation, not just visual inspection.
 */
import { normalizeAmount } from '../../lib/money/decimal.js';
import { downloadBlob } from './downloadService.js';

// One sheet name per export type; also used as this module's rowsSheetName.
const sheetNames = {
  summary: 'Summary',
  reportCosts: 'Costs',
  categoryTotals: 'Category Totals',
  monthlyTotals: 'Monthly Totals'
};

// Excel number-format strings, applied via numericCell() below.
// At least two decimals (rounded totals), up to eight (stored sums that were
// entered with more precision are shown, not hidden).
const amountFormatPattern = '#,##0.00######';
const percentageFormatPattern = '0.0%';

/*
 * Original (stored) amounts are written as real numbers and never rounded, so
 * a tiny or long stored amount must not LOOK like zero or like a shorter
 * number. The shared amount format shows at most eight decimals, so a stored
 * amount with more decimals gets its own exact-digit format (Excel allows up
 * to 30 decimals), and one beyond that a scientific format. Excel itself can
 * only keep and show about 15 significant digits and cannot represent
 * magnitudes below about 2.2e-308; a workbook with such an amount says so in
 * a summary note instead of turning the cell into text.
 */
const amountDisplayDecimals = 8;
const excelMaxFormatDecimals = 30;
const excelSignificantDigits = 15;
const excelSmallestPositive = 2.2250738585072014e-308;
const precisionNote =
  'Some original amounts have more precision than Excel can store or show (about 15 significant digits). The stored values are kept exactly in Cost Manager Pro; Excel may display fewer digits.';

// Chooses the number format of one stored amount and whether Excel can hold
// it faithfully. Reads the exact decimal text, never a rounded value.
function getStoredAmountPresentation(value) {
  const canonical = normalizeAmount(value);
  const fractionLength = canonical.split('.')[1]?.length ?? 0;
  const significantDigits = canonical.replace(/[-.]/g, '').replace(/^0+/, '').length;
  const exceedsExcel =
    significantDigits > excelSignificantDigits ||
    (value !== 0 && Math.abs(value) < excelSmallestPositive);
  let format = amountFormatPattern;

  if (fractionLength > excelMaxFormatDecimals) {
    format = `0.${'0'.repeat(Math.max(1, Math.min(significantDigits, excelSignificantDigits) - 1))}E+00`;
  } else if (fractionLength > amountDisplayDecimals) {
    format = `#,##0.${'0'.repeat(fractionLength)}`;
  }

  return { format, exceedsExcel };
}
const yearFormatPattern = '0';

// Shared color palette for every cell style in this file.
const colors = {
  primary: '#2563EB',
  darkText: '#1E293B',
  secondaryText: '#64748B',
  lightBackground: '#F8FAFC',
  border: '#CBD5E1',
  white: '#FFFFFF'
};

const headerStyle = {
  backgroundColor: colors.primary,
  borderColor: colors.border,
  borderStyle: 'thin',
  fontWeight: 'bold',
  textColor: colors.white
};

const bodyCellStyle = {
  borderColor: colors.border,
  borderStyle: 'thin',
  alignVertical: 'top'
};

// Character widths tuned per column so typical values fit without wrapping.
const columnWidths = {
  Category: 22,
  Currency: 14,
  Date: 14,
  Day: 10,
  Description: 36,
  Month: 18,
  Share: 12,
  Sum: 16,
  Time: 10,
  Total: 16
};

// Dynamically imported so the (fairly large) write-excel-file library is
// only downloaded when a user actually exports something, not as part of
// the app's initial bundle.
async function loadWriter() {
  const module = await import('write-excel-file/browser');

  return module.default;
}

// Spans both summary columns; used for the two title rows at the top.
function titleCell(value, options = {}) {
  return {
    value,
    columnSpan: 2,
    fontWeight: 'bold',
    textColor: colors.darkText,
    ...options
  };
}

// Column header cell, shared by both the summary and data-rows sheets.
function headerCell(value) {
  return {
    value,
    ...headerStyle
  };
}

// The "Field" column of the summary sheet, e.g. "Total".
function metadataLabelCell(value, isEmphasized = false) {
  return {
    value,
    ...bodyCellStyle,
    backgroundColor: isEmphasized ? '#DBEAFE' : colors.lightBackground,
    fontWeight: 'bold',
    textColor: colors.darkText
  };
}

// Default cell type for plain string data (description, category, etc).
function textCell(value, options = {}) {
  return {
    value,
    ...bodyCellStyle,
    textColor: colors.darkText,
    ...options
  };
}

// type: Number keeps the written cell a real number, not text that merely
// looks like one, so the exported file stays usable for further calculation.
function numericCell(value, format = amountFormatPattern, options = {}) {
  return {
    value,
    type: Number,
    format,
    ...bodyCellStyle,
    align: 'right',
    textColor: colors.darkText,
    ...options
  };
}

// Picks the right cell type/format for one summary row's value, and
// highlights Total/Annual Total rows so they stand out from the rest.
function createValueCell(label, value) {
  const isEmphasized = label === 'Total' || label === 'Annual Total';

  if (label === 'Year' && typeof value === 'number') {
    return numericCell(value, yearFormatPattern);
  }

  if (typeof value === 'number') {
    return numericCell(value, amountFormatPattern, {
      backgroundColor: isEmphasized ? '#DBEAFE' : undefined,
      fontWeight: isEmphasized ? 'bold' : undefined
    });
  }

  // The exchange-rate disclosure is a long sentence, so it wraps instead of
  // running past the Value column.
  return textCell(value, {
    backgroundColor: isEmphasized ? '#DBEAFE' : undefined,
    fontWeight: isEmphasized ? 'bold' : undefined,
    wrap: label === 'Exchange rates' || label === 'Precision' || label === 'Conversion'
  });
}

// The first sheet in every export: title rows, then a Field/Value table
// built from the export model's `summary` array.
function createSummarySheet(model) {
  // One note, only when a stored amount is beyond what Excel can hold.
  const summary = model.rows.some(
    (row) => typeof row.sum === 'number' && getStoredAmountPresentation(row.sum).exceedsExcel
  )
    ? [...model.summary, ['Precision', precisionNote]]
    : model.summary;

  return {
    sheet: sheetNames.summary,
    data: [
      [titleCell('COST MANAGER', { fontSize: 18 }), null],
      [titleCell(model.title, { fontSize: 14, textColor: colors.primary }), null],
      [null, null],
      [headerCell('Field'), headerCell('Value')],
      ...summary.map(([label, value]) => {
        const isEmphasized = label === 'Total' || label === 'Annual Total';

        return [
          metadataLabelCell(label, isEmphasized),
          createValueCell(label, value)
        ];
      })
    ],
    columns: [{ width: 24 }, { width: 32 }]
  };
}

// Picks the right cell type/format per column for one data row.
function createDataCell(column, value) {
  if (column === 'Sum') {
    // A stored original amount: exact-digit format, never rounded.
    return numericCell(value, getStoredAmountPresentation(value).format);
  }

  if (column === 'Total') {
    // "Unavailable" (a month or total that could not be converted) stays text.
    return typeof value === 'number' ? numericCell(value) : textCell(value, { align: 'right' });
  }

  if (column === 'Share') {
    return numericCell(value, percentageFormatPattern);
  }

  return textCell(value, {
    wrap: column === 'Description' || column === 'Category'
  });
}

// Builds one worksheet: a header row plus one formatted data row per entry.
function createRowsSheet(sheetName, columns, rows) {
  return {
    sheet: sheetName,
    // Header row, then one formatted row per entry, in column order.
    data: [
      columns.map((column) => headerCell(column)),
      ...rows.map((row) =>
        columns.map((column, index) =>
          createDataCell(column, Object.values(row)[index])
        )
      )
    ],
    columns: columns.map((column) => ({
      width: columnWidths[column] ?? Math.max(14, column.length + 4)
    })),
    stickyRowsCount: 1
  };
}

// Every export has exactly two sheets: a summary, then the detail rows.
export function createWorkbookSheets({ model, rowsSheetName }) {
  return [
    createSummarySheet(model),
    createRowsSheet(rowsSheetName, model.columns, model.rows)
  ];
}

async function createWorkbookBlob({ model, rowsSheetName }) {
  const writeExcelFile = await loadWriter();
  const sheets = createWorkbookSheets({ model, rowsSheetName });

  return writeExcelFile(sheets).toBlob();
}

// One thin wrapper per export type, so each caller only needs to name the
// sheet its detail rows belong on.
export function createReportWorkbookBlob(model) {
  return createWorkbookBlob({
    model,
    rowsSheetName: sheetNames.reportCosts
  });
}

export function createPieChartWorkbookBlob(model) {
  return createWorkbookBlob({
    model,
    rowsSheetName: sheetNames.categoryTotals
  });
}

export function createBarChartWorkbookBlob(model) {
  return createWorkbookBlob({
    model,
    rowsSheetName: sheetNames.monthlyTotals
  });
}

// Shared save step: build the workbook Blob, then trigger the browser
// download via downloadService.js.
export async function downloadWorkbook(model, filename, createBlob) {
  const blob = await createBlob(model);

  downloadBlob(blob, filename);
}

export function downloadReportWorkbook(model, filename) {
  return downloadWorkbook(model, filename, createReportWorkbookBlob);
}

export function downloadPieChartWorkbook(model, filename) {
  return downloadWorkbook(model, filename, createPieChartWorkbookBlob);
}

export function downloadBarChartWorkbook(model, filename) {
  return downloadWorkbook(model, filename, createBarChartWorkbookBlob);
}
