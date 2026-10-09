/*
 * Backup, restore, and recovery for the app's expense dataset (M1).
 * Every operation that replaces data goes through costStore's
 * replaceAllCosts(), which keeps the replaced data as "previous data" first.
 * Restoring is split into prepareRestore() (validate only, no changes) and
 * applyRestore() (replace after the user confirms).
 */
import { costsDatabaseName, costsDatabaseVersion } from '../lib/costsDatabase.js';
import { getCostsStorageKey } from '../lib/db.js';
import {
  createBackup,
  getBackupFilename,
  parseBackup,
  serializeBackup
} from '../lib/storage/backupFormat.js';
import { parseCostDocument } from '../lib/storage/costDocument.js';
import {
  costStoreStatus,
  createCostStore,
  previousDataReasons
} from '../lib/storage/costStore.js';
import { inspectLegacyCosts, legacyDataStatus } from '../lib/storage/legacyStorage.js';
import { StorageError, storageErrorCodes } from '../lib/storage/storageErrors.js';
import { downloadBlob } from './export/downloadService.js';

const appCostStore = createCostStore(
  getCostsStorageKey(costsDatabaseName, costsDatabaseVersion)
);

export function getAppCostStore() {
  return appCostStore;
}

// The browser's "storage" event only reaches other tabs, so changes made
// here are announced with this event for components in the same tab.
export const dataChangedEventName = 'cost-manager-pro:data-changed';

export function notifyDataChanged() {
  window.dispatchEvent(new Event(dataChangedEventName));
}

function safelyGetPreviousData(store) {
  try {
    return store.getPreviousData();
  } catch {
    return null;
  }
}

/**
 * Everything the Settings data section needs to describe the current state.
 * Reads only; never changes storage.
 */
export function getDataStatus(store = appCostStore) {
  const state = store.inspect();
  const isEmpty = state.status === costStoreStatus.empty ||
    (state.status === costStoreStatus.ready && state.costs.length === 0);

  return {
    status: state.status,
    costCount: state.costs?.length ?? null,
    error: state.error ?? null,
    hasRawData: typeof state.rawValue === 'string',
    previousData: safelyGetPreviousData(store),
    // Data from before M1 is only offered while this dataset is empty, so
    // importing it never has to merge with or replace existing expenses.
    legacy: isEmpty ? inspectLegacyCosts() : { status: legacyDataStatus.none, costs: [] }
  };
}

export function buildBackupFile(store = appCostStore, now = new Date()) {
  const costs = store.readCosts();

  return {
    filename: getBackupFilename(now),
    content: serializeBackup(createBackup(costs, now)),
    costCount: costs.length
  };
}

function downloadJson(filename, content) {
  downloadBlob(new Blob([content], { type: 'application/json' }), filename);
}

export function downloadBackup(store = appCostStore, now = new Date()) {
  const file = buildBackupFile(store, now);

  downloadJson(file.filename, file.content);

  return file;
}

// Validates a backup file without changing anything.
export function prepareRestore(text) {
  return parseBackup(text);
}

export function applyRestore(preparedRestore, store = appCostStore, now = new Date()) {
  store.replaceAllCosts(preparedRestore.costs, previousDataReasons.restore, now);

  return preparedRestore.costs.length;
}

export function importLegacyCopy(store = appCostStore, now = new Date()) {
  const status = getDataStatus(store);

  if (status.legacy.status !== legacyDataStatus.available) {
    throw new StorageError(
      storageErrorCodes.damaged,
      'There is no earlier data that can be imported.'
    );
  }

  // The legacy key is only read; replaceAllCosts writes Cost Manager Pro's
  // own key.
  store.replaceAllCosts(status.legacy.costs, previousDataReasons.legacyImport, now);

  return status.legacy.costs.length;
}

// Recovery path when stored data cannot be read: the unreadable value is
// kept as previous data (still downloadable), then the dataset starts empty.
export function resetUnreadableData(store = appCostStore, now = new Date()) {
  const state = store.inspect();

  if (state.status !== costStoreStatus.damaged && state.status !== costStoreStatus.unsupported) {
    throw new StorageError(
      storageErrorCodes.damaged,
      'Stored data is readable, so it was not reset.'
    );
  }

  store.replaceAllCosts([], previousDataReasons.reset, now);
}

export function restorePreviousData(store = appCostStore, now = new Date()) {
  return store.restorePreviousData(now).length;
}

function getDatedFilename(prefix, now) {
  return getBackupFilename(now).replace('cost-manager-pro-backup', prefix);
}

// Downloads the stored value exactly as it is, for data that cannot be read.
export function downloadUnreadableData(store = appCostStore, now = new Date()) {
  const state = store.inspect();

  if (typeof state.rawValue !== 'string') {
    throw new StorageError(storageErrorCodes.damaged, 'There is no stored data to download.');
  }

  downloadJson(getDatedFilename('cost-manager-pro-unreadable-data', now), state.rawValue);
}

// Downloads previous data as a normal backup file when it is valid, so it
// can be restored later; otherwise exactly as it was stored.
export function downloadPreviousData(store = appCostStore, now = new Date()) {
  const previous = store.getPreviousData();

  if (!previous) {
    throw new StorageError(storageErrorCodes.damaged, 'There is no previous data to download.');
  }

  if (previous.isRestorable) {
    const { costs } = parseCostDocument(previous.rawValue);

    downloadJson(
      getDatedFilename('cost-manager-pro-previous-data', now),
      serializeBackup(createBackup(costs, now))
    );
    return;
  }

  downloadJson(getDatedFilename('cost-manager-pro-previous-unreadable-data', now), previous.rawValue);
}
