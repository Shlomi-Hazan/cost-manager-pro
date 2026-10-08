/*
 * Bridges the required asynchronous Fetch API with the synchronous-looking
 * getReport() call shown in the official db.js sample. The course requires
 * exchange rates to come from Fetch, but the official sample calls
 * ob.getReport("USD") and reads data.total.sum on the very next line, with
 * no await — so, to keep that sample working as shown, getReport() cannot
 * itself perform a network request.
 *
 * The resolution used throughout this project: the application fetches and
 * validates rates elsewhere (see exchangeRatesService.js), then stores the
 * already-validated result here in localStorage. db.js (both the module and
 * Vanilla versions) reads this cache synchronously whenever a report needs
 * to convert between currencies, so getReport() itself never awaits
 * anything. This is a project design decision, not an official requirement,
 * because the official document does not explicitly resolve this tension
 * (tracked as OQ-003 in docs/REQUIREMENTS.md).
 */
import { validateExchangeRates } from '../utils/currency.js';
import { readItem, removeItem, writeItem } from './storage/browserStorage.js';

// Namespaced for Cost Manager Pro (ADR-042). The cache only holds data that
// can be fetched again, so the old "cost-manager:" key is not migrated.
export const exchangeRatesCacheKey = 'cost-manager-pro:exchange-rates-cache';

// Returns null (rather than throwing) for "no cache yet" AND for corrupted/
// invalid cached data, since both cases mean the same thing to a caller:
// there are no rates it can safely convert with right now.
export function getCachedExchangeRates() {
  let storedValue;

  try {
    storedValue = readItem(exchangeRatesCacheKey);
  } catch {
    return null;
  }

  if (storedValue === null) {
    return null;
  }

  try {
    return validateExchangeRates(JSON.parse(storedValue));
  } catch {
    return null;
  }
}

// Only ever stores rates that have already passed validateExchangeRates(),
// so anything later read back out of localStorage is guaranteed well-formed
// (barring external tampering, which getCachedExchangeRates() tolerates).
export function setCachedExchangeRates(rates) {
  const validatedRates = validateExchangeRates(rates);

  writeItem(exchangeRatesCacheKey, JSON.stringify(validatedRates));

  return validatedRates;
}

export function clearCachedExchangeRates() {
  removeItem(exchangeRatesCacheKey);
}
