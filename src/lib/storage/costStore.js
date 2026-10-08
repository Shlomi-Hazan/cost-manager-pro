/*
 * Safe persistence for one expense dataset (one localStorage key).
 *
 * Safety rules:
 * - Every read re-reads and fully validates the stored value. Nothing is
 *   cached, so another tab's changes are always seen.
 * - "Nothing stored" (empty) is distinct from "stored but unusable"
 *   (damaged / unsupported) and from "storage unavailable".
 * - Ordinary saves are refused unless the stored value is empty or valid.
 *   Damaged data is never overwritten by a normal save.
 * - Replacing a whole dataset (restore, import, reset) first keeps the
 *   current stored value as a "previous data" copy, then writes, then reads
 *   back to verify. If the safety copy cannot be written, nothing changes.
 */
import { readItem, removeItem, writeItem } from './browserStorage.js';
import {
  currentCostSchemaVersion,
  parseCostDocument,
  serializeCostDocument,
  validateCostList
} from './costDocument.js';
import { StorageError, isStorageError, storageErrorCodes } from './storageErrors.js';

export const costStoreStatus = {
  empty: 'empty',
  ready: 'ready',
  damaged: 'damaged',
  unsupported: 'unsupported',
  unavailable: 'unavailable'
};

export const previousDataReasons = {
  restore: 'restore',
  legacyImport: 'legacy-import',
  reset: 'reset',
  undo: 'undo',
  schemaMigration: 'schema-migration'
};

const snapshotFormat = 'cost-manager-pro-previous-data';

function statusForError(error) {
  if (error.code === storageErrorCodes.unsupportedVersion) {
    return costStoreStatus.unsupported;
  }

  if (error.code === storageErrorCodes.unavailable) {
    return costStoreStatus.unavailable;
  }

  return costStoreStatus.damaged;
}

