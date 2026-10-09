import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setCachedExchangeRates } from '../../src/lib/exchangeRatesCache.js';
import {
  costsDatabaseName,
  costsDatabaseVersion,
  costsDatabase
} from '../../src/lib/costsDatabase.js';
import { db, getCostsStorageKey } from '../../src/lib/db.js';

/*
 * Contract tests for the module version of db.js (src/lib/db.js). Per
 * R-131, the official grader may use different test code than the sample
 * shown in the course document, so these tests deliberately go beyond the
 * exact sample values (200/400/600) to protect the underlying CONTRACT:
 * openCostsDB/addCost/getReport's required shape and behavior, original-
 * currency preservation, current-month/year defaults, and the team's CRUD
 * extensions. See tests/db/vanilla-db.test.js for the equivalent suite
 * against the standalone Vanilla file — the two are intentionally kept
 * structurally parallel so a behavioral difference between the two db.js
 * versions would show up as one suite passing and the other failing.
 */

function setLocalDate(year, month, day, hour = 12, minute = 0) {
  vi.setSystemTime(new Date(year, month - 1, day, hour, minute, 0));
}

// Reads the records exactly as stored. Since M1 the value is a versioned
// document ({ schemaVersion, costs }) under the Cost Manager Pro namespace.
function readStoredCosts(databaseName = 'costsdb', databaseVersion = 1) {
  const storedValue = localStorage.getItem(getCostsStorageKey(databaseName, databaseVersion));

  return storedValue === null ? [] : JSON.parse(storedValue).costs;
}

function expectDatabaseObject(ob) {
  expect(ob).toEqual({
    addCost: expect.any(Function),
    getAllCosts: expect.any(Function),
    getCostById: expect.any(Function),
    updateCost: expect.any(Function),
    deleteCost: expect.any(Function),
    getReport: expect.any(Function)
  });
}

function editableCost(overrides = {}) {
  return {
    sum: 300,
    currency: 'USD',
    category: 'Updated',
    description: 'Updated cost',
    date: {
      day: 29,
      month: 2,
      year: 2028,
      hour: 9,
      minute: 45
    },
    ...overrides
  };
}

