import { describe, expect, it } from 'vitest';
import { parseEcbObservations } from '../../src/lib/fx/ecbParser.js';
import { createObservationIndex, selectObservationSet } from '../../src/lib/fx/observationSelection.js';
import { createEmptyTable, recordFailure, recordObservations, recordProviderMetadata } from '../../src/lib/fx/rateTable.js';
import { parseEcbMetadata } from '../../src/lib/fx/ecbParser.js';
import { clientResult, fixture, fixtureJson } from './helpers.js';

/*
 * M2B.1 historical selection: which observation applies to an expense, and
 * the proof that it was actually fetched. Built from real fixtures.
 */
const all = ['GBP', 'ILS', 'USD'];

function load(file, { kind = 'range', from, to, quotes = all, fetchedAt, expectation = 'data', table = createEmptyTable() }) {
  const { observations } = parseEcbObservations(fixture(file), { quotes, expectation });

  return recordObservations(table, clientResult({ observations, kind, from, to, quotes, fetchedAt, expectation })).table;
}

function synthetic(table, observations, { from, to, quotes, fetchedAt = '2026-10-13T00:00:00.000Z', expectation = 'data', kind = 'range' }) {
  return recordObservations(table, clientResult({ observations, kind, from, to, quotes, fetchedAt, expectation })).table;
}

const septemberToOctober = () => load('ecb-series-2026-09-01_to_2026-10-12.json', { from: '2026-09-01', to: '2026-10-12', fetchedAt: '2026-10-12T08:00:00.000Z' });

function select(table, expenseDate, currencies, referenceDate = '2026-10-12') {
  return selectObservationSet({ table, expenseDate, currencies, referenceDate });
}

const raw = fixtureJson('ecb-series-2026-09-01_to_2026-10-12.json');
const rawRate = (date, quote) => String(raw.find((item) => item.date === date && item.quote === quote).rate);

describe('an ordinary business day', () => {
  it('uses that day\'s observation, exactly as published, and is final', () => {
    const result = select(septemberToOctober(), '2026-10-07', ['ILS', 'USD']);

    expect(result).toMatchObject({ status: 'available', requestedDate: '2026-10-07', selectedDate: '2026-10-07', finality: 'final', mayBeSuperseded: false, needsFetch: false, reason: null, missing: [] });
    expect(result.rates).toEqual({ EUR: '1', ILS: rawRate('2026-10-07', 'ILS'), USD: rawRate('2026-10-07', 'USD') });
  });

  it('reports provenance: the observation date, the fetch, and the fetch time', () => {
    const { provenance } = select(septemberToOctober(), '2026-10-07', ['ILS', 'USD']);

    expect(provenance).toEqual([
      { quote: 'ILS', rate: rawRate('2026-10-07', 'ILS'), observationDate: '2026-10-07', fetchId: 1, fetchedAt: '2026-10-12T08:00:00.000Z' },
      { quote: 'USD', rate: rawRate('2026-10-07', 'USD'), observationDate: '2026-10-07', fetchId: 1, fetchedAt: '2026-10-12T08:00:00.000Z' }
    ]);
  });

  it('keeps the expense date, the observation date and the fetch time distinct', () => {
    const result = select(septemberToOctober(), '2026-09-12', ['EUR', 'USD']);

    expect(result.requestedDate).toBe('2026-09-12');
    expect(result.selectedDate).toBe('2026-09-11');
    expect(result.provenance[0].fetchedAt).toBe('2026-10-12T08:00:00.000Z');
  });
});

describe('weekends and TARGET holidays', () => {
  it.each([['2026-09-12', '2026-09-11'], ['2026-09-13', '2026-09-11'], ['2026-09-19', '2026-09-18'], ['2026-09-27', '2026-09-25']])(
    'a weekend expense on %s uses the preceding working day %s, and is final once a later observation exists',
    (date, expected) => {
      const result = select(septemberToOctober(), date, ['ILS', 'USD']);

      expect(result).toMatchObject({ status: 'available', selectedDate: expected, finality: 'final', mayBeSuperseded: false });
    }
  );

  it('a weekend at the end of the data is provisional: a newer observation may still be published', () => {
    const result = select(septemberToOctober(), '2026-10-10', ['ILS', 'USD']);

    expect(result).toMatchObject({ status: 'available', selectedDate: '2026-10-09', finality: 'provisional', mayBeSuperseded: true, needsFetch: false });
  });

  it('uses the preceding day for a TARGET holiday, and for the long Christmas gap', () => {
    const table = load('ecb-series-2025-12-18_to_2025-12-31.json', { from: '2025-12-18', to: '2025-12-31', fetchedAt: '2026-01-05T09:00:00.000Z' });

    ['2025-12-25', '2025-12-26', '2025-12-27', '2025-12-28'].forEach((date) => {
      const result = select(table, date, ['USD', 'ILS'], '2026-01-05');

      expect(result).toMatchObject({ status: 'available', selectedDate: '2025-12-24', finality: 'final' });
    });
    expect(select(table, '2025-12-29', ['EUR', 'USD'], '2026-01-05').selectedDate).toBe('2025-12-29');
  });

  it('uses Thursday for Good Friday and Easter Monday (a 5-day gap)', () => {
    const table = load('ecb-series-2025-04-14_to_2025-04-25.json', { from: '2025-04-14', to: '2025-04-25', fetchedAt: '2025-04-30T09:00:00.000Z' });

    ['2025-04-18', '2025-04-19', '2025-04-20', '2025-04-21'].forEach((date) => {
      expect(select(table, date, ['GBP', 'USD'], '2025-04-30')).toMatchObject({ selectedDate: '2025-04-17', finality: 'final' });
    });
  });
});

