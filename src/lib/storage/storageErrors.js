/*
 * One error type for every persistence failure, with a machine-readable
 * `code` so the UI can explain what happened without matching message text.
 */
export const storageErrorCodes = {
  // The browser refused access to localStorage (disabled, private mode
  // restrictions, security policy).
  unavailable: 'unavailable',
  // Saving failed because the browser's storage quota is full.
  quotaExceeded: 'quota-exceeded',
  // Saving failed for another reason.
  writeFailed: 'write-failed',
  // Stored data exists but cannot be used safely; it is kept untouched.
  damaged: 'damaged',
  // Stored data was written by a newer version of the app.
  unsupportedVersion: 'unsupported-version',
  // Stored data changed (e.g. in another tab) between reading and saving;
  // nothing was saved.
  conflict: 'conflict',
  // A replacement failed and the automatic rollback also failed; a copy of
  // the earlier data is kept as previous data.
  recoveryIncomplete: 'recovery-incomplete'
};

export class StorageError extends Error {
  constructor(code, message, { cause, details } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'StorageError';
    this.code = code;
    this.details = details ?? null;
  }
}

export function isStorageError(error) {
  return error instanceof StorageError;
}
