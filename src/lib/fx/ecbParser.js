/*
 * M2B.1: validates Frankfurter v2 ECB responses and turns them into
 * decimal-safe observations. Pure functions: no network, no storage, no
 * clock (the caller passes every bound it needs).
 *
 * Provider shape (verified against api.frankfurter.dev/v2/providers/ecb/rates):
 *   [ { "date": "2026-10-09", "base": "EUR", "quote": "USD", "rate": 1.1206 }, ... ]
 * A valid answer can be an EMPTY array (a future date, a date before the
 * series starts), so HTTP 200 and even valid JSON do not prove data exists.
 *
 * PRECISION POLICY
 * Rates are kept as exact decimal STRINGS, never as floating-point numbers.
 *  - Exact-token mode (primary): JSON.parse's reviver receives each number's
 *    source text (`context.source`, a standard JSON.parse feature). The token
 *    itself becomes the rate, so no digit is lost to a double, with no
 *    dependency and no regular expression over the serialized JSON.
 *  - Number-boundary mode (fallback, for engines without `context.source`):
 *    the parsed Number is accepted only if its shortest decimal form has at
 *    most 15 significant digits and no exponent. LIMIT: in this mode a token
 *    with more digits than a double holds cannot be detected, because the
 *    digits are already gone when the Number is built. The result reports
 *    which mode was used (`precisionMode`).
 * In both modes a rate with more than 15 significant digits or an exponent
 * is rejected as `unsupported-precision` rather than silently accepted.
 * Every ECB rate seen so far has at most 5 significant digits.
 */
import { supportedCurrencies } from '../../constants/currencies.js';
import { isRealCalendarDate } from '../costValidation.js';
import { normalizeAmount } from '../money/decimal.js';
import {
  ecbFirstObservationDate,
  fxBaseCurrency,
  fxProvider,
  fxQuoteCurrencies,
  maxRateSignificantDigits
} from './constants.js';
import { FxError, fxErrorCodes as codes } from './fxErrors.js';

const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

// Marks a number whose exact source text was captured by the reviver.
class RateToken {
  constructor(source) {
    this.source = source;
  }
}

/** @returns {boolean} Whether this engine gives JSON.parse revivers `context.source`. */
export function supportsJsonSourceText() {
  try {
    let supported = false;

    JSON.parse('1', (_key, value, context) => {
      supported = typeof context?.source === 'string';

      return value;
    });

    return supported;
  } catch {
    return false;
  }
}

/**
 * @param {string} value
 * @returns {boolean} True for a real calendar date written YYYY-MM-DD.
 */
export function isValidIsoDate(value) {
  const match = typeof value === 'string' ? datePattern.exec(value) : null;

  if (!match) {
    return false;
  }

  const [, year, month, day] = match.map(Number);

  return month >= 1 && month <= 12 && isRealCalendarDate(day, month, year);
}

/**
 * @param {string} isoDate - YYYY-MM-DD.
 * @param {number} days - Whole days to add (may be negative).
 * @returns {string} The shifted calendar date. Pure calendar arithmetic in
 *   UTC, so it is independent of the machine's timezone.
 */
export function addDays(isoDate, days) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));

  return shifted.toISOString().slice(0, 10);
}

function significantDigits(decimalText) {
  return decimalText.replace(/^-/, '').replace('.', '').replace(/^0+/, '').length;
}

function invalidObservation(index, code, message, details = {}) {
  return new FxError(code, `Observation #${index + 1}: ${message}`, {
    details: { index, ...details }
  });
}

