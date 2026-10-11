import { Buffer } from 'node:buffer';
import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  createReportWorkbookBlob,
  createWorkbookSheets
} from '../../src/services/export/excelExportService.js';
import { buildMonthlyReportExportModel } from '../../src/services/export/exportModels.js';

/*
 * M2A.2 export presentation: a stored original amount is written as a real
 * number and must not LOOK like zero or like a shorter number in Excel. The
 * shared format shows at most eight decimals, so longer amounts get an exact
 * per-cell format, and amounts beyond Excel's ~15 significant digits get one
 * explanatory summary note. Nothing is converted to text or rounded.
 */
const defaultFormat = '#,##0.00######';

function cost(sum, index) {
  return {
    id: `c${index}`,
    sum,
    currency: 'USD',
    category: 'Food',
    description: `cost ${index}`,
    date: { day: 1, month: 10, year: 2026, hour: 9, minute: 0 }
  };
}

function build(sums) {
  const model = buildMonthlyReportExportModel({
    report: { month: 10, year: 2026, total: { currency: 'USD', sum: 1 } },
    costs: sums.map(cost),
    totalAmount: '1'
  });

  return { model, sheets: createWorkbookSheets({ model, rowsSheetName: 'Costs' }) };
}

function sumCells(sheets) {
  return sheets[1].data.slice(1).map((row) => row[4]);
}

function summaryLabels(sheets) {
  return sheets[0].data.map((row) => row[0]?.value);
}

describe('Excel stored-amount presentation', () => {
  it('leaves ordinary amounts exactly as before, with no precision note', () => {
    const { sheets } = build([33.33, 0.333, 12.5, 100, 0.12345678]);

    sumCells(sheets).forEach((cell) => {
      expect(cell).toMatchObject({ type: Number, format: defaultFormat });
    });
    expect(summaryLabels(sheets)).not.toContain('Precision');
  });

  it.each([
    [1e-21, '#,##0.000000000000000000000'],
    [0.123456789012, '#,##0.000000000000'],
    [0.000000001, '#,##0.000000000'],
    [-1e-9, '#,##0.000000000']
  ])('gives %s an exact-digit numeric format so it never displays as zero', (value, format) => {
    const [cell] = sumCells(build([value]).sheets);

    expect(cell).toMatchObject({ value, type: Number, format });
    // The number of zero placeholders equals the exact decimals.
    expect(cell.format.split('.')[1].length).toBeGreaterThan(8);
  });

  it('keeps the stored value untouched and numeric', () => {
    const values = [1e-21, 0.123456789012, 123456789.12345679, 0.30000000000000004];
    const cells = sumCells(build(values).sheets);

    expect(cells.map((cell) => cell.value)).toEqual(values);
    cells.forEach((cell) => expect(typeof cell.value).toBe('number'));
  });

  it('uses a scientific format with enough digits beyond 30 decimals', () => {
    const [tiny, other] = sumCells(build([1.2345e-35, 5e-324]).sheets);

    expect(tiny.format).toBe('0.0000E+00');
    expect(other.format).toBe('0.0E+00');
  });

  it('adds one explanatory note only when a value exceeds what Excel can hold', () => {
    const exceeding = [123456789.12345679, 0.30000000000000004, 5e-324, 1.2345678901234566e-25];

    exceeding.forEach((value) => {
      const { sheets } = build([33.33, value]);
      const labels = summaryLabels(sheets);

      expect(labels.filter((label) => label === 'Precision')).toHaveLength(1);
      expect(sheets[0].data.at(-1)[1]).toMatchObject({ wrap: true });
      expect(sheets[0].data.at(-1)[1].value).toMatch(/more precision than Excel/);
    });
    // 1e-21 and 12-digit decimals fit in 15 significant digits: no note.
    expect(summaryLabels(build([1e-21, 0.123456789012]).sheets)).not.toContain('Precision');
  });

  it('does not change the workbook structure for any of these amounts', () => {
    const { sheets, model } = build([1e-21, 123456789.12345679]);

    expect(sheets).toHaveLength(2);
    expect(sheets[1].data[0].map((cell) => cell.value)).toEqual(model.columns);
    expect(sheets[1].data).toHaveLength(3);
  });

  it('writes the per-cell formats and numeric values into a real xlsx file', async () => {
    const { model } = build([1e-21, 0.123456789012, 33.33]);
    const buffer = Buffer.from(await (await createReportWorkbookBlob(model)).arrayBuffer());
    const entries = readZipEntries(buffer);
    const styles = entries['xl/styles.xml'];
    const sheet = entries['xl/worksheets/sheet2.xml'];
    const formats = [...styles.matchAll(/formatCode="([^"]*)"/g)].map((match) => match[1]);

    expect(formats).toContain('#,##0.000000000000000000000');
    expect(formats).toContain('#,##0.000000000000');
    expect(formats).toContain(defaultFormat);
    // The cells are numeric (no t="s"/inlineStr) and hold the exact value.
    expect(sheet).toMatch(/<c r="E2"[^>]*><v>1e-21<\/v>/);
    expect(sheet).toMatch(/<c r="E3"[^>]*><v>0\.123456789012<\/v>/);
    expect(sheet).not.toMatch(/<c r="E2"[^>]*t="(s|inlineStr|str)"/);
  });
});

// Minimal ZIP reader (central directory + deflate) so the real file can be
// inspected without a dependency.
function readZipEntries(buffer) {
  let end = buffer.length - 22;

  while (buffer.readUInt32LE(end) !== 0x06054b50) {
    end -= 1;
  }
  const count = buffer.readUInt16LE(end + 10);
  let position = buffer.readUInt32LE(end + 16);
  const entries = {};

  for (let index = 0; index < count; index += 1) {
    const method = buffer.readUInt16LE(position + 10);
    const compressedSize = buffer.readUInt32LE(position + 20);
    const nameLength = buffer.readUInt16LE(position + 28);
    const extraLength = buffer.readUInt16LE(position + 30);
    const commentLength = buffer.readUInt16LE(position + 32);
    const offset = buffer.readUInt32LE(position + 42);
    const name = buffer.toString('utf8', position + 46, position + 46 + nameLength);
    const start = offset + 30 + buffer.readUInt16LE(offset + 26) + buffer.readUInt16LE(offset + 28);
    const data = buffer.subarray(start, start + compressedSize);

    entries[name] = (method === 8 ? inflateRawSync(data) : data).toString('utf8');
    position += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}
