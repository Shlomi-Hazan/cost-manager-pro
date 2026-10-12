import { describe, expect, it } from 'vitest';
import { parseEcbObservations } from '../../src/lib/fx/ecbParser.js';
import { createObservationIndex } from '../../src/lib/fx/observationSelection.js';
import {
  applyPendingRevision,
  createEmptyTable,
  discardPendingRevision,
  enforceSizeLimit,
  mergeTables,
  parseTable,
  recordFailure,
  recordObservations,
  recordProviderMetadata,
  serializeTable,
  validateTable
} from '../../src/lib/fx/rateTable.js';
import { cacheLimits } from '../../src/lib/fx/constants.js';
import { clientResult, fixture } from './helpers.js';

/*
 * M2B.1 table: the versioned document, its integrity checks, merging, and
 * revision handling. Pure functions, real fixtures.
 */
const all = ['GBP', 'ILS', 'USD'];
const obs = (date, quote, rate) => ({ date, quote, rate });

function record(table, observations, options) {
  return recordObservations(table, clientResult({ observations, quotes: ['USD'], kind: 'range', from: '2026-10-01', to: '2026-10-09', ...options }));
}

function seriesTable(fetchedAt = '2026-10-12T08:00:00.000Z') {
  const { observations } = parseEcbObservations(fixture('ecb-series-2026-09-01_to_2026-10-12.json'), { quotes: all });

  return recordObservations(createEmptyTable(), clientResult({ observations, from: '2026-09-01', to: '2026-10-12', quotes: all, fetchedAt })).table;
}

function codeOf(action) {
  try {
    action();

    return 'ok';
  } catch (error) {
    return error.details?.reason ? `${error.code}:${error.details.reason}` : error.code;
  }
}

describe('an empty table', () => {
  it('is valid, versioned, and identifies the provider and base', () => {
    const table = createEmptyTable();

    expect(table).toMatchObject({ format: 'cost-manager-pro-fx-cache', schemaVersion: 1, provider: 'ECB', base: 'EUR' });
    expect(Object.keys(table.observations)).toEqual(['GBP', 'ILS', 'USD']);
    expect(Object.keys(table.observations)).not.toContain('EUR');
    expect(parseTable(serializeTable(table))).toEqual({ ...table, checksum: expect.any(String) });
  });
});

describe('serialization', () => {
  it('is deterministic: the same content gives the same text whatever the insertion order', () => {
    const first = record(createEmptyTable(), [obs('2026-10-08', 'USD', '1.1'), obs('2026-10-09', 'USD', '1.2')]).table;
    const reversed = createEmptyTable();

    reversed.observations.USD = Object.fromEntries(Object.entries(first.observations.USD).reverse());
    reversed.nextFetchId = first.nextFetchId;
    reversed.fetches = first.fetches;
    reversed.coverage = first.coverage;

    expect(serializeTable(reversed)).toBe(serializeTable(first));
  });

  it('round-trips a real six-week table without loss', () => {
    const table = seriesTable();
    const again = parseTable(serializeTable(table));

    expect(serializeTable(again)).toBe(serializeTable(table));
    expect(Object.keys(again.observations.USD)).toHaveLength(29);
  });

  it('stores rates as exact decimal text, never as numbers', () => {
    const table = seriesTable();

    Object.values(table.observations).forEach((byDate) => {
      Object.values(byDate).forEach(([rate]) => expect(typeof rate).toBe('string'));
    });
  });

  it('is compact: well under 100 bytes per observation day for three currencies', () => {
    const text = serializeTable(seriesTable());

    expect(text.length / 29).toBeLessThan(400);
  });
});