describe('the observation date is never after the expense date, and both currencies share it', () => {
  it('holds for every day of the fixture range, checked against an independent oracle', () => {
    const index = createObservationIndex(septemberToOctober());
    const dates = [...new Set(raw.map((item) => item.date))].sort();

    for (let offset = 0; offset < 42; offset += 1) {
      const day = new Date(Date.UTC(2026, 8, 1 + offset)).toISOString().slice(0, 10);
      const expected = [...dates].reverse().find((date) => date <= day);
      const result = index.select({ expenseDate: day, currencies: ['ILS', 'USD'], referenceDate: '2026-10-12' });

      expect(result.selectedDate).toBe(expected);
      expect(result.selectedDate <= day).toBe(true);
      expect(result.provenance.every((entry) => entry.observationDate === result.selectedDate)).toBe(true);
      expect(result.rates.ILS).toBe(rawRate(expected, 'ILS'));
      expect(result.rates.USD).toBe(rawRate(expected, 'USD'));
    }
  });

  it('never uses an observation dated after the expense', () => {
    const result = select(septemberToOctober(), '2026-10-08', ['EUR', 'USD']);

    expect(result.selectedDate).toBe('2026-10-08');
    expect(result.rates.USD).toBe(rawRate('2026-10-08', 'USD'));
    expect(result.rates.USD).not.toBe(rawRate('2026-10-09', 'USD'));
  });

  it('when one currency lacks the day, both fall back to the latest day they share', () => {
    let table = synthetic(createEmptyTable(), [
      { date: '2026-10-07', quote: 'ILS', rate: '3.4' },
      { date: '2026-10-07', quote: 'USD', rate: '1.12' },
      { date: '2026-10-08', quote: 'USD', rate: '1.13' }
    ], { from: '2026-10-05', to: '2026-10-08', quotes: ['ILS', 'USD'], expectation: 'any' });

    table = recordProviderMetadata(table, parseEcbMetadata(fixture('ecb-metadata.json')), '2026-10-13T00:00:00.000Z');
    const both = select(table, '2026-10-08', ['ILS', 'USD'], '2026-10-13');
    const usdOnly = select(table, '2026-10-08', ['EUR', 'USD'], '2026-10-13');

    expect(both).toMatchObject({ status: 'available', selectedDate: '2026-10-07', rates: { ILS: '3.4', USD: '1.12' } });
    expect(both.rates.USD).not.toBe('1.13');
    expect(usdOnly).toMatchObject({ selectedDate: '2026-10-08', rates: { USD: '1.13' } });
  });
});

