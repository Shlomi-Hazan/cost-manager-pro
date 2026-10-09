import { useRef, useState } from 'react';
// Icons for the generate button and the two export buttons below.
import BarChartOutlinedIcon from '@mui/icons-material/BarChartOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';
// MUI layout/form/table primitives used by the filters bar and totals table.
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
// Recharts primitives for the required 12-month bar chart itself.
import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
// Shared UI components, then local constants/db/services/utils below.
import LoadingButtonLabel from '../common/LoadingButtonLabel.jsx';
import SectionCard from '../common/SectionCard.jsx';
import { supportedCurrencies } from '../../constants/currencies.js';
import { costsDatabase } from '../../lib/costsDatabase.js';
import { refreshExchangeRates } from '../../services/exchangeRatesService.js';
// TEAM EXTENSION: Excel/PDF export helpers for the yearly bar chart data.
import * as excelExportService from '../../services/export/excelExportService.js';
import { buildBarChartExportModel } from '../../services/export/exportModels.js';
import * as pdfExportService from '../../services/export/pdfExportService.js';
import { captureChartSvgAsPngDataUrl } from '../../utils/chartCapture.js';
import { getBarChartExportFilename } from '../../utils/exportFilenames.js';
import { buildYearlyMonthlyTotals } from '../../utils/yearlyAggregation.js';
import { formatDisplayAmount } from '../../utils/amountFormat.js';
import { getStorageErrorMessage } from '../../utils/storageErrorMessage.js';
import { formatPositiveBarValueLabel } from '../../utils/chartPresentation.js';

/*
 * Course requirement: the yearly 12-month Bar Chart (R-080/R-081) — always
 * shows all twelve months for the selected year/currency, with months that
 * have no costs displayed as zero rather than omitted. Rendered as its own
 * component (used from ChartsPage) since it has its own independent
 * filters. Excel/PDF export is a TEAM EXTENSION.
 */

// Defaults the form to the current year in USD on first render.
function getCurrentFilters() {
  return {
    year: String(new Date().getFullYear()),
    currency: 'USD'
  };
}

// Validates the filter form before generating a chart.
function validateFilters(filters) {
  const errors = {};
  const trimmedYear = filters.year.trim();
  const chartYear = Number(trimmedYear);

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
    chartYear,
    errors,
    isValid: Object.keys(errors).length === 0
  };
}

// Maps a thrown error to a user-facing message for the chart's error alert.
function getYearlyErrorMessage(error) {
  const storageMessage = getStorageErrorMessage(error);

  if (storageMessage) {
    return storageMessage;
  }

  if (
    error instanceof Error &&
    (error.message.includes('cached exchange rates') ||
      error.message.includes('Exchange rates'))
  ) {
    return 'Exchange rates are unavailable for converting this yearly chart. Please try again.';
  }

  return 'Could not generate the yearly chart. Please try again.';
}

