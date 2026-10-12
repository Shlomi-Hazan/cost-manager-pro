/*
 * M2B.1: chooses the ECB observation set that applies to an expense, and
 * PROVES the choice against what was actually fetched. Pure and synchronous:
 * it reads a table (see rateTable.js) and never touches the network, storage,
 * or the clock (the caller passes `referenceDate`, only to recognise future
 * dates).
 *
 * Policy (ADR-049)
 *  - An expense on local calendar date D uses the latest observation set
 *    dated on or before D. D is the stored day/month/year as YYYY-MM-DD;
 *    nothing is converted through UTC.
 *  - Every currency of one conversion comes from the SAME observation date.
 *  - An observation dated after D is never used.
 *  - EUR is the base (1 by definition) and never needs an observation; a
 *    conversion between the same currency needs none at all (`identity` is
 *    true: the amount is used as it is, and `rates` holds only EUR).
 *  - A selection is only `available` when each needed currency has COUNTED
 *    coverage (valid or confirmed-empty) over [observationDate, D]. Without
 *    it the answer is `needs-fetch` with the missing ranges, and "tried and
 *    failed" is reported apart from "never tried". A selection therefore can
 *    never cross an unverified boundary.
 *  - Finality comes from observed data, not from the clock: the result is
 *    FINAL when the observation is dated D itself, or when a later common
 *    observation (dated after D) proves every earlier publication was
 *    already out. Otherwise it is PROVISIONAL (D is after the newest known
 *    observation: today before the next publication, a weekend or holiday
 *    at the end of the data) and may be superseded.
 *  - D after `referenceDate` (the caller's today) is `unavailable`
 *    (`future-date`); D before the series start is `unavailable`.
 */
import { supportedCurrencies } from '../../constants/currencies.js';
import { ecbFirstObservationDate, fxBaseCurrency, fxQuoteCurrencies } from './constants.js';
import { addDays, isValidIsoDate } from './ecbParser.js';
import { FxError, fxErrorCodes as codes } from './fxErrors.js';
import { coverageStatuses, isCountedCoverage } from './rateTable.js';

export const selectionStatus = {
  available: 'available',
  needsFetch: 'needs-fetch',
  unavailable: 'unavailable'
};

export const unavailableReasons = {
  futureDate: 'future-date',
  beforeProviderHistory: 'before-provider-history',
  currencyUnavailable: 'currency-unavailable',
  noCommonObservationDate: 'no-common-observation-date'
};

export const finality = { final: 'final', provisional: 'provisional' };

// ---- inclusive date intervals ----------------------------------------------

function mergeIntervals(intervals) {
  const sorted = [...intervals].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  const merged = [];

  sorted.forEach((interval) => {
    const last = merged[merged.length - 1];

    if (last && interval.from <= addDays(last.to, 1)) {
      if (interval.to > last.to) {
        last.to = interval.to;
      }
    } else {
      merged.push({ from: interval.from, to: interval.to });
    }
  });

  return merged;
}

// Parts of [from, to] not inside any of the (merged) covered intervals.
function uncovered(from, to, covered) {
  const gaps = [];
  let cursor = from;

  for (const interval of covered) {
    if (interval.to < cursor) {
      continue;
    }

    if (interval.from > to) {
      break;
    }

    if (interval.from > cursor) {
      gaps.push({ from: cursor, to: addDays(interval.from, -1) });
    }

    cursor = addDays(interval.to, 1);

    if (cursor > to) {
      return gaps;
    }
  }

  if (cursor <= to) {
    gaps.push({ from: cursor, to });
  }

  return gaps;
}