describe('finality comes from observed data, not from the clock', () => {
  it('today before the publication: provisional, using the previous observation', () => {
    const result = select(septemberToOctober(), '2026-10-12', ['EUR', 'USD'], '2026-10-12');

    expect(result).toMatchObject({ status: 'available', selectedDate: '2026-10-09', finality: 'provisional', mayBeSuperseded: true });
  });

  it('today after the publication: final, using today\'s own observation', () => {
    const table = synthetic(septemberToOctober(), [
      { date: '2026-10-12', quote: 'GBP', rate: '0.85' },
      { date: '2026-10-12', quote: 'ILS', rate: '3.41' },
      { date: '2026-10-12', quote: 'USD', rate: '1.12' }
    ], { kind: 'latest', quotes: all, fetchedAt: '2026-10-12T15:30:00.000Z' });
    const result = select(table, '2026-10-12', ['EUR', 'USD'], '2026-10-12');

    expect(result).toMatchObject({ selectedDate: '2026-10-12', finality: 'final', mayBeSuperseded: false });
    expect(result.rates.USD).toBe('1.12');
  });

  it('a provisional weekend result becomes final once the next observation is cached', () => {
    const before = select(septemberToOctober(), '2026-10-10', ['EUR', 'USD']);
    const table = synthetic(septemberToOctober(), [
      { date: '2026-10-12', quote: 'GBP', rate: '0.85' },
      { date: '2026-10-12', quote: 'ILS', rate: '3.41' },
      { date: '2026-10-12', quote: 'USD', rate: '1.12' }
    ], { kind: 'latest', quotes: all, fetchedAt: '2026-10-12T15:30:00.000Z' });
    const after = select(table, '2026-10-10', ['EUR', 'USD']);

    expect(before.finality).toBe('provisional');
    expect(after).toMatchObject({ selectedDate: '2026-10-09', finality: 'final' });
    expect(after.rates).toEqual(before.rates);
  });

  it('a later observation for only one currency does not prove the other final', () => {
    let table = septemberToOctober();

    table = synthetic(table, [{ date: '2026-10-12', quote: 'USD', rate: '1.12' }], { kind: 'latest', quotes: ['USD'], fetchedAt: '2026-10-12T15:30:00.000Z' });
    expect(select(table, '2026-10-10', ['EUR', 'USD']).finality).toBe('final');
    expect(select(table, '2026-10-10', ['USD', 'ILS']).finality).toBe('provisional');
  });
});

describe('future dates', () => {
  it('is unavailable after the caller\'s today, even when coverage reaches it', () => {
    const result = select(septemberToOctober(), '2026-10-13', ['EUR', 'USD'], '2026-10-12');

    expect(result).toMatchObject({ status: 'unavailable', reason: 'future-date', selectedDate: null, rates: null, finality: null });
  });

  it('far-future dates are unavailable and never receive a rate', () => {
    ['2026-10-13', '2027-01-01', '2999-12-31'].forEach((date) => {
      const result = select(septemberToOctober(), date, ['USD', 'ILS'], '2026-10-12');

      expect(result.status).toBe('unavailable');
      expect(result.rates).toBeNull();
    });
  });

  it('without a reference date a date past the coverage needs a fetch instead of guessing', () => {
    const result = selectObservationSet({ table: septemberToOctober(), expenseDate: '2027-03-01', currencies: ['EUR', 'USD'] });

    expect(result).toMatchObject({ status: 'needs-fetch', needsFetch: true, rates: null });
  });
});

describe('history limits', () => {
  it('is unavailable before the ECB series starts', () => {
    expect(select(createEmptyTable(), '1998-12-31', ['EUR', 'USD'])).toMatchObject({ status: 'unavailable', reason: 'before-provider-history' });
    expect(select(createEmptyTable(), '1970-01-01', ['EUR', 'USD'])).toMatchObject({ status: 'unavailable', reason: 'before-provider-history' });
  });

  it('uses the provider metadata start date when known', () => {
    const table = recordProviderMetadata(createEmptyTable(), { startDate: '2000-01-03', endDate: '2026-10-09', publishesMissed: 0, cadence: 'daily' }, '2026-10-12T08:00:00.000Z');

    expect(select(table, '1999-06-01', ['EUR', 'USD']).reason).toBe('before-provider-history');
  });

  it('a currency absent in the early years is unavailable only once that absence is confirmed', () => {
    let table = synthetic(createEmptyTable(), [
      { date: '1999-01-04', quote: 'GBP', rate: '0.7111' },
      { date: '1999-01-04', quote: 'USD', rate: '1.1789' }
    ], { from: '1999-01-04', to: '2000-05-31', quotes: ['GBP', 'USD'] });

    // ILS was never asked about: that is "not fetched", NOT "no data".
    const unasked = select(table, '1999-06-15', ['EUR', 'ILS'], '2026-10-12');

    expect(unasked.status).toBe('needs-fetch');
    expect(unasked.missing.every((gap) => gap.quote === 'ILS' && gap.state === 'not-fetched')).toBe(true);

    table = synthetic(table, [], { from: '1999-01-04', to: '2000-05-31', quotes: ['ILS'], expectation: 'any' });
    const confirmed = select(table, '1999-06-15', ['EUR', 'ILS'], '2026-10-12');

    expect(confirmed).toMatchObject({ status: 'unavailable', reason: 'currency-unavailable', needsFetch: false });
    // The confirmation is for ILS only: USD in the same period stays available.
    expect(select(table, '1999-01-04', ['EUR', 'USD'], '2026-10-12')).toMatchObject({ status: 'available', selectedDate: '1999-01-04' });
  });

  it('reports no common observation date when each currency has data but never on the same day', () => {
    let table = synthetic(createEmptyTable(), [
      { date: '2026-10-05', quote: 'USD', rate: '1.1' },
      { date: '2026-10-07', quote: 'USD', rate: '1.2' },
      { date: '2026-10-06', quote: 'ILS', rate: '3.4' },
      { date: '2026-10-08', quote: 'ILS', rate: '3.5' }
    ], { from: '1999-01-04', to: '2026-10-08', quotes: ['ILS', 'USD'], expectation: 'any' });

    table = recordProviderMetadata(table, { startDate: '1999-01-04', endDate: '2026-10-08', publishesMissed: 0, cadence: 'daily' }, '2026-10-13T00:00:00.000Z');
    expect(select(table, '2026-10-08', ['ILS', 'USD'], '2026-10-13')).toMatchObject({ status: 'unavailable', reason: 'no-common-observation-date' });
  });
});

