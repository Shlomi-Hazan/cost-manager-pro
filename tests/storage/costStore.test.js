import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCostStore } from '../../src/lib/storage/costStore.js';
import {
  appDataKey,
  appPendingSnapshotKey,
  appSnapshotKey,
  currentDocument,
  legacyCosts,
  makeCost,
  quotaError
} from './fixtures.js';

const now = new Date('2026-10-09T08:15:00.000Z');

function readSnapshot() {
  const value = localStorage.getItem(appSnapshotKey);

  return value === null ? null : JSON.parse(value);
}

// Makes setItem fail only for the given key, like a quota error that hits
// one write in the middle of an operation.
function failWritesTo(key, error = quotaError()) {
  const realSetItem = Storage.prototype.setItem;

  return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function setItem(itemKey, value) {
    if (itemKey === key) {
      throw error;
    }

    return realSetItem.call(this, itemKey, value);
  });
}

// Simulates a browser that reports a different value than was written:
// reads of the data key return 'unexpected' whenever the stored value is no
// longer `originalValue`.
function misreportWrittenData(originalValue) {
  const realGetItem = Storage.prototype.getItem;

  return vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function getItem(key) {
    const value = realGetItem.call(this, key);

    return key === appDataKey && value !== originalValue ? 'unexpected' : value;
  });
}

