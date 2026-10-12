import { describe, expect, it } from 'vitest';
import {
  costInputErrorCodes as codes,
  inputLimits,
  parseAmountInput,
  validateCostInput
} from '../../src/lib/costInput.js';
import { dataQualityCodes, getAmountDataQualityNotes } from '../../src/lib/dataQuality.js';
import { getCostInputMessage } from '../../src/utils/costInputMessages.js';

/*
 * M2A.3 new-input policy. Every rule is asserted through the stable error
 * code and its parameters, never through message wording.
 */
function codeOf(text, currency = 'USD') {
  const result = parseAmountInput(text, currency);

  return result.ok ? 'ok' : result.error.code;
}

describe('amount syntax', () => {
  it.each([
    ['12', 12],
    ['12.5', 12.5],
    ['12.50', 12.5],
    ['0.01', 0.01],
    ['0.5', 0.5],
    ['007.5', 7.5],
    ['  12.50  ', 12.5],
    ['999999999999.99', 999999999999.99]
  ])('accepts %j as %s', (text, expected) => {
    const result = parseAmountInput(text, 'USD');

    expect(result).toMatchObject({ ok: true, sum: expected });
  });

  it.each([
    ['1e5'], ['1E5'], ['1e-2'], ['0x10'], ['0b11'], ['0o7'], ['Infinity'], ['-Infinity'],
    ['NaN'], ['+5'], ['5.'], ['.5'], ['1,5'], ['1,000.00'], ['1 000'], ['1 2'], ['1_000'],
    ['٣'], ['１２'], ['1.2.3'], ['--5'], ['5-'], ['$5'], ['5 USD'], ['abc'], ['1\n2']
  ])('rejects %j as invalid syntax (never reaches Number())', (text) => {
    expect(codeOf(text)).toBe(codes.amountSyntax);
  });

  it('reports empty input as required', () => {
    expect(codeOf('')).toBe(codes.amountRequired);
    expect(codeOf('   ')).toBe(codes.amountRequired);
  });

  it('rejects non-string input without coercing it', () => {
    [12, null, undefined, {}, ['1']].forEach((value) => {
      expect(codeOf(value)).toBe(codes.amountSyntax);
    });
  });
});

describe('amount range and precision', () => {
  it.each([['0'], ['0.00'], ['000'], ['0.0'], ['-1'], ['-0'], ['-0.01'], ['-12.50']])(
    'rejects %j as not positive',
    (text) => {
      expect(codeOf(text)).toBe(codes.amountNotPositive);
    }
  );

  it('allows the smallest positive amount of each currency', () => {
    ['USD', 'ILS', 'GBP', 'EUR'].forEach((currency) => {
      expect(codeOf('0.01', currency)).toBe('ok');
    });
  });

  it.each(['USD', 'ILS', 'GBP', 'EUR'])('limits %s to two decimal places, as typed', (currency) => {
    expect(codeOf('1.99', currency)).toBe('ok');
    expect(parseAmountInput('1.999', currency)).toMatchObject({
      ok: false,
      error: { code: codes.amountTooManyDecimals, params: { max: 2 } }
    });
    // A trailing zero is still a third digit: nothing is silently truncated.
    expect(codeOf('1.990', currency)).toBe(codes.amountTooManyDecimals);
  });

  it('allows at most 12 integer digits, ignoring leading zeros', () => {
    expect(codeOf('999999999999')).toBe('ok');
    expect(codeOf('0000999999999999')).toBe('ok');
    expect(parseAmountInput('1000000000000', 'USD')).toMatchObject({
      error: { code: codes.amountTooManyIntegerDigits, params: { max: inputLimits.maxIntegerDigits } }
    });
  });

  it('allows at most 15 significant digits for currencies with more decimals', () => {
    // KWD has three minor-unit digits: 12 + 3 = 15 is the limit.
    expect(codeOf('999999999999.999', 'KWD')).toBe('ok');
    expect(codeOf('0.000000000000001', 'KWD')).toBe(codes.amountTooManyDecimals);
    expect(parseAmountInput('1234567890123.1', 'KWD')).toMatchObject({
      error: { code: codes.amountTooManyIntegerDigits }
    });
  });

  it('returns a Number that equals the typed decimal exactly', () => {
    const samples = ['0.01', '0.1', '0.07', '1.15', '100.1', '4.35', '999999999999.99', '123456789012.34'];

    samples.forEach((text) => {
      const result = parseAmountInput(text, 'USD');

      // Up to 15 significant digits a Number round-trips through its text.
      expect(String(result.sum)).toBe(result.amount);
      expect(result.amount).toBe(text.replace(/^0+(?=\d)/, ''));
    });
  });

  it('keeps the canonical decimal string beside the Number', () => {
    expect(parseAmountInput('0007.50', 'USD')).toEqual({ ok: true, amount: '7.5', sum: 7.5 });
  });
});