describe('recording observations', () => {
  it('adds observations, a fetch record with its time, and valid coverage per currency', () => {
    const { table, added, unchanged, revisions } = record(createEmptyTable(), [obs('2026-10-08', 'USD', '1.1'), obs('2026-10-09', 'USD', '1.2')], {
      fetchedAt: '2026-10-12T08:00:00.000Z'
    });

    expect({ added, unchanged, revisions }).toEqual({ added: 2, unchanged: 0, revisions: 0 });
    expect(table.observations.USD['2026-10-09']).toEqual(['1.2', 1]);
    expect(table.fetches['1']).toEqual({ at: '2026-10-12T08:00:00.000Z', kind: 'range', quotes: ['USD'], from: '2026-10-01', to: '2026-10-09', status: 'ok' });
    expect(table.coverage.USD).toEqual([{ from: '2026-10-01', to: '2026-10-09', status: 'valid', fetch: 1 }]);
    expect(table.coverage.ILS).toEqual([]);
  });

  it('records only the currencies that were asked about, never the others', () => {
    const { table } = record(createEmptyTable(), [obs('2026-10-09', 'USD', '1.2')]);

    expect(table.coverage.GBP).toEqual([]);
    expect(table.coverage.ILS).toEqual([]);
    expect(table.observations.GBP).toEqual({});
  });

  it('records a valid empty answer as confirmed-empty coverage for that currency only', () => {
    const result = clientResult({ observations: [], quotes: ['ILS'], from: '1999-01-04', to: '2000-05-31', expectation: 'any' });
    const { table } = recordObservations(createEmptyTable(), result);

    expect(table.coverage.ILS).toEqual([{ from: '1999-01-04', to: '2000-05-31', status: 'confirmed-empty', fetch: 1 }]);
    expect(table.coverage.USD).toEqual([]);
    expect(Object.keys(table.observations.ILS)).toHaveLength(0);
  });

  it('a requested currency with no observations is confirmed-empty for it, valid for the others', () => {
    const result = clientResult({ observations: [obs('2026-10-09', 'USD', '1.2')], quotes: ['ILS', 'USD'], from: '2026-10-01', to: '2026-10-09', expectation: 'any' });
    const { table } = recordObservations(createEmptyTable(), result);

    expect(table.coverage.USD[0].status).toBe('valid');
    expect(table.coverage.ILS[0].status).toBe('confirmed-empty');
  });

  it('a latest answer extends coverage to the day after the fetch date, no further', () => {
    const result = clientResult({ observations: [obs('2026-10-09', 'USD', '1.1206')], quotes: ['USD'], kind: 'latest', fetchedAt: '2026-10-12T08:00:00.000Z' });
    const { table } = recordObservations(createEmptyTable(), result);

    expect(table.coverage.USD).toEqual([{ from: '2026-10-09', to: '2026-10-13', status: 'valid', fetch: 1 }]);
  });

  it('a range ending in the future cannot claim dates after the fetch moment', () => {
    const result = clientResult({ observations: [obs('2026-10-09', 'USD', '1.1')], quotes: ['USD'], from: '2026-10-01', to: '2026-12-31', fetchedAt: '2026-10-12T08:00:00.000Z' });
    const { table } = recordObservations(createEmptyTable(), result);

    expect(table.coverage.USD[0]).toMatchObject({ from: '2026-10-01', to: '2026-10-13' });
  });

  it('a single-date answer proves only the date it returned', () => {
    const result = clientResult({ observations: [obs('2026-10-09', 'USD', '1.1206')], quotes: ['USD'], kind: 'date', date: '2026-10-10' });
    const { table } = recordObservations(createEmptyTable(), result);

    expect(table.coverage.USD).toEqual([{ from: '2026-10-09', to: '2026-10-09', status: 'valid', fetch: 1 }]);
  });

  it('re-recording the same data adds nothing and flags nothing', () => {
    const first = record(createEmptyTable(), [obs('2026-10-09', 'USD', '1.2')]).table;
    const again = record(first, [obs('2026-10-09', 'USD', '1.2')], { fetchedAt: '2026-10-12T09:00:00.000Z' });

    expect({ added: again.added, unchanged: again.unchanged, revisions: again.revisions }).toEqual({ added: 0, unchanged: 1, revisions: 0 });
    expect(again.table.pendingRevisions).toEqual([]);
    expect(again.table.observations.USD['2026-10-09']).toEqual(['1.2', 1]);
  });

  it('never modifies the table it is given', () => {
    const table = seriesTable();
    const before = serializeTable(table);

    record(table, [obs('2026-10-09', 'USD', '9.9')]);
    expect(serializeTable(table)).toBe(before);
  });
});

