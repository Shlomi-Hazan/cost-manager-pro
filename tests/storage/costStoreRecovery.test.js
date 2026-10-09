import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCostStore } from '../../src/lib/storage/costStore.js';
import {
  appDataKey,
  appPendingSnapshotKey,
  appSnapshotKey,
  currentDocument,
  makeCost,
  quotaError
} from './fixtures.js';

/*
 * M1 hardening: failures in the middle of a replacement or an undo must
 * never destroy the last recoverable copy. Each test checks the values
 * actually left in storage, not only the thrown error.
 *
 * Starting point used by most tests (set up through the real API):
 *   data     = CURRENT   (what the user sees now)
 *   snapshot = EARLIER   (the "previous data" an undo would restore)
 */
const now = new Date('2026-10-09T08:15:00.000Z');
const earlierCosts = [makeCost({ id: 'earlier', sum: 1234.56789 })];
const currentCosts = [makeCost({ id: 'current', sum: 0.1, currency: 'EURO' })];
const earlierRaw = currentDocument(earlierCosts);
const currentRaw = currentDocument(currentCosts);

function storedSnapshotRaw() {
  const record = localStorage.getItem(appSnapshotKey);

  return record === null ? null : JSON.parse(record).rawValue;
}

function storedPendingRaw() {
  const record = localStorage.getItem(appPendingSnapshotKey);

  return record === null ? null : JSON.parse(record).rawValue;
}

function expectUnchangedStartingPoint() {
  expect(localStorage.getItem(appDataKey)).toBe(currentRaw);
  expect(storedSnapshotRaw()).toBe(earlierRaw);
}

// Lets each listed key fail on its Nth write (1-based) with the given error.
function failWrites(plan) {
  const realSetItem = Storage.prototype.setItem;
  const counts = {};

  return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function setItem(key, value) {
    counts[key] = (counts[key] ?? 0) + 1;
    const rule = plan[key];

    if (rule && (rule.on === undefined || rule.on.includes(counts[key]))) {
      throw rule.error ?? quotaError();
    }

    return realSetItem.call(this, key, value);
  });
}

