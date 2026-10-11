import { describe, expect, it } from 'vitest';
import {
  formatAmount,
  formatMoney,
  formatPercentage,
  formatRatioAsPercentage,
  formatStoredAmount,
  getMinorUnitDigits,
  roundForCurrency
} from '../../src/lib/money/format.js';

/*
 * M2A.2: presentation formatting. Intl.NumberFormat does the formatting;
 * decimal strings are rounded once (half away from zero) before it sees them.
 */
describe('money formatting', () => {
  it.each([
    ['USD', 2],
    ['ILS', 2],
    ['GBP', 2],
    ['EURO', 2],
    ['JPY', 0],
    ['KWD', 3]
  ])('%s uses %i minor-unit digits', (currency, digits) => {
    expect(getMinorUnitDigits(currency)).toBe(digits);
  });

  it('rounds a total once, half away from zero, at the currency minor unit', () => {
    expect(roundForCurrency('0.999', 'USD')).toBe('1.00');
    expect(roundForCurrency('2.675', 'ILS')).toBe('2.68');
    expect(roundForCurrency('1.005', 'GBP')).toBe('1.01');
    expect(roundForCurrency('1234.5', 'JPY')).toBe('1235');
    expect(roundForCurrency('1.0005', 'KWD')).toBe('1.001');
  });

  it('formats with symbol and grouping, and EURO is formatted as ISO EUR only', () => {
    expect(formatMoney('1234567.005', 'EURO')).toBe('€1,234,567.01');
    expect(formatMoney('1234.5', 'USD')).toBe('$1,234.50');
    expect(formatMoney('0.999', 'GBP')).toBe('£1.00');
    expect(formatMoney('1234.5', 'JPY')).toBe('¥1,235');
  });

  it('never uses scientific notation, even for huge or tiny values', () => {
    expect(formatAmount('1e21', 'USD')).toBe('1,000,000,000,000,000,000,000.00');
    expect(formatAmount('1e-7', 'USD')).toBe('0.00');
  });

  it('shows a tiny negative total as zero, without a minus sign', () => {
    expect(formatMoney('-0.004', 'USD')).toBe('$0.00');
    expect(formatAmount('-0.004', 'USD')).toBe('0.00');
    expect(formatAmount('-0.005', 'USD')).toBe('-0.01');
  });

  it('formats without a symbol where the currency is shown next to the number', () => {
    expect(formatAmount('127.352941', 'USD')).toBe('127.35');
    expect(formatAmount(0, 'USD')).toBe('0.00');
    expect(formatAmount('135.875', 'USD')).toBe('135.88');
  });

  it('is locale-aware without a localization framework', () => {
    expect(formatAmount('1234.5', 'USD', 'de-DE')).toBe('1.234,50');
    expect(formatAmount('1234.5', 'ILS', 'he-IL')).toBe('1,234.50');
  });

  it('keeps an original stored amount exact: padded to the minor unit, never rounded', () => {
    expect(formatStoredAmount(25.5, 'USD')).toBe('25.50');
    expect(formatStoredAmount(100, 'USD')).toBe('100.00');
    expect(formatStoredAmount(0.333, 'USD')).toBe('0.333');
    expect(formatStoredAmount(1234.5678, 'GBP')).toBe('1,234.5678');
    expect(formatStoredAmount(7.352941176470589, 'USD')).toBe('7.352941176470589');
    expect(formatStoredAmount(1e21, 'USD')).toBe('1,000,000,000,000,000,000,000.00');
  });

  it('formats percentages at one decimal, half away from zero', () => {
    expect(formatPercentage('33.35')).toBe('33.4%');
    expect(formatPercentage('100')).toBe('100.0%');
    expect(formatRatioAsPercentage(0.333)).toBe('33.3%');
    expect(formatRatioAsPercentage(1)).toBe('100.0%');
  });
});
