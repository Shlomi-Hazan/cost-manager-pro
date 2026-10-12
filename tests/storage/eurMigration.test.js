import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { costsDatabase } from '../../src/lib/costsDatabase.js';
import {
  createBackup,
  parseBackup,
  serializeBackup
} from '../../src/lib/storage/backupFormat.js';
import {
  currentCostSchemaVersion,
  migrateCostDocument,
  parseCostDocument,
  serializeCostDocument
} from '../../src/lib/storage/costDocument.js';
import { createCostStore } from '../../src/lib/storage/costStore.js';
import {
  applyRestore,
  buildBackupFile,
  getDataStatus,
  importLegacyCopy,
  prepareRestore,
  restorePreviousData
} from '../../src/services/dataManagementService.js';
import {
  appDataKey,
  appPendingSnapshotKey,
  appSnapshotKey,
  makeCost,
  originalAppKeys,
  quotaError,
  schemaOneDocument
} from './fixtures.js';

/*
 * M2A.3: the EURO -> EUR schema migration (schema 1 -> 2) and everything that
 * must survive it: exact values, record order, ids, recovery snapshots,
 * backups, legacy import, and interrupted operations. Money amounts that are
 * easy to corrupt are used on purpose.
 */
const now = new Date('2026-10-12T08:15:00.000Z');

// A schema 1 dataset: EURO records among others, with excess precision, zero,
// negative and huge amounts, and two records that look identical but have
// different ids.
const schemaOneCosts = [
  makeCost({ id: 'a', sum: 1234.56789, currency: 'EURO', description: 'Café ☕ "quoted" — עברית' }),
  makeCost({ id: 'b', sum: 1e-21, currency: 'USD', category: 'Tiny' }),
  makeCost({ id: 'c', sum: 0, currency: 'EURO', category: 'Zero' }),
  makeCost({ id: 'd', sum: -5.5, currency: 'GBP', category: 'Refund' }),
  makeCost({ id: 'e', sum: 123456789012345680000, currency: 'ILS', category: 'Huge' }),
  makeCost({ id: 'dup-1', sum: 10, currency: 'EURO', description: 'same' }),
  makeCost({ id: 'dup-2', sum: 10, currency: 'EURO', description: 'same' }),
  makeCost({ id: 'f', sum: 0.1 + 0.2, currency: 'EURO', category: 'Float' })
];

function upgraded(costs) {
  return costs.map((cost) => (cost.currency === 'EURO' ? { ...cost, currency: 'EUR' } : cost));
}

function allStorage() {
  return Object.fromEntries(Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)]));
}

function failWritesTo(key, error = quotaError()) {
  const realSetItem = Storage.prototype.setItem;

  return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function setItem(itemKey, value) {
    if (itemKey === key) {
      throw error;
    }

    return realSetItem.call(this, itemKey, value);
  });
}

function schemaOneBackup(costs, overrides = {}) {
  return JSON.stringify({
    format: 'cost-manager-pro-backup',
    formatVersion: 1,
    exportedAt: '2026-10-01T10:00:00.000Z',
    app: 'Cost Manager Pro',
    costCount: costs.length,
    costs,
    ...overrides
  });
}