describe('cost store recovery safety', () => {
  let store;

  beforeEach(() => {
    localStorage.clear();
    store = createCostStore(appDataKey);
    localStorage.setItem(appDataKey, earlierRaw);
    store.replaceAllCosts(currentCosts, 'restore', now);
    expectUnchangedStartingPoint();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe('replacing data', () => {
    it('keeps the earlier snapshot when the data write fails', () => {
      failWrites({ [appDataKey]: {} });

      expect(() =>
        store.replaceAllCosts([makeCost({ id: 'incoming' })], 'restore', now)
      ).toThrow(expect.objectContaining({ code: 'quota-exceeded' }));
      vi.restoreAllMocks();

      // Before the fix, the snapshot was overwritten with CURRENT here and
      // EARLIER was lost.
      expectUnchangedStartingPoint();
      expect(localStorage.getItem(appPendingSnapshotKey)).toBeNull();
    });

    it('keeps everything when the safety copy cannot be staged', () => {
      failWrites({ [appPendingSnapshotKey]: {} });

      expect(() =>
        store.replaceAllCosts([makeCost({ id: 'incoming' })], 'restore', now)
      ).toThrow(expect.objectContaining({ code: 'quota-exceeded' }));
      vi.restoreAllMocks();

      expectUnchangedStartingPoint();
    });
  });

  describe('undo (restore previous data)', () => {
    it('swaps data and previous data with exact values', () => {
      expect(store.restorePreviousData(now)).toEqual(earlierCosts);

      expect(localStorage.getItem(appDataKey)).toBe(earlierRaw);
      expect(storedSnapshotRaw()).toBe(currentRaw);
      expect(localStorage.getItem(appPendingSnapshotKey)).toBeNull();
      expect(store.readCosts()[0].sum).toBe(1234.56789);

      store.restorePreviousData(now);
      expectUnchangedStartingPoint();
    });

    it('keeps both copies when the data write fails', () => {
      failWrites({ [appDataKey]: {} });

      expect(() => store.restorePreviousData(now)).toThrow(
        expect.objectContaining({ code: 'quota-exceeded' })
      );
      vi.restoreAllMocks();

      expectUnchangedStartingPoint();
      expect(localStorage.getItem(appPendingSnapshotKey)).toBeNull();
    });

    it('keeps both copies when the data write fails and the cleanup fails too', () => {
      // The scenario from the review: the main write fails and the follow-up
      // repair/cleanup also fails.
      failWrites({ [appDataKey]: {} });
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new Error('cleanup failed');
      });

      expect(() => store.restorePreviousData(now)).toThrow();
      vi.restoreAllMocks();

      expectUnchangedStartingPoint();
      // The leftover staged copy duplicates the unchanged data and is not
      // mistaken for previous data.
      expect(storedPendingRaw()).toBe(currentRaw);
      expect(store.getPreviousData()).toMatchObject({ rawValue: earlierRaw, isRestorable: true });

      // A later undo still works and clears the leftover.
      expect(store.restorePreviousData(now)).toEqual(earlierCosts);
      expect(storedSnapshotRaw()).toBe(currentRaw);
      expect(localStorage.getItem(appPendingSnapshotKey)).toBeNull();
    });

    it('keeps everything when the safety copy cannot be staged', () => {
      failWrites({ [appPendingSnapshotKey]: {} });

      expect(() => store.restorePreviousData(now)).toThrow(
        expect.objectContaining({ code: 'quota-exceeded' })
      );
      vi.restoreAllMocks();

      expectUnchangedStartingPoint();
    });

    it('completes the undo when only the final snapshot update fails, and reports the right previous data', () => {
      // The snapshot slot rejects its update (the promotion step).
      failWrites({ [appSnapshotKey]: {} });

      expect(store.restorePreviousData(now)).toEqual(earlierCosts);
      vi.restoreAllMocks();

      expect(localStorage.getItem(appDataKey)).toBe(earlierRaw);
      // CURRENT is still held under the pending key and is what the app
      // reports as previous data.
      expect(storedPendingRaw()).toBe(currentRaw);
      expect(store.getPreviousData()).toMatchObject({ rawValue: currentRaw, isRestorable: true });

      // The next operation settles it.
      store.restorePreviousData(now);
      expectUnchangedStartingPoint();
      expect(localStorage.getItem(appPendingSnapshotKey)).toBeNull();
    });

    it('puts the data back when the restored value cannot be verified', () => {
      const realGetItem = Storage.prototype.getItem;

      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function getItem(key) {
        const value = realGetItem.call(this, key);

        return key === appDataKey && value === earlierRaw ? 'unexpected' : value;
      });

      expect(() => store.restorePreviousData(now)).toThrow(
        expect.objectContaining({ code: 'write-failed' })
      );
      vi.restoreAllMocks();

      expectUnchangedStartingPoint();
      expect(localStorage.getItem(appPendingSnapshotKey)).toBeNull();
    });

    it('reports an incomplete recovery accurately and keeps a recoverable copy', () => {
      const realGetItem = Storage.prototype.getItem;

      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function getItem(key) {
        const value = realGetItem.call(this, key);

        return key === appDataKey && value === earlierRaw ? 'unexpected' : value;
      });
      // The first data write (the restore) succeeds; the rollback write fails.
      failWrites({ [appDataKey]: { on: [2] } });

      expect(() => store.restorePreviousData(now)).toThrow(
        expect.objectContaining({ code: 'recovery-incomplete' })
      );
      vi.restoreAllMocks();

      // CURRENT survives under the pending key, EARLIER in the snapshot
      // slot (and in the data key).
      expect(storedPendingRaw()).toBe(currentRaw);
      expect(storedSnapshotRaw()).toBe(earlierRaw);
      expect(store.getPreviousData()).toMatchObject({ rawValue: currentRaw, isRestorable: true });
    });
  });

  describe('interrupted undo (tab closed between steps)', () => {
    it('after staging only: the data was not replaced, so the snapshot is still previous data', () => {
      localStorage.setItem(
        appPendingSnapshotKey,
        JSON.stringify({ format: 'cost-manager-pro-previous-data', reason: 'undo', createdAt: now.toISOString(), rawValue: currentRaw })
      );

      expect(store.getPreviousData()).toMatchObject({ rawValue: earlierRaw });
      expect(store.restorePreviousData(now)).toEqual(earlierCosts);
      expect(storedSnapshotRaw()).toBe(currentRaw);
      expect(localStorage.getItem(appPendingSnapshotKey)).toBeNull();
    });

    it('after the data write: the staged copy is the previous data and nothing is lost', () => {
      localStorage.setItem(appDataKey, earlierRaw);
      localStorage.setItem(
        appPendingSnapshotKey,
        JSON.stringify({ format: 'cost-manager-pro-previous-data', reason: 'undo', createdAt: now.toISOString(), rawValue: currentRaw })
      );

      expect(store.readCosts()).toEqual(earlierCosts);
      expect(store.getPreviousData()).toMatchObject({ rawValue: currentRaw, isRestorable: true });

      expect(store.restorePreviousData(now)).toEqual(currentCosts);
      expect(localStorage.getItem(appDataKey)).toBe(currentRaw);
      expect(storedSnapshotRaw()).toBe(earlierRaw);
      expect(localStorage.getItem(appPendingSnapshotKey)).toBeNull();
    });

    it('never promotes an unreadable pending record over the real snapshot', () => {
      localStorage.setItem(appPendingSnapshotKey, 'not a record');

      expect(store.getPreviousData()).toMatchObject({ rawValue: earlierRaw });
      store.replaceAllCosts([makeCost({ id: 'incoming' })], 'restore', now);
      expect(storedSnapshotRaw()).toBe(currentRaw);
    });
  });

  describe('changes from another tab', () => {
    it('refuses a replacement when the data changed after it was read', () => {
      const otherTabRaw = currentDocument([makeCost({ id: 'other-tab' })]);
      const realSetItem = Storage.prototype.setItem;

      // Another tab saves at the moment this tab stages its safety copy.
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function setItem(key, value) {
        realSetItem.call(this, key, value);

        if (key === appPendingSnapshotKey) {
          realSetItem.call(this, appDataKey, otherTabRaw);
        }
      });

      expect(() =>
        store.replaceAllCosts([makeCost({ id: 'incoming' })], 'restore', now)
      ).toThrow(expect.objectContaining({ code: 'conflict' }));
      vi.restoreAllMocks();

      expect(localStorage.getItem(appDataKey)).toBe(otherTabRaw);
      expect(storedSnapshotRaw()).toBe(earlierRaw);
      expect(localStorage.getItem(appPendingSnapshotKey)).toBeNull();
    });

    it('refuses an ordinary save when the data changed after it was read', () => {
      const otherTabRaw = currentDocument([makeCost({ id: 'other-tab' })]);

      expect(() =>
        store.modifyCosts((costs) => {
          // Another tab saves while this change is being prepared.
          localStorage.setItem(appDataKey, otherTabRaw);

          return [...costs, makeCost({ id: 'mine' })];
        }, now)
      ).toThrow(expect.objectContaining({ code: 'conflict' }));

      expect(localStorage.getItem(appDataKey)).toBe(otherTabRaw);
    });
  });
});