describe('coverage: not fetched, failed, partial, and per currency', () => {
  it('an empty cache needs a fetch and says nothing was fetched', () => {
    const result = select(createEmptyTable(), '2026-10-07', ['USD', 'ILS']);

    expect(result).toMatchObject({ status: 'needs-fetch', needsFetch: true, rates: null });
    expect(result.missing.map((gap) => [gap.quote, gap.state])).toEqual([['ILS', 'not-fetched'], ['USD', 'not-fetched']]);
  });

  it('names the exact uncovered range when the data stops short of the date', () => {
    // September only: the October part of the series was never fetched.
    const { observations } = parseEcbObservations(fixture('ecb-series-2026-09-01_to_2026-10-12.json'), { quotes: all });
    const table = recordObservations(
      createEmptyTable(),
      clientResult({ observations: observations.filter((item) => item.date <= '2026-09-30'), from: '2026-09-01', to: '2026-09-30', quotes: all, fetchedAt: '2026-10-01T08:00:00.000Z' })
    ).table;
    const result = select(table, '2026-10-05', ['EUR', 'USD'], '2026-10-12');

    expect(result).toMatchObject({ status: 'needs-fetch', selectedDate: '2026-09-30' });
    expect(result.missing).toEqual([{ quote: 'USD', from: '2026-10-01', to: '2026-10-05', state: 'not-fetched' }]);
  });

  it('distinguishes an attempt that failed from one never made', () => {
    const table = recordFailure(createEmptyTable(), { kind: 'range', quotes: ['USD'], from: '2026-10-01', to: '2026-10-12', at: '2026-10-12T08:00:00.000Z', errorCode: 'timeout' });
    const result = select(table, '2026-10-07', ['USD', 'ILS']);

    expect(result.missing.find((gap) => gap.quote === 'USD').state).toBe('failed');
    expect(result.missing.find((gap) => gap.quote === 'ILS').state).toBe('not-fetched');
  });

  it('reports an incomplete or invalid answer as partial, and never counts it as coverage', () => {
    const table = recordFailure(createEmptyTable(), { kind: 'range', quotes: ['ILS'], from: '2026-10-01', to: '2026-10-12', at: '2026-10-12T08:00:00.000Z', errorCode: 'invalid-rate', partial: true });
    const result = select(table, '2026-10-07', ['EUR', 'ILS']);

    expect(result.status).toBe('needs-fetch');
    expect(result.missing.find((gap) => gap.quote === 'ILS').state).toBe('partial');
  });

  it('never treats all currencies as covered because one of them is', () => {
    let table = synthetic(createEmptyTable(), [
      { date: '2026-10-07', quote: 'USD', rate: '1.12' },
      { date: '2026-10-08', quote: 'USD', rate: '1.13' }
    ], { from: '2026-10-05', to: '2026-10-12', quotes: ['USD'], fetchedAt: '2026-10-12T08:00:00.000Z' });

    table = recordProviderMetadata(table, { startDate: '2026-10-05', endDate: '2026-10-09', publishesMissed: 0, cadence: 'daily' }, '2026-10-12T08:00:00.000Z');
    expect(select(table, '2026-10-08', ['EUR', 'USD'], '2026-10-12').status).toBe('available');
    expect(select(table, '2026-10-08', ['EUR', 'USD'], '2026-10-12').status).toBe('available');

    const mixed = select(table, '2026-10-08', ['USD', 'ILS'], '2026-10-12');

    expect(mixed.status).toBe('needs-fetch');
    expect(mixed.missing.every((gap) => gap.quote === 'ILS')).toBe(true);
    expect(select(table, '2026-10-08', ['EUR', 'GBP'], '2026-10-12').status).toBe('needs-fetch');
  });

  it('does not cross a gap between two covered ranges', () => {
    let table = synthetic(createEmptyTable(), [
      { date: '2026-09-01', quote: 'USD', rate: '1.1' },
      { date: '2026-10-05', quote: 'USD', rate: '1.2' }
    ], { from: '2026-09-01', to: '2026-09-10', quotes: ['USD'], expectation: 'any' });

    // Second range covers only October; September 11 - October 4 is a hole.
    table = synthetic(table, [{ date: '2026-10-05', quote: 'USD', rate: '1.2' }], { from: '2026-10-01', to: '2026-10-12', quotes: ['USD'], expectation: 'any' });
    const result = select(table, '2026-10-03', ['EUR', 'USD'], '2026-10-12');

    expect(result.status).toBe('needs-fetch');
    expect(result.missing).toEqual([{ quote: 'USD', from: '2026-09-11', to: '2026-09-30', state: 'not-fetched' }]);
  });

  it('merges adjacent ranges so a selection spanning them is proven', () => {
    let table = synthetic(createEmptyTable(), [{ date: '2026-09-04', quote: 'USD', rate: '1.1' }], { from: '2026-09-01', to: '2026-09-15', quotes: ['USD'], expectation: 'any' });

    table = synthetic(table, [{ date: '2026-09-17', quote: 'USD', rate: '1.2' }], { from: '2026-09-16', to: '2026-09-30', quotes: ['USD'], expectation: 'any' });
    expect(select(table, '2026-09-20', ['EUR', 'USD'], '2026-10-12')).toMatchObject({ status: 'available', selectedDate: '2026-09-17' });
    expect(select(table, '2026-09-16', ['EUR', 'USD'], '2026-10-12')).toMatchObject({ status: 'available', selectedDate: '2026-09-04' });
  });
});

