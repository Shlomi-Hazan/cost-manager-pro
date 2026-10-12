/*
 * M2B.2: the one place that converts expenses to a report currency with dated
 * ECB observations. Pure and synchronous: it reads a prepared observation
 * index (see lib/fx/observationSelection.js) and never touches the network,
 * storage, or the clock. Reports, charts and exports all derive their numbers
 * from the result of convertCosts(), so they cannot disagree.
 *
 * Rules (ADR-050)
 *  - Each expense uses its OWN observation: the latest ECB observation set
 *    dated on or before the expense's stored local calendar date, the same
 *    observation date for both currencies. The expense date, the observation
 *    date, and the fetch time are kept distinct.
 *  - A same-currency expense needs no rate. The amount is used exactly as stored.
 *  - Policy B: exact decimals, one division per conversion, nothing rounded
 *    here. Rounding happens only when a figure is displayed or exported.
 *  - NO PARTIAL TOTALS: `total` is a string only when EVERY expense converted.
 *    If any cannot be converted, `total` is null and the affected expenses are
 *    listed. No zero, one, demo, or other value is ever substituted.
 *  - Stored expenses are never modified.
 */
import { convertDecimalAmount, normalizeAmount, sumAmounts } from '../money/decimal.js';

export function toIsoDate({ year, month, day }) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * @param {Date} [now] - The clock (injectable for tests).
 * @returns {string} The user's LOCAL calendar date as YYYY-MM-DD.
 */
export function getLocalIsoDate(now = new Date()) {
  return toIsoDate({ year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() });
}

function earliest(values) {
  return values.reduce((current, value) => (current === null || value < current ? value : current), null);
}

function latest(values) {
  return values.reduce((current, value) => (current === null || value > current ? value : current), null);
}

/**
 * @param {object} options
 * @param {{select: function}|null} options.index - A prepared observation
 *   index, or null when no rates were prepared (only same-currency expenses
 *   can then be converted).
 * @param {string} options.targetCurrency - The report currency.
 * @param {string|null} [options.referenceDate] - The user's local today
 *   (YYYY-MM-DD), used only to recognise future-dated expenses.
 * @returns {{targetCurrency: string, convertCost: function}}
 */
export function createHistoricalConverter({ index, targetCurrency, referenceDate = null }) {
  const selections = new Map();

  function select(expenseDate, currency) {
    const key = `${expenseDate}|${currency}`;

    if (!selections.has(key)) {
      selections.set(key, index.select({ expenseDate, currencies: [currency, targetCurrency], referenceDate }));
    }

    return selections.get(key);
  }

  return {
    targetCurrency,

    /**
     * @param {object} cost - A stored expense ({id, sum, currency, category, date}).
     * @returns {object} The conversion of this one expense (see convertCosts).
     */
    convertCost(cost) {
      const expenseDate = toIsoDate(cost.date);
      const base = { id: cost.id, category: cost.category, currency: cost.currency, sum: cost.sum, expenseDate };

      if (cost.currency === targetCurrency) {
        return { ...base, status: 'converted', identity: true, amount: normalizeAmount(cost.sum), observationDate: null, finality: 'final', fetchedAt: null };
      }

      if (index === null) {
        return { ...base, status: 'unavailable', identity: false, amount: null, reason: 'rates-not-prepared', missing: [] };
      }

      const selection = select(expenseDate, cost.currency);

      if (selection.status !== 'available') {
        const reason = selection.status === 'needs-fetch' ? 'rates-not-available' : selection.reason;

        return { ...base, status: 'unavailable', identity: false, amount: null, reason, missing: selection.missing };
      }

      return {
        ...base,
        status: 'converted',
        identity: false,
        amount: convertDecimalAmount(cost.sum, selection.rates[cost.currency], selection.rates[targetCurrency]),
        observationDate: selection.selectedDate,
        finality: selection.finality,
        fetchedAt: earliest(selection.provenance.map((entry) => entry.fetchedAt).filter(Boolean))
      };
    }
  };
}

/**
 * Converts every expense of a set and summarizes it. Never rounds, never drops
 * an expense, never returns a partial total.
 * @param {object[]} costs - Stored expenses.
 * @param {{convertCost: function}} converter
 * @returns {{items: object[], complete: boolean, total: string|null,
 *   counts: object, unavailable: object[], unavailableReasons: string[],
 *   usesRates: boolean, observation: object|null}}
 */
export function convertCosts(costs, converter) {
  const items = costs.map((cost) => converter.convertCost(cost));
  const unavailable = items.filter((item) => item.status === 'unavailable');
  const rateItems = items.filter((item) => item.status === 'converted' && !item.identity);
  const complete = unavailable.length === 0;
  const dates = rateItems.map((item) => item.observationDate);
  const fetched = rateItems.map((item) => item.fetchedAt).filter(Boolean);

  return {
    targetCurrency: converter.targetCurrency,
    items,
    complete,
    // Only a complete set has a total. There is no "converted so far" figure.
    total: complete ? sumAmounts(items.map((item) => item.amount)) : null,
    counts: {
      expenses: items.length,
      converted: items.length - unavailable.length,
      unavailable: unavailable.length,
      sameCurrency: items.filter((item) => item.identity).length,
      withRates: rateItems.length,
      provisional: rateItems.filter((item) => item.finality === 'provisional').length
    },
    unavailable: unavailable.map(({ id, expenseDate, currency, sum, reason }) => ({ id, expenseDate, currency, sum, reason })),
    unavailableReasons: [...new Set(unavailable.map((item) => item.reason))].sort(),
    usesRates: rateItems.length > 0,
    observation:
      rateItems.length === 0
        ? null
        : {
            firstDate: earliest(dates),
            lastDate: latest(dates),
            provisional: rateItems.some((item) => item.finality === 'provisional'),
            fetchedFirst: earliest(fetched),
            fetchedLast: latest(fetched)
          }
  };
}

/**
 * Merges the observation summaries of several conversions (for example the
 * twelve months of a year) into one.
 * @param {object[]} conversions - Results of convertCosts().
 * @returns {object|null}
 */
export function mergeObservations(conversions) {
  const observed = conversions.map((conversion) => conversion.observation).filter(Boolean);

  if (observed.length === 0) {
    return null;
  }

  return {
    firstDate: earliest(observed.map((entry) => entry.firstDate)),
    lastDate: latest(observed.map((entry) => entry.lastDate)),
    provisional: observed.some((entry) => entry.provisional),
    fetchedFirst: earliest(observed.map((entry) => entry.fetchedFirst).filter(Boolean)),
    fetchedLast: latest(observed.map((entry) => entry.fetchedLast).filter(Boolean))
  };
}
