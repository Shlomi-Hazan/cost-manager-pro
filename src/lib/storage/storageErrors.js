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
  unsupportedVersion: 'unsupported-version'
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
