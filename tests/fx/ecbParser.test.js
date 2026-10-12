// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  addDays,
  isValidIsoDate,
  parseEcbMetadata,
  parseEcbObservations,
  supportsJsonSourceText,
  validateEcbObservations
} from '../../src/lib/fx/ecbParser.js';
import { fixture, fixtureJson } from './helpers.js';

/*
 * M2B.1 parsing: the provider answer becomes validated, decimal-safe
 * observations or a typed error. Fixtures are real captured responses.
 */
const all = ['GBP', 'ILS', 'USD'];
const item = (overrides = {}) => ({ date: '2026-10-09', base: 'EUR', quote: 'USD', rate: 1.1206, ...overrides });

function code(action) {
  try {
    action();

    return 'ok';
  } catch (error) {
    return error.code ?? `other:${error.message}`;
  }
}

describe('valid answers (real fixtures)', () => {
  it('parses the latest answer into sorted decimal-string observations', () => {
    const result = parseEcbObservations(fixture('ecb-latest-2026-10-09.json'), { quotes: all, expectation: 'data' });

    expect(result.observations).toEqual([
      { date: '2026-10-09', quote: 'GBP', rate: '0.84763' },
      { date: '2026-10-09', quote: 'ILS', rate: '3.426' },
      { date: '2026-10-09', quote: 'USD', rate: '1.1206' }
    ]);
    expect(result.isEmpty).toBe(false);
    result.observations.forEach((observation) => expect(typeof observation.rate).toBe('string'));
  });

  it('parses a six-week series: 87 observations, ordered by date then quote, no duplicates', () => {
    const { observations } = parseEcbObservations(fixture('ecb-series-2026-09-01_to_2026-10-12.json'), { quotes: all });
    const keys = observations.map((observation) => `${observation.date}|${observation.quote}`);

    expect(observations).toHaveLength(87);
    expect(keys).toEqual([...keys].sort());
    expect(new Set(keys).size).toBe(87);
  });

  it('reads a weekend answer as the observation actually returned (Friday), not the requested date', () => {
    const { observations } = parseEcbObservations(fixture('ecb-on-2026-10-10-saturday.json'), { quotes: all, maxDate: '2026-10-10' });

    expect(new Set(observations.map((observation) => observation.date))).toEqual(new Set(['2026-10-09']));
  });

  it('reads a holiday answer as the preceding working day', () => {
    const { observations } = parseEcbObservations(fixture('ecb-on-2025-12-25-usd.json'), { quotes: ['USD'], maxDate: '2025-12-25' });

    expect(observations).toEqual([{ date: '2025-12-24', quote: 'USD', rate: '1.1787' }]);
  });

  it('accepts the Christmas and Easter series with their multi-day gaps', () => {
    expect(parseEcbObservations(fixture('ecb-series-2025-12-18_to_2025-12-31.json'), { quotes: all }).observations).toHaveLength(24);
    expect(parseEcbObservations(fixture('ecb-series-2025-04-14_to_2025-04-25.json'), { quotes: all }).observations.length).toBeGreaterThan(20);
  });

  it('keeps ILS absent on the first ECB date when only the other currencies were returned', () => {
    const result = parseEcbObservations(fixture('ecb-on-1999-01-04-no-ils.json'), { quotes: ['GBP', 'USD'], expectation: 'data' });

    expect(result.observations.map((observation) => observation.quote)).toEqual(['GBP', 'USD']);
    expect(() => parseEcbObservations(fixture('ecb-on-1999-01-04-no-ils.json'), { quotes: all, expectation: 'data' })).toThrow(
      expect.objectContaining({ code: 'missing-required-currency', details: { quote: 'ILS' } })
    );
  });
});

describe('empty answers are not data', () => {
  it('rejects an empty list where data is expected', () => {
    expect(code(() => parseEcbObservations('[]', { quotes: all, expectation: 'data' }))).toBe('empty-response');
  });

  it('accepts an empty list as a valid "no observations" result where any answer is allowed', () => {
    expect(parseEcbObservations('[]', { quotes: all, expectation: 'any' })).toMatchObject({ observations: [], isEmpty: true });
  });
});

