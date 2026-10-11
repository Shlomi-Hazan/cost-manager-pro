import { describe, expect, it } from 'vitest';
import {
  amountToNumber,
  compareAmounts,
  convertDecimalAmount,
  normalizeAmount,
  percentageOf,
  roundAmount,
  sumAmounts
} from '../../src/lib/money/decimal.js';

/*
 * M2A.2: the decimal engine's arithmetic, rounding, and input handling.
 * Expected values are written out by hand, not computed with the engine.
 */
describe('exact decimal arithmetic', () => {
  it('adds without binary floating-point noise', () => {
    expect(sumAmounts([0.1, 0.2])).toBe('0.3');
    expect(sumAmounts(['0.1', '0.2'])).toBe('0.3');
    expect(sumAmounts([0.1, 0.7, 0.2])).toBe('1');
    expect(sumAmounts(Array(10).fill(0.1))).toBe('1');
  });

  it('sums nothing as zero and keeps negatives and zero correct', () => {
    expect(sumAmounts([])).toBe('0');
    expect(sumAmounts([5, -5])).toBe('0');
    expect(sumAmounts([-0.1, -0.2])).toBe('-0.3');
    expect(sumAmounts([0])).toBe('0');
  });

  it('handles tiny, large, and long decimals exactly', () => {
    expect(sumAmounts(['0.0000001', '0.0000002'])).toBe('0.0000003');
    expect(sumAmounts(['999999999999999999999.99', '0.01'])).toBe('1000000000000000000000');
    expect(sumAmounts(['0.123456789012345678901234567890', '1'])).toBe('1.12345678901234567890123456789');
  });

  it('accepts exponent strings and prints normal notation', () => {
    expect(normalizeAmount('1e-7')).toBe('0.0000001');
    expect(normalizeAmount('1.5E3')).toBe('1500');
    expect(normalizeAmount(1e21)).toBe('1000000000000000000000');
    expect(normalizeAmount(1e-7)).toBe('0.0000001');
  });

  it('rejects anything that is not a finite decimal', () => {
    ['abc', '', '1,5', ' 1', 'NaN', null, undefined, {}].forEach((value) => {
      expect(() => normalizeAmount(value)).toThrow(TypeError);
    });
    [NaN, Infinity, -Infinity].forEach((value) => {
      expect(() => normalizeAmount(value)).toThrow(TypeError);
    });
  });
});

describe('rounding: half away from zero, once', () => {
  it.each([
    ['0.125', 2, '0.13'],
    ['-0.125', 2, '-0.13'],
    ['1.005', 2, '1.01'],
    ['2.675', 2, '2.68'],
    ['1.004999999', 2, '1.00'],
    ['0.5', 0, '1'],
    ['-0.5', 0, '-1'],
    ['-2.5', 0, '-3'],
    ['2.5', 0, '3'],
    ['1234.5', 0, '1235'],
    ['1.0005', 3, '1.001'],
    ['0.999', 2, '1.00'],
    ['0', 2, '0.00']
  ])('rounds %s to %i places as %s', (amount, decimals, expected) => {
    expect(roundAmount(amount, decimals)).toBe(expected);
  });

  it('never returns negative zero', () => {
    expect(roundAmount('-0.004', 2)).toBe('0.00');
    expect(roundAmount('-0', 2)).toBe('0.00');
    expect(roundAmount('-0.4', 0)).toBe('0');
  });

  it('is symmetric for positive and negative values', () => {
    ['0.125', '2.675', '1.005', '0.335', '99.995', '0.0049', '7.777'].forEach((value) => {
      const positive = roundAmount(value, 2);

      expect(roundAmount(`-${value}`, 2)).toBe(positive === '0.00' ? '0.00' : `-${positive}`);
    });
  });
});

describe('conversion', () => {
  it('returns the amount unchanged for identical rates', () => {
    expect(convertDecimalAmount('12.345', 3.4, 3.4)).toBe('12.345');
    expect(convertDecimalAmount(0.1, 1, 1)).toBe('0.1');
  });

  it('converts through the single multiply-then-divide form', () => {
    // 100 ILS -> GBP = 100 * 0.6 / 3.4, to 30 decimal places.
    expect(convertDecimalAmount(100, 3.4, 0.6)).toBe('17.647058823529411764705882352941');
    expect(convertDecimalAmount(3.4, 3.4, 1)).toBe('1');
    expect(convertDecimalAmount(1, 1, 3.4)).toBe('3.4');
  });

  it('round-trips within the documented 30-decimal division precision', () => {
    const there = convertDecimalAmount('100', 1, 3.4);
    const back = convertDecimalAmount(there, 3.4, 1);

    expect(back).toBe('100');
  });

  it('rejects non-positive rates', () => {
    expect(() => convertDecimalAmount(1, 0, 1)).toThrow(RangeError);
    expect(() => convertDecimalAmount(1, 1, -2)).toThrow(RangeError);
  });
});

describe('comparison and percentages', () => {
  it('compares exactly', () => {
    expect(compareAmounts('0.999', '1')).toBe(-1);
    expect(compareAmounts(1, '1.0')).toBe(0);
    expect(compareAmounts('1.0000000000000000001', 1)).toBe(1);
  });

  it('rounds percentages to one decimal, half away, and does not force 100', () => {
    expect(percentageOf('1', '3', 1)).toBe('33.3');
    expect(percentageOf('2', '3', 1)).toBe('66.7');
    expect(percentageOf('1', '8', 1)).toBe('12.5');
    expect(percentageOf('1', '16', 1)).toBe('6.3');
    // Three equal shares each show 33.3, which sums to 99.9 (not forced).
    expect(percentageOf('1', '3', 1)).toBe('33.3');
    expect(percentageOf('0', '0', 1)).toBe('0.0');
    expect(percentageOf('5', '-1', 1)).toBe('0.0');
  });

  it('turns an exact string into a Number only at the boundary helper', () => {
    expect(amountToNumber('0.3')).toBe(0.3);
  });
});

describe('big.js configuration isolation', () => {
  it('leaves the library-wide default constructor untouched', async () => {
    const { default: Big } = await import('big.js');

    expect(Big.DP).toBe(20);
    expect(Big.RM).toBe(1);
    expect(Big.strict).toBe(false);
  });

  it('rejects raw floating-point arguments inside the engine (strict mode)', () => {
    // Numbers are accepted only through the engine's own String() conversion.
    expect(sumAmounts([0.1])).toBe('0.1');
    expect(() => sumAmounts([Number.NaN])).toThrow(TypeError);
  });
});