describe('the other fields', () => {
  const valid = { sum: '12.50', currency: 'EUR', category: 'food', description: 'Lunch' };

  it('accepts a complete valid expense and normalizes category and description', () => {
    const result = validateCostInput({ ...valid, category: '  food  ', description: '  Lunch  ' });

    expect(result.isValid).toBe(true);
    expect(result.value).toEqual({ sum: 12.5, currency: 'EUR', category: 'Food', description: 'Lunch' });
  });

  it('never accepts EURO or unknown currencies for new input', () => {
    ['EURO', 'XYZ', '', 'usd', 'JPY', undefined].forEach((currency) => {
      const result = validateCostInput({ ...valid, currency });

      expect(result.errors.currency).toEqual({ code: codes.currencyUnsupported, params: {} });
    });
  });

  it('requires and bounds category and description', () => {
    expect(validateCostInput({ ...valid, category: '   ' }).errors.category.code).toBe(codes.categoryRequired);
    expect(validateCostInput({ ...valid, description: '' }).errors.description.code).toBe(codes.descriptionRequired);
    expect(validateCostInput({ ...valid, category: 'x'.repeat(51) }).errors.category).toEqual({
      code: codes.categoryTooLong,
      params: { max: 50 }
    });
    expect(validateCostInput({ ...valid, category: 'x'.repeat(50) }).isValid).toBe(true);
    expect(validateCostInput({ ...valid, description: 'y'.repeat(201) }).errors.description).toEqual({
      code: codes.descriptionTooLong,
      params: { max: 200 }
    });
  });

  it('counts characters, not UTF-16 units, and rejects control characters', () => {
    expect(validateCostInput({ ...valid, description: '😀'.repeat(200) }).isValid).toBe(true);
    expect(validateCostInput({ ...valid, description: 'שלום'.repeat(50) }).isValid).toBe(true);
    expect(validateCostInput({ ...valid, description: 'a\u0000b' }).errors.description.code).toBe(
      codes.descriptionInvalidCharacters
    );
    expect(validateCostInput({ ...valid, category: 'a\tb' }).errors.category.code).toBe(
      codes.categoryInvalidCharacters
    );
  });

  it('exposes only codes and parameters; wording comes from a separate table', () => {
    const { errors } = validateCostInput({ ...valid, sum: '1.999' });

    expect(Object.keys(errors.sum).sort()).toEqual(['code', 'params']);
    expect(getCostInputMessage(errors.sum)).toBe('Use at most 2 decimal places.');
    expect(getCostInputMessage({ code: 'unknown.code', params: {} })).toBe('Check this field.');
  });
});

describe('dates and times (local calendar fields, no timezone handling)', () => {
  const base = { sum: '1', currency: 'USD', category: 'Food', description: 'x' };

  function dateCode(date, time = '09:30') {
    const result = validateCostInput({ ...base, date, time });

    return result.errors.date?.code ?? result.errors.time?.code ?? 'ok';
  }

  it('accepts real Gregorian dates, including leap days', () => {
    expect(dateCode('2028-02-29')).toBe('ok');
    expect(dateCode('2026-12-31')).toBe('ok');
    expect(validateCostInput({ ...base, date: '2028-02-29', time: '23:59' }).value).toMatchObject({
      date: { day: 29, month: 2, year: 2028 },
      time: { hour: 23, minute: 59 }
    });
  });

  it.each([
    ['2026-02-29', codes.dateInvalid],
    ['2100-02-29', codes.dateInvalid],
    ['2026-04-31', codes.dateInvalid],
    ['2026-13-01', codes.dateInvalid],
    ['2026-00-10', codes.dateInvalid],
    ['2026-01-00', codes.dateInvalid],
    ['2026-1-1', codes.dateFormat],
    ['26-01-01', codes.dateFormat],
    ['', codes.dateRequired],
    ['1899-12-31', codes.dateYearOutOfRange],
    ['3000-01-01', codes.dateYearOutOfRange]
  ])('rejects %j as %s', (date, expected) => {
    expect(dateCode(date)).toBe(expected);
  });

  it.each([
    ['24:00', codes.timeFormat],
    ['12:60', codes.timeFormat],
    ['9:30', codes.timeFormat],
    ['12:5', codes.timeFormat],
    ['', codes.timeRequired]
  ])('rejects time %j as %s', (time, expected) => {
    expect(dateCode('2026-06-01', time)).toBe(expected);
  });
});

