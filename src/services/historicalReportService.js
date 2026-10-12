/*
 * M2B.2: the one entry point screens call to produce report and chart
 * figures. For each request it
 *   1. reads the stored expenses (read-only),
 *   2. prepares ECB rates asynchronously (historicalRatesService.js),
 *   3. converts everything synchronously from ONE index snapshot
 *      (lib/reporting/*),
 * so the monthly report, yearly report, pie chart, bar chart and exports are
 * derived from the same conversion and can never disagree. db.getReport()
 * is not involved: it stays the synchronous, flat-rate legacy contract.
 */
import { amountToNumber } from '../lib/money/decimal.js';
import { buildFxStatus } from '../lib/reporting/fxAvailability.js';
import { createHistoricalConverter, getLocalIsoDate } from '../lib/reporting/historicalConversion.js';
import { buildCategoryBreakdown, buildMonthlyConversion, buildYearlyConversion } from '../lib/reporting/historicalReports.js';
import { getEcbDisclosure, getIncompleteNotice, getStatusNotes } from './conversionDisclosure.js';
import { prepareHistoricalRates } from './historicalRatesService.js';

// Full-detail copy for report tables (all date/time fields).
function copyCost(cost) {
  return {
    id: cost.id,
    sum: cost.sum,
    currency: cost.currency,
    category: cost.category,
    description: cost.description,
    date: { ...cost.date }
  };
}

async function convertedView({ costs, currency, now, signal, services }) {
  const referenceDate = getLocalIsoDate(now ? new Date(now()) : new Date());
  const prepare = services?.prepareHistoricalRates ?? prepareHistoricalRates;
  const prepared = await prepare({ costs, targetCurrency: currency, referenceDate, signal });

  return {
    prepared,
    converter: createHistoricalConverter({ index: prepared.index, targetCurrency: currency, referenceDate })
  };
}

// Browser offline is only a hint that changes wording; it proves nothing.
function browserIsOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function describe(conversion, prepared, items, targetCurrency) {
  const fxStatus = buildFxStatus({ prepared, items, summary: conversion, targetCurrency, browserOffline: browserIsOffline() });

  return {
    fxStatus,
    rateDisclosure: getEcbDisclosure(conversion, fxStatus),
    incompleteNotice: getIncompleteNotice(conversion, fxStatus),
    statusNotes: getStatusNotes(fxStatus)
  };
}

/**
 * @returns {Promise<object>} { year, month, costs, total:{currency,sum|null},
 *   totalAmount|null, complete, status, conversion, rateDisclosure,
 *   incompleteNotice, breakdown }
 */
export async function generateMonthlyReport({ database, currency, year, month, now, signal, services }) {
  const costs = database.getAllCosts().filter((cost) => cost.date.year === year && cost.date.month === month).map(copyCost);
  const { converter, prepared } = await convertedView({ costs, currency, now, signal, services });
  const conversion = buildMonthlyConversion(costs, converter);
  const notes = describe(conversion, prepared, conversion.items, currency);

  return {
    year,
    month,
    costs,
    total: { currency, sum: conversion.total === null ? null : amountToNumber(conversion.total) },
    totalAmount: conversion.total,
    complete: conversion.complete,
    status: conversion.status,
    conversion,
    breakdown: buildCategoryBreakdown(conversion),
    ...notes,
    // No converted figure is shown for an incomplete month, so no ECB claim.
    rateDisclosure: conversion.complete ? notes.rateDisclosure : null
  };
}

/**
 * Yearly report AND yearly bar chart share this result: `months` are the
 * twelve monthly conversions and `totalAmount` is their exact sum.
 */
export async function generateYearlyReport({ database, currency, year, now, signal, services }) {
  const costs = database.getAllCosts().filter((cost) => cost.date.year === year).map(copyCost);
  const { converter, prepared } = await convertedView({ costs, currency, now, signal, services });
  const yearly = buildYearlyConversion(costs, converter, year);

  const summary = { ...yearly, unavailableReasons: [...new Set(yearly.unavailable.map((item) => item.reason))].sort() };
  const notes = describe(summary, prepared, yearly.months.flatMap((month) => month.conversion.items), currency);
  const yearlyNotes = {
    fxStatus: notes.fxStatus,
    statusNotes: notes.statusNotes,
    // Same contract as the monthly report: no ECB claim beside an unavailable total.
    rateDisclosure: yearly.complete ? notes.rateDisclosure : null,
    // The bar chart still shows the months that DID convert, so it needs the
    // provenance of those figures even when the year is incomplete.
    partialRateDisclosure: notes.rateDisclosure,
    incompleteNotice: notes.incompleteNotice
  };

  return {
    year,
    costs,
    currency,
    total: { currency, sum: yearly.totalAmount === null ? null : amountToNumber(yearly.totalAmount) },
    totalAmount: yearly.totalAmount,
    complete: yearly.complete,
    months: yearly.months,
    yearly,
    conversion: { ...yearly, total: yearly.totalAmount, complete: yearly.complete },
    ...yearlyNotes
  };
}
