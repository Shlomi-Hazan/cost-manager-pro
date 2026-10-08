/*
 * Backup file format, version 1 (documented in docs/DATA_STORAGE.md):
 *
 *   {
 *     "format": "cost-manager-pro-backup",
 *     "formatVersion": 1,
 *     "exportedAt": "2026-10-09T08:15:00.000Z",
 *     "app": "Cost Manager Pro",
 *     "costCount": 2,
 *     "costs": [ <stored cost record>, ... ]
 *   }
 *
 * Records are written exactly as stored, so amounts, currencies, dates,
 * times, and ids round-trip unchanged. Settings and the exchange-rate cache
 * are not included. Parsing validates the whole file before returning
 * anything, so a bad file can never be partly restored.
 */
import { validateCostList } from './costDocument.js';
import { isStorageError } from './storageErrors.js';

export const backupFormatName = 'cost-manager-pro-backup';
export const currentBackupFormatVersion = 1;

// Far larger than any realistic expense history, and larger than browsers
// allow localStorage to hold, so a bigger file cannot be a valid backup.
export const maxBackupFileSize = 10 * 1024 * 1024;

export const backupErrorCodes = {
  tooLarge: 'too-large',
  invalidJson: 'invalid-json',
  notABackup: 'not-a-backup',
  unsupportedVersion: 'unsupported-version',
  invalidMetadata: 'invalid-metadata',
  countMismatch: 'count-mismatch',
  invalidRecord: 'invalid-record',
  duplicateId: 'duplicate-id'
};

export class BackupError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'BackupError';
    this.code = code;
  }
}

export function createBackup(costs, now = new Date()) {
  return {
    format: backupFormatName,
    formatVersion: currentBackupFormatVersion,
    exportedAt: now.toISOString(),
    app: 'Cost Manager Pro',
    costCount: costs.length,
    costs
  };
}

export function serializeBackup(backup) {
  return `${JSON.stringify(backup, null, 2)}\n`;
}

function padTwo(value) {
  return String(value).padStart(2, '0');
}

// Local date and time, so the name matches what the user saw on screen.
export function getBackupFilename(now = new Date()) {
  const date = `${now.getFullYear()}-${padTwo(now.getMonth() + 1)}-${padTwo(now.getDate())}`;
  const time = `${padTwo(now.getHours())}${padTwo(now.getMinutes())}`;

  return `cost-manager-pro-backup-${date}-${time}.json`;
}

/**
 * @param {string} text - Full contents of a backup file.
 * @returns {{costs: object[], exportedAt: string, costCount: number}}
 * @throws {BackupError} With a user-facing message; nothing is restored.
 */
export function parseBackup(text) {
  if (typeof text !== 'string' || text.length > maxBackupFileSize) {
    throw new BackupError(
      backupErrorCodes.tooLarge,
      'This file is too large to be a Cost Manager Pro backup.'
    );
  }

  let backup;

  try {
    backup = JSON.parse(text);
  } catch {
    throw new BackupError(
      backupErrorCodes.invalidJson,
      'This file is not valid JSON, so it cannot be a Cost Manager Pro backup.'
    );
  }

  if (backup === null || typeof backup !== 'object' || backup.format !== backupFormatName) {
    throw new BackupError(
      backupErrorCodes.notABackup,
      'This file is not a Cost Manager Pro backup.'
    );
  }

  if (!Number.isInteger(backup.formatVersion) || backup.formatVersion < 1) {
    throw new BackupError(
      backupErrorCodes.invalidMetadata,
      'This backup file has an invalid format version.'
    );
  }

  if (backup.formatVersion > currentBackupFormatVersion) {
    throw new BackupError(
      backupErrorCodes.unsupportedVersion,
      'This backup was created by a newer version of Cost Manager Pro and cannot be restored here.'
    );
  }

  if (typeof backup.exportedAt !== 'string' || Number.isNaN(Date.parse(backup.exportedAt))) {
    throw new BackupError(
      backupErrorCodes.invalidMetadata,
      'This backup file is missing a valid creation date.'
    );
  }

  if (!Array.isArray(backup.costs)) {
    throw new BackupError(
      backupErrorCodes.invalidMetadata,
      'This backup file does not contain an expense list.'
    );
  }

  if (backup.costCount !== backup.costs.length) {
    throw new BackupError(
      backupErrorCodes.countMismatch,
      'This backup file looks incomplete: its expense count does not match its contents.'
    );
  }

  try {
    validateCostList(backup.costs);
  } catch (error) {
    if (!isStorageError(error)) {
      throw error;
    }

    const isDuplicate = error.details?.reason === 'duplicate-id';

    throw new BackupError(
      isDuplicate ? backupErrorCodes.duplicateId : backupErrorCodes.invalidRecord,
      isDuplicate
        ? `This backup contains two expenses with the same id (expense #${error.details.index + 1}). Nothing was restored.`
        : `This backup contains an invalid expense (expense #${error.details.index + 1}). Nothing was restored.`
    );
  }

  return {
    costs: backup.costs,
    exportedAt: backup.exportedAt,
    costCount: backup.costCount
  };
}
