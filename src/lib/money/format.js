/*
 * M2A.2: the one place money is turned into text. Amounts are decimal
 * strings; Intl.NumberFormat accepts them directly (modern Chrome/Firefox/
 * Safari), so they are never reduced to a Number first. Rounding is half away
 * from zero ("halfExpand"), applied once here. No toFixed() and no
 * Math.round(n * 100) / 100.
 */
import { percentageOf, roundAmount } from './decimal.js';

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

/**
 * Formats an ORIGINAL stored amount without rounding it: the shortest exact
 * decimal, grouped, at least the minor-unit digits, and any excess historical
 * precision kept (never silently rounded).
 * @param {string|number} amount
 * @param {string} currency
 * @param {string} [locale]
 * @returns {string}
 */
export function formatStoredAmount(amount, currency, locale = DEFAULT_LOCALE) {
  const text = typeof amount === 'number' ? String(amount) : amount;
  const fractionLength = (/\.(\d+)$/.exec(roundAmount(text, 20).replace(/0+$/, '')) ?? ['', ''])[1].length;
  const digits = Math.max(getMinorUnitDigits(currency), fractionLength);

  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: true
  }).format(roundAmount(text, digits));
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
