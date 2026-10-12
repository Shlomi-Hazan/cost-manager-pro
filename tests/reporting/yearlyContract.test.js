// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createEmptyTable, recordObservations } from '../../src/lib/fx/rateTable.js';
import { createObservationIndex } from '../../src/lib/fx/observationSelection.js';
import { generateMonthlyReport, generateYearlyReport } from '../../src/services/historicalReportService.js';
import { buildBarChartExportModel, buildMonthlyReportExportModel } from '../../src/services/export/exportModels.js';
import { clientResult } from '../fx/helpers.js';

const mk = (id, currency, month) => ({ id, sum: '120', currency, category: 'Food', description: id, date: { day: 7, month, year: 2026, hour: 1, minute: 1 } });
const table = recordObservations(createEmptyTable(), clientResult({ observations: [{ date: '2026-08-07', quote: 'USD', rate: '1.2' }], quotes: ['USD'], from: '2026-08-01', to: '2026-08-31' })).table;
const services = { prepareHistoricalRates: async () => ({ index: createObservationIndex(table) }) };
const run = (costs) => ({ database: { getAllCosts: () => costs }, currency: 'EUR', year: 2026, now: () => Date.parse('2026-10-12T12:00:00Z'), services });

describe('incomplete results never carry a complete-looking disclosure', () => {
  const complete = [mk('ok', 'USD', 8)];
  const incomplete = [mk('ok', 'USD', 8), mk('bad', 'USD', 3)];

  it('complete: monthly and yearly both disclose ECB', async () => {
    expect((await generateMonthlyReport({ ...run(complete), month: 8 })).rateDisclosure).not.toBeNull();
    expect((await generateYearlyReport(run(complete))).rateDisclosure).not.toBeNull();
  });

  it('incomplete: both return a null disclosure, a null total and a notice', async () => {
    const monthly = await generateMonthlyReport({ ...run([mk('bad', 'USD', 3)]), month: 3 });
    const yearly = await generateYearlyReport(run(incomplete));

    [monthly, yearly].forEach((report) => {
      expect(report.rateDisclosure).toBeNull();
      expect(report.totalAmount).toBeNull();
      expect(report.incompleteNotice.count).toBe(1);
    });
    // The bar chart still has provenance for the months that did convert.
    expect(yearly.partialRateDisclosure).not.toBeNull();
    expect(yearly.months[7].amount).toBe('100');
  });

  it('feeding the service result to the export builders gives Unavailable and no ECB row', async () => {
    const yearly = await generateYearlyReport(run(incomplete));
    const bar = buildBarChartExportModel({ yearlyResult: { currency: 'EUR', year: 2026, monthlyTotals: yearly.months, totalAmount: yearly.totalAmount }, rateDisclosure: yearly.rateDisclosure, incompleteNotice: yearly.incompleteNotice });
    const report = buildMonthlyReportExportModel({ report: { month: 3, year: 2026, total: { currency: 'EUR', sum: null } }, costs: [], totalAmount: yearly.totalAmount, rateDisclosure: yearly.rateDisclosure, incompleteNotice: yearly.incompleteNotice });

    [bar, report].forEach((model) => {
      expect(model.summary.some(([label]) => label === 'Exchange rates')).toBe(false);
      expect(model.summary.some(([label]) => label === 'Conversion')).toBe(true);
    });
    expect(bar.metadata.annualTotal).toBe('Unavailable');
    expect(report.metadata.total).toBe('Unavailable');
  });
});