describe('schema 1 -> 2 migration (pure)', () => {
  it('is the current schema version', () => {
    expect(currentCostSchemaVersion).toBe(2);
  });

  it('changes only the euro identifier, and keeps order, ids, and every other field', () => {
    const { costs, sourceSchemaVersion } = parseCostDocument(schemaOneDocument(schemaOneCosts));

    expect(sourceSchemaVersion).toBe(1);
    expect(costs).toEqual(upgraded(schemaOneCosts));
    costs.forEach((cost, index) => {
      const before = schemaOneCosts[index];

      // Every field except the currency is identical, in the same key order.
      expect({ ...cost, currency: before.currency }).toEqual(before);
      expect(Object.keys(cost)).toEqual(Object.keys(before));
    });
    expect(costs.map((cost) => cost.id)).toEqual(schemaOneCosts.map((cost) => cost.id));
    expect(costs.filter((cost) => cost.currency === 'EURO')).toEqual([]);
  });

  it('preserves amounts bit for bit, including excess precision, zero and negatives', () => {
    const { costs } = parseCostDocument(schemaOneDocument(schemaOneCosts));

    costs.forEach((cost, index) => {
      expect(Object.is(cost.sum, schemaOneCosts[index].sum)).toBe(true);
    });
    // The serialized form carries the same JSON number text.
    const serialized = JSON.parse(serializeCostDocument(costs)).costs.map((cost) => cost.sum);

    expect(serialized).toEqual(schemaOneCosts.map((cost) => cost.sum));
    expect(serializeCostDocument(costs)).toContain('"sum":1e-21');
  });

  it('keeps duplicate-looking records distinct, and still rejects a repeated id', () => {
    const { costs } = parseCostDocument(schemaOneDocument(schemaOneCosts));

    expect(costs.filter((cost) => cost.description === 'same')).toHaveLength(2);
    expect(() =>
      parseCostDocument(schemaOneDocument([makeCost({ id: 'x' }), makeCost({ id: 'x' })]))
    ).toThrow(expect.objectContaining({ code: 'damaged' }));
  });

  it('is deterministic and idempotent', () => {
    const first = parseCostDocument(schemaOneDocument(schemaOneCosts));
    const second = parseCostDocument(schemaOneDocument(schemaOneCosts));
    const again = parseCostDocument(serializeCostDocument(first.costs));

    expect(second.costs).toEqual(first.costs);
    expect(again.costs).toEqual(first.costs);
    expect(again.sourceSchemaVersion).toBe(2);
    expect(serializeCostDocument(again.costs)).toBe(serializeCostDocument(first.costs));
  });

  it('never mutates the parsed input document', () => {
    const document = { schemaVersion: 1, costs: structuredClone(schemaOneCosts) };
    const frozenCopy = structuredClone(document);

    migrateCostDocument(document);
    expect(document).toEqual(frozenCopy);
  });

  it('upgrades the pre-M1 bare-array layout all the way, EURO included', () => {
    const { costs, sourceSchemaVersion } = parseCostDocument(JSON.stringify(schemaOneCosts));

    expect(sourceSchemaVersion).toBe(0);
    expect(costs).toEqual(upgraded(schemaOneCosts));
  });

  it.each([
    ['lower case', 'euro'],
    ['mixed case', 'Euro'],
    ['trailing space', 'EURO '],
    ['leading space', ' EURO'],
    ['an unknown code', 'XYZ'],
    ['a similar code', 'EUROS'],
    ['an empty string', ''],
    ['a non-string', 5],
    ['null', null]
  ])('never turns %s into a valid euro: the dataset is reported as damaged', (_label, currency) => {
    expect(() =>
      parseCostDocument(schemaOneDocument([makeCost({ currency })]))
    ).toThrow(expect.objectContaining({ code: 'damaged', details: expect.objectContaining({ reason: 'invalid-record' }) }));
  });

  it('rejects a schema 1 record that already says EUR (it was never valid then)', () => {
    expect(() => parseCostDocument(schemaOneDocument([makeCost({ currency: 'EUR' })]))).toThrow(
      expect.objectContaining({ code: 'damaged' })
    );
    expect(() => parseCostDocument(JSON.stringify([makeCost({ currency: 'EUR' })]))).toThrow(
      expect.objectContaining({ code: 'damaged' })
    );
  });

  it('rejects EURO in a schema 2 document, because it should have been upgraded', () => {
    expect(() =>
      parseCostDocument(JSON.stringify({ schemaVersion: 2, costs: [makeCost({ currency: 'EURO' })] }))
    ).toThrow(expect.objectContaining({ code: 'damaged' }));
  });

  it('never downgrades or reads a newer schema', () => {
    const raw = JSON.stringify({ schemaVersion: 3, costs: [makeCost()] });

    expect(() => parseCostDocument(raw)).toThrow(expect.objectContaining({ code: 'unsupported-version' }));
  });

  it.each([
    ['costs is not a list', '{"schemaVersion": 1, "costs": {}}'],
    ['a null record', '{"schemaVersion": 1, "costs": [null]}'],
    ['a record that is a string', '{"schemaVersion": 1, "costs": ["EURO"]}'],
    ['malformed JSON', '{"schemaVersion": 1, "costs": [']
  ])('reports %s as damaged without throwing anything else', (_label, raw) => {
    expect(() => parseCostDocument(raw)).toThrow(expect.objectContaining({ code: 'damaged' }));
  });

  it('keeps legacy zero, negative, huge, and long-decimal amounts readable', () => {
    const { costs } = parseCostDocument(schemaOneDocument(schemaOneCosts));

    expect(costs.map((cost) => cost.sum)).toEqual(schemaOneCosts.map((cost) => cost.sum));
  });
});

