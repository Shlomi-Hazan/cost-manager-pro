/*
 * Thin wrappers around window.localStorage that turn browser exceptions into
 * StorageError values. Reading, writing, and removing are kept separate so
 * that "could not read" is never confused with "nothing stored".
 */
import { StorageError, storageErrorCodes } from './storageErrors.js';

function getLocalStorage() {
  // Accessing the property itself can throw (e.g. a SecurityError when
  // site data is blocked), so it is wrapped like every other call.
  try {
    const storage = globalThis.localStorage;

    if (!storage) {
      throw new Error('localStorage is not available.');
    }

    return storage;
  } catch (error) {
    throw new StorageError(
      storageErrorCodes.unavailable,
      'Browser storage is not available.',
      { cause: error }
    );
  }
}

// Browsers report a full quota with different names and legacy codes.
export function isQuotaExceededError(error) {
  return (
    error?.name === 'QuotaExceededError' ||
    error?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    error?.code === 22 ||
    error?.code === 1014
  );
}

/**
 * @param {string} key - Storage key.
 * @returns {string|null} The stored string, or null when nothing is stored.
 * @throws {StorageError} `unavailable` when the browser refuses the read.
 */
export function readItem(key) {
  const storage = getLocalStorage();

  try {
    return storage.getItem(key);
  } catch (error) {
    throw new StorageError(
      storageErrorCodes.unavailable,
      'Browser storage could not be read.',
      { cause: error }
    );
  }
}

/**
 * localStorage.setItem either stores the whole value or throws without
 * changing the previous value, so a failed write never leaves half a value.
 * @param {string} key - Storage key.
 * @param {string} value - Value to store.
 * @throws {StorageError} `quota-exceeded`, `unavailable`, or `write-failed`.
 */
export function writeItem(key, value) {
  const storage = getLocalStorage();

  try {
    storage.setItem(key, value);
  } catch (error) {
    if (isQuotaExceededError(error)) {
      throw new StorageError(
        storageErrorCodes.quotaExceeded,
        'Browser storage is full.',
        { cause: error }
      );
    }

    throw new StorageError(
      storageErrorCodes.writeFailed,
      'Browser storage could not be written.',
      { cause: error }
    );
  }
}

export function removeItem(key) {
  const storage = getLocalStorage();

  try {
    storage.removeItem(key);
  } catch (error) {
    throw new StorageError(
      storageErrorCodes.writeFailed,
      'Browser storage could not be updated.',
      { cause: error }
    );
  }
}