describe('revisions are detected, not silently applied', () => {
  const accepted = () => record(createEmptyTable(), [obs('2026-10-09', 'USD', '1.1206')], { fetchedAt: '2026-10-12T08:00:00.000Z' }).table;
  const disagreeing = (table) => record(table, [obs('2026-10-09', 'USD', '1.1209')], { fetchedAt: '2026-10-20T08:00:00.000Z' });

  it('keeps the accepted value and records the disagreeing one as a pending revision', () => {
    const result = disagreeing(accepted());

    expect(result.revisions).toBe(1);
    expect(result.table.observations.USD['2026-10-09']).toEqual(['1.1206', 1]);
    expect(result.table.pendingRevisions).toEqual([
      { quote: 'USD', date: '2026-10-09', accepted: '1.1206', acceptedFetch: 1, candidate: '1.1209', candidateFetch: 2 }
    ]);
    expect(createObservationIndex(result.table).select({ expenseDate: '2026-10-09', currencies: ['EUR', 'USD'], referenceDate: '2026-10-20' }).rates.USD).toBe('1.1206');
  });

  it('does not duplicate the same pending revision when it is seen again', () => {
    const once = disagreeing(accepted()).table;
    const twice = record(once, [obs('2026-10-09', 'USD', '1.1209')], { fetchedAt: '2026-10-21T08:00:00.000Z' }).table;

    expect(twice.pendingRevisions).toHaveLength(1);
  });

  it('applies a revision only on explicit request, and keeps the replaced value in the log', () => {
    const applied = applyPendingRevision(disagreeing(accepted()).table, { quote: 'USD', date: '2026-10-09' });

    expect(applied.observations.USD['2026-10-09']).toEqual(['1.1209', 2]);
    expect(applied.pendingRevisions).toEqual([]);
    expect(applied.revisionLog).toEqual([{ quote: 'USD', date: '2026-10-09', previous: '1.1206', previousFetch: 1, current: '1.1209', currentFetch: 2 }]);
    expect(applied.fetches['1']).toBeDefined();
    expect(parseTable(serializeTable(applied))).toBeTruthy();
  });

  it('can discard a revision and keep the accepted value', () => {
    const kept = discardPendingRevision(disagreeing(accepted()).table, { quote: 'USD', date: '2026-10-09' });

    expect(kept.pendingRevisions).toEqual([]);
    expect(kept.observations.USD['2026-10-09']).toEqual(['1.1206', 1]);
    expect(kept.revisionLog).toEqual([]);
  });

  it('ignores a request to apply a revision that does not exist', () => {
    const table = accepted();

    expect(applyPendingRevision(table, { quote: 'USD', date: '2026-01-01' })).toEqual(table);
  });

  it('a revision never changes any other observation', () => {
    const table = record(accepted(), [obs('2026-10-08', 'USD', '1.1')]).table;
    const applied = applyPendingRevision(disagreeing(table).table, { quote: 'USD', date: '2026-10-09' });

    expect(applied.observations.USD['2026-10-08']).toEqual(table.observations.USD['2026-10-08']);
  });
});

