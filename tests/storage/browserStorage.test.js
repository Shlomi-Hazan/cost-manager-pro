import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isQuotaExceededError,
  readItem,
  removeItem,
  writeItem
} from '../../src/lib/storage/browserStorage.js';
import { quotaError } from './fixtures.js';

describe('browser storage wrappers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('returns null for a missing key and the exact string otherwise', () => {
    expect(readItem('missing')).toBeNull();
    writeItem('key', ' exact value ');
    expect(readItem('key')).toBe(' exact value ');
  });

  it('turns read exceptions into an "unavailable" error', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Access denied', 'SecurityError');
    });

    expect(() => readItem('key')).toThrow(
      expect.objectContaining({ name: 'StorageError', code: 'unavailable' })
    );
  });

  it('reports a full quota distinctly', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw quotaError();
    });

    expect(() => writeItem('key', 'value')).toThrow(
      expect.objectContaining({ code: 'quota-exceeded' })
    );
  });

  it('reports other write failures as write-failed', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('unknown');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('unknown');
    });

    expect(() => writeItem('key', 'value')).toThrow(
      expect.objectContaining({ code: 'write-failed' })
    );
    expect(() => removeItem('key')).toThrow(
      expect.objectContaining({ code: 'write-failed' })
    );
  });

  it('recognizes quota errors from different browsers', () => {
    expect(isQuotaExceededError({ name: 'QuotaExceededError' })).toBe(true);
    expect(isQuotaExceededError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe(true);
    expect(isQuotaExceededError({ code: 22 })).toBe(true);
    expect(isQuotaExceededError({ code: 1014 })).toBe(true);
    expect(isQuotaExceededError(new Error('other'))).toBe(false);
  });
});