describe('cost store', () => {
  let store;

  beforeEach(() => {
    localStorage.clear();
    store = createCostStore(appDataKey);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe('reading', () => {
    it('treats a missing key as an empty, writable dataset', () => {
      expect(store.inspect()).toMatchObject({ status: 'empty', costs: [], rawValue: null });
      expect(store.readCosts()).toEqual([]);
    });

    it('reads a valid dataset', () => {
      localStorage.setItem(appDataKey, currentDocument(legacyCosts));

      expect(store.inspect().status).toBe('ready');
      expect(store.readCosts()).toEqual(legacyCosts);
    });

    it('distinguishes damaged data from an empty dataset and keeps the raw value', () => {
      localStorage.setItem(appDataKey, '[{"id": "x"');

      const state = store.inspect();

      expect(state.status).toBe('damaged');
      expect(state.rawValue).toBe('[{"id": "x"');
      expect(() => store.readCosts()).toThrow(expect.objectContaining({ code: 'damaged' }));
    });

    it('reports unreadable storage separately from malformed JSON', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('Access denied', 'SecurityError');
      });

      expect(store.inspect().status).toBe('unavailable');
      expect(() => store.readCosts()).toThrow(expect.objectContaining({ code: 'unavailable' }));
    });

    it('reports data from a newer schema as unsupported', () => {
      localStorage.setItem(appDataKey, '{"schemaVersion": 99, "costs": []}');

      expect(store.inspect().status).toBe('unsupported');
      expect(() => store.readCosts()).toThrow(
        expect.objectContaining({ code: 'unsupported-version' })
      );
    });
  });

  describe('ordinary saves', () => {
    it('saves in the current versioned format', () => {
      store.modifyCosts((costs) => [...costs, makeCost()], now);

      expect(JSON.parse(localStorage.getItem(appDataKey))).toEqual({
        schemaVersion: 1,
        costs: [makeCost()]
      });
    });

    it.each([
      ['malformed JSON', '{not valid JSON'],
      ['a non-array root', '{"some": "object"}'],
      ['an invalid record', currentDocument([makeCost({ currency: 'XYZ' })])],
      ['a duplicate id', currentDocument([makeCost(), makeCost()])],
      ['a newer schema version', '{"schemaVersion": 2, "costs": []}']
    ])('never overwrites stored data containing %s', (_label, rawValue) => {
      localStorage.setItem(appDataKey, rawValue);
      const change = vi.fn((costs) => [...costs, makeCost({ id: 'new' })]);

      expect(() => store.modifyCosts(change, now)).toThrow();
      expect(change).not.toHaveBeenCalled();
      expect(localStorage.getItem(appDataKey)).toBe(rawValue);
      expect(localStorage.getItem(appSnapshotKey)).toBeNull();
    });

    it('does not write anything when storage cannot be read', () => {
      const setItem = vi.spyOn(Storage.prototype, 'setItem');

      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('Access denied', 'SecurityError');
      });

      expect(() => store.modifyCosts((costs) => costs, now)).toThrow(
        expect.objectContaining({ code: 'unavailable' })
      );
      expect(setItem).not.toHaveBeenCalled();
    });

    it('reports a full quota and leaves stored data unchanged', () => {
      const before = currentDocument([makeCost()]);

      localStorage.setItem(appDataKey, before);
      failWritesTo(appDataKey);

      expect(() =>
        store.modifyCosts((costs) => [...costs, makeCost({ id: 'new' })], now)
      ).toThrow(expect.objectContaining({ code: 'quota-exceeded' }));
      expect(localStorage.getItem(appDataKey)).toBe(before);
    });

    it('reports other write failures without changing stored data', () => {
      const before = currentDocument([makeCost()]);

      localStorage.setItem(appDataKey, before);
      failWritesTo(appDataKey, new Error('disk error'));

      expect(() => store.modifyCosts((costs) => costs, now)).toThrow(
        expect.objectContaining({ code: 'write-failed' })
      );
      expect(localStorage.getItem(appDataKey)).toBe(before);
    });

    it('rejects a change that would store an invalid record', () => {
      localStorage.setItem(appDataKey, currentDocument([makeCost()]));

      expect(() =>
        store.modifyCosts((costs) => [...costs, makeCost()], now)
      ).toThrow(expect.objectContaining({ code: 'damaged' }));
      expect(store.readCosts()).toEqual([makeCost()]);
    });
  });

  describe('migration from the pre-M1 layout', () => {
    it('keeps the original value as previous data on the first save, then upgrades', () => {
      const legacyRaw = JSON.stringify(legacyCosts);

      localStorage.setItem(appDataKey, legacyRaw);
      store.modifyCosts((costs) => [...costs, makeCost({ id: 'new' })], now);

      expect(readSnapshot()).toMatchObject({
        reason: 'schema-migration',
        createdAt: now.toISOString(),
        rawValue: legacyRaw
      });
      expect(JSON.parse(localStorage.getItem(appDataKey))).toEqual({
        schemaVersion: 1,
        costs: [...legacyCosts, makeCost({ id: 'new' })]
      });
    });

    it('does not change storage just by reading old data, however often', () => {
      const legacyRaw = JSON.stringify(legacyCosts);

      localStorage.setItem(appDataKey, legacyRaw);

      for (let attempt = 0; attempt < 3; attempt += 1) {
        expect(store.readCosts()).toEqual(legacyCosts);
      }

      expect(localStorage.getItem(appDataKey)).toBe(legacyRaw);
      expect(localStorage.getItem(appSnapshotKey)).toBeNull();
    });

    it('stays safe when a migration is interrupted, and can simply be retried', () => {
      const legacyRaw = JSON.stringify(legacyCosts);

      localStorage.setItem(appDataKey, legacyRaw);
      const failure = failWritesTo(appDataKey);

      expect(() => store.modifyCosts((costs) => costs, now)).toThrow();
      // The source is untouched and still readable. Since the M1 hardening
      // the safety copy is only staged, and is discarded when the data
      // write fails, so no slot holds a stale copy.
      expect(localStorage.getItem(appDataKey)).toBe(legacyRaw);
      expect(localStorage.getItem(appSnapshotKey)).toBeNull();
      expect(localStorage.getItem(appPendingSnapshotKey)).toBeNull();

      failure.mockRestore();
      store.modifyCosts((costs) => costs, now);

      expect(store.inspect().sourceSchemaVersion).toBe(1);
      expect(store.readCosts()).toEqual(legacyCosts);
      expect(readSnapshot().rawValue).toBe(legacyRaw);
    });

    it('only takes the migration safety copy once', () => {
      localStorage.setItem(appDataKey, JSON.stringify(legacyCosts));
      store.modifyCosts((costs) => costs, now);
      const firstSnapshot = localStorage.getItem(appSnapshotKey);

      store.modifyCosts((costs) => [...costs, makeCost({ id: 'later' })], new Date('2027-01-01T00:00:00Z'));

      expect(localStorage.getItem(appSnapshotKey)).toBe(firstSnapshot);
    });
  });

  describe('replacing the whole dataset', () => {
    it('keeps the current data as previous data before replacing it', () => {
      const before = currentDocument([makeCost()]);
      const replacement = [makeCost({ id: 'restored', sum: 42 })];

      localStorage.setItem(appDataKey, before);
      store.replaceAllCosts(replacement, 'restore', now);

      expect(store.readCosts()).toEqual(replacement);
      expect(readSnapshot()).toEqual({
        format: 'cost-manager-pro-previous-data',
        reason: 'restore',
        createdAt: now.toISOString(),
        rawValue: before
      });
    });

    it('validates everything before changing anything', () => {
      const before = currentDocument([makeCost()]);

      localStorage.setItem(appDataKey, before);

      expect(() =>
        store.replaceAllCosts([makeCost({ id: 'ok' }), { id: 'broken' }], 'restore', now)
      ).toThrow();
      expect(localStorage.getItem(appDataKey)).toBe(before);
      expect(localStorage.getItem(appSnapshotKey)).toBeNull();
    });

    it('changes nothing when the safety copy cannot be saved', () => {
      const before = currentDocument([makeCost()]);

      localStorage.setItem(appDataKey, before);
      // The safety copy is staged under the pending key first.
      failWritesTo(appPendingSnapshotKey);

      expect(() =>
        store.replaceAllCosts([makeCost({ id: 'new' })], 'restore', now)
      ).toThrow(expect.objectContaining({ code: 'quota-exceeded' }));
      expect(localStorage.getItem(appDataKey)).toBe(before);
      expect(localStorage.getItem(appSnapshotKey)).toBeNull();
    });

    it('leaves current data unchanged when writing the replacement fails', () => {
      const before = currentDocument([makeCost()]);

      localStorage.setItem(appDataKey, before);
      failWritesTo(appDataKey);

      expect(() =>
        store.replaceAllCosts([makeCost({ id: 'new' })], 'restore', now)
      ).toThrow(expect.objectContaining({ code: 'quota-exceeded' }));
      expect(localStorage.getItem(appDataKey)).toBe(before);
    });

    it('puts the previous value back when the written data cannot be verified', () => {
      const before = currentDocument([makeCost()]);

      localStorage.setItem(appDataKey, before);
      // Once the new value has been written, reading it back returns
      // something else.
      misreportWrittenData(before);

      expect(() =>
        store.replaceAllCosts([makeCost({ id: 'new' })], 'restore', now)
      ).toThrow(expect.objectContaining({ code: 'write-failed' }));
      vi.restoreAllMocks();
      expect(localStorage.getItem(appDataKey)).toBe(before);
    });

    it('can replace damaged data, keeping the damaged value as previous data', () => {
      localStorage.setItem(appDataKey, '{damaged');
      store.replaceAllCosts([], 'reset', now);

      expect(store.inspect().status).toBe('ready');
      expect(store.readCosts()).toEqual([]);
      expect(store.getPreviousData()).toMatchObject({
        reason: 'reset',
        rawValue: '{damaged',
        isRestorable: false,
        costCount: null
      });
    });

    it('does not let an empty dataset replace an earlier safety copy', () => {
      localStorage.setItem(appDataKey, '{damaged');
      store.replaceAllCosts([], 'reset', now);

      // Restoring into the now-empty dataset must keep the damaged value.
      store.replaceAllCosts([makeCost()], 'restore', new Date('2026-10-10T00:00:00Z'));

      expect(store.getPreviousData().rawValue).toBe('{damaged');
      expect(store.readCosts()).toEqual([makeCost()]);
    });
  });

  describe('previous data', () => {
    it('is null when nothing has been replaced', () => {
      expect(store.getPreviousData()).toBeNull();
    });

    it('can be restored, and restoring can be undone', () => {
      const original = [makeCost()];
      const replacement = [makeCost({ id: 'restored', sum: 7 })];

      localStorage.setItem(appDataKey, currentDocument(original));
      store.replaceAllCosts(replacement, 'restore', now);

      expect(store.getPreviousData()).toMatchObject({ isRestorable: true, costCount: 1 });
      expect(store.restorePreviousData(now)).toEqual(original);
      expect(store.readCosts()).toEqual(original);

      store.restorePreviousData(now);
      expect(store.readCosts()).toEqual(replacement);
    });

    it('refuses to restore previous data that cannot be read', () => {
      localStorage.setItem(appDataKey, '{damaged');
      store.replaceAllCosts([makeCost()], 'reset', now);

      expect(() => store.restorePreviousData(now)).toThrow();
      expect(store.readCosts()).toEqual([makeCost()]);
    });

    it('treats an unrecognized safety copy as downloadable but not restorable', () => {
      localStorage.setItem(appSnapshotKey, 'not a snapshot');

      expect(store.getPreviousData()).toEqual({
        reason: 'unknown',
        createdAt: null,
        rawValue: 'not a snapshot',
        costCount: null,
        isRestorable: false
      });
    });
  });
});