// Turns a parsed `rate` (a RateToken or a Number) into a canonical decimal
// string, or throws a typed error.
function readRate(raw, index, precisionMode) {
  if (raw instanceof RateToken) {
    const token = raw.source;

    if (/^-/.test(token)) {
      throw invalidObservation(index, codes.invalidRate, 'the rate is not positive.');
    }

    if (/[eE]/.test(token)) {
      throw invalidObservation(index, codes.unsupportedPrecision, 'the rate uses exponent notation.', { token });
    }

    if (!/^\d+(\.\d+)?$/.test(token)) {
      throw invalidObservation(index, codes.invalidRate, 'the rate is not a plain decimal.', { token });
    }

    const normalized = normalizeAmount(token);

    if (normalized === '0') {
      throw invalidObservation(index, codes.invalidRate, 'the rate is not positive.');
    }

    if (significantDigits(normalized) > maxRateSignificantDigits) {
      throw invalidObservation(index, codes.unsupportedPrecision, 'the rate has more digits than supported.', { token });
    }

    return normalized;
  }

  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    throw invalidObservation(index, codes.invalidRate, 'the rate is not a finite number.');
  }

  if (raw <= 0) {
    throw invalidObservation(index, codes.invalidRate, 'the rate is not positive.');
  }

  const text = String(raw);

  if (/[eE]/.test(text)) {
    throw invalidObservation(index, codes.unsupportedPrecision, 'the rate needs exponent notation.', { value: text });
  }

  if (significantDigits(text) > maxRateSignificantDigits) {
    throw invalidObservation(index, codes.unsupportedPrecision, 'the rate has more digits than supported.', {
      value: text,
      precisionMode
    });
  }

  return normalizeAmount(text);
}

/**
 * Validates an already-parsed observation array.
 * @param {unknown} root - Parsed JSON.
 * @param {object} options
 * @param {string[]} options.quotes - Requested quote currencies.
 * @param {string} [options.minDate] - Earliest acceptable observation date.
 * @param {string} [options.maxDate] - Latest acceptable observation date.
 * @param {boolean} [options.latest] - A "latest" request: dates after
 *   `maxDate` are reported as `future-observation`.
 * @param {'data'|'any'} [options.expectation] - `data`: an empty answer or a
 *   requested currency with no observation is an error. `any`: an empty
 *   answer is a valid "no observations" result.
 * @param {'exact-token'|'number-boundary'} [precisionMode]
 * @returns {{observations: {date: string, quote: string, rate: string}[],
 *   isEmpty: boolean, precisionMode: string}} Sorted by date, then quote.
 * @throws {FxError}
 */
export function validateEcbObservations(root, options, precisionMode = 'number-boundary') {
  const { quotes, minDate = ecbFirstObservationDate, maxDate = null, latest = false, expectation = 'data' } = options;

  if (!Array.isArray(root)) {
    throw new FxError(codes.invalidRoot, 'The provider response is not a list of observations.');
  }

  if (root.length === 0) {
    if (expectation === 'data') {
      throw new FxError(codes.emptyResponse, 'The provider returned no observations where some were expected.');
    }

    return { observations: [], isEmpty: true, precisionMode };
  }

  const seen = new Map();
  const observations = [];

  root.forEach((item, index) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      throw invalidObservation(index, codes.invalidObservation, 'it is not an object.');
    }

    if (item.provider !== undefined && String(item.provider).toUpperCase() !== fxProvider) {
      throw invalidObservation(index, codes.unexpectedProvider, 'it does not come from the ECB.', { provider: item.provider });
    }

    if (!isValidIsoDate(item.date)) {
      throw invalidObservation(index, codes.invalidDate, 'the date is not a real YYYY-MM-DD date.', { date: item.date });
    }

    if (item.base !== fxBaseCurrency) {
      throw invalidObservation(index, codes.wrongBase, `the base is not ${fxBaseCurrency}.`, { base: item.base });
    }

    if (typeof item.quote !== 'string' || !supportedCurrencies.includes(item.quote) || item.quote === fxBaseCurrency) {
      throw invalidObservation(index, codes.unsupportedCurrency, 'the quote currency is not supported.', { quote: item.quote });
    }

    if (!quotes.includes(item.quote)) {
      throw invalidObservation(index, codes.unexpectedQuote, 'the quote currency was not requested.', { quote: item.quote });
    }

    if (item.date < minDate) {
      throw invalidObservation(index, codes.dateOutOfRange, 'the date is before the accepted range.', { date: item.date, minDate });
    }

    if (maxDate !== null && item.date > maxDate) {
      throw invalidObservation(index, latest ? codes.futureObservation : codes.dateOutOfRange, 'the date is after the accepted range.', {
        date: item.date,
        maxDate
      });
    }

    const rate = readRate(item.rate, index, precisionMode);
    const key = `${item.quote}|${item.date}`;

    if (seen.has(key)) {
      const sameRate = seen.get(key) === rate;

      throw invalidObservation(
        index,
        sameRate ? codes.duplicateObservation : codes.conflictingObservation,
        sameRate ? 'it repeats an earlier observation.' : 'it contradicts an earlier observation.',
        { quote: item.quote, date: item.date }
      );
    }

    seen.set(key, rate);
    observations.push({ date: item.date, quote: item.quote, rate });
  });

  if (expectation === 'data') {
    quotes.forEach((quote) => {
      if (!observations.some((observation) => observation.quote === quote)) {
        throw new FxError(codes.missingRequiredCurrency, `The provider returned no observation for ${quote}.`, {
          details: { quote }
        });
      }
    });
  }

  observations.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.quote < b.quote ? -1 : 1));

  return { observations, isEmpty: false, precisionMode };
}

