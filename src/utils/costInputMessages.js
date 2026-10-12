/*
 * English wording for the error codes produced by lib/costInput.js. The
 * application logic only ever looks at the code; this table is the one place
 * that turns a code and its parameters into text, so Hebrew (M3) can replace
 * it without touching validation.
 */
import { costInputErrorCodes as codes } from '../lib/costInput.js';

const messages = {
  [codes.amountRequired]: () => 'Enter a cost sum.',
  [codes.amountSyntax]: () =>
    'Enter the sum using digits and an optional decimal point, for example 12.50.',
  [codes.amountNotPositive]: () => 'Enter an amount greater than zero.',
  [codes.amountTooManyDecimals]: ({ max }) =>
    max === 0 ? 'Enter a whole number.' : `Use at most ${max} decimal places.`,
  [codes.amountTooManyIntegerDigits]: ({ max }) =>
    `Use at most ${max} digits before the decimal point.`,
  [codes.amountTooManySignificantDigits]: ({ max }) => `Use at most ${max} significant digits.`,
  [codes.currencyUnsupported]: () => 'Select a supported currency.',
  [codes.categoryRequired]: () => 'Enter a category.',
  [codes.categoryTooLong]: ({ max }) => `Use at most ${max} characters.`,
  [codes.categoryInvalidCharacters]: () => 'Remove control characters from the category.',
  [codes.descriptionRequired]: () => 'Enter a description.',
  [codes.descriptionTooLong]: ({ max }) => `Use at most ${max} characters.`,
  [codes.descriptionInvalidCharacters]: () => 'Remove control characters from the description.',
  [codes.dateRequired]: () => 'Enter a date.',
  [codes.dateFormat]: () => 'Enter a date in YYYY-MM-DD format.',
  [codes.dateInvalid]: () => 'Enter a real calendar date.',
  [codes.dateYearOutOfRange]: ({ min, max }) => `Enter a year from ${min} to ${max}.`,
  [codes.timeRequired]: () => 'Enter a time.',
  [codes.timeFormat]: () => 'Enter a time in HH:mm format.'
};

/**
 * @param {{code: string, params: object}} error - From validateCostInput().
 * @returns {string} User-facing English text.
 */
export function getCostInputMessage(error) {
  return (messages[error.code] ?? (() => 'Check this field.'))(error.params ?? {});
}

/**
 * @param {object} errors - The `errors` map from validateCostInput().
 * @returns {object} The same fields with user-facing text.
 */
export function getCostInputMessages(errors) {
  return Object.fromEntries(
    Object.entries(errors).map(([field, error]) => [field, getCostInputMessage(error)])
  );
}
