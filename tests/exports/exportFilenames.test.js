import { describe, expect, it } from 'vitest';
import {
  getBarChartExportFilename,
  getMonthlyReportExportFilename,
  getPieChartExportFilename,
  getYearlyReportExportFilename
} from '../../src/utils/exportFilenames.js';

// TEAM EXTENSION test: filenames must be deterministic (same inputs always
// produce the same name) and encode the period/currency they cover.
describe('exportFilenames', () => {
  it('builds all required deterministic export filenames', () => {
    expect(
      getMonthlyReportExportFilename({
        year: 2026,
        month: 8,
        currency: 'USD',
        extension: 'xlsx'
      })
    ).toBe('cost-manager-monthly-report-2026-08-usd.xlsx');
    expect(
      getMonthlyReportExportFilename({
        year: 2026,
        month: 8,
        currency: 'USD',
        extension: 'pdf'
      })
    ).toBe('cost-manager-monthly-report-2026-08-usd.pdf');
    expect(
      getYearlyReportExportFilename({
        year: 2026,
        currency: 'USD',
        extension: 'xlsx'
      })
    ).toBe('cost-manager-yearly-report-2026-usd.xlsx');
    expect(
      getYearlyReportExportFilename({
        year: 2026,
        currency: 'USD',
        extension: 'pdf'
      })
    ).toBe('cost-manager-yearly-report-2026-usd.pdf');
    expect(
      getPieChartExportFilename({
        year: 2026,
        month: 8,
        currency: 'USD',
        extension: 'xlsx'
      })
    ).toBe('cost-manager-pie-chart-2026-08-usd.xlsx');
    expect(
      getPieChartExportFilename({
        year: 2026,
        month: 8,
        currency: 'USD',
        extension: 'pdf'
      })
    ).toBe('cost-manager-pie-chart-2026-08-usd.pdf');
    expect(
      getBarChartExportFilename({
        year: 2026,
        currency: 'USD',
        extension: 'xlsx'
      })
    ).toBe('cost-manager-bar-chart-2026-usd.xlsx');
    expect(
      getBarChartExportFilename({
        year: 2026,
        currency: 'USD',
        extension: 'pdf'
      })
    ).toBe('cost-manager-bar-chart-2026-usd.pdf');
  });

  it('zero-pads one-digit months', () => {
    expect(
      getPieChartExportFilename({
        year: 2026,
        month: 1,
        currency: 'EUR',
        extension: 'xlsx'
      })
    ).toBe('cost-manager-pie-chart-2026-01-eur.xlsx');
  });
});