describe('structure', () => {
  it.each([
    ['an object instead of a list', '{"date":"2026-10-09"}'],
    ['a string', '"[]"'],
    ['null', 'null'],
    ['a number', '3']
  ])('rejects %s as an invalid root', (_label, text) => {
    expect(code(() => parseEcbObservations(text, { quotes: all }))).toBe('invalid-root');
  });

  it('rejects text that is not JSON', () => {
    expect(code(() => parseEcbObservations('<html>Bad gateway</html>', { quotes: all }))).toBe('invalid-json');
    expect(code(() => parseEcbObservations('', { quotes: all }))).toBe('invalid-json');
    expect(code(() => parseEcbObservations('[{"date":', { quotes: all }))).toBe('invalid-json');
  });

  it.each([[null], ['text'], [3], [[]]])('rejects an item that is %j', (value) => {
    expect(code(() => validateEcbObservations([value], { quotes: all }))).toBe('invalid-observation');
  });

  it('reports an HTTP-error body as an invalid root, never as data', () => {
    expect(code(() => parseEcbObservations(fixture('ecb-error-422.json'), { quotes: all }))).toBe('invalid-root');
  });

  it('ignores extra provider fields but rejects a different provider', () => {
    expect(code(() => validateEcbObservations([item({ extra: 1 })], { quotes: ['USD'] }))).toBe('ok');
    expect(code(() => validateEcbObservations([item({ provider: 'ECB' })], { quotes: ['USD'] }))).toBe('ok');
    expect(code(() => validateEcbObservations([item({ provider: 'FED' })], { quotes: all }))).toBe('unexpected-provider');
  });
});

describe('base, currency and date', () => {
  it('requires the EUR base', () => {
    ['USD', 'eur', 'EURO', undefined, null].forEach((base) => {
      expect(code(() => validateEcbObservations([item({ base })], { quotes: all }))).toBe('wrong-base');
    });
  });

  it('rejects unsupported currencies, EUR as a quote, and unrequested currencies', () => {
    expect(code(() => validateEcbObservations([item({ quote: 'JPY' })], { quotes: all }))).toBe('unsupported-currency');
    expect(code(() => validateEcbObservations([item({ quote: 'EUR' })], { quotes: all }))).toBe('unsupported-currency');
    expect(code(() => validateEcbObservations([item({ quote: 'EURO' })], { quotes: all }))).toBe('unsupported-currency');
    expect(code(() => validateEcbObservations([item({ quote: 5 })], { quotes: all }))).toBe('unsupported-currency');
    expect(code(() => validateEcbObservations([item({ quote: 'GBP' })], { quotes: ['USD'] }))).toBe('unexpected-quote');
  });

  it.each([
    ['2026-02-30'], ['2026-13-01'], ['2026-00-10'], ['2026-1-1'], ['26-10-09'], ['2026/10/09'], [''], [null], [20261009], ['2026-10-09T00:00:00Z']
  ])('rejects the date %j', (date) => {
    expect(code(() => validateEcbObservations([item({ date })], { quotes: all }))).toBe('invalid-date');
  });

  it('accepts a leap day and rejects a non-leap one', () => {
    expect(isValidIsoDate('2024-02-29')).toBe(true);
    expect(isValidIsoDate('2025-02-29')).toBe(false);
    expect(isValidIsoDate('2100-02-29')).toBe(false);
  });

  it('rejects observations before the ECB series or outside the requested window', () => {
    expect(code(() => validateEcbObservations([item({ date: '1998-12-31' })], { quotes: all }))).toBe('date-out-of-range');
    expect(code(() => validateEcbObservations([item({ date: '2026-09-01' })], { quotes: all, minDate: '2026-09-15' }))).toBe('date-out-of-range');
    expect(code(() => validateEcbObservations([item({ date: '2026-10-12' })], { quotes: all, maxDate: '2026-10-09' }))).toBe('date-out-of-range');
  });

  it('reports a latest answer dated in the future as future provider data', () => {
    expect(code(() => validateEcbObservations([item({ date: '2031-01-02' })], { quotes: all, maxDate: '2026-10-13', latest: true }))).toBe('future-observation');
  });
});

