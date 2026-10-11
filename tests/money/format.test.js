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
    ['EUR', 2],
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

  it('formats with symbol and grouping, and EUR is formatted as ISO EUR only', () => {
    expect(formatMoney('1234567.005', 'EUR')).toBe('€1,234,567.01');
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

/*
 * M2A.2 review correction: an ORIGINAL stored amount is never rounded for
 * display, and a nonzero value never shows as zero, however many decimals it
 * has. Expected strings are written out by hand.
 */
describe('stored amounts keep every digit', () => {
  it.each([
    [1e-21, '0.000000000000000000001'],
    ['0.000000000000000000001', '0.000000000000000000001'],
    [-1e-21, '-0.000000000000000000001'],
    // The shortest form of a 17-digit literal like 1.2345678901234567e-25.
    [1.2345678901234566e-25, `0.${'0'.repeat(24)}12345678901234566`],
    [1e-7, '0.0000001'],
    [0.30000000000000004, '0.30000000000000004'],
    ['1.230000', '1.23'],
    [1.5, '1.50'],
    [1234567.125, '1,234,567.125'],
    ['0.000000000000000000000000000001', '0.000000000000000000000000000001']
  ])('shows %s as %s', (amount, expected) => {
    expect(formatStoredAmount(amount, 'USD')).toBe(expected);
  });

  it('never shows scientific notation, even for very large or tiny values', () => {
    expect(formatStoredAmount(1e21, 'USD')).toBe('1,000,000,000,000,000,000,000.00');
    expect(formatStoredAmount(Number.MAX_SAFE_INTEGER, 'USD')).toBe('9,007,199,254,740,991.00');
    expect(formatStoredAmount(1.5e300, 'USD')).not.toMatch(/e/i);
    expect(formatStoredAmount(1.5e300, 'USD').replace(/[,.0]/g, '')).toBe('15');
  });

  it('keeps exact digits beyond Intl\'s fraction-digit limit (documented fallback)', () => {
    // 5e-324 is the smallest positive double: 324 fraction digits.
    const tiny = formatStoredAmount(5e-324, 'USD');

    expect(tiny).toMatch(/^0\.0{323}5$/);
    expect(formatStoredAmount(-5e-324, 'USD')).toMatch(/^-0\.0{323}5$/);
    // 1e-101 needs 101 digits, one past the Intl limit; grouping still applies.
    expect(formatStoredAmount('1234567.' + '0'.repeat(100) + '1', 'USD')).toBe(
      '1,234,567.' + '0'.repeat(100) + '1'
    );
  });

  it('has no negative-zero artifacts', () => {
    expect(formatStoredAmount(-0, 'USD')).toBe('0.00');
    expect(formatStoredAmount('-0.0', 'USD')).toBe('0.00');
    expect(formatStoredAmount('-0.000', 'GBP')).toBe('0.00');
  });

  it('distinguishes a tiny nonzero value from zero', () => {
    expect(formatStoredAmount(1e-21, 'USD')).not.toBe(formatStoredAmount(0, 'USD'));
  });

  it('works for English and Hebrew locales', () => {
    expect(formatStoredAmount(1e-21, 'ILS', 'he-IL')).toBe('0.000000000000000000001');
    expect(formatStoredAmount(1234.5678, 'ILS', 'he-IL')).toBe('1,234.5678');
    expect(formatStoredAmount(-1234.5, 'ILS', 'he-IL').replace(/[\u200e\u200f]/g, '')).toBe('-1,234.50');
    expect(formatStoredAmount(1234.5678, 'GBP', 'de-DE')).toBe('1.234,5678');
    expect(formatStoredAmount(5e-324, 'ILS', 'he-IL')).toMatch(/^0\.0{323}5$/);
  });
});