// Largest index with sortedDates[index] <= date, or -1.
function latestOnOrBefore(sortedDates, date) {
  let low = 0;
  let high = sortedDates.length - 1;
  let found = -1;

  while (low <= high) {
    const middle = (low + high) >> 1;

    if (sortedDates[middle] <= date) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return found;
}

/**
 * Builds the lookup structures once, so many expenses can be selected
 * cheaply. The table is read, never modified.
 * @param {object} table - A validated FX table.
 * @returns {{select: function}}
 */
export function createObservationIndex(table) {
  const perQuote = Object.fromEntries(
    fxQuoteCurrencies.map((quote) => [
      quote,
      {
        dates: Object.keys(table.observations[quote]).sort(),
        counted: mergeIntervals(table.coverage[quote].filter((range) => isCountedCoverage(range.status))),
        attempts: table.coverage[quote].filter((range) => !isCountedCoverage(range.status))
      }
    ])
  );
  const providerStart = table.provider_meta?.startDate ?? ecbFirstObservationDate;

  // Why a range is missing: tried and failed, tried and incomplete, or never.
  function describeMissing(quote, gap) {
    const overlapping = perQuote[quote].attempts.filter((attempt) => attempt.from <= gap.to && attempt.to >= gap.from);
    const state = overlapping.some((attempt) => attempt.status === coverageStatuses.failed)
      ? 'failed'
      : overlapping.some((attempt) => attempt.status === coverageStatuses.partial)
        ? 'partial'
        : 'not-fetched';

    return { quote, from: gap.from, to: gap.to, state };
  }

  function result(fields) {
    return {
      status: selectionStatus.unavailable,
      requestedDate: null,
      selectedDate: null,
      quotes: [],
      rates: null,
      finality: null,
      mayBeSuperseded: false,
      needsFetch: false,
      identity: false,
      reason: null,
      missing: [],
      provenance: [],
      ...fields
    };
  }

  function select({ expenseDate, currencies, referenceDate = null }) {
    if (!isValidIsoDate(expenseDate)) {
      throw new FxError(codes.invalidRequest, 'The expense date must be a real YYYY-MM-DD date.', { details: { expenseDate } });
    }

    if (referenceDate !== null && !isValidIsoDate(referenceDate)) {
      throw new FxError(codes.invalidRequest, 'The reference date must be a real YYYY-MM-DD date.', { details: { referenceDate } });
    }

    if (!Array.isArray(currencies) || currencies.some((currency) => !supportedCurrencies.includes(currency))) {
      throw new FxError(codes.invalidRequest, 'Currencies must be supported currency codes.', { details: { currencies } });
    }

    const quotes = [...new Set(currencies.filter((currency) => currency !== fxBaseCurrency))].sort();
    const base = { requestedDate: expenseDate, quotes };

    // Same currency, or EUR itself: nothing to look up.
    if (quotes.length === 0 || new Set(currencies).size < 2) {
      return result({
        ...base,
        status: selectionStatus.available,
        identity: true,
        rates: { [fxBaseCurrency]: '1' },
        finality: finality.final
      });
    }

    if (referenceDate !== null && expenseDate > referenceDate) {
      return result({ ...base, reason: unavailableReasons.futureDate });
    }

    if (expenseDate < providerStart) {
      return result({ ...base, reason: unavailableReasons.beforeProviderHistory });
    }

    // Latest date on or before `expenseDate` on which EVERY needed currency
    // has an observation, descending until all agree.
    let candidate = expenseDate;
    let culprit = null;

    for (;;) {
      let lowest = candidate;

      for (const quote of quotes) {
        const index = latestOnOrBefore(perQuote[quote].dates, candidate);

        if (index < 0) {
          culprit = quote;
          lowest = null;
          break;
        }

        if (perQuote[quote].dates[index] < lowest) {
          lowest = perQuote[quote].dates[index];
        }
      }

      if (lowest === null || lowest === candidate) {
        candidate = lowest;
        break;
      }

      candidate = lowest;
    }

    if (candidate === null) {
      // Some currency has no observation at or before the dates tried. Is the
      // history for it fully checked, or not yet fetched?
      const missing = [];

      quotes.forEach((quote) => {
        uncovered(providerStart, expenseDate, perQuote[quote].counted).forEach((gap) => missing.push(describeMissing(quote, gap)));
      });

      if (missing.length > 0) {
        return result({ ...base, status: selectionStatus.needsFetch, needsFetch: true, missing });
      }

      // The history is fully checked. Either the currency has no observation
      // at or before the date at all (confirmed absence), or every currency
      // has some but never on the same day.
      const hasObservationBefore = latestOnOrBefore(perQuote[culprit].dates, expenseDate) >= 0;

      return result({
        ...base,
        reason: hasObservationBefore ? unavailableReasons.noCommonObservationDate : unavailableReasons.currencyUnavailable,
        missing: []
      });
    }

    // Prove [candidate, expenseDate] was checked for every needed currency.
    const missing = [];

    quotes.forEach((quote) => {
      uncovered(candidate, expenseDate, perQuote[quote].counted).forEach((gap) => missing.push(describeMissing(quote, gap)));
    });

    if (missing.length > 0) {
      return result({ ...base, selectedDate: candidate, status: selectionStatus.needsFetch, needsFetch: true, missing });
    }

    const rates = { [fxBaseCurrency]: '1' };
    const provenance = [];

    quotes.forEach((quote) => {
      const [rate, fetchId] = table.observations[quote][candidate];

      rates[quote] = rate;
      provenance.push({ quote, rate, observationDate: candidate, fetchId, fetchedAt: table.fetches[String(fetchId)]?.at ?? null });
    });

    // A later observation shared by every needed currency proves earlier
    // publications are complete.
    const laterCommon = candidate < expenseDate
      ? perQuote[quotes[0]].dates.some(
          (date) => date > expenseDate && quotes.every((quote) => table.observations[quote][date] !== undefined)
        )
      : false;
    const isFinal = candidate === expenseDate || laterCommon;

    return result({
      ...base,
      status: selectionStatus.available,
      selectedDate: candidate,
      rates,
      finality: isFinal ? finality.final : finality.provisional,
      mayBeSuperseded: !isFinal,
      provenance
    });
  }

  return { select };
}

/**
 * Convenience for a single lookup.
 * @param {object} args
 * @param {object} args.table - A validated FX table.
 * @param {string} args.expenseDate - YYYY-MM-DD, the stored local date.
 * @param {string[]} args.currencies - The source and target currency of the
 *   conversion, e.g. ['ILS', 'USD'] or ['EUR', 'USD']. One entry, or equal
 *   entries, means no conversion (nothing to look up).
 * @param {string} [args.referenceDate] - The caller's local today, used only
 *   to recognise future dates.
 * @returns {object} See the result fields above.
 */
export function selectObservationSet({ table, ...rest }) {
  return createObservationIndex(table).select(rest);
}