export function createCostStore(dataKey) {
  const snapshotKey = `${dataKey}:previous`;

  /**
   * Reads and classifies the stored value without changing anything.
   * @returns {{status: string, costs?: object[], rawValue?: string|null,
   *   sourceSchemaVersion?: number, error?: StorageError}}
   */
  function inspect() {
    let rawValue;

    try {
      rawValue = readItem(dataKey);
    } catch (error) {
      return { status: statusForError(error), error, rawValue: null };
    }

    if (rawValue === null) {
      return { status: costStoreStatus.empty, costs: [], rawValue: null };
    }

    try {
      const { costs, sourceSchemaVersion } = parseCostDocument(rawValue);

      return { status: costStoreStatus.ready, costs, rawValue, sourceSchemaVersion };
    } catch (error) {
      if (!isStorageError(error)) {
        throw error;
      }

      return { status: statusForError(error), error, rawValue };
    }
  }

  function isUsable(state) {
    return state.status === costStoreStatus.empty || state.status === costStoreStatus.ready;
  }

  // Returns stored records, or throws the StorageError explaining why the
  // stored data cannot be used. Never substitutes an empty list.
  function readCosts() {
    const state = inspect();

    if (!isUsable(state)) {
      throw state.error;
    }

    return state.costs;
  }

  function writeSnapshot(rawValue, reason, now) {
    writeItem(
      snapshotKey,
      JSON.stringify({
        format: snapshotFormat,
        reason,
        createdAt: now.toISOString(),
        rawValue
      })
    );
  }

  // A stored value is worth keeping as "previous data" unless it is missing
  // or a valid dataset with no expenses. This stops an empty dataset from
  // replacing an earlier, more valuable safety copy.
  function isWorthKeeping(state) {
    if (state.rawValue === null) {
      return false;
    }

    return !(state.status === costStoreStatus.ready && state.costs.length === 0);
  }

  /**
   * Applies `change` to the current records and saves the result. Used for
   * ordinary add/edit/delete. Refuses to run when stored data is unusable.
   * @param {function(object[]): object[]} change - Returns the next list.
   * @param {Date} [now] - Clock for the migration safety copy.
   * @returns {object[]} The saved list.
   */
  function modifyCosts(change, now = new Date()) {
    const state = inspect();

    if (!isUsable(state)) {
      throw state.error;
    }

    const nextCosts = change([...state.costs]);

    validateCostList(nextCosts);

    // First save after reading an older layout: keep the original value so
    // the upgrade can be undone.
    if (
      state.status === costStoreStatus.ready &&
      state.sourceSchemaVersion < currentCostSchemaVersion
    ) {
      writeSnapshot(state.rawValue, previousDataReasons.schemaMigration, now);
    }

    writeItem(dataKey, serializeCostDocument(nextCosts));

    return nextCosts;
  }

  /**
   * Replaces the whole dataset after it has been fully validated. Works even
   * when the current value is damaged or unsupported (that is the recovery
   * path), because the current value is kept as previous data first.
   * @param {object[]} costs - Complete, already-parsed list of records.
   * @param {string} reason - One of previousDataReasons.
   * @param {Date} [now] - Clock for the safety copy timestamp.
   */
  function replaceAllCosts(costs, reason, now = new Date()) {
    validateCostList(costs);

    const current = inspect();

    if (current.status === costStoreStatus.unavailable) {
      throw current.error;
    }

    if (isWorthKeeping(current)) {
      // If this fails (e.g. storage is full) the error propagates and the
      // current data is left exactly as it was.
      writeSnapshot(current.rawValue, reason, now);
    }

    const nextRawValue = serializeCostDocument(costs);

    writeItem(dataKey, nextRawValue);

    // Read back to confirm the browser stored exactly what was written.
    const written = readItem(dataKey);

    if (written !== nextRawValue) {
      if (current.rawValue === null) {
        removeItem(dataKey);
      } else {
        writeItem(dataKey, current.rawValue);
      }

      throw new StorageError(
        storageErrorCodes.writeFailed,
        'Saved data could not be verified; the previous data was put back.'
      );
    }
  }

  /**
   * @returns {null|{reason: string, createdAt: string|null, rawValue: string,
   *   costCount: number|null, isRestorable: boolean}}
   */
  function getPreviousData() {
    const storedSnapshot = readItem(snapshotKey);

    if (storedSnapshot === null) {
      return null;
    }

    let snapshot;

    try {
      snapshot = JSON.parse(storedSnapshot);
    } catch {
      snapshot = null;
    }

    if (snapshot?.format !== snapshotFormat || typeof snapshot.rawValue !== 'string') {
      // Keep whatever is there downloadable, but never restore it blindly.
      return {
        reason: 'unknown',
        createdAt: null,
        rawValue: storedSnapshot,
        costCount: null,
        isRestorable: false
      };
    }

    try {
      const { costs } = parseCostDocument(snapshot.rawValue);

      return {
        reason: snapshot.reason,
        createdAt: snapshot.createdAt,
        rawValue: snapshot.rawValue,
        costCount: costs.length,
        isRestorable: true
      };
    } catch {
      return {
        reason: snapshot.reason,
        createdAt: snapshot.createdAt,
        rawValue: snapshot.rawValue,
        costCount: null,
        isRestorable: false
      };
    }
  }

  // Swaps the previous data back in. The data being replaced becomes the
  // new previous data, so this can itself be undone.
  function restorePreviousData(now = new Date()) {
    const previous = getPreviousData();

    if (!previous?.isRestorable) {
      throw new StorageError(
        storageErrorCodes.damaged,
        'The previous data cannot be restored automatically.'
      );
    }

    const { costs } = parseCostDocument(previous.rawValue);
    const current = inspect();

    if (current.status === costStoreStatus.unavailable) {
      throw current.error;
    }

    // Always keep what is being replaced here, even an empty dataset, so
    // the swap is reversible.
    if (current.rawValue !== null) {
      writeSnapshot(current.rawValue, previousDataReasons.undo, now);
    }

    try {
      writeItem(dataKey, serializeCostDocument(costs));
    } catch (error) {
      // Put the original safety copy back so it is not lost.
      writeSnapshot(previous.rawValue, previous.reason, new Date(previous.createdAt ?? now));
      throw error;
    }

    return costs;
  }

  return {
    dataKey,
    snapshotKey,
    inspect,
    readCosts,
    modifyCosts,
    replaceAllCosts,
    getPreviousData,
    restorePreviousData
  };
}
