/*
 * TEAM EXTENSION (X-008): generates human-readable PDFs (via jsPDF +
 * jspdf-autotable) for the Monthly/Yearly reports and Pie/Bar charts,
 * including an embedded chart image for the chart PDFs (see
 * chartCapture.js). Never reads storage directly — everything printed here
 * comes from an already-built export model (see exportModels.js).
 */
import { getModelRowsForPdf } from './exportModels.js';
import { downloadBlob } from './downloadService.js';

// jsPDF/jspdf-autotable are dynamically imported so they only load into the
// bundle when a PDF export is actually requested.
async function createPdfDocument() {
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable')
  ]);
  const autoTable = autoTableModule.autoTable ?? autoTableModule.default;

  return {
    autoTable,
    doc: new jsPDF({ compress: false, unit: 'pt', format: 'a4' })
  };
}

// App name plus the report/chart title, at a fixed position on every page.
function addTitle(doc, title) {
  doc.setFontSize(18);
  doc.text('Cost Manager', 40, 44);
  doc.setFontSize(14);
  doc.text(title, 40, 68);
}

// A4 is 595 pt wide; text starts at 40 pt, leaving 515 pt before the
// right margin. Long lines (the exchange-rate disclosure) wrap inside it.
const metadataTextWidth = 515;

// Prints each summary line and returns the y position content can resume
// at. A line that fits on one row behaves exactly as before.
function addMetadata(doc, lines, startY = 94) {
  doc.setFontSize(10);
  let y = startY;

  lines.forEach((line) => {
    doc.splitTextToSize(line, metadataTextWidth).forEach((wrappedLine) => {
      doc.text(wrappedLine, 40, y);
      y += 16;
    });
  });

  return y + 12;
}

// Pre-M2 hotfix: a report or chart that used converted amounts says so in
// the file itself, so it is not misleading when read apart from the app.
function getRateDisclosureLines(model) {
  return [
    ...(model.metadata.rateDisclosure ? [`Exchange rates: ${model.metadata.rateDisclosure}`] : []),
    ...(model.metadata.incompleteNote ? [`Conversion: ${model.metadata.incompleteNote}`] : [])
  ];
}

// jsPDF's own output() call, isolated so callers don't need to know the
// exact format string ('arraybuffer') used to build the download Blob.
function outputPdfBytes(doc) {
  return doc.output('arraybuffer');
}

// Shown instead of a table when there is nothing to render (no rows, no
// chart image), so the PDF never has a blank, confusing page.
function addNoDataMessage(doc, message, y) {
  doc.setFontSize(10);
  doc.text(message, 40, y);

  return y + 20;
}

// Chart PDFs use different summary fields than report PDFs (see
// exportModels.js's buildPieChartExportModel/buildBarChartExportModel).
function getChartMetadataLines(model) {
  if (model.type === 'pie-chart') {
    return [
      `Period: ${model.metadata.periodLabel}`,
      `Currency: ${model.metadata.currency}`,
      `Total: ${model.metadata.totalLabel}`,
      `Categories: ${model.metadata.categoryCount}`,
      ...getRateDisclosureLines(model)
    ];
  }

  return [
    `Year: ${model.metadata.year}`,
    `Currency: ${model.metadata.currency}`,
    `Annual total: ${model.metadata.annualTotalLabel}`,
    `Months with costs: ${model.metadata.monthsWithCosts}`,
    ...getRateDisclosureLines(model)
  ];
}

// Scales an image down (preserving aspect ratio) to fit a maxWidth x
// maxHeight box; never scales up, so small captures stay their real size.
export function fitImageWithinBounds({ width, height, maxWidth, maxHeight }) {
  const scale = Math.min(maxWidth / width, maxHeight / height);

  return {
    height: height * scale,
    width: width * scale
  };
}

// Draws the captured chart PNG onto the page, scaled down to fit within
// the page margins while preserving its aspect ratio.
function addChartImage(doc, chartImageDataUrl, y) {
  const horizontalMargin = 40;
  const pageWidth = doc.internal.pageSize.getWidth();
  const maxWidth = pageWidth - horizontalMargin * 2;
  const maxHeight = 260;
  // jsPDF exposes the image's natural pixel size via getImageProperties().
  const imageProperties = doc.getImageProperties(chartImageDataUrl);
  const size = fitImageWithinBounds({
    width: imageProperties.width,
    height: imageProperties.height,
    maxWidth,
    maxHeight
  });
  const x = horizontalMargin + (maxWidth - size.width) / 2;

  doc.addImage(
    chartImageDataUrl,
    'PNG',
    x,
    y,
    size.width,
    size.height,
    undefined,
    'FAST'
  );

  return y + size.height + 20;
}

// Builds a Monthly/Yearly report PDF: title, summary metadata, then the
// full data table via jspdf-autotable.
export async function createReportPdfBuffer(model) {
  const { autoTable, doc } = await createPdfDocument();

  addTitle(doc, model.title);
  const nextY = addMetadata(doc, [
    model.type === 'monthly-report'
      ? `Period: ${model.metadata.periodLabel}`
      : `Year: ${model.metadata.year}`,
    `Report currency: ${model.metadata.currency}`,
    `Total: ${model.metadata.totalLabel}`,
    `Number of costs: ${model.metadata.numberOfCosts}`,
    ...getRateDisclosureLines(model)
  ]);

  if (model.rows.length === 0) {
    addNoDataMessage(doc, 'No costs found for this period.', nextY);
  }

  // jspdf-autotable draws the actual data grid; startY leaves room for the
  // no-data message above when there are no rows to show.
  autoTable(doc, {
    head: [model.columns],
    body: getModelRowsForPdf(model),
    startY: model.rows.length === 0 ? nextY + 16 : nextY,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [37, 99, 235] }
  });

  return outputPdfBytes(doc);
}

// Builds a Pie/Bar chart PDF: title, summary metadata, the chart image
// (when one was successfully captured), then the underlying data table.
export async function createChartPdfBuffer(model, chartImageDataUrl = null) {
  const { autoTable, doc } = await createPdfDocument();

  addTitle(doc, model.title);
  let nextY = addMetadata(doc, getChartMetadataLines(model));

  if (chartImageDataUrl) {
    nextY = addChartImage(doc, chartImageDataUrl, nextY);
  } else {
    nextY = addNoDataMessage(doc, 'No chart visualization is available for this data.', nextY);
  }

  if (model.rows.length === 0) {
    nextY = addNoDataMessage(doc, 'No data rows are available.', nextY);
  }

  autoTable(doc, {
    head: [model.columns],
    body: getModelRowsForPdf(model),
    startY: nextY,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [37, 99, 235] }
  });

  return outputPdfBytes(doc);
}

// Shared save step: build the PDF bytes, wrap them in a Blob, then trigger
// the browser download via downloadService.js.
export async function downloadPdf(createBuffer, filename) {
  const buffer = await createBuffer();
  const blob = new Blob([buffer], { type: 'application/pdf' });

  downloadBlob(blob, filename);
}

export function downloadReportPdf(model, filename) {
  return downloadPdf(() => createReportPdfBuffer(model), filename);
}

// chartImageDataUrl may be null (e.g. an empty/all-zero chart with nothing
// to rasterize); createChartPdfBuffer() falls back to a text message.
export function downloadChartPdf(model, filename, chartImageDataUrl) {
  return downloadPdf(
    () => createChartPdfBuffer(model, chartImageDataUrl),
    filename
  );
}
