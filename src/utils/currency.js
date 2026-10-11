/*
 * Course requirement: currency conversion and exchange-rate-shape validation.
 * This is the single place that implements the official rate model and the
 * conversion formula, so both the React application and any report/chart
 * code reuse identical, independently-tested logic instead of re-deriving it.
 */
import { legacyEuroIdentifier, supportedCurrencies } from '../constants/currencies.js';
import { amountToNumber, convertDecimalAmount } from '../lib/money/decimal.js';

/**
 * @param {string} currency - Currency identifier to check.
 * @returns {boolean} True if currency is one of USD, ILS, GBP, EUR.
 */
export function isSupportedCurrency(currency) {
  return supportedCurrencies.includes(currency);
}

/**
 * Validates a raw exchange-rate object (usually a Fetch response, default
 * or custom) before it is trusted anywhere in the app. The official rate
 * model expresses every rate as "how many units of that currency equal 1
 * USD", e.g. { USD: 1, GBP: 0.6, EUR: 0.7, ILS: 3.4 }.
 *
 * Compatibility (M2A.3): before the euro became "EUR" it was "EURO", and
 * a custom source or an old cache may still use that key. A source with
 * "EURO" and no "EUR" is read as the same euro rate. This only affects the
 * in-memory copy: nothing stored is rewritten, "EURO" is never emitted, and a
 * source that gives both with different values is rejected instead of one
 * being guessed.
 * @param {object} rates - Candidate rates object.
 * @returns {object} A clean copy containing only the four required
 *   currencies in a fixed order; extra fields on the source object are
 *   dropped rather than carried through.
 * @throws {TypeError} If rates is missing a required currency, has a
 *   non-positive/non-finite rate, or USD is not exactly 1.
 */
export function validateExchangeRates(rates) {
  if (rates === null || typeof rates !== 'object' || Array.isArray(rates)) {
    throw new TypeError('Exchange rates must be an object.');
  }

  // Resolve the legacy euro key first, so the checks below see one "EUR".
  if (Object.hasOwn(rates, legacyEuroIdentifier)) {
    if (!Object.hasOwn(rates, 'EUR')) {
      rates = { ...rates, EUR: rates[legacyEuroIdentifier] };
    } else if (rates.EUR !== rates[legacyEuroIdentifier]) {
      throw new TypeError('Exchange rates give different values for EUR and EURO.');
    }
  }

  supportedCurrencies.forEach((currency) => {
    if (!Object.hasOwn(rates, currency)) {
      throw new TypeError(`Exchange rates must include ${currency}.`);
    }

    if (typeof rates[currency] !== 'number' || !Number.isFinite(rates[currency])) {
      throw new TypeError(`Exchange rate for ${currency} must be a finite number.`);
    }

    if (rates[currency] <= 0) {
      throw new TypeError(`Exchange rate for ${currency} must be greater than zero.`);
    }
  });

  // A rate of 0 (or negative) would make conversion undefined/meaningless, so
  // it is rejected above. USD is additionally pinned to exactly 1 because the
  // whole rate table is defined relative to USD as the base currency.
  if (rates.USD !== 1) {
    throw new TypeError('Exchange rate for USD must be exactly 1.');
  }

  return supportedCurrencies.reduce((validatedRates, currency) => {
    return {
      ...validatedRates,
      [currency]: rates[currency]
    };
  }, {});
}

/**
 * Converts an amount from one supported currency to another using the
 * official rate model: amount / rates[source] converts to USD, then
 * * rates[target] converts from USD to the target currency. Never mutates
 * a stored cost's original sum/currency (see src/lib/db.js) — only ever
 * used to compute a converted value for display in a report/chart total.
 * @param {number} amount - Amount to convert, in sourceCurrency.
 * @param {string} sourceCurrency - Currency amount is currently in.
 * @param {string} targetCurrency - Currency to convert amount into.
 * @param {object} rates - Exchange rates object (see validateExchangeRates).
 * @returns {number} amount converted into targetCurrency.
 */
export function convertCurrency(amount, sourceCurrency, targetCurrency, rates) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    throw new TypeError('amount must be a finite number.');
  }

  if (!isSupportedCurrency(sourceCurrency)) {
    throw new TypeError('sourceCurrency must be one of USD, ILS, GBP, EUR.');
  }

  if (!isSupportedCurrency(targetCurrency)) {
    throw new TypeError('targetCurrency must be one of USD, ILS, GBP, EUR.');
  }

  const validatedRates = validateExchangeRates(rates);

  // M2A.2: computed exactly (one division, no floating-point intermediates);
  // the Number is produced only at this legacy return boundary. Financial
  // code should use convertMoney() in src/lib/money/money.js, which keeps
  // the exact decimal string.
  return amountToNumber(
    convertDecimalAmount(amount, validatedRates[sourceCurrency], validatedRates[targetCurrency])
  );
}
