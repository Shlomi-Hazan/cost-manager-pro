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
import { buildDetailedYearlyReport } from '../services/detailedReportsService.js';
import { refreshExchangeRates } from '../services/exchangeRatesService.js';
// TEAM EXTENSION: Excel/PDF export helpers for this yearly report.
import * as excelExportService from '../services/export/excelExportService.js';
import {
  buildYearlyReportExportModel
} from '../services/export/exportModels.js';
import * as pdfExportService from '../services/export/pdfExportService.js';
import {
  getYearlyReportExportFilename
} from '../utils/exportFilenames.js';
import { formatDisplayAmount } from '../utils/amountFormat.js';
import { getStorageErrorMessage } from '../utils/storageErrorMessage.js';

/*
 * TEAM EXTENSION (X-005): a full-year detail report, in addition to the
 * course-required Monthly Report. Follows the same filter/generate/export
 * pattern as MonthlyReportPage.jsx by design, so the two report screens
 * behave predictably the same way; see that file for the more detailed
 * comments on the shared pattern (rate refresh, sortable table, exports).
 */

// Defaults the form to the current year in USD on first render.
function getCurrentFilters() {
  return {
    year: String(new Date().getFullYear()),
    currency: 'USD'
  };
}

// Validates the filter form before generating a report.
function validateFilters(filters) {
  const errors = {};
  const trimmedYear = filters.year.trim();
  const reportYear = Number(trimmedYear);

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
    reportYear
  };
}

// Maps a thrown error to a user-facing message for the report's error alert.
function getReportErrorMessage(error) {
  const storageMessage = getStorageErrorMessage(error);

  if (storageMessage) {
    return storageMessage;
  }

  if (
    error instanceof Error &&
    (error.message.includes('cached exchange rates') ||
      error.message.includes('Exchange rates'))
  ) {
    return 'Exchange rates are unavailable for converting this yearly report. Please try again.';
  }

  return 'Could not generate the yearly report. Please try again.';
}

function YearlyReportPage({ headingComponent = 'h1' }) {
  // Form/result state: filters the user is editing, plus the last
  // successfully generated report (or the error that stopped it).
  const [filters, setFilters] = useState(getCurrentFilters);
  const [errors, setErrors] = useState({});
  const [report, setReport] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [exportErrorMessage, setExportErrorMessage] = useState('');
  const [exportingAction, setExportingAction] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  // TEAM EXTENSION (X-006): shared sorting state for the report table below.
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

  // Validates, then fetches rates and builds the detailed yearly report.
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
      // Refreshing rates here keeps the cache warm; a same-currency report
      // can still succeed below even if this fails.
      try {
        await refreshExchangeRates();
      } catch {
        // Same-currency yearly reports and valid cached rates can still work.
      }

      const nextReport = buildDetailedYearlyReport(
        costsDatabase,
        filters.currency,
        validation.reportYear
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

  // Shared shape for both export functions below.
  function buildCurrentExportModel() {
    return buildYearlyReportExportModel({
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
        getYearlyReportExportFilename({
          year: report.year,
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
        getYearlyReportExportFilename({
          year: report.year,
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
      <PageHeader component={headingComponent} title="Yearly Report">
        Select a year and currency to review all cost entries for that year.
      </PageHeader>

      {/* Filter form: submitting it calls handleSubmit above. */}
      <SectionCard
        component="form"
        onSubmit={handleSubmit}
      >
        <Stack spacing={3}>
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
                  Generate Yearly Report
                </LoadingButtonLabel>
              </Button>
            </Box>
          </Box>
        </Stack>
      </SectionCard>
      {/* Empty/info state shown before the first successful generation. */}

      {!hasGenerated && !errorMessage && !isLoading ? (
        <Alert severity="info">
          Choose filters and generate a detailed yearly report.
        </Alert>
      ) : null}

      {/* Generated-report section: totals, exports, then the sortable table. */}
      {report ? (
        <SectionCard>
          <Stack spacing={3}>
            <Box>
              <Typography component="h2" variant="h2">
                {report.year} Yearly Report
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

            {/* TEAM EXTENSION: Excel/PDF export of this yearly report. */}
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
              <Alert severity="info">No costs found for this year.</Alert>
            ) : (
              <SortableReportTable
                costs={sortedCosts}
                dateMode="yearly"
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

export default YearlyReportPage;
