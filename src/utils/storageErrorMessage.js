/*
 * User-facing explanations for StorageError codes, so every page explains a
 * storage problem the same way and points to the recovery tools in
 * Settings. Returns null for errors that are not storage errors, letting
 * the caller keep its own message.
 */
import { isStorageError, storageErrorCodes } from '../lib/storage/storageErrors.js';

const messages = {
  [storageErrorCodes.unavailable]:
    'Your browser is not allowing this site to use storage, so expenses cannot be read or saved. Check the site data settings in your browser.',
  [storageErrorCodes.quotaExceeded]:
    'Your browser storage for this site is full, so this change was not saved. Your existing data was not changed.',
  [storageErrorCodes.writeFailed]:
    'This change could not be saved. Your existing data was not changed. Please try again.',
  [storageErrorCodes.damaged]:
    'Your saved expenses cannot be read, so nothing was changed. Go to Settings, under "Your data", to download or recover them.',
  [storageErrorCodes.unsupportedVersion]:
    'Your saved expenses were created by a newer version of Cost Manager Pro, so nothing was changed. Go to Settings, under "Your data", for options.'
};

export function getStorageErrorMessage(error) {
  if (!isStorageError(error)) {
    return null;
  }

  return messages[error.code] ?? messages[storageErrorCodes.writeFailed];
}
