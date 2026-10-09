import { useRef, useState } from 'react';
// Icons for the generate button and the two export buttons below.
import DonutLargeOutlinedIcon from '@mui/icons-material/DonutLargeOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';
// MUI layout/form/table primitives used by the filters bar and data table.
import {
  Alert,
  Box,
  Button,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
// Recharts primitives for the required monthly category pie chart itself.
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip
} from 'recharts';
// Shared UI components, then local constants/db/services/utils below.
import LoadingButtonLabel from '../components/common/LoadingButtonLabel.jsx';
import PageHeader from '../components/common/PageHeader.jsx';
import SectionCard from '../components/common/SectionCard.jsx';
import { supportedCurrencies } from '../constants/currencies.js';
import { costsDatabase } from '../lib/costsDatabase.js';
// Exchange-rate cache/refresh and the required Pie Chart aggregation logic.
import {
  getCachedExchangeRates,
  refreshExchangeRates
} from '../services/exchangeRatesService.js';
import { aggregateCostsByCategory } from '../utils/chartAggregation.js';
import YearlyBarChartSection from '../components/charts/YearlyBarChartSection.jsx';
// TEAM EXTENSION: Excel/PDF export helpers for the Pie Chart data.
import * as excelExportService from '../services/export/excelExportService.js';
import { buildPieChartExportModel } from '../services/export/exportModels.js';
import * as pdfExportService from '../services/export/pdfExportService.js';
import { captureChartSvgAsPngDataUrl } from '../utils/chartCapture.js';
import {
  addCategoryShare,
  shouldShowPieSliceLabel
} from '../utils/chartPresentation.js';
import { getPieChartExportFilename } from '../utils/exportFilenames.js';
import {
  formatDisplayAmount,
  formatDisplayPercentage
} from '../utils/amountFormat.js';
import { getStorageErrorMessage } from '../utils/storageErrorMessage.js';

/*
 * Course requirement: the monthly category Pie Chart (R-070/R-071). Renders
 * the Yearly Bar Chart section (R-080/R-081) underneath as a separate
 * component (YearlyBarChartSection) since the two charts have independent
 * filters and are only grouped on one page as a layout choice, not because
 * the specification requires them combined. Excel/PDF chart export is a
 * TEAM EXTENSION.
 */

const months = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' }
];

// Fixed palette cycled across pie slices, independent of category count.
const chartColors = [
  '#2563eb',
  '#0f766e',
  '#f59e0b',
  '#dc2626',
  '#7c3aed',
  '#0891b2'
];

// Defaults the form to the current month/year in USD on first render.
function getCurrentFilters() {
  const now = new Date();

  return {
    month: String(now.getMonth() + 1),
    year: String(now.getFullYear()),
    currency: 'USD'
  };
}

function getMonthLabel(month) {
  return months.find((option) => option.value === month)?.label ?? String(month);
}

// Validates the filter form before generating a chart.
function validateFilters(filters) {
  const errors = {};
  const chartMonth = Number(filters.month);
  const trimmedYear = filters.year.trim();
  const chartYear = Number(trimmedYear);

  if (!Number.isInteger(chartMonth) || chartMonth < 1 || chartMonth > 12) {
    errors.month = 'Select a chart month.';
  }

  if (trimmedYear === '') {
    errors.year = 'Enter a chart year.';
  } else if (!Number.isFinite(chartYear) || !Number.isInteger(chartYear)) {
    errors.year = 'Enter a whole chart year.';
  }

  // Currency: must be one of the four required identifiers.
  if (!supportedCurrencies.includes(filters.currency)) {
    errors.currency = 'Select a supported currency.';
  }

  return {
    errors,
    isValid: Object.keys(errors).length === 0,
    chartMonth,
    chartYear
  };
}

// Maps a thrown error to a user-facing message for the chart's error alert.
function getChartErrorMessage(error) {
  const storageMessage = getStorageErrorMessage(error);

  if (storageMessage) {
    return storageMessage;
  }

  if (
    error instanceof Error &&
    (error.message.includes('cached exchange rates') ||
      error.message.includes('Exchange rates'))
  ) {
    return 'Exchange rates are unavailable for converting this chart. Please try again.';
  }

  return 'Could not generate the monthly category chart. Please try again.';
}

