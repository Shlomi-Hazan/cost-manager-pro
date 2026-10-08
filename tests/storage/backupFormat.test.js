import { describe, expect, it } from 'vitest';
import {
  createBackup,
  getBackupFilename,
  maxBackupFileSize,
  parseBackup,
  serializeBackup
} from '../../src/lib/storage/backupFormat.js';
import { legacyCosts, makeCost } from './fixtures.js';

const now = new Date('2026-10-09T08:15:00.000Z');

function backupText(overrides = {}) {
  return JSON.stringify({ ...createBackup(legacyCosts, now), ...overrides });
}

function expectBackupError(text, code) {
  try {
    parseBackup(text);
  } catch (error) {
    expect(error.name).toBe('BackupError');
    expect(error.code).toBe(code);
    expect(error.message.length).toBeGreaterThan(10);

    return error;
  }

  throw new Error('Expected a BackupError to be thrown.');
}

describe('backup file format', () => {
  it('contains versioned metadata and every record, and nothing else', () => {
    const backup = createBackup(legacyCosts, now);

    expect(Object.keys(backup).sort()).toEqual(
      ['app', 'costCount', 'costs', 'exportedAt', 'format', 'formatVersion'].sort()
    );
    expect(backup).toMatchObject({
      format: 'cost-manager-pro-backup',
      formatVersion: 1,
      exportedAt: '2026-10-09T08:15:00.000Z',
      app: 'Cost Manager Pro',
      costCount: 3
    });
    expect(backup.costs).toEqual(legacyCosts);
  });

  it('round-trips amounts, currencies, dates, times, and ids exactly', () => {
    const parsed = parseBackup(serializeBackup(createBackup(legacyCosts, now)));

    expect(parsed).toEqual({
      costs: legacyCosts,
      exportedAt: '2026-10-09T08:15:00.000Z',
      costCount: 3
    });
  });

  it('accepts an empty backup', () => {
    expect(parseBackup(serializeBackup(createBackup([], now))).costs).toEqual([]);
  });

  it('names files with the local date and time', () => {
    expect(getBackupFilename(new Date(2026, 0, 5, 7, 3))).toBe(
      'cost-manager-pro-backup-2026-01-05-0703.json'
    );
  });

  it('rejects files that are too large', () => {
    expectBackupError(' '.repeat(maxBackupFileSize + 1), 'too-large');
  });

  it('rejects files that are not JSON', () => {
    expectBackupError('{"format": "cost-manager-pro-backup",', 'invalid-json');
  });

  it.each([
    ['null', 'null'],
    ['an array of expenses', JSON.stringify(legacyCosts)],
    ['another format', JSON.stringify({ format: 'something-else', formatVersion: 1 })]
  ])('rejects %s as not a backup', (_label, text) => {
    expectBackupError(text, 'not-a-backup');
  });

  it('rejects an invalid format version', () => {
    expectBackupError(backupText({ formatVersion: '1' }), 'invalid-metadata');
    expectBackupError(backupText({ formatVersion: 0 }), 'invalid-metadata');
  });

  it('rejects backups from a newer version', () => {
    expectBackupError(backupText({ formatVersion: 2 }), 'unsupported-version');
  });

  it('rejects a missing or invalid creation date', () => {
    expectBackupError(backupText({ exportedAt: undefined }), 'invalid-metadata');
    expectBackupError(backupText({ exportedAt: 'yesterday' }), 'invalid-metadata');
  });

  it('rejects a backup without an expense list', () => {
    expectBackupError(backupText({ costs: {} }), 'invalid-metadata');
  });

  it('rejects a backup whose count does not match its expenses', () => {
    expectBackupError(backupText({ costCount: 2 }), 'count-mismatch');
    expectBackupError(backupText({ costCount: undefined }), 'count-mismatch');
  });

  it('rejects the whole backup when one expense is invalid', () => {
    const costs = [makeCost({ id: 'ok' }), makeCost({ id: 'bad', date: { day: 1 } })];
    const error = expectBackupError(
      backupText({ costs, costCount: 2 }),
      'invalid-record'
    );

    expect(error.message).toContain('#2');
  });

  it('rejects the whole backup when two expenses share an id', () => {
    const costs = [makeCost({ id: 'same' }), makeCost({ id: 'same', sum: 3 })];

    expectBackupError(backupText({ costs, costCount: 2 }), 'duplicate-id');
  });
});
