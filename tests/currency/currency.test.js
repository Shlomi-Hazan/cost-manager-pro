import { describe, expect, it } from 'vitest';
import { convertCurrency, validateExchangeRates } from '../../src/utils/currency.js';

/*
 * Protects the official rate model and the conversion formula
 * (amount / rates[source] * rates[target]) against regressions such as an
 * inverted formula or accidental EUR/EUR confusion, independent of any
 * report/chart UI that happens to call this function.
 */
const rates = {
  USD: 1,
  GBP: 0.5,
  EUR: 0.8,
  ILS: 4
};

describe('currency utilities', () => {
  it('keeps same-currency conversion unchanged', () => {
    expect(convertCurrency(125, 'USD', 'USD', rates)).toBe(125);
  });

  it('converts USD to ILS using the USD-based rate model', () => {
    expect(convertCurrency(100, 'USD', 'ILS', rates)).toBe(400);
  });

  it('converts ILS to USD using the USD-based rate model', () => {
    expect(convertCurrency(400, 'ILS', 'USD', rates)).toBe(100);
  });

  it('converts GBP to EUR using the shared conversion formula', () => {
    expect(convertCurrency(50, 'GBP', 'EUR', rates)).toBe(80);
  });

  it('allows zero amounts', () => {
    expect(convertCurrency(0, 'GBP', 'EUR', rates)).toBe(0);
  });

  it('preserves decimal precision without rounding', () => {
    expect(convertCurrency(12.5, 'ILS', 'GBP', rates)).toBeCloseTo(1.5625);
  });

  it('rejects invalid source currencies', () => {
    expect(() => convertCurrency(10, 'CAD', 'USD', rates)).toThrow(
      'sourceCurrency must be one of USD, ILS, GBP, EUR.'
    );
  });

  it('rejects invalid target currencies', () => {
    expect(() => convertCurrency(10, 'USD', 'CAD', rates)).toThrow(
      'targetCurrency must be one of USD, ILS, GBP, EUR.'
    );
  });

  it('rejects invalid rate shapes', () => {
    expect(() => validateExchangeRates(null)).toThrow(
      'Exchange rates must be an object.'
    );
  });

  it('rejects missing required currencies', () => {
    expect(() => validateExchangeRates({ USD: 1, GBP: 0.5, EUR: 0.8 })).toThrow(
      'Exchange rates must include ILS.'
    );
  });

  it('rejects USD rates that are not exactly 1', () => {
    expect(() => validateExchangeRates({ ...rates, USD: 1.1 })).toThrow(
      'Exchange rate for USD must be exactly 1.'
    );
  });

  it('rejects non-finite rates', () => {
    expect(() => validateExchangeRates({ ...rates, GBP: Infinity })).toThrow(
      'Exchange rate for GBP must be a finite number.'
    );
  });
});
