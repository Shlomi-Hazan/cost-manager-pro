import { useState } from 'react';
// Icons for the generate button and the two export buttons below.
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';
import {
  Alert,
  Box,
  Button,
  MenuItem,
  Stack,
  TextField,
  Typography
} from '@mui/material';
// Shared UI components, then the required report/currency/db modules.
import LoadingButtonLabel from '../components/common/LoadingButtonLabel.jsx';
import PageHeader from '../components/common/PageHeader.jsx';
import SectionCard from '../components/common/SectionCard.jsx';
import SortableReportTable from '../components/reports/SortableReportTable.jsx';
import { supportedCurrencies } from '../constants/currencies.js';
import { useReportSorting } from '../hooks/useReportSorting.js';
import { costsDatabase } from '../lib/costsDatabase.js';
import { buildDetailedMonthlyReport } from '../services/detailedReportsService.js';
import { refreshExchangeRates } from '../services/exchangeRatesService.js';
// TEAM EXTENSION: Excel/PDF export helpers for this monthly report.
import * as excelExportService from '../services/export/excelExportService.js';
import {
  buildMonthlyReportExportModel
} from '../services/export/exportModels.js';
import * as pdfExportService from '../services/export/pdfExportService.js';
import {
  getMonthlyReportExportFilename
} from '../utils/exportFilenames.js';
import { formatDisplayAmount } from '../utils/amountFormat.js';
import { getStorageErrorMessage } from '../utils/storageErrorMessage.js';

