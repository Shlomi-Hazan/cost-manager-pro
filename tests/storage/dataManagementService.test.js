import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { costsDatabase } from '../../src/lib/costsDatabase.js';
import { setCachedExchangeRates } from '../../src/lib/exchangeRatesCache.js';
import {
  applyRestore,
  buildBackupFile,
  downloadPreviousData,
  downloadUnreadableData,
  getDataStatus,
  importLegacyCopy,
  prepareRestore,
  resetUnreadableData,
  restorePreviousData
} from '../../src/services/dataManagementService.js';
import { downloadBlob } from '../../src/services/export/downloadService.js';
import {
  clearCustomExchangeRatesUrl,
  setCustomExchangeRatesUrl
} from '../../src/services/settingsService.js';
import {
  appDataKey,
  appSnapshotKey,
  currentDocument,
  legacyCosts,
  makeCost,
  originalAppKeys,
  quotaError
} from './fixtures.js';

vi.mock('../../src/services/export/downloadService.js', () => ({
  downloadBlob: vi.fn()
}));

const now = new Date('2026-10-09T08:15:00.000Z');

function snapshotAllStorage() {
  return Object.fromEntries(
    Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)])
  );
}

function seedOriginalApp() {
  const originalValues = {
    [originalAppKeys.costs]: JSON.stringify(legacyCosts),
    [originalAppKeys.costsVersion1]: JSON.stringify([{ sum: 1, currency: 'USD' }]),
    [originalAppKeys.settings]: JSON.stringify({ exchangeRatesUrl: 'https://example.com/rates.json' }),
    [originalAppKeys.ratesCache]: JSON.stringify({ USD: 1, GBP: 0.6, EURO: 0.7, ILS: 3.4 })
  };

  Object.entries(originalValues).forEach(([key, value]) => localStorage.setItem(key, value));

  return originalValues;
}

function expectOriginalAppUntouched(originalValues) {
  Object.entries(originalValues).forEach(([key, value]) => {
    expect(localStorage.getItem(key)).toBe(value);
  });
}

async function lastDownload() {
  const [blob, filename] = downloadBlob.mock.calls.at(-1);

  return { filename, text: await blob.text(), type: blob.type };
}