describe('module db contract', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    setLocalDate(2026, 8, 22);
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  // --- Required contract: openCostsDB / addCost shape ---

  it('opens a database object with addCost and getReport methods', () => {
    const ob = db.openCostsDB('costsdb', 1);

    expectDatabaseObject(ob);
  });

  it('accepts an empty database name because the official contract requires a string', () => {
    const ob = db.openCostsDB('', 1);

    expectDatabaseObject(ob);
  });

  it('adds a cost, returns required fields, records the date, and does not mutate input', () => {
    const ob = db.openCostsDB('costsdb', 1);
    const inputCost = {
      sum: 200,
      currency: 'USD',
      category: 'FOOD',
      description: 'pizza'
    };

    const result = ob.addCost(inputCost);

    expect(result).toMatchObject({
      sum: 200,
      currency: 'USD',
      category: 'FOOD',
      description: 'pizza',
      date: {
        day: 22,
        month: 8,
        year: 2026,
        hour: 12,
        minute: 0
      }
    });
    expect(result.id).toEqual(expect.any(String));
    expect(result.id).not.toBe('');
    expect(inputCost).toEqual({
      sum: 200,
      currency: 'USD',
      category: 'FOOD',
      description: 'pizza'
    });
  });

  it('persists costs so reopened database objects can report them', () => {
    const first = db.openCostsDB('costsdb', 1);
    first.addCost({
      sum: 125,
      currency: 'USD',
      category: 'BOOKS',
      description: 'Course book'
    });

    const second = db.openCostsDB('costsdb', 1);
    const report = second.getReport('USD', 2026, 8);

    expect(report.costs).toHaveLength(1);
    expect(report.costs[0]).toMatchObject({
      sum: 125,
      currency: 'USD',
      category: 'BOOKS',
      description: 'Course book',
      date: {
        day: 22
      }
    });
    expect(report.total).toEqual({
      currency: 'USD',
      sum: 125
    });
  });

  it('isolates stored costs by database name and database version', () => {
    const base = db.openCostsDB('costsdb', 1);
    const otherName = db.openCostsDB('otherdb', 1);
    const otherVersion = db.openCostsDB('costsdb', 2);

    base.addCost({
      sum: 50,
      currency: 'USD',
      category: 'BASE',
      description: 'Base database'
    });
    otherName.addCost({
      sum: 75,
      currency: 'USD',
      category: 'OTHER_NAME',
      description: 'Other database name'
    });
    otherVersion.addCost({
      sum: 100,
      currency: 'USD',
      category: 'OTHER_VERSION',
      description: 'Other database version'
    });

    expect(base.getReport('USD', 2026, 8).total.sum).toBe(50);
    expect(otherName.getReport('USD', 2026, 8).total.sum).toBe(75);
    expect(otherVersion.getReport('USD', 2026, 8).total.sum).toBe(100);
  });

  // --- Required contract: getReport() filtering, defaults, and shape ---

  it('filters explicit reports by requested year and month', () => {
    const ob = db.openCostsDB('costsdb', 1);

    setLocalDate(2026, 8, 10);
    ob.addCost({
      sum: 100,
      currency: 'USD',
      category: 'MATCH',
      description: 'August 2026 first'
    });

    setLocalDate(2026, 8, 11);
    ob.addCost({
      sum: 150,
      currency: 'USD',
      category: 'MATCH',
      description: 'August 2026 second'
    });

    setLocalDate(2026, 7, 10);
    ob.addCost({
      sum: 200,
      currency: 'USD',
      category: 'OUTSIDE_MONTH',
      description: 'July 2026'
    });

    setLocalDate(2025, 8, 10);
    ob.addCost({
      sum: 300,
      currency: 'USD',
      category: 'OUTSIDE_YEAR',
      description: 'August 2025'
    });

    const report = ob.getReport('USD', 2026, 8);

    expect(report).toMatchObject({
      year: 2026,
      month: 8,
      total: {
        currency: 'USD',
        sum: 250
      }
    });
    expect(report.costs).toHaveLength(2);
    expect(report.costs.map((cost) => cost.description)).toEqual([
      'August 2026 first',
      'August 2026 second'
    ]);
  });

  it('defaults reports to the current month and year', () => {
    const ob = db.openCostsDB('costsdb', 1);

    setLocalDate(2026, 9, 5);
    ob.addCost({
      sum: 90,
      currency: 'USD',
      category: 'CURRENT',
      description: 'Current month'
    });

    const report = ob.getReport('USD');

    expect(report).toMatchObject({
      year: 2026,
      month: 9,
      total: {
        currency: 'USD',
        sum: 90
      }
    });
  });

  it('returns an empty report for a month without costs', () => {
    const ob = db.openCostsDB('costsdb', 1);

    const report = ob.getReport('USD', 2026, 8);

    expect(report).toEqual({
      year: 2026,
      month: 8,
      costs: [],
      total: {
        currency: 'USD',
        sum: 0
      }
    });
  });

  it('preserves original currencies in localStorage and report items', () => {
    const ob = db.openCostsDB('costsdb', 1);

    ob.addCost({
      sum: 120,
      currency: 'GBP',
      category: 'Education',
      description: 'Course'
    });

    const report = ob.getReport('GBP', 2026, 8);
    const storedCosts = readStoredCosts();

    expect(storedCosts[0]).toMatchObject({
      sum: 120,
      currency: 'GBP',
      date: {
        day: 22,
        month: 8,
        year: 2026,
        hour: 12,
        minute: 0
      }
    });
    expect(report.costs[0]).toMatchObject({
      sum: 120,
      currency: 'GBP',
      date: {
        day: 22
      }
    });
  });

  it('accepts each required currency identifier for same-currency reports', () => {
    const currencies = ['USD', 'ILS', 'GBP', 'EURO'];

    currencies.forEach((currency, index) => {
      const ob = db.openCostsDB(`costsdb-${currency}`, 1);

      ob.addCost({
        sum: 10 + index,
        currency,
        category: 'CATEGORY',
        description: `${currency} cost`
      });

      expect(ob.getReport(currency, 2026, 8).total).toEqual({
        currency,
        sum: 10 + index
      });
    });
  });

  it('supports the official same-currency grader-style sample', () => {
    const ob = db.openCostsDB('costsdb', 1);

    const result1 = ob.addCost({
      sum: 200,
      currency: 'USD',
      category: 'FOOD',
      description: 'pizza'
    });
    const result2 = ob.addCost({
      sum: 400,
      currency: 'USD',
      category: 'CAR',
      description: 'fuel'
    });
    const data = ob.getReport('USD');

    expect(result1).toEqual(expect.any(Object));
    expect(result2).toEqual(expect.any(Object));
    expect(data).toEqual(expect.any(Object));
    expect(data.total).toEqual({
      currency: 'USD',
      sum: 600
    });
  });

  it('uses application database version 2 without reading version 1 application costs', () => {
    const legacyVersion1Key = `cost-manager:${encodeURIComponent(costsDatabaseName)}:v1:costs`;

    localStorage.setItem(
      legacyVersion1Key,
      JSON.stringify([
        {
          sum: 999,
          currency: 'USD',
          category: 'LEGACY',
          description: 'Legacy app cost',
          date: { day: 22, month: 8, year: 2026 }
        }
      ])
    );

    expect(costsDatabaseVersion).toBe(2);
    expect(costsDatabase.getReport('USD', 2026, 8).costs).toEqual([]);

    costsDatabase.addCost({
      sum: 10,
      currency: 'USD',
      category: 'CURRENT',
      description: 'Current app cost'
    });

    // The old course-era key is neither read nor changed.
    expect(JSON.parse(localStorage.getItem(legacyVersion1Key))).toHaveLength(1);
    expect(readStoredCosts(costsDatabaseName, 1)).toHaveLength(0);
    expect(readStoredCosts(costsDatabaseName, 2)).toHaveLength(1);
    expect(costsDatabase.getReport('USD', 2026, 8).total.sum).toBe(10);
  });

  // --- Team extensions: stable IDs, full CRUD (getAllCosts/getCostById/
  // updateCost/deleteCost) — see X-001/X-002/X-003 in
  // docs/REQUIREMENTS.md. These must never break the required addCost/
  // getReport contract above. ---

  it('generates stable unique IDs for identical new costs', () => {
    const ob = db.openCostsDB('costsdb', 1);
    const first = ob.addCost({
      sum: 20,
      currency: 'USD',
      category: 'Food',
      description: 'Coffee'
    });
    const second = ob.addCost({
      sum: 20,
      currency: 'USD',
      category: 'Food',
      description: 'Coffee'
    });

    expect(first.id).toEqual(expect.any(String));
    expect(second.id).toEqual(expect.any(String));
    expect(first.id).not.toBe('');
    expect(second.id).not.toBe('');
    expect(first.id).not.toBe(second.id);
    expect(ob.getCostById(first.id)?.id).toBe(first.id);
  });

  it('records hour and minute on new stored costs', () => {
    const ob = db.openCostsDB('costsdb', 1);

    setLocalDate(2026, 8, 22, 16, 37);

    const added = ob.addCost({
      sum: 42,
      currency: 'USD',
      category: 'Time',
      description: 'Timed cost'
    });

    expect(added.date).toEqual({
      day: 22,
      month: 8,
      year: 2026,
      hour: 16,
      minute: 37
    });
    expect(readStoredCosts()[0].date).toEqual(added.date);
  });

  it('returns all stored costs as defensive copies', () => {
    const ob = db.openCostsDB('costsdb', 1);
    ob.addCost({
      sum: 15,
      currency: 'USD',
      category: 'Copy',
      description: 'First'
    });
    ob.addCost({
      sum: 25,
      currency: 'USD',
      category: 'Copy',
      description: 'Second'
    });

    const costs = ob.getAllCosts();

    costs[0].description = 'Mutated outside';
    costs[0].date.day = 1;

    expect(costs).toHaveLength(2);
    expect(ob.getAllCosts()[0]).toMatchObject({
      description: 'First',
      date: { day: 22 }
    });
  });

  it('gets a cost by ID as a defensive copy', () => {
    const ob = db.openCostsDB('costsdb', 1);
    const added = ob.addCost({
      sum: 60,
      currency: 'USD',
      category: 'Lookup',
      description: 'Lookup cost'
    });

    const found = ob.getCostById(added.id);

    found.description = 'Mutated outside';

    expect(found).toMatchObject({
      id: added.id,
      sum: 60,
      description: 'Mutated outside'
    });
    expect(ob.getCostById(added.id)).toMatchObject({
      id: added.id,
      description: 'Lookup cost'
    });
  });

  it('returns null when getCostById cannot find a valid ID', () => {
    const ob = db.openCostsDB('costsdb', 1);

    expect(ob.getCostById('missing-id')).toBeNull();
  });

  it('throws for invalid cost IDs', () => {
    const ob = db.openCostsDB('costsdb', 1);

    expect(() => ob.getCostById('')).toThrow('id must be a non-empty string.');
    expect(() => ob.getCostById('   ')).toThrow('id must be a non-empty string.');
    expect(() => ob.getCostById(123)).toThrow('id must be a non-empty string.');
  });

  it('updates a cost by ID while preserving the original ID', () => {
    const ob = db.openCostsDB('costsdb', 1);
    const added = ob.addCost({
      sum: 100,
      currency: 'USD',
      category: 'Before',
      description: 'Before update'
    });
    const input = editableCost({
      id: 'ignored-id',
      sum: 250,
      currency: 'GBP',
      category: 'After',
      description: 'After update'
    });

    const updated = ob.updateCost(added.id, input);

    expect(updated).toEqual({
      id: added.id,
      sum: 250,
      currency: 'GBP',
      category: 'After',
      description: 'After update',
      date: {
        day: 29,
        month: 2,
        year: 2028,
        hour: 9,
        minute: 45
      }
    });
    expect(input.id).toBe('ignored-id');
    expect(ob.getCostById(added.id)).toEqual(updated);
  });

  it('returns null when updateCost cannot find a valid ID', () => {
    const ob = db.openCostsDB('costsdb', 1);

    expect(ob.updateCost('missing-id', editableCost())).toBeNull();
  });

  it('returns null before payload validation when updateCost cannot find a valid ID', () => {
    const ob = db.openCostsDB('costsdb', 1);

    expect(
      ob.updateCost('missing-id', {
        ...editableCost(),
        sum: Number.NaN,
        date: { day: 29, month: 2, year: 2026, hour: 99, minute: 99 }
      })
    ).toBeNull();
  });

  it('throws when updateCost receives an invalid ID', () => {
    const ob = db.openCostsDB('costsdb', 1);

    expect(() => ob.updateCost('', editableCost())).toThrow(
      'id must be a non-empty string.'
    );
  });

  it('validates the full editable cost payload on update', () => {
    const ob = db.openCostsDB('costsdb', 1);
    const added = ob.addCost({
      sum: 100,
      currency: 'USD',
      category: 'Before',
      description: 'Before update'
    });

    expect(() => ob.updateCost(added.id, { ...editableCost(), sum: Number.NaN })).toThrow(
      'cost.sum must be a finite number.'
    );
    expect(() =>
      ob.updateCost(added.id, { ...editableCost(), currency: 'EUR' })
    ).toThrow('cost.currency must be one of USD, ILS, GBP, EURO.');
    expect(() =>
      ob.updateCost(added.id, { ...editableCost(), category: 123 })
    ).toThrow('cost.category must be a string.');
    expect(() =>
      ob.updateCost(added.id, { ...editableCost(), description: null })
    ).toThrow('cost.description must be a string.');
  });

  it('rejects impossible calendar dates on update', () => {
    const ob = db.openCostsDB('costsdb', 1);
    const added = ob.addCost({
      sum: 100,
      currency: 'USD',
      category: 'Before',
      description: 'Before update'
    });

    expect(() =>
      ob.updateCost(added.id, {
        ...editableCost(),
        date: { day: 29, month: 2, year: 2026, hour: 8, minute: 30 }
      })
    ).toThrow('cost.date must be a real calendar date.');
  });

  it('rejects invalid update time values', () => {
    const ob = db.openCostsDB('costsdb', 1);
    const added = ob.addCost({
      sum: 100,
      currency: 'USD',
      category: 'Before',
      description: 'Before update'
    });

    expect(() =>
      ob.updateCost(added.id, {
        ...editableCost(),
        date: { day: 20, month: 8, year: 2026, hour: 24, minute: 30 }
      })
    ).toThrow('cost.date.hour must be an integer from 0 to 23.');
    expect(() =>
      ob.updateCost(added.id, {
        ...editableCost(),
        date: { day: 20, month: 8, year: 2026, hour: 23, minute: 60 }
      })
    ).toThrow('cost.date.minute must be an integer from 0 to 59.');
  });

  it('deletes the requested cost by ID without touching matching content', () => {
    const ob = db.openCostsDB('costsdb', 1);
    const first = ob.addCost({
      sum: 30,
      currency: 'USD',
      category: 'Same',
      description: 'Same content'
    });
    const second = ob.addCost({
      sum: 30,
      currency: 'USD',
      category: 'Same',
      description: 'Same content'
    });

    const deleted = ob.deleteCost(first.id);

    expect(deleted).toMatchObject({ id: first.id });
    expect(ob.getCostById(first.id)).toBeNull();
    expect(ob.getCostById(second.id)).toMatchObject({ id: second.id });
    expect(ob.getAllCosts()).toHaveLength(1);
  });

  it('returns null when deleteCost cannot find a valid ID', () => {
    const ob = db.openCostsDB('costsdb', 1);

    expect(ob.deleteCost('missing-id')).toBeNull();
  });

  it('throws when deleteCost receives an invalid ID', () => {
    const ob = db.openCostsDB('costsdb', 1);

    expect(() => ob.deleteCost(' ')).toThrow('id must be a non-empty string.');
  });

  it('does not expose ID or time fields through the required report item shape', () => {
    const ob = db.openCostsDB('costsdb', 1);
    ob.addCost({
      sum: 70,
      currency: 'USD',
      category: 'Report',
      description: 'Report item'
    });

    const [reportCost] = ob.getReport('USD', 2026, 8).costs;

    expect(reportCost).toEqual({
      sum: 70,
      currency: 'USD',
      category: 'Report',
      description: 'Report item',
      date: {
        day: 22
      }
    });
  });

  it('uses updated date values for report filtering', () => {
    const ob = db.openCostsDB('costsdb', 1);
    const added = ob.addCost({
      sum: 80,
      currency: 'USD',
      category: 'Move',
      description: 'Moved month'
    });

    ob.updateCost(
      added.id,
      editableCost({
        sum: 80,
        category: 'Move',
        description: 'Moved month',
        date: { day: 15, month: 9, year: 2026, hour: 11, minute: 20 }
      })
    );

    expect(ob.getReport('USD', 2026, 8).costs).toEqual([]);
    expect(ob.getReport('USD', 2026, 9).total.sum).toBe(80);
  });

  it('removes deleted costs from report totals', () => {
    const ob = db.openCostsDB('costsdb', 1);
    const first = ob.addCost({
      sum: 80,
      currency: 'USD',
      category: 'Report',
      description: 'Keep'
    });
    ob.addCost({
      sum: 20,
      currency: 'USD',
      category: 'Report',
      description: 'Delete'
    });

    ob.deleteCost(first.id);

    expect(ob.getReport('USD', 2026, 8).total.sum).toBe(20);
  });

  it('keeps CRUD operations isolated by database name and version', () => {
    const base = db.openCostsDB('costsdb', 1);
    const otherName = db.openCostsDB('otherdb', 1);
    const otherVersion = db.openCostsDB('costsdb', 2);
    const added = base.addCost({
      sum: 110,
      currency: 'USD',
      category: 'Base',
      description: 'Base only'
    });

    expect(otherName.getCostById(added.id)).toBeNull();
    expect(otherVersion.getCostById(added.id)).toBeNull();
    expect(base.getCostById(added.id)).toMatchObject({ id: added.id });
  });

  // --- Currency conversion / cache requirement (R-036, OQ-003) ---

  it('converts cross-currency report totals from cached rates while preserving original cost values', () => {
    setCachedExchangeRates({
      USD: 1,
      GBP: 0.5,
      EURO: 0.8,
      ILS: 4
    });
    const ob = db.openCostsDB('costsdb', 1);

    ob.addCost({
      sum: 100,
      currency: 'USD',
      category: 'FOOD',
      description: 'Groceries'
    });
    ob.addCost({
      sum: 50,
      currency: 'GBP',
      category: 'TRAVEL',
      description: 'Train'
    });

    const report = ob.getReport('USD', 2026, 8);
    const storedCosts = readStoredCosts();

    expect(report).not.toBeInstanceOf(Promise);
    expect(report.total).toEqual({
      currency: 'USD',
      sum: 200
    });
    expect(report.costs[1]).toMatchObject({
      sum: 50,
      currency: 'GBP',
      category: 'TRAVEL',
      description: 'Train'
    });
    expect(storedCosts[1]).toMatchObject({
      sum: 50,
      currency: 'GBP'
    });
  });

  it('fails explicitly for cross-currency totals when no valid rate cache exists', () => {
    const ob = db.openCostsDB('costsdb', 1);

    ob.addCost({
      sum: 100,
      currency: 'USD',
      category: 'FOOD',
      description: 'Groceries'
    });
    ob.addCost({
      sum: 50,
      currency: 'GBP',
      category: 'TRAVEL',
      description: 'Train'
    });

    expect(() => ob.getReport('USD', 2026, 8)).toThrow(
      'Cross-currency report totals require cached exchange rates.'
    );
  });

  // --- Malformed storage (M1, DATA-2). Before M1 this test asserted that
  // unreadable data was treated as an empty list and then overwritten by
  // the next addCost(), which silently lost the stored data. It now asserts
  // the safe behavior: the error is explicit and the stored value is never
  // overwritten. Detailed cases live in tests/storage/. ---

  it('refuses to read or overwrite malformed stored cost data', () => {
    const storageKey = getCostsStorageKey('costsdb', 1);

    localStorage.setItem(storageKey, '{not valid JSON');
    const ob = db.openCostsDB('costsdb', 1);

    expect(() => ob.getReport('USD', 2026, 8)).toThrow(
      expect.objectContaining({ name: 'StorageError', code: 'damaged' })
    );
    expect(() => ob.getAllCosts()).toThrow(
      expect.objectContaining({ code: 'damaged' })
    );
    expect(() =>
      ob.addCost({
        sum: 40,
        currency: 'USD',
        category: 'Recovered',
        description: 'Added after malformed data'
      })
    ).toThrow(expect.objectContaining({ code: 'damaged' }));

    expect(localStorage.getItem(storageKey)).toBe('{not valid JSON');
  });

  it('preserves unrelated localStorage keys when adding, updating, and deleting costs', () => {
    const unrelatedKey = 'some-other-app:preference';
    const unrelatedValue = JSON.stringify({ theme: 'dark' });

    localStorage.setItem(unrelatedKey, unrelatedValue);

    const ob = db.openCostsDB('costsdb', 1);
    const added = ob.addCost({
      sum: 10,
      currency: 'USD',
      category: 'Isolation',
      description: 'Should not touch other keys'
    });

    expect(localStorage.getItem(unrelatedKey)).toBe(unrelatedValue);

    ob.updateCost(added.id, editableCost());
    expect(localStorage.getItem(unrelatedKey)).toBe(unrelatedValue);

    ob.deleteCost(added.id);
    expect(localStorage.getItem(unrelatedKey)).toBe(unrelatedValue);
  });
});
