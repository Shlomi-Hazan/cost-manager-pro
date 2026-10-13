// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createObservationIndex } from '../../src/lib/fx/observationSelection.js';
import { createEmptyTable, getLastCheckedAt, recordObservations, recordProviderMetadata } from '../../src/lib/fx/rateTable.js';
import { clientResult } from './helpers.js';

/*
 * M2B.3 freshness semantics. Dates: Fri 2026-10-09, Sat 10, Sun 11, Mon 12.
 * An old observation is not "stale" by age; it is provisional only when the
 * provider may still publish something for the expense's own day.
 */
const rec = (table, date, from, to, fetchedAt = '2026-10-13T08:00:00.000Z', kind = 'range') =>
  recordObservations(table, clientResult({ kind, observations: [{ date, quote: 'USD', rate: '1.2' }], quotes: ['USD'], from, to, fetchedAt })).table;
const select = (table, expenseDate, referenceDate = '2026-10-13') => createObservationIndex(table).select({ expenseDate, currencies: ['USD', 'EUR'], referenceDate });
const meta = (table, endDate) => recordProviderMetadata(table, { startDate: '1999-01-04', endDate, publishesMissed: 0, cadence: 'daily' }, '2026-10-13T08:00:00.000Z');

describe('final versus provisional', () => {
  it('an observation on the expense day itself is final', () => {
    expect(select(rec(createEmptyTable(), '2026-10-09', '2026-10-02', '2026-10-09'), '2026-10-09').finality).toBe('final');
  });

  it('a weekend expense is provisional with no proof of a later publication', () => {
    const result = select(rec(createEmptyTable(), '2026-10-09', '2026-10-02', '2026-10-11'), '2026-10-11');

    expect(result).toMatchObject({ status: 'available', selectedDate: '2026-10-09', finality: 'provisional', mayBeSuperseded: true });
  });

  it('a weekend expense is final once the provider reports a newer observation date', () => {
    const table = meta(rec(createEmptyTable(), '2026-10-09', '2026-10-02', '2026-10-11'), '2026-10-12');

    expect(select(table, '2026-10-11')).toMatchObject({ finality: 'final', mayBeSuperseded: false });
  });

  it('metadata that is not newer than the expense date proves nothing', () => {
    const table = meta(rec(createEmptyTable(), '2026-10-09', '2026-10-02', '2026-10-11'), '2026-10-09');

    expect(select(table, '2026-10-11').finality).toBe('provisional');
    expect(select(table, '2026-10-10').finality).toBe('provisional');
  });

  it('a very old observation is final when it is the one that applies, regardless of its age', () => {
    const table = meta(rec(createEmptyTable(), '2015-12-24', '2015-12-17', '2015-12-27'), '2026-10-12');

    expect(select(table, '2015-12-26')).toMatchObject({ selectedDate: '2015-12-24', finality: 'final' });
  });

  it('without metadata the same old observation stays honestly provisional (nothing proves it final)', () => {
    expect(select(rec(createEmptyTable(), '2015-12-24', '2015-12-17', '2015-12-27'), '2015-12-26').finality).toBe('provisional');
  });

  it('contradictory metadata (a date before the observation) cannot make a later date final', () => {
    const table = meta(rec(createEmptyTable(), '2026-10-09', '2026-10-02', '2026-10-11'), '2026-10-01');

    expect(select(table, '2026-10-11').finality).toBe('provisional');
  });

  it('"today" is judged against the caller-supplied local date, not the provider clock', () => {
    const table = rec(createEmptyTable(), '2026-10-12', '2026-10-05', '2026-10-13');

    expect(select(table, '2026-10-13', '2026-10-13')).toMatchObject({ status: 'available', finality: 'provisional' });
    expect(select(table, '2026-10-14', '2026-10-13')).toMatchObject({ status: 'unavailable', reason: 'future-date' });
  });
});

describe('last checked and coverage growth', () => {
  it('is the newest successful data fetch, ignores metadata checks, and is null when nothing was fetched', () => {
    expect(getLastCheckedAt(createEmptyTable())).toBeNull();
    let table = rec(createEmptyTable(), '2026-10-09', '2026-10-09', '2026-10-09', '2026-10-10T08:00:00.000Z');

    table = rec(table, '2026-10-09', '2026-10-09', '2026-10-09', '2026-10-13T08:00:00.000Z');
    table = meta(table, '2026-10-12');
    expect(getLastCheckedAt(table)).toBe('2026-10-13T08:00:00.000Z');
    expect(getLastCheckedAt(table, ['GBP'])).toBeNull();
  });

  it('re-checking the same range does not make the coverage list grow', () => {
    let table = createEmptyTable();

    for (let day = 1; day <= 20; day += 1) {
      table = rec(table, '2026-10-09', '2026-10-02', '2026-10-09', `2026-10-${String(day + 9).padStart(2, '0')}T08:00:00.000Z`);
    }

    expect(table.coverage.USD).toHaveLength(1);
    expect(getLastCheckedAt(table)).toBe('2026-10-29T08:00:00.000Z');
    expect(table.observations.USD['2026-10-09'][0]).toBe('1.2');
  });
});