describe('identity conversions and invalid input', () => {
  it.each([[['USD', 'USD']], [['EUR', 'EUR']], [['EUR']], [['ILS']], [[]]])('needs no observation for %j', (currencies) => {
    const result = select(createEmptyTable(), '2026-10-07', currencies);

    expect(result).toMatchObject({ status: 'available', identity: true, finality: 'final', rates: { EUR: '1' }, missing: [], provenance: [] });
  });

  it('EUR with another currency needs only that currency', () => {
    const result = select(septemberToOctober(), '2026-10-07', ['EUR', 'USD']);

    expect(result.rates).toEqual({ EUR: '1', USD: rawRate('2026-10-07', 'USD') });
    expect(result.identity).toBe(false);
  });

  it.each([
    [{ expenseDate: '2026-02-30', currencies: ['EUR', 'USD'] }],
    [{ expenseDate: '10/07/2026', currencies: ['EUR', 'USD'] }],
    [{ expenseDate: '2026-10-07', currencies: ['EURO'] }],
    [{ expenseDate: '2026-10-07', currencies: ['JPY'] }],
    [{ expenseDate: '2026-10-07', currencies: 'USD' }],
    [{ expenseDate: '2026-10-07', currencies: ['EUR', 'USD'], referenceDate: 'today' }]
  ])('throws a typed error for %j', (args) => {
    expect(() => selectObservationSet({ table: createEmptyTable(), ...args })).toThrow(expect.objectContaining({ code: 'invalid-request' }));
  });
});

describe('determinism and scale', () => {
  it('returns the same result every time, whether through an index or directly', () => {
    const table = septemberToOctober();
    const index = createObservationIndex(table);
    const args = { expenseDate: '2026-09-27', currencies: ['ILS', 'USD'], referenceDate: '2026-10-12' };

    expect(index.select(args)).toEqual(index.select(args));
    expect(index.select(args)).toEqual(selectObservationSet({ table, ...args }));
  });

  it('does not modify the table', () => {
    const table = septemberToOctober();
    const before = JSON.stringify(table);

    createObservationIndex(table).select({ expenseDate: '2026-09-27', currencies: ['ILS', 'USD'], referenceDate: '2026-10-12' });
    expect(JSON.stringify(table)).toBe(before);
  });

  it('handles thousands of lookups on an index', () => {
    const index = createObservationIndex(septemberToOctober());
    let available = 0;

    for (let count = 0; count < 5000; count += 1) {
      const day = new Date(Date.UTC(2026, 8, 1 + (count % 42))).toISOString().slice(0, 10);

      if (index.select({ expenseDate: day, currencies: ['ILS', 'GBP'], referenceDate: '2026-10-12' }).status === 'available') {
        available += 1;
      }
    }

    expect(available).toBe(5000);
  });
});