describe('recording failures and provider metadata', () => {
  it('records a failure as non-counting coverage with its error code', () => {
    const table = recordFailure(createEmptyTable(), { kind: 'range', quotes: ['USD', 'ILS'], from: '2026-10-01', to: '2026-10-09', at: '2026-10-12T08:00:00.000Z', errorCode: 'timeout' });

    expect(table.coverage.USD).toEqual([{ from: '2026-10-01', to: '2026-10-09', status: 'failed', fetch: 1 }]);
    expect(table.fetches['1']).toMatchObject({ status: 'failed', error: 'timeout', quotes: ['ILS', 'USD'] });
    expect(Object.keys(table.observations.USD)).toHaveLength(0);
  });

  it('marks a validation failure as partial', () => {
    const table = recordFailure(createEmptyTable(), { kind: 'latest', quotes: ['USD'], from: '2026-10-09', to: '2026-10-09', at: '2026-10-12T08:00:00.000Z', errorCode: 'invalid-rate', partial: true });

    expect(table.coverage.USD[0].status).toBe('partial');
  });

  it('keeps provider metadata with the time it was checked', () => {
    const table = recordProviderMetadata(createEmptyTable(), { startDate: '1999-01-04', endDate: '2026-10-09', publishesMissed: 0, cadence: 'daily' }, '2026-10-12T08:00:00.000Z');

    expect(table.provider_meta).toEqual({ startDate: '1999-01-04', endDate: '2026-10-09', publishesMissed: 0, cadence: 'daily', checkedAt: '2026-10-12T08:00:00.000Z' });
    expect(parseTable(serializeTable(table))).toBeTruthy();
  });

  it('bounds the failure log', () => {
    let table = createEmptyTable();

    for (let index = 0; index < cacheLimits.maxFailureRecords + 20; index += 1) {
      table = recordFailure(table, { kind: 'range', quotes: ['USD'], from: '2026-10-01', to: '2026-10-09', at: `2026-10-12T08:${String(index % 60).padStart(2, '0')}:00.000Z`, errorCode: `e${index}` });
    }

    expect(table.coverage.USD.length).toBeLessThanOrEqual(cacheLimits.maxFailureRecords);
  });
});

describe('corruption is detected, never trusted', () => {
  const good = () => JSON.parse(serializeTable(seriesTable()));
  const reserialize = (document) => JSON.stringify(document);

  it('accepts the untouched document', () => {
    expect(codeOf(() => validateTable(good()))).toBe('ok');
  });

  it('detects a single changed rate through the checksum', () => {
    const document = good();

    document.observations.USD['2026-10-09'][0] = '9.9999';
    expect(codeOf(() => parseTable(reserialize(document)))).toBe('cache-corrupt:checksum-mismatch');
  });

  it('detects a changed date, a removed observation, and an altered coverage', () => {
    ['observations', 'coverage', 'fetches'].forEach((section) => {
      const document = good();

      if (section === 'observations') {
        delete document.observations.ILS['2026-10-09'];
      } else if (section === 'coverage') {
        document.coverage.USD[0].to = '2026-10-13';
      } else {
        document.fetches['1'].at = '2020-01-01T00:00:00.000Z';
      }

      expect(codeOf(() => parseTable(reserialize(document)))).toBe('cache-corrupt:checksum-mismatch');
    });
  });

  it('detects truncated and non-JSON text', () => {
    const text = serializeTable(seriesTable());

    expect(codeOf(() => parseTable(text.slice(0, text.length - 40)))).toBe('cache-corrupt:invalid-json');
    expect(codeOf(() => parseTable('not json'))).toBe('cache-corrupt:invalid-json');
    expect(codeOf(() => parseTable(''))).toBe('cache-corrupt:invalid-json');
  });

  it.each([
    ['not a cache document', () => [], 'not-a-cache'],
    ['another format', (d) => ({ ...d, format: 'something-else' }), 'not-a-cache'],
    ['a non-integer schema version', (d) => ({ ...d, schemaVersion: '1' }), 'invalid-schema-version'],
    ['schema version zero', (d) => ({ ...d, schemaVersion: 0 }), 'invalid-schema-version'],
    ['another provider', (d) => ({ ...d, provider: 'FED' }), 'wrong-provider-or-base'],
    ['another base', (d) => ({ ...d, base: 'USD' }), 'wrong-provider-or-base']
  ])('rejects %s', (_label, change, reason) => {
    expect(codeOf(() => validateTable(change(good())))).toBe(`cache-corrupt:${reason}`);
  });

  describe('even with a valid checksum, structurally bad content is rejected', () => {
    // Rebuild a document that PASSES the checksum but breaks a rule.
    function withBadContent(change) {
      const table = JSON.parse(serializeTable(seriesTable()));

      delete table.checksum;
      change(table);

      return JSON.parse(serializeTable(table));
    }

    it.each([
      ['a rate with a trailing zero', (t) => { t.observations.USD['2026-10-09'][0] = '1.1000'; }, 'invalid-rate'],
      ['a zero rate', (t) => { t.observations.USD['2026-10-09'][0] = '0'; }, 'invalid-rate'],
      ['a numeric rate', (t) => { t.observations.USD['2026-10-09'][0] = 1.12; }, 'invalid-rate'],
      ['a negative rate', (t) => { t.observations.USD['2026-10-09'][0] = '-1.1'; }, 'invalid-rate'],
      ['an exponent rate', (t) => { t.observations.USD['2026-10-09'][0] = '1e0'; }, 'invalid-rate'],
      ['a rate with 16 digits', (t) => { t.observations.USD['2026-10-09'][0] = '1.123456789012345'; }, 'invalid-rate-precision'],
      ['an impossible date', (t) => { t.observations.USD['2026-02-30'] = ['1.1', 1]; }, 'invalid-observation-date'],
      ['a date before the series', (t) => { t.observations.USD['1998-12-31'] = ['1.1', 1]; }, 'invalid-observation-date'],
      ['an observation referring to no fetch', (t) => { t.observations.USD['2026-10-09'][1] = 99; }, 'invalid-observation'],
      ['an observation of the wrong shape', (t) => { t.observations.USD['2026-10-09'] = '1.1'; }, 'invalid-observation'],
      ['a coverage range backwards', (t) => { t.coverage.USD[0].from = '2026-12-01'; }, 'invalid-coverage'],
      ['an unknown coverage status', (t) => { t.coverage.USD[0].status = 'great'; }, 'invalid-coverage'],
      ['coverage referring to no fetch', (t) => { t.coverage.USD[0].fetch = 99; }, 'invalid-coverage'],
      ['an observation section for EUR', (t) => { t.observations.EUR = {}; }, 'unexpected-currency'],
      ['a missing currency section', (t) => { delete t.observations.ILS; }, 'missing-currency-section'],
      ['a fetch id not below nextFetchId', (t) => { t.nextFetchId = 1; }, 'invalid-fetch-record'],
      ['a fetch with a bad time', (t) => { t.fetches['1'].at = 'yesterday'; }, 'invalid-fetch-record'],
      ['a pending revision that does not match the accepted value', (t) => { t.pendingRevisions = [{ quote: 'USD', date: '2026-10-09', accepted: '9', acceptedFetch: 1, candidate: '1.2', candidateFetch: 1 }]; }, 'invalid-pending-revision'],
      ['bad provider metadata', (t) => { t.provider_meta = { startDate: 'x', endDate: 'y' }; }, 'invalid-provider-meta']
    ])('rejects %s', (_label, change, reason) => {
      expect(codeOf(() => validateTable(withBadContent(change)))).toBe(`cache-corrupt:${reason}`);
    });
  });

  it('reports a newer schema as unsupported, never as corrupt', () => {
    const document = good();

    document.schemaVersion = 2;
    expect(codeOf(() => validateTable(document))).toBe('cache-unsupported-version');
  });
});

