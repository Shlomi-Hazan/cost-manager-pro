/*
 * M2A.3: validation of what a user TYPES for a NEW or EDITED expense.
 *
 * Three different concerns are kept apart on purpose:
 *  1. New-input validation (this file): strict rules for values the user is
 *     entering now.
 *  2. Stored-data integrity (costValidation.js, costDocument.js): accepts
 *     everything an earlier version could have stored, so old data is never
 *     rejected on read.
 *  3. Data-quality notices (dataQuality.js): optional, non-blocking remarks
 *     about old values that would fail today's rules.
 * Running the strict rules over stored records would reject history, which
 * is why nothing here is called when data is read.
 *
 * Results use stable error codes and plain parameters; the application never
 * matches message text. Wording lives in utils/costInputMessages.js so it can
 * be localized later.
 *
 * Amount rules (new input only):
 *  - plain decimal digits with an optional single "." and at least one digit
 *    after it; "," is not a decimal or grouping separator, and no sign,
 *    exponent, hex/binary, space, or other character is accepted. Leading and
 *    trailing whitespace is trimmed; whitespace inside is rejected;
 *  - greater than zero (zero and negative are for legacy data only);
 *  - at most the currency's minor-unit decimals, 12 integer digits, and 15
 *    significant digits, counted as typed (no silent truncation or rounding).
 * The text is checked as exact decimal syntax BEFORE any Number conversion.
 * Up to 15 significant digits a Number round-trips exactly, so the stored
 * JSON number equals the typed decimal.
 */
import { supportedCurrencies } from '../constants/currencies.js';
import { normalizeCategoryInput } from '../utils/category.js';
import { compareAmounts, normalizeAmount } from './money/decimal.js';
import { getMinorUnitDigits } from './money/format.js';
import { isRealCalendarDate } from './costValidation.js';

export const inputLimits = {
  maxIntegerDigits: 12,
  maxSignificantDigits: 15,
  maxCategoryLength: 50,
  maxDescriptionLength: 200,
  // Proposed bounds for a typed date's year (not enforced on stored data).
  minYear: 1900,
  maxYear: 2999
};

export const costInputErrorCodes = {
  amountRequired: 'amount.required',
  amountSyntax: 'amount.syntax',
  amountNotPositive: 'amount.not-positive',
  amountTooManyDecimals: 'amount.too-many-decimals',
  amountTooManyIntegerDigits: 'amount.too-many-integer-digits',
  amountTooManySignificantDigits: 'amount.too-many-significant-digits',
  currencyUnsupported: 'currency.unsupported',
  categoryRequired: 'category.required',
  categoryTooLong: 'category.too-long',
  categoryInvalidCharacters: 'category.invalid-characters',
  descriptionRequired: 'description.required',
  descriptionTooLong: 'description.too-long',
  descriptionInvalidCharacters: 'description.invalid-characters',
  dateRequired: 'date.required',
  dateFormat: 'date.format',
  dateInvalid: 'date.invalid',
  dateYearOutOfRange: 'date.year-out-of-range',
  timeRequired: 'time.required',
  timeFormat: 'time.format'
};

const decimalPattern = /^\d+(\.\d+)?$/;

// ASCII control characters (tab, newline, NUL, DEL, ...). Written as a code
// check instead of a regular expression to keep the intent plain.
function hasControlCharacters(text) {
  return Array.from(text).some((character) => {
    const code = character.codePointAt(0);

    return code < 32 || code === 127;
  });
}

function fail(code, params = {}) {
  return { ok: false, error: { code, params } };
}

function stripLeadingZeros(digits) {
  return digits.replace(/^0+/, '');
}

/**
 * Validates an amount typed for a new or changed expense.
 * @param {string} text - Exactly what the user typed.
 * @param {string} currency - The expense currency (sets the decimals limit).
 * @returns {{ok: true, amount: string, sum: number}|{ok: false, error:
 *   {code: string, params: object}}} `amount` is the canonical decimal
 *   string; `sum` is the Number to store (identical for <= 15 digits).
 */
export function parseAmountInput(text, currency) {
  if (typeof text !== 'string') {
    return fail(costInputErrorCodes.amountSyntax);
  }

  const trimmed = text.trim();

  if (trimmed === '') {
    return fail(costInputErrorCodes.amountRequired);
  }

  const isNegative = trimmed.startsWith('-');
  const body = isNegative ? trimmed.slice(1) : trimmed;

  if (!decimalPattern.test(body)) {
    return fail(costInputErrorCodes.amountSyntax);
  }

  if (isNegative) {
    return fail(costInputErrorCodes.amountNotPositive);
  }

  const [integerPart, fractionPart = ''] = body.split('.');
  const maxDecimals = getMinorUnitDigits(currency);

  // Exact decimal comparison (no Number), so 0, 0.00 and 000 are all zero.
  if (compareAmounts(body, '0') <= 0) {
    return fail(costInputErrorCodes.amountNotPositive);
  }

  if (fractionPart.length > maxDecimals) {
    return fail(costInputErrorCodes.amountTooManyDecimals, { max: maxDecimals });
  }

  if (stripLeadingZeros(integerPart).length > inputLimits.maxIntegerDigits) {
    return fail(costInputErrorCodes.amountTooManyIntegerDigits, {
      max: inputLimits.maxIntegerDigits
    });
  }

  if (stripLeadingZeros(integerPart + fractionPart).length > inputLimits.maxSignificantDigits) {
    return fail(costInputErrorCodes.amountTooManySignificantDigits, {
      max: inputLimits.maxSignificantDigits
    });
  }

  const amount = normalizeAmount(body);

  return { ok: true, amount, sum: Number(amount) };
}