// Recharts calls this per slice with the slice's geometry (angle/radius) and
// the category's aggregated payload; it computes the label's on-chart
// position from that geometry and hides the label entirely for very thin
// slices (see shouldShowPieSliceLabel) where text would just overlap.
function renderPieLabel(labelProps) {
  const payload = labelProps.payload ?? labelProps;
  const category = payload.category ?? labelProps.name;
  const percentage = payload.percentage ?? labelProps.percent ?? 0;
  const { midAngle } = labelProps;

  if (!shouldShowPieSliceLabel({ percentage })) {
    return null;
  }

  const radius =
    labelProps.middleRadius ??
    (Number(labelProps.innerRadius) + Number(labelProps.outerRadius)) / 2;
  const radians = (Math.PI / 180) * -midAngle;
  const x = labelProps.cx + radius * Math.cos(radians);
  const y = labelProps.cy + radius * Math.sin(radians);

  // Dark stroke outline keeps the white label text readable on any slice color.
  return (
    <text
      dominantBaseline="central"
      fill="#FFFFFF"
      fontSize={12}
      fontWeight="700"
      paintOrder="stroke"
      stroke="rgba(23, 32, 51, 0.68)"
      strokeWidth={3}
      textAnchor="middle"
      x={x}
      y={y}
    >
      {`${category} ${formatDisplayPercentage(percentage)}`}
    </text>
  );
}

