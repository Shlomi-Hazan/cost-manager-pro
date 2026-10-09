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
 * - Operations that replace data and keep a "previous data" copy (restore,
 *   import, reset, undo, the first save after a format upgrade) use one
 *   commit sequence, so that every value involved exists somewhere in
 *   storage at every step (see commitWithPreviousData below).
 *
 * localStorage offers no transactions and no compare-and-swap across tabs.
 * Each single setItem either stores the whole value or fails, but a
 * sequence of writes can still be interrupted (tab closed, quota) or
 * interleaved with another tab. The design keeps data recoverable in those
 * cases. It does not make multi-key changes atomic.
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

function createSnapshotRecord(rawValue, reason, now) {
  return JSON.stringify({
    format: snapshotFormat,
    reason,
    createdAt: now.toISOString(),
    rawValue
  });
}

// Turns a stored snapshot record into the shape callers use. Unrecognized
// values stay downloadable but are never restored blindly.
function describeSnapshot(storedRecord) {
  let snapshot;

  try {
    snapshot = JSON.parse(storedRecord);
  } catch {
    snapshot = null;
  }

  if (snapshot?.format !== snapshotFormat || typeof snapshot.rawValue !== 'string') {
    return {
      reason: 'unknown',
      createdAt: null,
      rawValue: storedRecord,
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

function readSnapshotRawValue(storedRecord) {
  try {
    const snapshot = JSON.parse(storedRecord);

    return typeof snapshot?.rawValue === 'string' ? snapshot.rawValue : null;
  } catch {
    return null;
  }
}

export function createCostStore(dataKey) {
  const snapshotKey = `${dataKey}:previous`;
  // Holds the next "previous data" copy while a replacement is in
  // progress. It only outlives an operation if that operation was
  // interrupted or a late step failed.
  const pendingSnapshotKey = `${dataKey}:previous:pending`;

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

  // A stored value is worth keeping as "previous data" unless it is missing
  // or a valid dataset with no expenses. This stops an empty dataset from
  // replacing an earlier, more valuable safety copy.
  function isWorthKeeping(state) {
    if (state.rawValue === null) {
      return false;
    }

    return !(state.status === costStoreStatus.ready && state.costs.length === 0);
  }

  /*
   * A pending copy left behind by an interrupted or partly failed commit is
   * resolved by comparing it with the current data:
   * - data still equals the pending copy's value: the data was never
   *   replaced, so the pending copy is a duplicate and the snapshot slot is
   *   still the real previous data;
   * - otherwise the data was replaced, so the pending copy is the real
   *   previous data.
   * This read-only view is used by getPreviousData(); settlePendingSnapshot()
   * applies the same rule before the next commit.
   */
  function readPendingSnapshot() {
    const pendingRecord = readItem(pendingSnapshotKey);

    if (pendingRecord === null) {
      return null;
    }

    const pendingRawValue = readSnapshotRawValue(pendingRecord);

    // Only this module writes the pending key. If its record cannot be
    // read, it is never promoted over the real snapshot.
    if (pendingRawValue === null) {
      return { record: pendingRecord, dataWasReplaced: false };
    }

    return { record: pendingRecord, dataWasReplaced: readItem(dataKey) !== pendingRawValue };
  }

  function settlePendingSnapshot() {
    const pending = readPendingSnapshot();

    if (!pending) {
      return;
    }

    if (pending.dataWasReplaced) {
      writeItem(snapshotKey, pending.record);
    }

    removeItem(pendingSnapshotKey);
  }

  function conflictError() {
    return new StorageError(
      storageErrorCodes.conflict,
      'Stored data was changed elsewhere (for example in another tab) while this change was being saved, so nothing was changed.'
    );
  }

  /*
   * The commit sequence for every change that keeps previous data:
   *  1. Store the copy of the current value under the pending key. (If this
   *     fails, nothing has changed.)
   *  2. Check that the data still equals the value that was read; another
   *     tab may have written it. (If not, nothing is changed.)
   *  3. Write the new data. (If this fails, the data is unchanged, and the
   *     snapshot slot was never touched.)
   *  4. Read the data back. If it is not exactly what was written, write
   *     the earlier value back.
   *  5. Copy the pending copy into the snapshot slot, then remove the
   *     pending key. If this fails, the pending copy stays and is still
   *     reported and resolved as the previous data.
   * At every step, the earlier data, the new data, and the earlier
   * snapshot each exist in at least one key.
   */
  function commitWithPreviousData({ expectedRawValue, nextRawValue, keepCurrent, reason, now }) {
    settlePendingSnapshot();

    let pendingWritten = false;

    if (keepCurrent) {
      writeItem(pendingSnapshotKey, createSnapshotRecord(expectedRawValue, reason, now));
      pendingWritten = true;
    }

    function discardPending() {
      if (pendingWritten) {
        try {
          removeItem(pendingSnapshotKey);
        } catch {
          // Harmless: an unremoved duplicate is resolved later because the
          // data still equals its value.
        }
      }
    }

    if (readItem(dataKey) !== expectedRawValue) {
      discardPending();
      throw conflictError();
    }

    try {
      writeItem(dataKey, nextRawValue);
    } catch (error) {
      discardPending();
      throw error;
    }

    if (readItem(dataKey) !== nextRawValue) {
      try {
        if (expectedRawValue === null) {
          removeItem(dataKey);
        } else {
          writeItem(dataKey, expectedRawValue);
        }
      } catch (rollbackError) {
        throw new StorageError(
          storageErrorCodes.recoveryIncomplete,
          'The change could not be verified, and the earlier data could not be put back automatically. A copy of the earlier data is kept as previous data.',
          { cause: rollbackError }
        );
      }

      discardPending();
      throw new StorageError(
        storageErrorCodes.writeFailed,
        'Saved data could not be verified; the earlier data was put back.'
      );
    }

    if (pendingWritten) {
      try {
        settlePendingSnapshot();
      } catch {
        // The new data is saved. The copy stays under the pending key, where
        // getPreviousData() still finds it, and the next commit settles it.
      }
    }
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

    const nextRawValue = serializeCostDocument(nextCosts);

    // First save after reading an older layout: keep the original value so
    // the upgrade can be undone, using the full commit sequence.
    if (
      state.status === costStoreStatus.ready &&
      state.sourceSchemaVersion < currentCostSchemaVersion
    ) {
      commitWithPreviousData({
        expectedRawValue: state.rawValue,
        nextRawValue,
        keepCurrent: isWorthKeeping(state),
        reason: previousDataReasons.schemaMigration,
        now
      });

      return nextCosts;
    }

    // Ordinary save: a single write, guarded against a change made in
    // another tab since the read above.
    if (readItem(dataKey) !== state.rawValue) {
      throw conflictError();
    }

    writeItem(dataKey, nextRawValue);

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

    commitWithPreviousData({
      expectedRawValue: current.rawValue,
      nextRawValue: serializeCostDocument(costs),
      keepCurrent: isWorthKeeping(current),
      reason,
      now
    });
  }

  /**
   * @returns {null|{reason: string, createdAt: string|null, rawValue: string,
   *   costCount: number|null, isRestorable: boolean}}
   */
  function getPreviousData() {
    const pending = readPendingSnapshot();

    if (pending?.dataWasReplaced) {
      return describeSnapshot(pending.record);
    }

    const storedSnapshot = readItem(snapshotKey);

    return storedSnapshot === null ? null : describeSnapshot(storedSnapshot);
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
    commitWithPreviousData({
      expectedRawValue: current.rawValue,
      nextRawValue: serializeCostDocument(costs),
      keepCurrent: current.rawValue !== null,
      reason: previousDataReasons.undo,
      now
    });

    return costs;
  }

  return {
    dataKey,
    snapshotKey,
    pendingSnapshotKey,
    inspect,
    readCosts,
    modifyCosts,
    replaceAllCosts,
    getPreviousData,
    restorePreviousData
  };
}