describe('merging (union, no silent loss)', () => {
  const a = () => record(createEmptyTable(), [obs('2026-10-07', 'USD', '1.1'), obs('2026-10-08', 'USD', '1.2')], { fetchedAt: '2026-10-12T08:00:00.000Z' }).table;
  const b = () => record(createEmptyTable(), [obs('2026-10-08', 'USD', '1.2'), obs('2026-10-09', 'USD', '1.3')], { fetchedAt: '2026-10-12T09:00:00.000Z' }).table;

  it('keeps the observations of both tables', () => {
    const merged = mergeTables(a(), b());

    expect(Object.keys(merged.observations.USD)).toEqual(['2026-10-07', '2026-10-08', '2026-10-09']);
    expect(parseTable(serializeTable(merged))).toBeTruthy();
  });

  it('renumbers fetch ids that collide, keeping every reference correct', () => {
    const merged = mergeTables(a(), b());

    // Both tables used fetch id 1 for different fetches.
    expect(Object.keys(merged.fetches)).toHaveLength(2);
    expect(merged.fetches[String(merged.observations.USD['2026-10-09'][1])].at).toBe('2026-10-12T09:00:00.000Z');
    expect(merged.fetches[String(merged.observations.USD['2026-10-07'][1])].at).toBe('2026-10-12T08:00:00.000Z');
  });

  it('is idempotent: merging a table with itself changes nothing', () => {
    const table = a();

    expect(serializeTable(mergeTables(table, table))).toBe(serializeTable(table));
    expect(serializeTable(mergeTables(mergeTables(table, b()), b()))).toBe(serializeTable(mergeTables(table, b())));
  });

  it('turns a disagreeing observation into a pending revision and keeps the base value', () => {
    const other = record(createEmptyTable(), [obs('2026-10-08', 'USD', '1.25')], { fetchedAt: '2026-10-12T10:00:00.000Z' }).table;
    const merged = mergeTables(a(), other);

    expect(merged.observations.USD['2026-10-08'][0]).toBe('1.2');
    expect(merged.pendingRevisions).toHaveLength(1);
    expect(merged.pendingRevisions[0]).toMatchObject({ accepted: '1.2', candidate: '1.25' });
  });

  it('keeps the newest provider metadata', () => {
    const older = recordProviderMetadata(a(), { startDate: '1999-01-04', endDate: '2026-10-07', publishesMissed: 0, cadence: 'daily' }, '2026-10-12T08:00:00.000Z');
    const newer = recordProviderMetadata(b(), { startDate: '1999-01-04', endDate: '2026-10-09', publishesMissed: 0, cadence: 'daily' }, '2026-10-12T09:00:00.000Z');

    expect(mergeTables(older, newer).provider_meta.endDate).toBe('2026-10-09');
    expect(mergeTables(newer, older).provider_meta.endDate).toBe('2026-10-09');
  });

  it('does not modify either input', () => {
    const left = a();
    const right = b();
    const before = [serializeTable(left), serializeTable(right)];

    mergeTables(left, right);
    expect([serializeTable(left), serializeTable(right)]).toEqual(before);
  });
});