describe('editing preserves legacy values the user did not change', () => {
  const legacy = {
    sum: 0.1 + 0.2, // 0.30000000000000004: more decimals than any currency allows
    category: 'old   category!!',
    description: 'x'.repeat(500),
    date: '1850-03-01',
    time: '09:05'
  };
  const unchanged = (overrides = {}) => ({
    sum: String(legacy.sum),
    currency: 'USD',
    category: legacy.category,
    description: legacy.description,
    date: legacy.date,
    time: legacy.time,
    ...overrides
  });

  it('accepts an untouched legacy record and keeps every stored value exactly', () => {
    const result = validateCostInput(unchanged(), legacy);

    expect(result.isValid).toBe(true);
    expect(result.value.sum).toBe(0.30000000000000004);
    expect(result.value.category).toBe(legacy.category);
    expect(result.value.description).toBe(legacy.description);
    expect(result.value.dateUnchanged).toBe(true);
    expect(result.value.timeUnchanged).toBe(true);
  });

  it.each([
    [0, '0'],
    [-5.5, '-5.5'],
    [1e-21, '1e-21'],
    [123456789012345680000, '123456789012345680000'],
    [12.345, '12.345']
  ])('keeps a stored amount of %s when the amount text is not edited', (sum, text) => {
    const result = validateCostInput(unchanged({ sum: text }), { ...legacy, sum });

    expect(result.isValid).toBe(true);
    expect(result.value.sum).toBe(sum);
  });

  it('applies the strict rules as soon as the user changes the amount', () => {
    expect(validateCostInput(unchanged({ sum: '0' }), { ...legacy, sum: 5 }).errors.sum.code).toBe(
      codes.amountNotPositive
    );
    expect(validateCostInput(unchanged({ sum: '12.345' }), { ...legacy, sum: 5 }).errors.sum.code).toBe(
      codes.amountTooManyDecimals
    );
    // Typing the old text back is "unchanged", but a different text is new.
    expect(validateCostInput(unchanged({ sum: '0.30' }), legacy).isValid).toBe(true);
    expect(validateCostInput(unchanged({ sum: '0.300' }), legacy).errors.sum.code).toBe(
      codes.amountTooManyDecimals
    );
  });

  it('does not revalidate fields that were not edited, but does validate edited ones', () => {
    const edited = validateCostInput(unchanged({ description: 'y'.repeat(500) }), legacy);

    expect(edited.errors.description.code).toBe(codes.descriptionTooLong);
    expect(edited.errors.sum).toBeUndefined();
    expect(edited.errors.category).toBeUndefined();
    expect(validateCostInput(unchanged({ date: '2026-02-30' }), legacy).errors.date.code).toBe(
      codes.dateInvalid
    );
  });

  it('keeps a legacy amount even when only the currency changes', () => {
    const result = validateCostInput(unchanged({ currency: 'EUR' }), legacy);

    expect(result.isValid).toBe(true);
    expect(result.value.sum).toBe(legacy.sum);
  });
});

describe('data-quality notes (non-blocking)', () => {
  it('reports stored amounts that would fail today\'s rules, and nothing else', () => {
    expect(getAmountDataQualityNotes({ sum: 12.5, currency: 'USD' })).toEqual([]);
    expect(getAmountDataQualityNotes({ sum: 0, currency: 'USD' })).toEqual([dataQualityCodes.amountNotPositive]);
    expect(getAmountDataQualityNotes({ sum: -5.5, currency: 'GBP' })).toEqual([dataQualityCodes.amountNotPositive]);
    expect(getAmountDataQualityNotes({ sum: 1234.56789, currency: 'ILS' })).toEqual([
      dataQualityCodes.amountMoreDecimalsThanCurrency
    ]);
    expect(getAmountDataQualityNotes({ sum: 1e-21, currency: 'USD' })).toEqual([
      dataQualityCodes.amountMoreDecimalsThanCurrency
    ]);
  });
});