/**
 * Parses and validates the text of an observations response.
 * @param {string} text - The response body.
 * @param {object} options - See validateEcbObservations. Also accepts
 *   `useSourceText` (default: detected) to force a precision mode in tests.
 * @returns {object} See validateEcbObservations.
 * @throws {FxError}
 */
export function parseEcbObservations(text, options) {
  const exact = options.useSourceText ?? supportsJsonSourceText();
  let root;

  try {
    root = exact
      ? JSON.parse(text, (key, value, context) =>
          key === 'rate' && typeof value === 'number' && typeof context?.source === 'string'
            ? new RateToken(context.source)
            : value
        )
      : JSON.parse(text);
  } catch (error) {
    throw new FxError(codes.invalidJson, 'The provider response is not valid JSON.', { cause: error });
  }

  return validateEcbObservations(root, options, exact ? 'exact-token' : 'number-boundary');
}

/**
 * Parses and validates ECB provider metadata (GET /v2/providers/ecb).
 * @param {string} text - The response body.
 * @returns {{key: string, pivotCurrency: string, startDate: string,
 *   endDate: string, publishesMissed: number|null, cadence: string|null}}
 * @throws {FxError}
 */
export function parseEcbMetadata(text) {
  let root;

  try {
    root = JSON.parse(text);
  } catch (error) {
    throw new FxError(codes.invalidJson, 'The provider metadata is not valid JSON.', { cause: error });
  }

  if (root === null || typeof root !== 'object' || Array.isArray(root)) {
    throw new FxError(codes.invalidMetadata, 'The provider metadata is not an object.');
  }

  if (typeof root.key !== 'string' || root.key.toUpperCase() !== fxProvider) {
    throw new FxError(codes.unexpectedProvider, 'The provider metadata does not describe the ECB.', {
      details: { key: root.key }
    });
  }

  if (root.pivot_currency !== fxBaseCurrency) {
    throw new FxError(codes.wrongBase, `The ECB pivot currency is not ${fxBaseCurrency}.`, {
      details: { pivot: root.pivot_currency }
    });
  }

  if (!isValidIsoDate(root.start_date) || !isValidIsoDate(root.end_date) || root.start_date > root.end_date) {
    throw new FxError(codes.invalidMetadata, 'The provider metadata has invalid start or end dates.');
  }

  if (!Array.isArray(root.currencies)) {
    throw new FxError(codes.invalidMetadata, 'The provider metadata has no currency list.');
  }

  [fxBaseCurrency, ...fxQuoteCurrencies].forEach((currency) => {
    if (!root.currencies.includes(currency)) {
      throw new FxError(codes.missingRequiredCurrency, `The ECB does not list ${currency}.`, { details: { quote: currency } });
    }
  });

  const missed = root.publishes_missed;

  return {
    key: fxProvider,
    pivotCurrency: fxBaseCurrency,
    startDate: root.start_date,
    endDate: root.end_date,
    publishesMissed: Number.isInteger(missed) && missed >= 0 ? missed : null,
    cadence: typeof root.publish_cadence === 'string' ? root.publish_cadence : null
  };
}

