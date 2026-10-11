/*
 * M2A.2: the one place that does financial arithmetic.
 *
 * Amounts are decimal STRINGS (for example "0.999"), never floating-point
 * Numbers, so sums and conversions carry no binary rounding noise (0.1 + 0.2
 * is exactly 0.3). big.js does the arithmetic behind these application-owned
 * functions; callers never import big.js directly.
 *
 * Policy B: exact values flow through every conversion and sum. Rounding
 * happens once, at the presentation/export boundary (roundAmount), using
 * half away from zero.
 *
 * PRECISION LIMITS (honest statement, not "infinite precision"):
 * - Addition, subtraction, and multiplication are exact for any size.
 * - Division is the only inexact step. It is evaluated to DIVISION_DECIMALS
 *   (30) decimal places, half away from zero. A conversion does ONE division
 *   (multiply first, divide once), so its error is below 5e-31 in the target
 *   currency, far below any currency minor unit.
 * - A JavaScript Number converts losslessly only up to 15 significant digits;
 *   precision already lost when the stored JSON number was parsed cannot be
 *   restored. Stored sums are therefore taken as their shortest decimal
 *   representation (String(n)) and never rewritten.
 * - Rates are never rounded before use.
 *
 * The constructor is isolated (Big() with no argument returns a new one), so
 * these settings never touch big.js's global configuration.
 */
import Big from 'big.js';

export const DIVISION_DECIMALS = 30;

const Decimal = Big();
Decimal.DP = DIVISION_DECIMALS;
// 1 = round half up on the magnitude, which is half AWAY from zero for
// negatives as well.
Decimal.RM = Decimal.roundHalfUp;
// Strict mode rejects raw Numbers, so a float cannot slip in by accident.
Decimal.strict = true;

const DECIMAL_PATTERN = /^-?(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?$/i;

/**
 * @param {string|number} value - A decimal string, or a finite Number (its
 *   shortest decimal representation is used).
 * @returns {Decimal}
 * @throws {TypeError} For anything that is not a finite decimal.
 */
function toDecimal(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('Amount must be a finite number.');
    }
    return new Decimal(String(value));
  }
  if (typeof value !== 'string' || !DECIMAL_PATTERN.test(value)) {
    throw new TypeError('Amount must be a decimal string.');
  }
  return new Decimal(value);
}

// Normal (non-scientific) notation, with no "-0".
function toCanonical(decimal) {
  return decimal.toFixed();
}

/**
 * @param {string|number} value
 * @returns {string} The canonical decimal string of a stored amount or rate.
 */
export function normalizeAmount(value) {
  return toCanonical(toDecimal(value));
}

/**
 * @param {(string|number)[]} values
 * @returns {string} The exact sum ("0" for an empty list).
 */
export function sumAmounts(values) {
  return toCanonical(values.reduce((total, value) => total.plus(toDecimal(value)), new Decimal('0')));
}

/**
 * Converts an amount using "units per 1 USD" rates:
 * amount * targetRate / sourceRate, with a single division.
 * @param {string|number} amount
 * @param {string|number} sourceRate
 * @param {string|number} targetRate
 * @returns {string}
 * @throws {RangeError} If the source rate is not positive.
 */
export function convertDecimalAmount(amount, sourceRate, targetRate) {
  const source = toDecimal(sourceRate);
  const target = toDecimal(targetRate);

  if (source.lte('0') || target.lte('0')) {
    throw new RangeError('Exchange rates must be positive.');
  }
  if (source.eq(target)) {
    return normalizeAmount(amount);
  }
  return toCanonical(toDecimal(amount).times(target).div(source));
}

/**
 * Rounds ONCE, half away from zero, to a number of decimal places. Used only
 * at the presentation/export boundary.
 * @param {string|number} amount
 * @param {number} decimals
 * @returns {string} A fixed-point string with exactly `decimals` places
 *   ("-0.00" is returned as "0.00").
 */
export function roundAmount(amount, decimals) {
  const rounded = toDecimal(amount).round(decimals, Decimal.roundHalfUp);

  return rounded.eq('0') ? new Decimal('0').toFixed(decimals) : rounded.toFixed(decimals);
}

/**
 * @param {string|number} left
 * @param {string|number} right
 * @returns {number} -1, 0, or 1.
 */
export function compareAmounts(left, right) {
  return toDecimal(left).cmp(toDecimal(right));
}

/**
 * Share of `part` in `whole` as a percentage, rounded half away from zero.
 * @param {string|number} part
 * @param {string|number} whole
 * @param {number} decimals
 * @returns {string} "0.0" style string; "0" places when whole is not positive.
 */
export function percentageOf(part, whole, decimals = 1) {
  const wholeValue = toDecimal(whole);

  if (wholeValue.lte('0')) {
    return roundAmount('0', decimals);
  }
  return roundAmount(toDecimal(part).times('100').div(wholeValue).toFixed(), decimals);
}

/**
 * Boundary helper for legacy Number-based shapes (chart geometry, the
 * externally pinned getReport total). Never feed the result back into
 * financial arithmetic.
 * @param {string} amount
 * @returns {number}
 */
export function amountToNumber(amount) {
  return Number(amount);
}

/**
 * Converts a percentage (such as "38.3") to its 0-1 ratio ("0.383") exactly,
 * so a spreadsheet cell holds 0.383 and not 0.38299999999999995.
 * @param {string|number} percentage
 * @returns {string}
 */
export function percentageToRatio(percentage) {
  return toCanonical(toDecimal(percentage).div('100'));
}