describe('rates and precision', () => {
  it.each([
    [0, 'invalid-rate'], [-1.5, 'invalid-rate'], [Number.NaN, 'invalid-rate'], [Infinity, 'invalid-rate'], [-Infinity, 'invalid-rate'],
    ['1.1206', 'invalid-rate'], [null, 'invalid-rate'], [undefined, 'invalid-rate'], [true, 'invalid-rate']
  ])('rejects the parsed rate %j', (rate, expected) => {
    expect(code(() => validateEcbObservations([item({ rate })], { quotes: all }))).toBe(expected);
  });

  it('rejects zero, negative and exponent tokens in the exact-token mode', () => {
    const text = (token) => `[{"date":"2026-10-09","base":"EUR","quote":"USD","rate":${token}}]`;

    expect(code(() => parseEcbObservations(text('0'), { quotes: all, useSourceText: true }))).toBe('invalid-rate');
    expect(code(() => parseEcbObservations(text('0.0'), { quotes: all, useSourceText: true }))).toBe('invalid-rate');
    expect(code(() => parseEcbObservations(text('-1.12'), { quotes: all, useSourceText: true }))).toBe('invalid-rate');
    expect(code(() => parseEcbObservations(text('1.12e0'), { quotes: all, useSourceText: true }))).toBe('unsupported-precision');
    expect(code(() => parseEcbObservations(text('1E2'), { quotes: all, useSourceText: true }))).toBe('unsupported-precision');
  });

  it('normalizes trailing zeros but never changes the value', () => {
    const text = '[{"date":"2026-10-09","base":"EUR","quote":"ILS","rate":3.4260}]';

    expect(parseEcbObservations(text, { quotes: ['ILS'], useSourceText: true }).observations[0].rate).toBe('3.426');
    expect(parseEcbObservations(text, { quotes: ['ILS'], useSourceText: false }).observations[0].rate).toBe('3.426');
  });

  describe('precision boundary', () => {
    const at = (digits) => `[{"date":"2026-10-09","base":"EUR","quote":"USD","rate":${digits}}]`;

    it('is available in this engine', () => {
      expect(supportsJsonSourceText()).toBe(true);
    });

    it('keeps exactly 15 significant digits in both modes', () => {
      [true, false].forEach((useSourceText) => {
        const result = parseEcbObservations(at('1.12345678901234'), { quotes: ['USD'], useSourceText });

        expect(result.observations[0].rate).toBe('1.12345678901234');
        expect(result.precisionMode).toBe(useSourceText ? 'exact-token' : 'number-boundary');
      });
    });

    it('rejects 16 or more significant digits in BOTH modes instead of claiming they were kept', () => {
      [true, false].forEach((useSourceText) => {
        ['1.123456789012345', '1.12060000000000001', '1.1206000000000000000001', '12345678.90123456', '0.0000123456789012345678'].forEach((token) => {
          expect(code(() => parseEcbObservations(at(token), { quotes: ['USD'], useSourceText }))).toBe('unsupported-precision');
        });
      });
    });

    it('the fallback fails closed: it can no longer silently turn a long token into a shorter rate', () => {
      // Before the guard, this was accepted as 1.1206 in the fallback mode
      // (the extra digits are already lost when the Number is built).
      const error = (() => {
        try {
          parseEcbObservations(at('1.12060000000000001'), { quotes: ['USD'], useSourceText: false });

          return null;
        } catch (caught) {
          return caught;
        }
      })();

      expect(error).toMatchObject({ code: 'unsupported-precision', details: { precisionMode: 'number-boundary' } });
    });

    it('the guard looks only at digit counts: dates, trailing zeros and short rates are unaffected', () => {
      [true, false].forEach((useSourceText) => {
        expect(parseEcbObservations(at('3.4260000000000000'), { quotes: ['USD'], useSourceText }).observations[0].rate).toBe('3.426');
        expect(parseEcbObservations(at('0.000012345678901'), { quotes: ['USD'], useSourceText }).observations[0].rate).toBe('0.000012345678901');
      });
    });

    it('still reports malformed JSON as invalid-json before the precision guard', () => {
      expect(code(() => parseEcbObservations('[{"rate":1.12060000000000001', { quotes: ['USD'], useSourceText: false }))).toBe('invalid-json');
    });

    it('round-trips every rate in the real series exactly through a decimal string', () => {
      const text = fixture('ecb-series-2026-09-01_to_2026-10-12.json');
      const exact = parseEcbObservations(text, { quotes: all, useSourceText: true }).observations;
      const bounded = parseEcbObservations(text, { quotes: all, useSourceText: false }).observations;

      expect(bounded).toEqual(exact);
      fixtureJson('ecb-series-2026-09-01_to_2026-10-12.json').forEach((raw, index) => {
        expect(String(raw.rate)).toBe(exact[index].rate);
        expect(exact[index].rate.replace('.', '').replace(/^0+/, '').length).toBeLessThanOrEqual(5);
      });
    });
  });
});

