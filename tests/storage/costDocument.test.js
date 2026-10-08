import { describe, expect, it } from 'vitest';
import {
  currentCostSchemaVersion,
  migrateCostDocument,
  parseCostDocument,
  serializeCostDocument
} from '../../src/lib/storage/costDocument.js';
import { currentDocument, legacyCosts, makeCost } from './fixtures.js';

function expectStorageError(callback, code, reason) {
  try {
    callback();
  } catch (error) {
    expect(error.name).toBe('StorageError');
    expect(error.code).toBe(code);

    if (reason) {
      expect(error.details.reason).toBe(reason);
    }

    return error;
  }

  throw new Error('Expected a StorageError to be thrown.');
}

describe('cost document parsing and migration', () => {
  it('reads the current schema exactly', () => {
    const result = parseCostDocument(currentDocument(legacyCosts));

    expect(result.sourceSchemaVersion).toBe(currentCostSchemaVersion);
    expect(result.costs).toEqual(legacyCosts);
  });

  it('migrates the pre-M1 bare-array layout without changing any value', () => {
    const result = parseCostDocument(JSON.stringify(legacyCosts));

    expect(result.sourceSchemaVersion).toBe(0);
    expect(result.costs).toEqual(legacyCosts);
    expect(result.costs[0].sum).toBe(1234.56789);
    expect(result.costs[1].sum).toBe(0.1);
    expect(result.costs[2].sum).toBe(-5.5);
    expect(result.costs[0].date).toEqual({ day: 29, month: 2, year: 2028, hour: 23, minute: 59 });
  });

  it('gives the same result when the same data is migrated repeatedly', () => {
    const first = parseCostDocument(JSON.stringify(legacyCosts));
    const second = parseCostDocument(serializeCostDocument(first.costs));
    const third = parseCostDocument(serializeCostDocument(second.costs));

    expect(second.costs).toEqual(first.costs);
    expect(third.costs).toEqual(first.costs);
    expect(third.sourceSchemaVersion).toBe(currentCostSchemaVersion);
  });

  it('does not mutate the parsed input document', () => {
    const document = [makeCost()];
    const before = structuredClone(document);

    migrateCostDocument(document);

    expect(document).toEqual(before);
  });

  it('round-trips money values and timestamps exactly', () => {
    const costs = [
      makeCost({ sum: 0.1 + 0.2 }),
      makeCost({ id: 'b', sum: 1e-7, date: { day: 1, month: 1, year: 1999, hour: 0, minute: 1 } }),
      makeCost({ id: 'c', sum: 9007199254740991 })
    ];

    expect(parseCostDocument(serializeCostDocument(costs)).costs).toEqual(costs);
  });

  it('reports malformed JSON as damaged', () => {
    expectStorageError(() => parseCostDocument('{not valid JSON'), 'damaged', 'invalid-json');
    expectStorageError(() => parseCostDocument(''), 'damaged', 'invalid-json');
  });

  it.each([
    ['a number', '42'],
    ['a string', '"costs"'],
    ['null', 'null'],
    ['an object without a schema version', '{"costs": []}'],
    ['schema version zero', '{"schemaVersion": 0, "costs": []}'],
    ['a string schema version', '{"schemaVersion": "1", "costs": []}']
  ])('reports a root value that is %s as damaged', (_label, rawValue) => {
    expectStorageError(() => parseCostDocument(rawValue), 'damaged', 'invalid-root');
  });

  it('reports a current document whose costs are not a list as damaged', () => {
    expectStorageError(
      () => parseCostDocument('{"schemaVersion": 1, "costs": {}}'),
      'damaged',
      'invalid-root'
    );
  });

  it.each([
    ['missing id', { id: undefined }],
    ['empty id', { id: '  ' }],
    ['non-numeric sum', { sum: '12' }],
    ['null sum', { sum: null }],
    ['unsupported currency', { currency: 'EUR' }],
    ['missing category', { category: undefined }],
    ['missing description', { description: undefined }],
    ['missing date', { date: undefined }],
    ['date without time', { date: { day: 1, month: 1, year: 2026 } }],
    ['impossible date', { date: { day: 30, month: 2, year: 2026, hour: 1, minute: 1 } }]
  ])('reports a record with %s as damaged and names the record', (_label, overrides) => {
    const costs = [makeCost({ id: 'first' }), makeCost({ id: 'second', ...overrides })];
    const error = expectStorageError(
      () => parseCostDocument(currentDocument(costs)),
      'damaged',
      'invalid-record'
    );

    expect(error.details.index).toBe(1);
    expect(error.message).toContain('#2');
  });

  it('reports duplicate ids as damaged instead of keeping either record', () => {
    const costs = [makeCost({ id: 'same' }), makeCost({ id: 'same', sum: 5 })];
    const error = expectStorageError(
      () => parseCostDocument(currentDocument(costs)),
      'damaged',
      'duplicate-id'
    );

    expect(error.details).toMatchObject({ index: 1, id: 'same' });
  });

  it('rejects data from a newer schema version instead of reading it', () => {
    const error = expectStorageError(
      () => parseCostDocument('{"schemaVersion": 2, "costs": [], "newField": true}'),
      'unsupported-version'
    );

    expect(error.details.schemaVersion).toBe(2);
  });
});