describe('data management service', () => {
  beforeEach(() => {
    localStorage.clear();
    downloadBlob.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe('status', () => {
    it('reports an empty dataset', () => {
      expect(getDataStatus()).toMatchObject({
        status: 'empty',
        costCount: 0,
        previousData: null,
        legacy: { status: 'none' }
      });
    });

    it('reports damaged data without changing it', () => {
      localStorage.setItem(appDataKey, '{damaged');

      expect(getDataStatus()).toMatchObject({ status: 'damaged', hasRawData: true, costCount: null });
      expect(localStorage.getItem(appDataKey)).toBe('{damaged');
    });

    it('offers earlier data only while the dataset is empty', () => {
      localStorage.setItem(originalAppKeys.costs, JSON.stringify(legacyCosts));

      expect(getDataStatus().legacy).toMatchObject({ status: 'available' });

      localStorage.setItem(appDataKey, currentDocument([makeCost({ id: 'mine' })]));
      expect(getDataStatus().legacy.status).toBe('none');
    });
  });

  describe('backup', () => {
    it('contains every stored expense with exact values', () => {
      localStorage.setItem(appDataKey, currentDocument(legacyCosts));

      const file = buildBackupFile(undefined, now);
      const backup = JSON.parse(file.content);

      expect(file.costCount).toBe(3);
      expect(backup.costs).toEqual(legacyCosts);
      expect(backup).toMatchObject({ format: 'cost-manager-pro-backup', formatVersion: 1, costCount: 3 });
    });

    it('does not include settings or cached exchange rates', () => {
      localStorage.setItem(appDataKey, currentDocument(legacyCosts));
      setCustomExchangeRatesUrl('https://example.com/private-rates.json');
      setCachedExchangeRates({ USD: 1, GBP: 0.6, EURO: 0.7, ILS: 3.4 });

      const { content } = buildBackupFile(undefined, now);

      expect(content).not.toContain('private-rates');
      expect(content).not.toContain('exchangeRatesUrl');
      expect(JSON.parse(content).costs).toEqual(legacyCosts);
    });

    it('refuses to back up damaged data as if it were valid', () => {
      localStorage.setItem(appDataKey, '{damaged');

      expect(() => buildBackupFile(undefined, now)).toThrow(expect.objectContaining({ code: 'damaged' }));
    });
  });

  describe('restore', () => {
    it('validates a file without changing anything', () => {
      localStorage.setItem(appDataKey, currentDocument([makeCost()]));
      const before = snapshotAllStorage();

      const prepared = prepareRestore(buildBackupFile(undefined, now).content);

      expect(prepared.costCount).toBe(1);
      expect(snapshotAllStorage()).toEqual(before);
    });

    it('replaces all data and keeps the previous data recoverable', () => {
      const original = [makeCost()];

      localStorage.setItem(appDataKey, currentDocument(original));
      const backup = JSON.stringify({
        format: 'cost-manager-pro-backup',
        formatVersion: 1,
        exportedAt: now.toISOString(),
        app: 'Cost Manager Pro',
        costCount: legacyCosts.length,
        costs: legacyCosts
      });

      expect(applyRestore(prepareRestore(backup), undefined, now)).toBe(3);
      expect(costsDatabase.getAllCosts()).toEqual(legacyCosts);
      expect(getDataStatus().previousData).toMatchObject({
        reason: 'restore',
        costCount: 1,
        isRestorable: true
      });

      restorePreviousData();
      expect(costsDatabase.getAllCosts()).toEqual(original);
    });

    it('never applies part of a failed restore', () => {
      const before = currentDocument([makeCost()]);

      localStorage.setItem(appDataKey, before);
      const prepared = prepareRestore(
        JSON.stringify({
          format: 'cost-manager-pro-backup',
          formatVersion: 1,
          exportedAt: now.toISOString(),
          app: 'Cost Manager Pro',
          costCount: 3,
          costs: legacyCosts
        })
      );
      const realSetItem = Storage.prototype.setItem;

      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function setItem(key, value) {
        if (key === appDataKey) {
          throw quotaError();
        }

        return realSetItem.call(this, key, value);
      });

      expect(() => applyRestore(prepared, undefined, now)).toThrow(
        expect.objectContaining({ code: 'quota-exceeded' })
      );
      expect(localStorage.getItem(appDataKey)).toBe(before);
    });

    it('rejects invalid files before any change', () => {
      localStorage.setItem(appDataKey, currentDocument([makeCost()]));
      const before = snapshotAllStorage();

      expect(() => prepareRestore('{"format": "cost-manager-pro-backup"}')).toThrow(
        expect.objectContaining({ name: 'BackupError' })
      );
      expect(snapshotAllStorage()).toEqual(before);
    });
  });

  describe('recovery', () => {
    it('downloads unreadable data exactly as stored', async () => {
      localStorage.setItem(appDataKey, '{damaged but precious');

      downloadUnreadableData(undefined, new Date(2026, 9, 9, 8, 15));

      expect(await lastDownload()).toEqual({
        filename: 'cost-manager-pro-unreadable-data-2026-10-09-0815.json',
        text: '{damaged but precious',
        type: 'application/json'
      });
    });

    it('resets only unreadable data, keeping it as previous data', async () => {
      localStorage.setItem(appDataKey, '{damaged');

      resetUnreadableData(undefined, now);

      expect(getDataStatus()).toMatchObject({ status: 'ready', costCount: 0 });
      downloadPreviousData(undefined, now);
      expect((await lastDownload()).text).toBe('{damaged');
    });

    it('refuses to reset readable data', () => {
      const before = currentDocument([makeCost()]);

      localStorage.setItem(appDataKey, before);

      expect(() => resetUnreadableData(undefined, now)).toThrow();
      expect(localStorage.getItem(appDataKey)).toBe(before);
      expect(localStorage.getItem(appSnapshotKey)).toBeNull();
    });

    it('downloads restorable previous data as a backup file', async () => {
      localStorage.setItem(appDataKey, currentDocument([makeCost()]));
      applyRestore({ costs: legacyCosts, costCount: 3 }, undefined, now);

      downloadPreviousData(undefined, now);

      const parsed = prepareRestore((await lastDownload()).text);

      expect(parsed.costs).toEqual([makeCost()]);
    });
  });

  describe('isolation from the original Cost Manager app', () => {
    it('imports a copy of earlier data and leaves the original key unchanged', () => {
      const originalValues = seedOriginalApp();

      expect(importLegacyCopy(undefined, now)).toBe(3);
      expect(costsDatabase.getAllCosts()).toEqual(legacyCosts);
      expectOriginalAppUntouched(originalValues);
    });

    it('does not import earlier data into a non-empty dataset', () => {
      seedOriginalApp();
      localStorage.setItem(appDataKey, currentDocument([makeCost({ id: 'mine' })]));

      expect(() => importLegacyCopy(undefined, now)).toThrow();
      expect(costsDatabase.getAllCosts()).toEqual([makeCost({ id: 'mine' })]);
    });

    it('never reads the original app data without an explicit import', () => {
      seedOriginalApp();

      expect(costsDatabase.getAllCosts()).toEqual([]);
      expect(costsDatabase.getReport('USD', 2028, 2).costs).toEqual([]);
    });

    it('never writes to any original-app key during normal use', () => {
      const originalValues = seedOriginalApp();
      const added = costsDatabase.addCost({
        sum: 10,
        currency: 'USD',
        category: 'Food',
        description: 'Lunch'
      });

      costsDatabase.updateCost(added.id, { ...makeCost(), id: undefined });
      costsDatabase.deleteCost(added.id);
      setCustomExchangeRatesUrl('https://example.com/pro-rates.json');
      clearCustomExchangeRatesUrl();
      setCachedExchangeRates({ USD: 1, GBP: 0.5, EURO: 0.9, ILS: 3.7 });
      // A non-empty dataset, so the restore also writes a safety copy.
      costsDatabase.addCost({ sum: 5, currency: 'ILS', category: 'Food', description: 'Coffee' });
      applyRestore({ costs: [makeCost()], costCount: 1 }, undefined, now);
      restorePreviousData();

      expectOriginalAppUntouched(originalValues);
      Object.keys(localStorage)
        .filter((key) => !Object.values(originalAppKeys).includes(key))
        .forEach((key) => expect(key.startsWith('cost-manager-pro:')).toBe(true));
    });
  });
});
