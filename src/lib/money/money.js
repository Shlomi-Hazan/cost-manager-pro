/*
 * M2A.2: currency-aware financial operations built on the decimal engine.
 * Everything returns canonical decimal STRINGS. This is the single canonical
 * calculation behind getReport totals, category totals, yearly totals, and
 * exports (Policy B: exact until the one presentation rounding).
 */
import { supportedCurrencies } from '../../constants/currencies.js';
import { validateExchangeRates } from '../../utils/currency.js';
import { convertDecimalAmount, normalizeAmount, sumAmounts } from './decimal.js';

function assertSupported(currency, label) {
  if (!supportedCurrencies.includes(currency)) {
    throw new TypeError(`${label} must be one of USD, ILS, GBP, EUR.`);
  }
}

/**
 * @param {number|string} amount - A stored sum (never modified).
 * @param {string} sourceCurrency
 * @param {string} targetCurrency
 * @param {object} rates - Validated "units per 1 USD" rates.
 * @returns {string} The exact converted amount, unrounded.
 */
export function convertMoney(amount, sourceCurrency, targetCurrency, rates) {
  assertSupported(sourceCurrency, 'sourceCurrency');
  assertSupported(targetCurrency, 'targetCurrency');
  const validatedRates = validateExchangeRates(rates);

  return convertDecimalAmount(
    amount,
    validatedRates[sourceCurrency],
    validatedRates[targetCurrency]
  );
}

/**
 * Converts one record's sum to the target currency with no rounding.
 * Same-currency amounts never need (or touch) rates.
 * @param {{sum: number, currency: string}} record
 * @param {string} targetCurrency
 * @param {object|null} rates
 * @param {string} missingRatesMessage - Thrown if a rate is needed but absent.
 * @returns {string}
 */
export function convertRecordSum(record, targetCurrency, rates, missingRatesMessage) {
  if (record.currency === targetCurrency) {
    return normalizeAmount(record.sum);
  }
  if (!rates) {
    throw new Error(missingRatesMessage);
  }
  return convertMoney(record.sum, record.currency, targetCurrency, rates);
}

/**
 * Exact sum of records in the target currency. Nothing is rounded per record,
 * so the result does not depend on order or grouping.
 * @param {{sum: number, currency: string}[]} records
 * @param {string} targetCurrency
 * @param {object|null} rates
 * @param {string} missingRatesMessage
 * @returns {string}
 */
export function sumRecordsInCurrency(records, targetCurrency, rates, missingRatesMessage) {
  assertSupported(targetCurrency, 'targetCurrency');

  return sumAmounts(
    records.map((record) => convertRecordSum(record, targetCurrency, rates, missingRatesMessage))
  );
}