describe('migration through the cost store (M1 safety path)', () => {
  let store;

  beforeEach(() => {
    localStorage.clear();
    store = createCostStore(appDataKey);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reading old data never writes, however often', () => {
    const raw = schemaOneDocument(schemaOneCosts);

    localStorage.setItem(appDataKey, raw);
    const before = allStorage();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem');

    for (let index = 0; index < 3; index += 1) {
      expect(store.readCosts()).toEqual(upgraded(schemaOneCosts));
      expect(store.inspect()).toMatchObject({ status: 'ready', sourceSchemaVersion: 1 });
      expect(costsDatabase.getAllCosts()).toEqual(upgraded(schemaOneCosts));
      expect(getDataStatus()).toMatchObject({ status: 'ready', costCount: schemaOneCosts.length });
    }

    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(allStorage()).toEqual(before);
  });

  it('the first save keeps the exact old value as previous data, then writes schema 2', () => {
    const raw = schemaOneDocument(schemaOneCosts);

    localStorage.setItem(appDataKey, raw);
    store.modifyCosts((costs) => [...costs, makeCost({ id: 'new', currency: 'EUR' })], now);

    expect(JSON.parse(localStorage.getItem(appSnapshotKey))).toEqual({
      format: 'cost-manager-pro-previous-data',
      reason: 'schema-migration',
      createdAt: now.toISOString(),
      rawValue: raw
    });
    expect(localStorage.getItem(appPendingSnapshotKey)).toBeNull();
    const saved = JSON.parse(localStorage.getItem(appDataKey));

    expect(saved.schemaVersion).toBe(2);
    expect(saved.costs).toEqual([...upgraded(schemaOneCosts), makeCost({ id: 'new', currency: 'EUR' })]);
    expect(localStorage.getItem(appDataKey)).not.toContain('EURO');
  });

  it('a refresh between the migration and the next save changes nothing and adds no second snapshot', () => {
    localStorage.setItem(appDataKey, schemaOneDocument(schemaOneCosts));
    store.modifyCosts((costs) => costs, now);
    const snapshot = localStorage.getItem(appSnapshotKey);
    const data = localStorage.getItem(appDataKey);

    // "Refresh": a brand-new store instance reads what is stored.
    const reloaded = createCostStore(appDataKey);

    expect(reloaded.inspect()).toMatchObject({ status: 'ready', sourceSchemaVersion: 2 });
    expect(allStorage()[appDataKey]).toBe(data);
    reloaded.modifyCosts((costs) => [...costs, makeCost({ id: 'later', currency: 'USD' })], new Date('2027-01-01T00:00:00Z'));
    expect(localStorage.getItem(appSnapshotKey)).toBe(snapshot);
  });

  it('migrating twice (repeated saves) is stable', () => {
    localStorage.setItem(appDataKey, schemaOneDocument(schemaOneCosts));
    store.modifyCosts((costs) => costs, now);
    const once = localStorage.getItem(appDataKey);

    store.modifyCosts((costs) => costs, now);
    expect(localStorage.getItem(appDataKey)).toBe(once);
  });

  it('undo after a migration brings back the old data (upgraded), and can be undone again', () => {
    const raw = schemaOneDocument(schemaOneCosts);

    localStorage.setItem(appDataKey, raw);
    store.modifyCosts((costs) => [...costs, makeCost({ id: 'new', currency: 'USD' })], now);

    expect(store.readCosts()).toHaveLength(schemaOneCosts.length + 1);
    const restored = store.restorePreviousData(now);

    expect(restored).toEqual(upgraded(schemaOneCosts));
    expect(store.readCosts()).toEqual(upgraded(schemaOneCosts));
    // The data that was replaced is now the previous data: undo is reversible.
    expect(store.getPreviousData()).toMatchObject({ isRestorable: true, costCount: schemaOneCosts.length + 1 });
    expect(JSON.parse(localStorage.getItem(appDataKey)).schemaVersion).toBe(2);
    expect(localStorage.getItem(appDataKey)).not.toContain('EURO');
  });

  describe('failure injection during the migrating save', () => {
    const raw = schemaOneDocument(schemaOneCosts);

    beforeEach(() => {
      localStorage.setItem(appDataKey, raw);
    });

    it('quota exceeded writing the data: old data untouched, nothing staged, retry works', () => {
      const failure = failWritesTo(appDataKey);

      expect(() => store.modifyCosts((costs) => costs, now)).toThrow(
        expect.objectContaining({ code: 'quota-exceeded' })
      );
      expect(localStorage.getItem(appDataKey)).toBe(raw);
      expect(localStorage.getItem(appSnapshotKey)).toBeNull();
      expect(localStorage.getItem(appPendingSnapshotKey)).toBeNull();
      expect(store.readCosts()).toEqual(upgraded(schemaOneCosts));

      failure.mockRestore();
      store.modifyCosts((costs) => costs, now);
      expect(JSON.parse(localStorage.getItem(appDataKey)).schemaVersion).toBe(2);
      expect(JSON.parse(localStorage.getItem(appSnapshotKey)).rawValue).toBe(raw);
    });

    it('cannot stage the safety copy: nothing changes at all', () => {
      failWritesTo(appPendingSnapshotKey);

      expect(() => store.modifyCosts((costs) => costs, now)).toThrow();
      expect(localStorage.getItem(appDataKey)).toBe(raw);
      expect(localStorage.getItem(appSnapshotKey)).toBeNull();
    });

    it('fails the final snapshot step: the new data is saved and the old value is still recoverable', () => {
      failWritesTo(appSnapshotKey);

      store.modifyCosts((costs) => costs, now);
      expect(JSON.parse(localStorage.getItem(appDataKey)).schemaVersion).toBe(2);
      // Staged copy stays under the pending key and is still reported.
      expect(store.getPreviousData()).toMatchObject({ reason: 'schema-migration', isRestorable: true });
      expect(JSON.parse(localStorage.getItem(appPendingSnapshotKey)).rawValue).toBe(raw);
    });

    it('the written value cannot be verified: the old data is put back', () => {
      const realGetItem = Storage.prototype.getItem;

      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function getItem(key) {
        const value = realGetItem.call(this, key);

        return key === appDataKey && value !== raw ? 'unexpected' : value;
      });

      expect(() => store.modifyCosts((costs) => costs, now)).toThrow(
        expect.objectContaining({ code: 'write-failed' })
      );
      vi.restoreAllMocks();
      expect(localStorage.getItem(appDataKey)).toBe(raw);
    });

    it('verification fails and the put-back fails too: reported, and a recoverable copy remains', () => {
      const realGetItem = Storage.prototype.getItem;
      const realSetItem = Storage.prototype.setItem;
      let dataWrites = 0;

      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function getItem(key) {
        const value = realGetItem.call(this, key);

        return key === appDataKey && value !== raw ? 'unexpected' : value;
      });
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function setItem(key, value) {
        if (key === appDataKey) {
          dataWrites += 1;

          if (dataWrites > 1) {
            throw quotaError();
          }
        }

        return realSetItem.call(this, key, value);
      });

      expect(() => store.modifyCosts((costs) => costs, now)).toThrow(
        expect.objectContaining({ code: 'recovery-incomplete' })
      );
      vi.restoreAllMocks();
      // The old value still exists in the staged safety copy.
      expect(JSON.parse(localStorage.getItem(appPendingSnapshotKey)).rawValue).toBe(raw);
    });

    it('interrupted after staging only (tab closed): data unchanged, nothing lost', () => {
      // The state left by a tab that closed after step 1 of the commit.
      localStorage.setItem(
        appPendingSnapshotKey,
        JSON.stringify({
          format: 'cost-manager-pro-previous-data',
          reason: 'schema-migration',
          createdAt: now.toISOString(),
          rawValue: raw
        })
      );

      expect(store.readCosts()).toEqual(upgraded(schemaOneCosts));
      expect(localStorage.getItem(appDataKey)).toBe(raw);
      // The next save settles it and still succeeds.
      store.modifyCosts((costs) => costs, now);
      expect(JSON.parse(localStorage.getItem(appDataKey)).schemaVersion).toBe(2);
      expect(JSON.parse(localStorage.getItem(appSnapshotKey)).rawValue).toBe(raw);
    });

    it('another tab changed the data after it was read: nothing is overwritten', () => {
      const other = schemaOneDocument([makeCost({ id: 'other-tab', currency: 'EURO' })]);

      expect(() =>
        store.modifyCosts((costs) => {
          localStorage.setItem(appDataKey, other);

          return costs;
        }, now)
      ).toThrow(expect.objectContaining({ code: 'conflict' }));
      expect(localStorage.getItem(appDataKey)).toBe(other);
    });
  });

  it.each([
    ['malformed JSON', '{"schemaVersion": 1, "costs": ['],
    ['an invalid historical record', schemaOneDocument([makeCost({ sum: '5' })])],
    ['a newer schema', JSON.stringify({ schemaVersion: 3, costs: [] })],
    ['EURO inside a schema 2 document', JSON.stringify({ schemaVersion: 2, costs: [makeCost({ currency: 'EURO' })] })]
  ])('never overwrites unreadable data (%s) with an ordinary save', (_label, raw) => {
    localStorage.setItem(appDataKey, raw);
    const change = vi.fn((costs) => costs);

    expect(() => store.modifyCosts(change, now)).toThrow();
    expect(change).not.toHaveBeenCalled();
    expect(localStorage.getItem(appDataKey)).toBe(raw);
  });
});