function YearlyBarChartSection() {
  // Form/result state: filters the user is editing, plus the last
  // successfully generated chart (or the error that stopped it).
  const [filters, setFilters] = useState(getCurrentFilters);
  const [errors, setErrors] = useState({});
  const [yearlyResult, setYearlyResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [exportErrorMessage, setExportErrorMessage] = useState('');
  const [exportingAction, setExportingAction] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
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
    setYearlyResult(null);
    setHasGenerated(false);
  }

  // Validates, then fetches rates and builds the 12-month totals.
  async function handleSubmit(event) {
    event.preventDefault();

    const validation = validateFilters(filters);

    setErrors(validation.errors);
    setErrorMessage('');
    setExportErrorMessage('');

    if (!validation.isValid) {
      setErrorMessage('Please correct the highlighted yearly chart filters.');
      return;
    }

    setIsLoading(true);

    try {
      // Refreshing rates here keeps the cache warm; a same-currency chart
      // can still succeed below even if this fails.
      try {
        await refreshExchangeRates();
      } catch {
        // Same-currency yearly charts and valid cached rates can still work.
      }

      // buildYearlyMonthlyTotals() calls the required getReport() once per
      // calendar month, guaranteeing exactly 12 entries — see
      // yearlyAggregation.js for why empty months still return a valid
      // zero-total report rather than being skipped.
      const monthlyTotals = buildYearlyMonthlyTotals(
        (currency, year, month) => costsDatabase.getReport(currency, year, month),
        filters.currency,
        validation.chartYear
      );

      setYearlyResult({
        currency: filters.currency,
        monthlyTotals,
        year: validation.chartYear
      });
      setHasGenerated(true);
    } catch (error) {
      // A failed generation clears any previous result rather than leaving
      // a stale chart on screen next to the new error message.
      setYearlyResult(null);
      setHasGenerated(false);
      setErrorMessage(getYearlyErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  // Shared shape for both export functions below.
  function buildCurrentExportModel() {
    return buildBarChartExportModel({ yearlyResult });
  }

  // TEAM EXTENSION: exports the current chart's data as a real .xlsx file.
  async function handleExcelExport() {
    if (!yearlyResult) {
      return;
    }

    setExportErrorMessage('');
    setExportingAction('excel');

    try {
      await excelExportService.downloadBarChartWorkbook(
        buildCurrentExportModel(),
        getBarChartExportFilename({
          year: yearlyResult.year,
          currency: yearlyResult.currency,
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
    if (!yearlyResult) {
      return;
    }

    setExportErrorMessage('');
    setExportingAction('pdf');

    try {
      // Snapshots the rendered SVG chart as a PNG to embed in the PDF.
      const chartImageDataUrl = await captureChartSvgAsPngDataUrl(
        chartContainerRef.current
      );

      if (chartImageDataUrl === null) {
        throw new Error('Bar chart image capture failed.');
      }

      await pdfExportService.downloadChartPdf(
        buildCurrentExportModel(),
        getBarChartExportFilename({
          year: yearlyResult.year,
          currency: yearlyResult.currency,
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
  // drift out of sync with the last generated yearlyResult.
  const monthlyTotals = yearlyResult?.monthlyTotals ?? [];
  const hasYearlyCosts = monthlyTotals.some((entry) => entry.total > 0);

  return (
    <Stack spacing={3}>
      <SectionCard
        component="form"
        onSubmit={handleSubmit}
      >
        <Stack spacing={3}>
          {/* Page title/description, then the filter form below. */}
          <Box>
            <Typography component="h2" variant="h2">
              Yearly 12-Month Bar Chart
            </Typography>
            <Typography color="text.secondary" variant="body1">
              Select a year and target currency for monthly totals.
            </Typography>
          </Box>

          {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}

          {/* Filter fields: year/currency, then the generate button. */}
          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: {
                xs: '1fr',
                md: '180px 180px auto'
              }
            }}
          >
            {/* Year: free numeric input, unlike Month's fixed select list elsewhere. */}
            <TextField
              error={Boolean(errors.year)}
              helperText={errors.year ?? ' '}
              inputMode="numeric"
              label="Yearly Chart Year"
              name="year"
              onChange={handleChange}
              value={filters.year}
            />

            {/* Currency select, restricted to the four required identifiers. */}
            <TextField
              error={Boolean(errors.currency)}
              helperText={errors.currency ?? ' '}
              label="Yearly Chart Currency"
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
                  isLoading ? null : <BarChartOutlinedIcon aria-hidden="true" />
                }
                type="submit"
                variant="contained"
              >
                {/* Spinner label swap while the chart is being generated. */}
                <LoadingButtonLabel
                  isLoading={isLoading}
                  loadingText="Generating..."
                >
                  Generate Yearly Chart
                </LoadingButtonLabel>
              </Button>
            </Box>
          </Box>
        </Stack>
      </SectionCard>

      {/* Empty/info state shown before the first successful generation. */}
      {!hasGenerated && !errorMessage && !isLoading ? (
        <Alert severity="info">
          Choose filters and generate a yearly 12-month Bar Chart.
        </Alert>
      ) : null}

      {/* Generated-chart section: totals, exports, then the chart itself. */}
      {yearlyResult ? (
        <SectionCard>
          <Stack spacing={3}>
            <Box>
              <Typography component="h2" variant="h2">
                {yearlyResult.year} Yearly Costs
              </Typography>
              <Typography color="text.secondary" variant="body1">
                Chart currency: {yearlyResult.currency}
              </Typography>
            </Box>

            {exportErrorMessage ? (
              <Alert severity="error">{exportErrorMessage}</Alert>
            ) : null}

            {/* TEAM EXTENSION: Excel/PDF export of this bar chart. */}
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

            {!hasYearlyCosts ? (
              <Alert severity="info">No costs found for this year.</Alert>
            ) : null}

            {/* R-080/R-081: all 12 months, zero-value bars included. */}
            <Box
              aria-label="Yearly monthly bar chart"
              ref={chartContainerRef}
              role="img"
              sx={{
                height: 360,
                width: '100%'
              }}
            >
              <ResponsiveContainer height="100%" width="100%">
                {/* margin leaves room for axis labels and the top value labels. */}
                <RechartsBarChart
                  data={monthlyTotals}
                  margin={{
                    bottom: 16,
                    left: 12,
                    right: 12,
                    top: 32
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="shortLabel" />
                  {/* Y-axis headroom: 15% above the tallest bar (or 1 if all zero). */}
                  <YAxis
                    domain={[
                      0,
                      (dataMax) => (dataMax > 0 ? dataMax * 1.15 : 1)
                    ]}
                    tickFormatter={formatDisplayAmount}
                    width={72}
                  />
                  <Tooltip
                    formatter={(value) =>
                      `${formatDisplayAmount(value)} ${yearlyResult.currency}`
                    }
                    labelFormatter={(_label, payload) =>
                      payload?.[0]?.payload?.label ?? ''
                    }
                  />
                  {/* Numeric label drawn above each bar, hidden for zero totals. */}
                  <Bar dataKey="total" fill="#2563eb" name="Monthly total">
                    <LabelList
                      dataKey="total"
                      fill="#1E293B"
                      fontSize={12}
                      formatter={formatPositiveBarValueLabel}
                      position="top"
                    />
                  </Bar>
                </RechartsBarChart>
              </ResponsiveContainer>
            </Box>

            {/* Same 12 monthly totals as the chart, in table form. */}
            <TableContainer>
              <Table aria-label="Yearly monthly totals">
                <TableHead>
                  <TableRow>
                    <TableCell>Month</TableCell>
                    <TableCell align="right">Total</TableCell>
                    <TableCell>Currency</TableCell>
                  </TableRow>
                </TableHead>
                {/* Column order matches the header cells above. */}
                <TableBody>
                  {monthlyTotals.map((entry) => (
                    // One row per calendar month, including zero-total months.
                    <TableRow key={entry.month}>
                      <TableCell>{entry.label}</TableCell>
                      <TableCell align="right">
                        {formatDisplayAmount(entry.total)}
                      </TableCell>
                      <TableCell>{entry.currency}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Stack>
        </SectionCard>
      ) : null}
    </Stack>
  );
}

export default YearlyBarChartSection;
