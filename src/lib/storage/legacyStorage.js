/*
 * Read-only access to expense data stored under the key used before M1,
 * "cost-manager:costsdb:v2:costs". The original course app (Cost Manager
 * Front-End) uses the very same key, so on a shared origin (for example
 * localhost during development) the data there may belong to that app.
 *
 * This module therefore NEVER writes, moves, or deletes the legacy key. It
 * only reports what is there, so the user can choose to import a copy
 * (ADR-042).
 */
import { readItem } from './browserStorage.js';
import { parseCostDocument } from './costDocument.js';
import { isStorageError } from './storageErrors.js';

export const legacyCostsStorageKey = 'cost-manager:costsdb:v2:costs';

export const legacyDataStatus = {
  none: 'none',
  available: 'available',
  unreadable: 'unreadable'
};

/**
 * @returns {{status: string, costs: object[]}} `available` with a validated
 *   copy of the records, `none` when there is nothing to import, or
 *   `unreadable` when the value exists but is not a valid dataset.
 */
export function inspectLegacyCosts() {
  let rawValue;

  try {
    rawValue = readItem(legacyCostsStorageKey);
  } catch {
    return { status: legacyDataStatus.none, costs: [] };
  }

  if (rawValue === null) {
    return { status: legacyDataStatus.none, costs: [] };
  }

  try {
    const { costs } = parseCostDocument(rawValue);

    return costs.length === 0
      ? { status: legacyDataStatus.none, costs: [] }
      : { status: legacyDataStatus.available, costs };
  } catch (error) {
    if (!isStorageError(error)) {
      throw error;
    }

    return { status: legacyDataStatus.unreadable, costs: [] };
  }
}