/*
 * Course requirement: the detailed monthly report (R-050 to R-053) — pick a
 * month/year/currency, generate a report through db.js, and display its
 * rows and total. Row-level sorting and Excel/PDF export are TEAM
 * EXTENSIONS layered on top of the same generated report data; they do not
 * change what getReport() returns or how it is calculated.
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

// R-052: the report defaults to the current month/year on first render,
// mirroring db.js's own "omit year/month" default so the UI and the
// required getReport() behavior agree on what "current" means.
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

// Validates the filter form before generating a report.
function validateFilters(filters) {
  const errors = {};
  const reportMonth = Number(filters.month);
  const trimmedYear = filters.year.trim();
  const reportYear = Number(trimmedYear);

  if (
    !Number.isInteger(reportMonth) ||
    reportMonth < 1 ||
    reportMonth > 12
  ) {
    errors.month = 'Select a report month.';
  }

  if (trimmedYear === '') {
    errors.year = 'Enter a report year.';
  } else if (!Number.isFinite(reportYear) || !Number.isInteger(reportYear)) {
    errors.year = 'Enter a whole report year.';
  }

  // Currency: must be one of the four required identifiers.
  if (!supportedCurrencies.includes(filters.currency)) {
    errors.currency = 'Select a supported currency.';
  }

  return {
    errors,
    isValid: Object.keys(errors).length === 0,
    reportMonth,
    reportYear
  };
}

// db.js throws a specific diagnostic error when a report needs currency
// conversion but no exchange-rate cache is populated yet (see
// src/lib/exchangeRatesCache.js). This is expected/recoverable behavior —
// not an application bug — so it is translated into a friendly retry
// message rather than a generic failure.
function getReportErrorMessage(error) {
  const storageMessage = getStorageErrorMessage(error);

  if (storageMessage) {
    return storageMessage;
  }

  if (
    error instanceof Error &&
    error.message.includes('cached exchange rates')
  ) {
    return 'Exchange rates are unavailable for converting this report. Please try again.';
  }

  return 'Could not generate the monthly report. Please try again.';
}

function MonthlyReportPage({ headingComponent = 'h1' }) {
  // Filter form state (month/year/currency + validation errors), the last
  // generated report (or null before/while generating), and separate error
  // banners for report generation vs. export, since both can fail
  // independently without invalidating each other.
  const [filters, setFilters] = useState(getCurrentFilters);
  const [errors, setErrors] = useState({});
  const [report, setReport] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [exportErrorMessage, setExportErrorMessage] = useState('');
  const [exportingAction, setExportingAction] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  const {
    sortedCosts,
    sortDirection,
    sortKey,
    requestSort,
    resetSort
  } = useReportSorting(report?.costs ?? []);

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
    setReport(null);
    setHasGenerated(false);
    resetSort();
  }

  // Validates, then fetches rates and builds the detailed monthly report.
  async function handleSubmit(event) {
    event.preventDefault();

    const validation = validateFilters(filters);

    setErrors(validation.errors);
    setErrorMessage('');
    setExportErrorMessage('');
    setReport(null);
    setHasGenerated(false);

    if (!validation.isValid) {
      setErrorMessage('Please correct the highlighted report filters.');
      return;
    }

    setIsLoading(true);

    try {
      // Opportunistically refresh rates before generating the report so a
      // cross-currency total uses the freshest cache available. A failed
      // refresh is swallowed here rather than shown as a report error: an
      // older cached rate (or a same-currency report needing no rates at
      // all) can still legitimately succeed below.
      try {
        await refreshExchangeRates();
      } catch {
        // A failed refresh should not block same-currency reports or valid cached rates.
      }

      // Delegates to db.js's getReport() (see detailedReportsService.js);
      // this component never reads/filters localStorage itself.
      const nextReport = buildDetailedMonthlyReport(
        costsDatabase,
        filters.currency,
        validation.reportYear,
        validation.reportMonth
      );

      setReport(nextReport);
      setHasGenerated(true);
    } catch (error) {
      // A failed generation clears any previous result rather than leaving
      // a stale report on screen next to the new error message.
      setErrorMessage(getReportErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  // TEAM EXTENSION: Excel/PDF export. Exports whatever is currently visible
  // (sortedCosts, in the user's chosen sort order) rather than re-reading
  // storage, so the exported file always matches what is on screen.
  function buildCurrentExportModel() {
    return buildMonthlyReportExportModel({
      costs: sortedCosts,
      report
    });
  }

  // TEAM EXTENSION: exports the current report as a real .xlsx file.
  async function handleExcelExport() {
    if (!report) {
      return;
    }

    setExportErrorMessage('');
    setExportingAction('excel');

    try {
      await excelExportService.downloadReportWorkbook(
        buildCurrentExportModel(),
        getMonthlyReportExportFilename({
          year: report.year,
          month: report.month,
          currency: report.total.currency,
          extension: 'xlsx'
        })
      );
    } catch {
      setExportErrorMessage('Could not export the Excel file. Please try again.');
    } finally {
      setExportingAction(null);
    }
  }

  // TEAM EXTENSION: exports the current report as a PDF.
  async function handlePdfExport() {
    if (!report) {
      return;
    }

    setExportErrorMessage('');
    setExportingAction('pdf');

    // Reuses buildCurrentExportModel() so the PDF and Excel exports always
    // agree on which rows/summary they're built from.
    try {
      await pdfExportService.downloadReportPdf(
        buildCurrentExportModel(),
        getMonthlyReportExportFilename({
          year: report.year,
          month: report.month,
          currency: report.total.currency,
          extension: 'pdf'
        })
      );
    } catch {
      setExportErrorMessage('Could not export the PDF file. Please try again.');
    } finally {
      setExportingAction(null);
    }
  }

  return (
    <Stack spacing={3}>
      <PageHeader component={headingComponent} title="Monthly Report">
        Select a month, year, and currency to review detailed cost entries.
      </PageHeader>

      {/* Filter form: submitting it calls handleSubmit above. */}
      <SectionCard
        component="form"
        onSubmit={handleSubmit}
      >
        <Stack spacing={3}>
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
            {/* Month: fixed 12-entry select, unlike Year's free numeric input. */}
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

            {/* Currency select, restricted to the four required identifiers. */}
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
                  isLoading ? null : <AssessmentOutlinedIcon aria-hidden="true" />
                }
                type="submit"
                variant="contained"
              >
                {/* Spinner label swap while the report is being generated. */}
                <LoadingButtonLabel
                  isLoading={isLoading}
                  loadingText="Generating..."
                >
                  Generate Report
                </LoadingButtonLabel>
              </Button>
            </Box>
          </Box>
        </Stack>
      </SectionCard>

      {!hasGenerated && !errorMessage && !isLoading ? (
        <Alert severity="info">
          Choose filters and generate a detailed monthly report.
        </Alert>
      ) : null}

      {/* Generated-report section: totals, exports, then the sortable table. */}
      {report ? (
        <SectionCard>
          <Stack spacing={3}>
            <Box>
              <Typography component="h2" variant="h2">
                {getMonthLabel(report.month)} {report.year}
              </Typography>
              <Typography color="text.secondary" variant="body1">
                Report currency: {report.total.currency}
              </Typography>
              <Typography fontWeight={700} variant="body1">
                Total: {formatDisplayAmount(report.total.sum)}{' '}
                {report.total.currency}
              </Typography>
            </Box>

            {exportErrorMessage ? (
              <Alert severity="error">{exportErrorMessage}</Alert>
            ) : null}

            {/* TEAM EXTENSION: Excel/PDF export of this monthly report. */}
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

            {/* Empty state vs. the shared sortable table (X-006). */}
            {report.costs.length === 0 ? (
              <Alert severity="info">No costs found for this month.</Alert>
            ) : (
              <SortableReportTable
                costs={sortedCosts}
                dateMode="monthly"
                onRequestSort={requestSort}
                sortDirection={sortDirection}
                sortKey={sortKey}
              />
            )}
          </Stack>
        </SectionCard>
      ) : null}
    </Stack>
  );
}

export default MonthlyReportPage;