describe('backups across the version change', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('new backups are version 2 and never contain the legacy identifier', () => {
    const backup = createBackup(upgraded(schemaOneCosts), now);

    expect(backup.formatVersion).toBe(2);
    expect(serializeBackup(backup)).not.toContain('EURO');
    expect(serializeBackup(backup)).toContain('"EUR"');
  });

  it('accepts a version 1 backup and upgrades its EURO records without touching anything else', () => {
    const text = schemaOneBackup(schemaOneCosts);
    const parsed = parseBackup(text);

    expect(parsed.costs).toEqual(upgraded(schemaOneCosts));
    expect(parsed.costCount).toBe(schemaOneCosts.length);
    parsed.costs.forEach((cost, index) => {
      expect(Object.is(cost.sum, schemaOneCosts[index].sum)).toBe(true);
    });
    // Parsing is read-only: the text the user supplied is unchanged.
    expect(text).toContain('"EURO"');
  });

  it('a backup exported after restoring a version 1 backup contains no EURO', () => {
    applyRestore(prepareRestore(schemaOneBackup(schemaOneCosts)), undefined, now);

    const file = buildBackupFile(undefined, now);

    expect(file.content).not.toContain('EURO');
    expect(JSON.parse(file.content).formatVersion).toBe(2);
    expect(parseBackup(file.content).costs).toEqual(upgraded(schemaOneCosts));
  });

  it.each([
    ['EURO in a version 2 backup', JSON.stringify({ ...JSON.parse(schemaOneBackup([makeCost({ currency: 'EURO' })])), formatVersion: 2 })],
    ['EUR in a version 1 backup', schemaOneBackup([makeCost({ currency: 'EUR' })])],
    ['an unknown currency in a version 1 backup', schemaOneBackup([makeCost({ currency: 'XYZ' })])],
    ['a repeated id', schemaOneBackup([makeCost({ id: 'x' }), makeCost({ id: 'x' })])],
    ['a count mismatch', schemaOneBackup([makeCost()], { costCount: 2 })],
    ['a newer format version', schemaOneBackup([makeCost()], { formatVersion: 3 })],
    ['malformed JSON', '{"format": "cost-manager-pro-backup", "formatVersion": 1, '],
    ['an empty file', '']
  ])('rejects %s and changes nothing', (_label, text) => {
    localStorage.setItem(appDataKey, schemaOneDocument(schemaOneCosts));
    const before = allStorage();

    expect(() => prepareRestore(text)).toThrow();
    expect(allStorage()).toEqual(before);
  });

  it('restoring a version 1 backup keeps the replaced data and can be undone', () => {
    const current = JSON.stringify({ schemaVersion: 2, costs: [makeCost({ id: 'mine', currency: 'USD' })] });

    localStorage.setItem(appDataKey, current);
    applyRestore(prepareRestore(schemaOneBackup(schemaOneCosts)), undefined, now);

    expect(costsDatabase.getAllCosts()).toEqual(upgraded(schemaOneCosts));
    expect(JSON.parse(localStorage.getItem(appDataKey)).schemaVersion).toBe(2);
    expect(JSON.parse(localStorage.getItem(appSnapshotKey)).rawValue).toBe(current);

    restorePreviousData(undefined, now);
    expect(costsDatabase.getAllCosts()).toEqual([makeCost({ id: 'mine', currency: 'USD' })]);
  });

  it('a failed restore of a version 1 backup leaves the current data and snapshots safe', () => {
    const current = JSON.stringify({ schemaVersion: 2, costs: [makeCost({ id: 'mine', currency: 'USD' })] });

    localStorage.setItem(appDataKey, current);
    const prepared = prepareRestore(schemaOneBackup(schemaOneCosts));

    failWritesTo(appDataKey);
    expect(() => applyRestore(prepared, undefined, now)).toThrow(expect.objectContaining({ code: 'quota-exceeded' }));
    vi.restoreAllMocks();

    expect(localStorage.getItem(appDataKey)).toBe(current);
    expect(localStorage.getItem(appPendingSnapshotKey)).toBeNull();
    expect(costsDatabase.getAllCosts()).toEqual([makeCost({ id: 'mine', currency: 'USD' })]);
  });

  it('previous data saved under schema 1 is still downloadable and restorable after the upgrade', () => {
    const store = createCostStore(appDataKey);
    const raw = schemaOneDocument(schemaOneCosts);

    localStorage.setItem(appDataKey, raw);
    store.modifyCosts((costs) => costs, now);

    expect(store.getPreviousData()).toMatchObject({ isRestorable: true, costCount: schemaOneCosts.length, rawValue: raw });
    expect(store.restorePreviousData(now)).toEqual(upgraded(schemaOneCosts));
  });
});

describe('importing data from the original project', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('imports a copy with EURO as EUR and leaves the original key untouched', () => {
    const originalValue = JSON.stringify(schemaOneCosts);

    localStorage.setItem(originalAppKeys.costs, originalValue);

    expect(getDataStatus().legacy).toMatchObject({ status: 'available' });
    expect(importLegacyCopy(undefined, now)).toBe(schemaOneCosts.length);
    expect(costsDatabase.getAllCosts()).toEqual(upgraded(schemaOneCosts));
    expect(localStorage.getItem(originalAppKeys.costs)).toBe(originalValue);
    expect(localStorage.getItem(appDataKey)).not.toContain('EURO');
  });

  it('reports an unreadable original value as unreadable, not as importable euros', () => {
    localStorage.setItem(originalAppKeys.costs, JSON.stringify([makeCost({ currency: 'euro' })]));

    expect(getDataStatus().legacy.status).toBe('unreadable');
  });
});