describe('size bound', () => {
  function bigTable(days) {
    const observations = [];

    for (let index = 0; index < days; index += 1) {
      const date = new Date(Date.UTC(2000, 0, 3 + index)).toISOString().slice(0, 10);

      all.forEach((quote) => observations.push(obs(date, quote, `${1 + (index % 7) / 10}`.replace(/\.?0+$/, ''))));
    }

    const to = observations[observations.length - 1].date;

    return recordObservations(createEmptyTable(), clientResult({ observations, quotes: all, from: '2000-01-03', to, fetchedAt: '2026-10-12T08:00:00.000Z' })).table;
  }

  it('drops the oldest dates until the document fits, and never exceeds the cap', () => {
    const table = bigTable(900);
    const limit = Math.floor(serializeTable(table).length / 3);
    const trimmed = enforceSizeLimit(table, limit);

    expect(serializeTable(trimmed).length).toBeLessThanOrEqual(limit);
    expect(Object.keys(trimmed.observations.USD).length).toBeGreaterThan(0);
    // The newest data is kept; the oldest is gone.
    expect(trimmed.observations.USD['2000-01-03']).toBeUndefined();
    const newest = Object.keys(table.observations.USD).sort().pop();

    expect(trimmed.observations.USD[newest]).toBeDefined();
    expect(parseTable(serializeTable(trimmed))).toBeTruthy();
  });

  it('clips coverage with the data, so it never claims dates it no longer holds', () => {
    const table = bigTable(900);
    const trimmed = enforceSizeLimit(table, Math.floor(serializeTable(table).length / 3));
    const firstKept = Object.keys(trimmed.observations.USD).sort()[0];

    trimmed.coverage.USD.forEach((range) => expect(range.from >= firstKept || range.from > '2000-01-03').toBe(true));
    const early = createObservationIndex(trimmed).select({ expenseDate: '2000-02-01', currencies: ['EUR', 'USD'], referenceDate: '2026-10-12' });

    expect(early.status).toBe('needs-fetch');
  });

  it('leaves a table that already fits untouched', () => {
    const table = seriesTable();

    expect(enforceSizeLimit(table, 1_000_000)).toBe(table);
  });

  it('holds the whole 26-year ECB history for three currencies far below the default cap', () => {
    const table = bigTable(26 * 256);

    expect(serializeTable(table).length).toBeLessThan(cacheLimits.maxSerializedLength);
  });
});