function ChartsPage() {
  // Form/result state: filters the user is editing, plus the last
  // successfully generated chart (or the error that stopped it).
  const [filters, setFilters] = useState(getCurrentFilters);
  const [errors, setErrors] = useState({});
  const [chartResult, setChartResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [exportErrorMessage, setExportErrorMessage] = useState('');
  const [exportingAction, setExportingAction] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  // Points at the chart's DOM container so a PDF export can rasterize the
  // rendered SVG into an image (see chartCapture.js) — this is the only
  // reason a ref is needed here.
  const chartContainerRef = useRef(null);

  // Editing any filter clears the previous result/errors, so stale output
  // is never shown next to filters that no longer match it.
  function handleChange(event) {
    const { name, value } = event.target;

    setFilters((currentFilters) => ({
      ...currentFilters,
      [name]: value
    }));
    setErrors((currentErrors) => ({
      ...currentErrors,
      [name]: undefined
    }));
    setErrorMessage('');
    setExportErrorMessage('');
    setChartResult(null);
    setHasGenerated(false);
  }

  // Validates, then fetches rates and builds the category aggregation.
  async function handleSubmit(event) {
    event.preventDefault();

    const validation = validateFilters(filters);

    setErrors(validation.errors);
    setErrorMessage('');
    setExportErrorMessage('');
    setChartResult(null);
    setHasGenerated(false);

    if (!validation.isValid) {
      setErrorMessage('Please correct the highlighted chart filters.');
      return;
    }

    setIsLoading(true);

    try {
      try {
        await refreshExchangeRates();
      } catch {
        // Same-currency charts and valid cached rates can still work after refresh failure.
      }

      // Reuses the required getReport() to fetch the month's costs (rather
      // than reading storage directly), then aggregates those rows by
      // category client-side for the chart — see chartAggregation.js.
      const report = costsDatabase.getReport(
        filters.currency,
        validation.chartYear,
        validation.chartMonth
      );
      const chartData = aggregateCostsByCategory(
        report.costs,
        filters.currency,
        getCachedExchangeRates()
      );

      setChartResult({
        report,
        chartData
      });
      setHasGenerated(true);
    } catch (error) {
      // A failed generation clears any previous result rather than leaving
      // a stale chart on screen next to the new error message.
      setErrorMessage(getChartErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  // Shared shape for both export functions below.
  function buildCurrentExportModel() {
    return buildPieChartExportModel({
      chartData,
      report: chartResult.report
    });
  }

  // TEAM EXTENSION: exports the current chart's data as a real .xlsx file.
  async function handleExcelExport() {
    if (!chartResult) {
      return;
    }

    setExportErrorMessage('');
    setExportingAction('excel');

    try {
      await excelExportService.downloadPieChartWorkbook(
        buildCurrentExportModel(),
        getPieChartExportFilename({
          year: chartResult.report.year,
          month: chartResult.report.month,
          currency: chartResult.report.total.currency,
          extension: 'xlsx'
        })
      );
    } catch {
      setExportErrorMessage('Could not export the Excel file. Please try again.');
    } finally {
      setExportingAction(null);
    }
  }

  // TEAM EXTENSION: exports a PDF with both the chart image and its data.
  async function handlePdfExport() {
    if (!chartResult) {
      return;
    }

    setExportErrorMessage('');
    setExportingAction('pdf');

    try {
      // Only attempt to rasterize the chart when it actually rendered a
      // pie (hasPositiveChartData) — an empty/all-zero month shows a
      // no-data message instead of an SVG, so there is nothing to capture.
      const chartImageDataUrl = hasPositiveChartData
        ? await captureChartSvgAsPngDataUrl(chartContainerRef.current)
        : null;

      if (hasPositiveChartData && chartImageDataUrl === null) {
        throw new Error('Pie chart image capture failed.');
      }

      await pdfExportService.downloadChartPdf(
        buildCurrentExportModel(),
        getPieChartExportFilename({
          year: chartResult.report.year,
          month: chartResult.report.month,
          currency: chartResult.report.total.currency,
          extension: 'pdf'
        }),
        chartImageDataUrl
      );
    } catch {
      setExportErrorMessage('Could not export the chart PDF. Please try again.');
    } finally {
      setExportingAction(null);
    }
  }

  // Derived from state rather than stored separately, so they can never
  // drift out of sync with the last generated chartResult.
  const chartData = chartResult?.chartData ?? [];
  const pieDisplayData = addCategoryShare(chartData);
  const hasChartData = chartData.length > 0;
  const hasPositiveChartData = chartData.some((entry) => entry.total > 0);

  return (
    <Stack spacing={3}>
      <PageHeader title="Charts">
        Visualize monthly cost categories in a selected currency.
      </PageHeader>

      <SectionCard
        component="form"
        onSubmit={handleSubmit}
      >
        <Stack spacing={3}>
          {/* Page title/description, then the filter form below. */}
          <Box>
            <Typography component="h2" variant="h2">
              Monthly Category Pie Chart
            </Typography>
            <Typography color="text.secondary" variant="body1">
              Select a month, year, and target currency for category totals.
            </Typography>
          </Box>

          {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}

          {/* Filter fields: month/year/currency, then the generate button. */}
          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: {
                xs: '1fr',
                md: '220px 180px 180px auto'
              }
            }}
          >
            <TextField
              error={Boolean(errors.month)}
              helperText={errors.month ?? ' '}
              label="Month"
              name="month"
              onChange={handleChange}
              select
              value={filters.month}
            >
              {/* Fixed 12-month list, unlike Year's free numeric input. */}
              {months.map((month) => (
                <MenuItem key={month.value} value={String(month.value)}>
                  {month.label}
                </MenuItem>
              ))}
            </TextField>

            {/* Year: free numeric input, unlike Month's fixed select list. */}
            <TextField
              error={Boolean(errors.year)}
              helperText={errors.year ?? ' '}
              inputMode="numeric"
              label="Year"
              name="year"
              onChange={handleChange}
              value={filters.year}
            />

            <TextField
              error={Boolean(errors.currency)}
              helperText={errors.currency ?? ' '}
              label="Currency"
              name="currency"
              onChange={handleChange}
              select
              value={filters.currency}
            >
              {supportedCurrencies.map((currency) => (
                <MenuItem key={currency} value={currency}>
                  {currency}
                </MenuItem>
              ))}
            </TextField>

            {/* Submitting the form calls handleSubmit further up. */}
            <Box sx={{ alignSelf: 'start', pt: { md: 1 } }}>
              <Button
                disabled={isLoading}
                startIcon={
                  isLoading ? null : <DonutLargeOutlinedIcon aria-hidden="true" />
                }
                type="submit"
                variant="contained"
              >
                {/* Spinner label swap while the chart is being generated. */}
                <LoadingButtonLabel
                  isLoading={isLoading}
                  loadingText="Generating..."
                >
                  Generate Chart
                </LoadingButtonLabel>
              </Button>
            </Box>
          </Box>
        </Stack>
      </SectionCard>

      {/* Empty state vs. the generated chart section below. */}
      {!hasGenerated && !errorMessage && !isLoading ? (
        <Alert severity="info">
          Choose filters and generate a monthly category Pie Chart.
        </Alert>
      ) : null}

      {/* Generated-chart section: title/currency, exports, then the chart itself. */}
      {chartResult ? (
        <SectionCard>
          <Stack spacing={3}>
            <Box>
              <Typography component="h2" variant="h2">
                {getMonthLabel(chartResult.report.month)} {chartResult.report.year}
              </Typography>
              <Typography color="text.secondary" variant="body1">
                Chart currency: {chartResult.report.total.currency}
              </Typography>
            </Box>

            {exportErrorMessage ? (
              <Alert severity="error">{exportErrorMessage}</Alert>
            ) : null}

            {/* TEAM EXTENSION: Excel/PDF export of this pie chart. */}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button
                disabled={Boolean(exportingAction)}
                onClick={handleExcelExport}
                startIcon={
                  exportingAction === 'excel' ? null : (
                    <TableChartOutlinedIcon aria-hidden="true" />
                  )
                }
                variant="outlined"
              >
                <LoadingButtonLabel
                  isLoading={exportingAction === 'excel'}
                  loadingText="Exporting..."
                >
                  Export Excel
                </LoadingButtonLabel>
              </Button>
              {/* PDF export mirrors the Excel button, different action/icon. */}
              <Button
                disabled={Boolean(exportingAction)}
                onClick={handlePdfExport}
                startIcon={
                  exportingAction === 'pdf' ? null : (
                    <PictureAsPdfOutlinedIcon aria-hidden="true" />
                  )
                }
                variant="outlined"
              >
                <LoadingButtonLabel
                  isLoading={exportingAction === 'pdf'}
                  loadingText="Exporting..."
                >
                  Export PDF
                </LoadingButtonLabel>
              </Button>
            </Stack>

            {/* Two distinct empty states before the actual pie chart. */}
            {!hasChartData ? (
              <Alert severity="info">No costs found for this month.</Alert>
            ) : !hasPositiveChartData ? (
              <Alert severity="info">
                Category totals are zero for this month.
              </Alert>
            ) : (
              // R-070/R-071: category totals for the selected month/year/currency.
              <Box
                aria-label="Monthly category pie chart"
                ref={chartContainerRef}
                role="img"
                sx={{
                  height: 360,
                  width: '100%'
                }}
              >
                <ResponsiveContainer height="100%" width="100%">
                  <PieChart>
                    {/* innerRadius > 0 makes this a donut rather than a solid pie. */}
                    <Pie
                      data={pieDisplayData}
                      dataKey="total"
                      cx="50%"
                      cy={150}
                      innerRadius={60}
                      isAnimationActive={false}
                      label={renderPieLabel}
                      labelLine={false}
                      nameKey="category"
                      outerRadius={120}
                    >
                      {/* One Cell per slice, colors cycling through chartColors. */}
                      {pieDisplayData.map((entry, index) => (
                        <Cell
                          fill={chartColors[index % chartColors.length]}
                          key={entry.category}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, name) => [
                        `${formatDisplayAmount(value)} ${chartResult.report.total.currency}`,
                        name
                      ]}
                    />
                    {/* Legend rows show name, amount, and share percentage. */}
                    <Legend
                      formatter={(value, entry) => {
                        const item = entry.payload;

                        return `${value} - ${formatDisplayAmount(item.total)} ${chartResult.report.total.currency} - ${formatDisplayPercentage(item.percentage)}`;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
            )}

            {/* Same category totals as the chart, in a sortable-by-eye table form. */}
            {hasChartData ? (
              <TableContainer>
                <Table aria-label="Monthly category totals">
                  <TableHead>
                    <TableRow>
                      <TableCell>Category</TableCell>
                      <TableCell align="right">Total</TableCell>
                      <TableCell align="right">Share</TableCell>
                      <TableCell>Currency</TableCell>
                    </TableRow>
                  </TableHead>
                  {/* Column order matches the header cells above. */}
                  <TableBody>
                    {pieDisplayData.map((entry) => (
                      <TableRow key={entry.category}>
                        <TableCell>{entry.category}</TableCell>
                        <TableCell align="right">
                          {formatDisplayAmount(entry.total)}
                        </TableCell>
                        <TableCell align="right">
                          {formatDisplayPercentage(entry.percentage)}
                        </TableCell>
                        <TableCell>{chartResult.report.total.currency}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : null}
          </Stack>
        </SectionCard>
      ) : null}

      {/* R-080/R-081: the yearly bar chart, always rendered below the pie chart. */}
      <YearlyBarChartSection />
    </Stack>
  );
}

export default ChartsPage;