function validateText(raw, { required, tooLong, invalidCharacters, maxLength }) {
  const cleaned = raw.trim();

  if (cleaned === '') {
    return fail(required);
  }

  if (hasControlCharacters(raw)) {
    return fail(invalidCharacters);
  }

  // Counted in characters (code points), not UTF-16 units, so an emoji or a
  // Hebrew letter counts once.
  if (Array.from(cleaned).length > maxLength) {
    return fail(tooLong, { max: maxLength });
  }

  return { ok: true };
}

function validateDate(dateText) {
  if (dateText.trim() === '') {
    return fail(costInputErrorCodes.dateRequired);
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText.trim());

  if (!match) {
    return fail(costInputErrorCodes.dateFormat);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (year < inputLimits.minYear || year > inputLimits.maxYear) {
    return fail(costInputErrorCodes.dateYearOutOfRange, {
      min: inputLimits.minYear,
      max: inputLimits.maxYear
    });
  }

  // Local calendar date fields only; no timezone conversion happens here.
  if (month < 1 || month > 12 || !isRealCalendarDate(day, month, year)) {
    return fail(costInputErrorCodes.dateInvalid);
  }

  return { ok: true, value: { day, month, year } };
}

function validateTime(timeText) {
  if (timeText.trim() === '') {
    return fail(costInputErrorCodes.timeRequired);
  }

  const match = /^(\d{2}):(\d{2})$/.exec(timeText.trim());

  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
    return fail(costInputErrorCodes.timeFormat);
  }

  return { ok: true, value: { hour: Number(match[1]), minute: Number(match[2]) } };
}

/**
 * Validates the fields of one expense form.
 *
 * `original` is the stored record when editing, and it implements the rule
 * for legacy data: a field whose text is unchanged from what the form was
 * opened with is NOT revalidated and its stored value is kept as is, so
 * editing a note on an old record can never fail (or silently rewrite) its
 * amount, category, description, or date. Only text the user actually
 * changed must meet today's rules.
 * @param {object} values - { sum, currency, category, description } as typed,
 *   plus { date, time } (YYYY-MM-DD and HH:mm) when the form has them.
 * @param {object} [original] - Edit mode: { sum (the stored Number), category,
 *   description, date (YYYY-MM-DD), time (HH:mm) } as stored.
 * @returns {{isValid: boolean, errors: object, value?: object}} `errors` maps
 *   a field to { code, params }; `value` holds the validated fields.
 */
export function validateCostInput(values, original = null) {
  const errors = {};
  const value = {};

  if (!supportedCurrencies.includes(values.currency)) {
    errors.currency = { code: costInputErrorCodes.currencyUnsupported, params: {} };
  } else {
    value.currency = values.currency;
  }

  if (original && values.sum.trim() === String(original.sum)) {
    // Unchanged stored amount: keep the exact stored Number.
    value.sum = original.sum;
  } else {
    const amount = parseAmountInput(values.sum, values.currency);

    if (amount.ok) {
      value.sum = amount.sum;
    } else {
      errors.sum = amount.error;
    }
  }

  const categoryUnchanged = original && values.category === original.category;
  const category = categoryUnchanged
    ? { ok: true }
    : validateText(values.category, {
        required: costInputErrorCodes.categoryRequired,
        tooLong: costInputErrorCodes.categoryTooLong,
        invalidCharacters: costInputErrorCodes.categoryInvalidCharacters,
        maxLength: inputLimits.maxCategoryLength
      });

  if (category.ok) {
    value.category = categoryUnchanged ? values.category : normalizeCategoryInput(values.category);
  } else {
    errors.category = category.error;
  }

  const descriptionUnchanged = original && values.description === original.description;
  const description = descriptionUnchanged
    ? { ok: true }
    : validateText(values.description, {
        required: costInputErrorCodes.descriptionRequired,
        tooLong: costInputErrorCodes.descriptionTooLong,
        invalidCharacters: costInputErrorCodes.descriptionInvalidCharacters,
        maxLength: inputLimits.maxDescriptionLength
      });

  if (description.ok) {
    value.description = descriptionUnchanged ? values.description : values.description.trim();
  } else {
    errors.description = description.error;
  }

  if (typeof values.date === 'string') {
    if (original && values.date === original.date) {
      value.dateUnchanged = true;
    } else {
      const date = validateDate(values.date);

      if (date.ok) {
        value.date = date.value;
      } else {
        errors.date = date.error;
      }
    }
  }

  if (typeof values.time === 'string') {
    if (original && values.time === original.time) {
      value.timeUnchanged = true;
    } else {
      const time = validateTime(values.time);

      if (time.ok) {
        value.time = time.value;
      } else {
        errors.time = time.error;
      }
    }
  }

  return { isValid: Object.keys(errors).length === 0, errors, value };
}
