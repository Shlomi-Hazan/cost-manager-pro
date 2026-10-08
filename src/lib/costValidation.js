/*
 * Validation rules for expense ("cost") records, shared by the db.js API
 * (validating caller input) and the storage layer (validating records read
 * back from localStorage or from a backup file). Keeping one set of rules
 * means a record the app can write is always a record it can read back.
 *
 * Error messages are part of the observable behavior of db.js and are
 * asserted by tests, so change them deliberately.
 */
import { supportedCurrencies } from '../constants/currencies.js';

export function isSupportedCurrency(currency) {
  return supportedCurrencies.includes(currency);
}

// The four caller-supplied fields of a cost. Deliberately permissive about
// content (any finite number, any string): product validation rules are
// planned for M2 and must not make existing stored data unreadable.
export function validateCost(cost) {
  if (cost === null || typeof cost !== 'object') {
    throw new TypeError('cost must be an object.');
  }

  if (typeof cost.sum !== 'number' || !Number.isFinite(cost.sum)) {
    throw new TypeError('cost.sum must be a finite number.');
  }

  if (!isSupportedCurrency(cost.currency)) {
    throw new TypeError('cost.currency must be one of USD, ILS, GBP, EURO.');
  }

  if (typeof cost.category !== 'string') {
    throw new TypeError('cost.category must be a string.');
  }

  if (typeof cost.description !== 'string') {
    throw new TypeError('cost.description must be a string.');
  }
}

export function validateCostId(id) {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new TypeError('id must be a non-empty string.');
  }
}

// Lets the Date constructor normalize the value and checks that it did not
// roll over into a different date (e.g. 31 February becomes 3 March).
function isRealCalendarDate(day, month, year) {
  const candidate = new Date(0);

  candidate.setFullYear(year, month - 1, day);
  candidate.setHours(0, 0, 0, 0);

  return (
    candidate.getFullYear() === year &&
    candidate.getMonth() === month - 1 &&
    candidate.getDate() === day
  );
}

export function validateCostDate(date) {
  if (date === null || typeof date !== 'object' || Array.isArray(date)) {
    throw new TypeError('cost.date must be an object.');
  }

  const { day, month, year, hour, minute } = date;

  if (
    !Number.isInteger(day) ||
    !Number.isInteger(month) ||
    !Number.isInteger(year) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute)
  ) {
    throw new TypeError('cost.date values must be integers.');
  }

  if (month < 1 || month > 12) {
    throw new TypeError('cost.date.month must be an integer from 1 to 12.');
  }

  if (!isRealCalendarDate(day, month, year)) {
    throw new TypeError('cost.date must be a real calendar date.');
  }

  if (hour < 0 || hour > 23) {
    throw new TypeError('cost.date.hour must be an integer from 0 to 23.');
  }

  if (minute < 0 || minute > 59) {
    throw new TypeError('cost.date.minute must be an integer from 0 to 59.');
  }
}

// A complete record as it is stored: generated id, the four cost fields, and
// the full date/time.
export function validateStoredCost(cost) {
  validateCost(cost);
  validateCostId(cost.id);
  validateCostDate(cost.date);
}

// Exact copy of the supported fields only, so stored records never carry
// unexpected extra properties and callers never share object references.
export function copyCostRecord(cost) {
  return {
    id: cost.id,
    sum: cost.sum,
    currency: cost.currency,
    category: cost.category,
    description: cost.description,
    date: {
      day: cost.date.day,
      month: cost.date.month,
      year: cost.date.year,
      hour: cost.date.hour,
      minute: cost.date.minute
    }
  };
}