describe('duplicates and conflicts', () => {
  it('rejects an exact repeat as a duplicate', () => {
    expect(code(() => validateEcbObservations([item(), item()], { quotes: all }))).toBe('duplicate-observation');
  });

  it('rejects the same date and currency with a different rate as a conflict', () => {
    expect(code(() => validateEcbObservations([item(), item({ rate: 1.12 })], { quotes: all }))).toBe('conflicting-observation');
  });

  it('treats 1.1206 and 1.12060 as the same rate (a duplicate, not a conflict)', () => {
    const text = '[{"date":"2026-10-09","base":"EUR","quote":"USD","rate":1.1206},{"date":"2026-10-09","base":"EUR","quote":"USD","rate":1.12060}]';

    expect(code(() => parseEcbObservations(text, { quotes: all, useSourceText: true }))).toBe('duplicate-observation');
  });

  it('allows the same currency on different dates and different currencies on one date', () => {
    expect(code(() => validateEcbObservations([item(), item({ date: '2026-10-08' }), item({ quote: 'ILS', rate: 3.4 })], { quotes: ['USD', 'ILS'] }))).toBe('ok');
  });
});

describe('metadata', () => {
  it('parses the real provider metadata', () => {
    expect(parseEcbMetadata(fixture('ecb-metadata.json'))).toEqual({
      key: 'ECB',
      pivotCurrency: 'EUR',
      startDate: '1999-01-04',
      endDate: '2026-10-09',
      publishesMissed: 0,
      cadence: 'daily'
    });
  });

  it('rejects metadata for another provider, another pivot, bad dates, or missing currencies', () => {
    const base = fixtureJson('ecb-metadata.json');
    const text = (changes) => JSON.stringify({ ...base, ...changes });

    expect(code(() => parseEcbMetadata(text({ key: 'FED' })))).toBe('unexpected-provider');
    expect(code(() => parseEcbMetadata(text({ pivot_currency: 'USD' })))).toBe('wrong-base');
    expect(code(() => parseEcbMetadata(text({ end_date: '2026-13-01' })))).toBe('invalid-metadata');
    expect(code(() => parseEcbMetadata(text({ start_date: '2027-01-01' })))).toBe('invalid-metadata');
    expect(code(() => parseEcbMetadata(text({ currencies: ['EUR', 'USD', 'GBP'] })))).toBe('missing-required-currency');
    expect(code(() => parseEcbMetadata(text({ currencies: 'EUR' })))).toBe('invalid-metadata');
    expect(code(() => parseEcbMetadata('[]'))).toBe('invalid-metadata');
    expect(code(() => parseEcbMetadata('nope'))).toBe('invalid-json');
  });

  it('tolerates a missing publishes_missed count', () => {
    const withoutCount = { ...fixtureJson('ecb-metadata.json') };

    delete withoutCount.publishes_missed;
    expect(parseEcbMetadata(JSON.stringify(withoutCount)).publishesMissed).toBeNull();
  });
});

describe('calendar arithmetic is independent of the machine timezone', () => {
  it.each([
    ['2026-03-01', -1, '2026-02-28'], ['2024-03-01', -1, '2024-02-29'], ['2026-12-31', 1, '2027-01-01'],
    ['2026-10-25', 1, '2026-10-26'], ['2026-03-29', 1, '2026-03-30'], ['2026-10-09', -10, '2026-09-29']
  ])('addDays(%s, %i) = %s', (date, days, expected) => {
    expect(addDays(date, days)).toBe(expected);
  });
});
