/*
 * M2A.2: the one place money is turned into text. Amounts are decimal
 * strings; Intl.NumberFormat accepts them directly (modern Chrome/Firefox/
 * Safari), so they are never reduced to a Number first. Rounding is half away
 * from zero ("halfExpand"), applied once here. No toFixed() and no
 * Math.round(n * 100) / 100.
 */
import { normalizeAmount, percentageOf, roundAmount } from './decimal.js';

// Minor-unit digits per currency. JPY and 3-decimal currencies are only used
// by calculation tests; they are not user-selectable.
const minorUnitDigits = { USD: 2, ILS: 2, GBP: 2, EURO: 2, JPY: 0, KWD: 3 };

// The app's identifier EURO is formatting-only mapped to ISO EUR.
const isoCodes = { EURO: 'EUR' };

export const DEFAULT_LOCALE = 'en-US';

/**
 * @param {string} currency
 * @returns {number} Minor-unit decimal places (2 when unknown).
 */
export function getMinorUnitDigits(currency) {
  return minorUnitDigits[currency] ?? 2;
}

/**
 * @param {string|number} amount - Exact decimal.
 * @param {string} currency
 * @returns {string} The canonical rounded amount, e.g. "1.00".
 */
export function roundForCurrency(amount, currency) {
  return roundAmount(amount, getMinorUnitDigits(currency));
}

/**
 * Formats a monetary total: rounded once to the currency's minor unit, with
 * symbol, grouping, and no scientific notation. Negative zero shows as zero.
 * @param {string|number} amount
 * @param {string} currency
 * @param {string} [locale]
 * @returns {string}
 */
export function formatMoney(amount, currency, locale = DEFAULT_LOCALE) {
  const digits = getMinorUnitDigits(currency);

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: isoCodes[currency] ?? currency,
    currencyDisplay: 'symbol',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    roundingMode: 'halfExpand',
    signDisplay: 'negative',
    useGrouping: true
  }).format(roundForCurrency(amount, currency));
}

// Largest fraction-digit count Intl.NumberFormat accepts here: 100 in current
// Chrome/Firefox/Safari, 20 in older engines. Probed once so the fallback
// below is used only when it is really needed.
const intlFractionLimit = (() => {
  for (const limit of [100, 20]) {
    try {
      new Intl.NumberFormat('en-US', { maximumFractionDigits: limit });
      return limit;
    } catch {
      // Try the smaller documented limit.
    }
  }
  return 3;
})();

// Fallback for values with more fraction digits than Intl accepts: the digits
// are kept exactly (never truncated or rounded), with the locale's decimal
// and grouping symbols. A negative sign is a plain "-" (no directionality
// marks), which is the only difference from the Intl path.
function formatDecimalStringExactly(canonical, minimumDigits, locale) {
  const parts = new Intl.NumberFormat(locale).formatToParts(1000000.5);
  const group = parts.find((part) => part.type === 'group')?.value ?? ',';
  const decimal = parts.find((part) => part.type === 'decimal')?.value ?? '.';
  const negative = canonical.startsWith('-');
  const [whole, fraction = ''] = canonical.replace('-', '').split('.');
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, group);
  const paddedFraction = fraction.padEnd(minimumDigits, '0');

  return `${negative ? '-' : ''}${groupedWhole}${paddedFraction ? decimal + paddedFraction : ''}`;
}

/**
 * Formats an ORIGINAL stored amount without rounding it. The digit count is
 * read from the exact canonical decimal (never from a rounded value), so the
 * shortest exact form is shown, padded to the currency's minor unit, and a
 * nonzero amount never displays as zero. No scientific notation. Beyond
 * Intl's fraction-digit limit (100 digits; only reachable by values below
 * 1e-100) an exact string fallback keeps every digit.
 * @param {string|number} amount
 * @param {string} currency
 * @param {string} [locale]
 * @returns {string}
 */
export function formatStoredAmount(amount, currency, locale = DEFAULT_LOCALE) {
  const canonical = normalizeAmount(amount);
  const fractionLength = canonical.split('.')[1]?.length ?? 0;
  const digits = Math.max(getMinorUnitDigits(currency), fractionLength);

  if (digits > intlFractionLimit) {
    return formatDecimalStringExactly(canonical, getMinorUnitDigits(currency), locale);
  }

  // Intl formats a decimal string exactly; with min = max = the exact digit
  // count there is nothing to round.
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: true
  }).format(canonical);
}

/**
 * @param {string|number} percentage - Already rounded or exact percentage.
 * @param {string} [locale]
 * @returns {string} e.g. "33.3%".
 */
export function formatPercentage(percentage, locale = DEFAULT_LOCALE) {
  return `${new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    roundingMode: 'halfExpand'
  }).format(roundAmount(percentage, 1))}%`;
}

/**
 * Like formatMoney but without the currency symbol, for places that already
 * show the currency code next to the number (tables, chart tooltips).
 * @param {string|number} amount
 * @param {string} currency
 * @param {string} [locale]
 * @returns {string} e.g. "1,234.50".
 */
export function formatAmount(amount, currency, locale = DEFAULT_LOCALE) {
  const digits = getMinorUnitDigits(currency);

  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    roundingMode: 'halfExpand',
    useGrouping: true
  }).format(roundForCurrency(amount, currency));
}

/**
 * @param {number|string} ratio - A 0-1 share (already rounded to one decimal
 *   of a percent when it comes from the canonical calculation).
 * @param {string} [locale]
 * @returns {string} e.g. "33.3%".
 */
export function formatRatioAsPercentage(ratio, locale = DEFAULT_LOCALE) {
  return formatPercentage(percentageOf(String(ratio), '1', 1), locale);
}
