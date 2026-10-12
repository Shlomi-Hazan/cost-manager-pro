import { describe, expect, it } from 'vitest';
import { buildEcbMetadataUrl, buildEcbRatesUrl, createEcbClient, parseRetryAfter } from '../../src/lib/fx/ecbClient.js';
import { clientDefaults } from '../../src/lib/fx/constants.js';
import { createFakeTimers, createFetchScript, ecbOrigin, fixture, response, settle } from './helpers.js';

/*
 * M2B.1 provider client. Every test uses a scripted fetch, manual timers and
 * a frozen clock: no network, no real waiting.
 */
const NOW = Date.parse('2026-10-12T08:00:00.000Z');
const prefix = `${ecbOrigin}/v2/providers/ecb`;
const latestBody = fixture('ecb-latest-2026-10-09.json');
const seriesBody = fixture('ecb-series-2026-09-01_to_2026-10-12.json');

function setup(steps, overrides = {}) {
  const timers = createFakeTimers();
  const fetch = createFetchScript(steps);
  const client = createEcbClient({ fetch, timers, now: () => NOW, random: () => 0, ...overrides });

  return { timers, fetch, client };
}

function failureOf(outcome) {
  expect(outcome.ok).toBe(false);

  return outcome.error;
}

describe('request URLs', () => {
  it('always target the ECB-specific provider endpoint with base EUR', () => {
    const urls = [
      buildEcbRatesUrl({ quotes: ['USD', 'GBP', 'ILS'] }),
      buildEcbRatesUrl({ quotes: ['USD'], date: '2026-10-10' }),
      buildEcbRatesUrl({ quotes: ['ILS'], from: '2026-09-01', to: '2026-10-12' }),
      buildEcbMetadataUrl()
    ];

    urls.forEach((url) => {
      expect(url.startsWith(`${prefix}`)).toBe(true);
      expect(url).not.toMatch(/\/v2\/rates/);
    });
    expect(urls[0]).toBe(`${prefix}/rates?base=EUR&quotes=GBP,ILS,USD`);
    expect(urls[1]).toBe(`${prefix}/rates?base=EUR&quotes=USD&date=2026-10-10`);
    expect(urls[2]).toBe(`${prefix}/rates?base=EUR&quotes=ILS&from=2026-09-01&to=2026-10-12`);
    expect(urls[3]).toBe(prefix);
  });

  it('sorts and de-duplicates the quotes so identical needs give identical URLs', () => {
    expect(buildEcbRatesUrl({ quotes: ['USD', 'ILS', 'USD', 'GBP'] })).toBe(buildEcbRatesUrl({ quotes: ['GBP', 'USD', 'ILS'] }));
  });

  it.each([
    [{ quotes: [] }], [{ quotes: ['EUR'] }], [{ quotes: ['JPY'] }], [{ quotes: 'USD' }], [{ quotes: ['EURO'] }],
    [{ quotes: ['USD'], date: '2026-02-30' }], [{ quotes: ['USD'], date: '2026-10-10', from: '2026-10-01', to: '2026-10-02' }],
    [{ quotes: ['USD'], from: '2026-10-05' }], [{ quotes: ['USD'], to: '2026-10-05' }], [{ quotes: ['USD'], from: '2026-10-06', to: '2026-10-05' }],
    [{ quotes: ['USD'], from: '2026-10-05&providers=x', to: '2026-10-06' }]
  ])('rejects the invalid request %j before any network call', (params) => {
    expect(() => buildEcbRatesUrl(params)).toThrow(expect.objectContaining({ code: 'invalid-request' }));
  });
});

describe('successful requests', () => {
  it('fetches the latest observations from the ECB path, with only safe headers', async () => {
    const { client, fetch, timers } = setup([response(latestBody)]);
    const outcome = await settle(client.fetchLatest(), timers);

    expect(outcome.ok).toBe(true);
    expect(fetch.calls).toHaveLength(1);
    expect(fetch.calls[0].url).toBe(`${prefix}/rates?base=EUR&quotes=GBP,ILS,USD`);
    expect(fetch.calls[0].init.method).toBe('GET');
    // Only a CORS-safelisted header: no preflight, no credentials.
    expect(fetch.calls[0].init.headers).toEqual({ Accept: 'application/json' });
    expect(fetch.calls[0].init.credentials).toBeUndefined();
    expect(outcome.value.observations).toHaveLength(3);
    expect(outcome.value.request).toEqual({ kind: 'latest', url: fetch.calls[0].url, quotes: ['GBP', 'ILS', 'USD'] });
    expect(outcome.value.fetchedAt).toBe('2026-10-12T08:00:00.000Z');
    expect(outcome.value.attempts).toBe(1);
  });

  it('fetches a date range and accepts the observation that precedes `from`', async () => {
    const body = fixture('ecb-series-2025-12-18_to_2025-12-31.json');
    const { client, fetch, timers } = setup([response(body)]);
    const outcome = await settle(client.fetchRange({ from: '2025-12-20', to: '2025-12-31' }), timers);

    expect(fetch.calls[0].url).toBe(`${prefix}/rates?base=EUR&quotes=GBP,ILS,USD&from=2025-12-20&to=2025-12-31`);
    expect(outcome.ok).toBe(true);
    expect(outcome.value.observations[0].date).toBe('2025-12-18');
  });

  it('rejects an observation implausibly far before `from`', async () => {
    const { client, timers } = setup([response(seriesBody)]);
    const error = failureOf(await settle(client.fetchRange({ from: '2026-10-05', to: '2026-10-12' }), timers));

    expect(error.code).toBe('date-out-of-range');
  });

  it('rejects an observation after `to`', async () => {
    const { client, timers } = setup([response(seriesBody)]);
    const error = failureOf(await settle(client.fetchRange({ from: '2026-09-01', to: '2026-09-30' }), timers));

    expect(error.code).toBe('date-out-of-range');
  });

  it('fetches one date and reports the observation date the provider answered with', async () => {
    const { client, fetch, timers } = setup([response(fixture('ecb-on-2026-10-10-saturday.json'))]);
    const outcome = await settle(client.fetchOnDate({ date: '2026-10-10' }), timers);

    expect(fetch.calls[0].url).toBe(`${prefix}/rates?base=EUR&quotes=GBP,ILS,USD&date=2026-10-10`);
    expect(new Set(outcome.value.observations.map((observation) => observation.date))).toEqual(new Set(['2026-10-09']));
  });

  it('fetches provider metadata', async () => {
    const { client, fetch, timers } = setup([response(fixture('ecb-metadata.json'), { url: prefix })]);
    const outcome = await settle(client.fetchMetadata(), timers);

    expect(fetch.calls[0].url).toBe(prefix);
    expect(outcome.value.metadata).toMatchObject({ key: 'ECB', startDate: '1999-01-04', endDate: '2026-10-09' });
  });

  it('rejects provider data dated in the future on a latest request', async () => {
    const future = JSON.stringify([{ date: '2031-01-02', base: 'EUR', quote: 'USD', rate: 1.1 }, { date: '2031-01-02', base: 'EUR', quote: 'GBP', rate: 0.8 }, { date: '2031-01-02', base: 'EUR', quote: 'ILS', rate: 3.4 }]);
    const { client, timers } = setup([response(future)]);

    expect(failureOf(await settle(client.fetchLatest(), timers)).code).toBe('future-observation');
  });
});

describe('answers that are not data (never retried, never accepted)', () => {
  it('rejects an empty list where data is required', async () => {
    const { client, fetch, timers } = setup([response('[]')]);
    const error = failureOf(await settle(client.fetchLatest(), timers));

    expect(error.code).toBe('empty-response');
    expect(fetch.calls).toHaveLength(1);
  });

  it('returns an empty list as a valid result only when the caller allows any answer', async () => {
    const { client, timers } = setup([response('[]')]);
    const outcome = await settle(client.fetchRange({ from: '2030-01-01', to: '2030-01-31', expectation: 'any' }), timers);

    expect(outcome.ok).toBe(true);
    expect(outcome.value).toMatchObject({ observations: [], isEmpty: true, expectation: 'any' });
  });

  it('rejects a missing required currency', async () => {
    const body = JSON.stringify([{ date: '2026-10-09', base: 'EUR', quote: 'USD', rate: 1.1206 }]);
    const { client, fetch, timers } = setup([response(body)]);
    const error = failureOf(await settle(client.fetchLatest(), timers));

    expect(error.code).toBe('missing-required-currency');
    expect(fetch.calls).toHaveLength(1);
  });

  it.each([
    ['not JSON', '<html>bad gateway</html>', 'invalid-json'],
    ['a wrong root', '{"rates":{}}', 'invalid-root'],
    ['the wrong base', JSON.stringify([{ date: '2026-10-09', base: 'USD', quote: 'EUR', rate: 0.89 }]), 'wrong-base']
  ])('rejects %s without retrying', async (_label, body, expected) => {
    const { client, fetch, timers } = setup([response(body)]);
    const error = failureOf(await settle(client.fetchLatest(), timers));

    expect(error.code).toBe(expected);
    expect(fetch.calls).toHaveLength(1);
  });

  it('never accepts an answer from outside the ECB provider endpoint (a redirect to the blended feed)', async () => {
    const { client, fetch, timers } = setup([response(latestBody, { url: `${ecbOrigin}/v2/rates?base=EUR` })]);
    const error = failureOf(await settle(client.fetchLatest(), timers));

    expect(error.code).toBe('unexpected-endpoint');
    expect(fetch.calls).toHaveLength(1);
    expect(failureOf(await settle(setup([response(latestBody, { url: 'https://evil.example/v2/providers/ecb/rates' })]).client.fetchLatest(), createFakeTimers())).code).toBe('unexpected-endpoint');
  });
});

describe('retries and backoff', () => {
  it('retries a 503 once and succeeds, after the backoff delay', async () => {
    const { client, fetch, timers } = setup([response('', { status: 503 }), response(latestBody)]);
    const outcome = await settle(client.fetchLatest(), timers);

    expect(outcome.ok).toBe(true);
    expect(outcome.value.attempts).toBe(2);
    expect(fetch.calls).toHaveLength(2);
    expect(timers.now()).toBe(500);
  });

  it.each([429, 502, 503, 504])('treats HTTP %i as transient: three attempts, then a structured error', async (status) => {
    const { client, fetch, timers } = setup([response('', { status })]);
    const error = failureOf(await settle(client.fetchLatest(), timers));

    expect(fetch.calls).toHaveLength(1 + clientDefaults.maxRetries);
    expect(error.code).toBe(status === 429 ? 'rate-limited' : 'provider-unavailable');
    expect(error.details).toMatchObject({ status, attempts: 3 });
    // 500 ms then 1000 ms of backoff.
    expect(timers.now()).toBe(1500);
  });

  it.each([400, 404, 422, 500, 401])('does not retry HTTP %i', async (status) => {
    const { client, fetch, timers } = setup([response(fixture('ecb-error-422.json'), { status })]);
    const error = failureOf(await settle(client.fetchLatest(), timers));

    expect(fetch.calls).toHaveLength(1);
    expect(error.code).toBe('http-error');
    expect(error.details).toMatchObject({ status, retryable: false });
  });

  it('retries network failures and reports the last one', async () => {
    const { client, fetch, timers } = setup(['offline']);
    const error = failureOf(await settle(client.fetchLatest(), timers));

    expect(error.code).toBe('network-error');
    expect(fetch.calls).toHaveLength(3);
    expect(error.details.attempts).toBe(3);
  });

  it('recovers when a network failure is followed by a good answer', async () => {
    const { client, timers } = setup(['offline', response(latestBody)]);

    expect((await settle(client.fetchLatest(), timers)).ok).toBe(true);
  });

  it('doubles the delay and caps it', async () => {
    const { client, fetch, timers } = setup([response('', { status: 503 })], { maxRetries: 5, baseDelayMs: 500, maxDelayMs: 2000 });

    await settle(client.fetchLatest(), timers);
    // 500 + 1000 + 2000 + 2000 + 2000
    expect(fetch.calls).toHaveLength(6);
    expect(timers.now()).toBe(7500);
  });

  it('adds jitter below half the base delay and never exceeds the cap', async () => {
    const { client, timers } = setup([response('', { status: 503 })], { random: () => 0.999, maxRetries: 1, baseDelayMs: 500, maxDelayMs: 600 });

    await settle(client.fetchLatest(), timers);
    expect(timers.now()).toBe(600);
  });

  it('uses the documented defaults (10 s timeout, two retries)', () => {
    expect(clientDefaults).toMatchObject({ timeoutMs: 10000, maxRetries: 2 });
  });
});

describe('Retry-After', () => {
  it('waits exactly the number of seconds given', async () => {
    const { client, timers } = setup([response('', { status: 429, headers: { 'Retry-After': '2' } }), response(latestBody)]);
    const outcome = await settle(client.fetchLatest(), timers);

    expect(outcome.ok).toBe(true);
    expect(timers.now()).toBe(2000);
  });

  it('honours an HTTP-date relative to the injected clock', async () => {
    const { client, timers } = setup([response('', { status: 503, headers: { 'Retry-After': 'Mon, 12 Oct 2026 08:00:05 GMT' } }), response(latestBody)]);

    await settle(client.fetchLatest(), timers);
    expect(timers.now()).toBe(5000);
  });

  it('does not wait for an unreasonably long Retry-After: it reports the delay and stops', async () => {
    const { client, fetch, timers } = setup([response('', { status: 429, headers: { 'Retry-After': '120' } }), response(latestBody)]);
    const error = failureOf(await settle(client.fetchLatest(), timers));

    expect(fetch.calls).toHaveLength(1);
    expect(error.code).toBe('rate-limited');
    expect(error.details).toMatchObject({ retryAfterMs: 120000, retryAfterTooLong: true, retryable: false });
    expect(timers.now()).toBe(0);
  });

  it.each([
    [null, null], ['', null], ['soon', null], ['0', 0], ['3', 3000], ['  7 ', 7000], ['Mon, 12 Oct 2026 07:59:00 GMT', 0], ['Mon, 12 Oct 2026 08:01:00 GMT', 60000]
  ])('parses %j as %j ms', (value, expected) => {
    expect(parseRetryAfter(value, NOW)).toBe(expected);
  });
});

describe('timeouts', () => {
  it('times out a request that never answers, retries, and finally fails with `timeout`', async () => {
    const { client, fetch, timers } = setup(['hang']);
    const error = failureOf(await settle(client.fetchLatest(), timers));

    expect(error.code).toBe('timeout');
    expect(fetch.calls).toHaveLength(3);
    // 3 x 10 s of waiting plus 500 ms and 1000 ms of backoff.
    expect(timers.now()).toBe(31500);
    expect(fetch.calls.every((call) => call.init.signal.aborted)).toBe(true);
  });

  it('recovers from one timeout', async () => {
    const { client, timers } = setup(['hang', response(latestBody)]);
    const outcome = await settle(client.fetchLatest(), timers);

    expect(outcome.ok).toBe(true);
    expect(outcome.value.attempts).toBe(2);
  });

  it('honours a custom timeout', async () => {
    const { client, timers } = setup(['hang'], { timeoutMs: 1000, maxRetries: 0 });

    expect(failureOf(await settle(client.fetchLatest(), timers)).code).toBe('timeout');
    expect(timers.now()).toBe(1000);
  });

  it('does not leave timers behind after success', async () => {
    const { client, timers } = setup([response(latestBody)]);

    await settle(client.fetchLatest(), timers);
    expect(timers.pendingCount()).toBe(0);
  });
});

describe('cancellation', () => {
  it('does not call the network when already cancelled', async () => {
    const { client, fetch, timers } = setup([response(latestBody)]);
    const controller = new AbortController();

    controller.abort();
    const error = failureOf(await settle(client.fetchLatest({ signal: controller.signal }), timers));

    expect(error.code).toBe('aborted');
    expect(fetch.calls).toHaveLength(0);
  });

  it('stops a request in flight and does not retry', async () => {
    const { client, fetch, timers } = setup(['hang']);
    const controller = new AbortController();
    const pending = settle(client.fetchLatest({ signal: controller.signal }), timers);

    await Promise.resolve();
    controller.abort();
    const error = failureOf(await pending);

    expect(error.code).toBe('aborted');
    expect(fetch.calls).toHaveLength(1);
    expect(timers.pendingCount()).toBe(0);
  });

  it('stops during a backoff sleep and makes no further attempt', async () => {
    const { client, fetch, timers } = setup([response('', { status: 503 }), response(latestBody)]);
    const controller = new AbortController();
    const pending = client.fetchLatest({ signal: controller.signal });
    let outcome = null;

    pending.then((value) => { outcome = { ok: true, value }; }, (error) => { outcome = { ok: false, error }; });
    for (let step = 0; step < 40; step += 1) {
      await Promise.resolve();
    }

    expect(fetch.calls).toHaveLength(1);
    expect(timers.pendingCount()).toBe(1);
    controller.abort();
    for (let step = 0; step < 40; step += 1) {
      await Promise.resolve();
    }

    expect(outcome.error.code).toBe('aborted');
    expect(fetch.calls).toHaveLength(1);
    expect(timers.pendingCount()).toBe(0);
  });
});

describe('sharing identical requests', () => {
  it('sends one request for two identical concurrent calls and gives each caller its own copy', async () => {
    const { client, fetch, timers } = setup([response(latestBody)]);
    const first = client.fetchLatest();
    const second = client.fetchLatest();
    const [a, b] = await Promise.all([settle(first, timers), settle(second, timers)]);

    expect(fetch.calls).toHaveLength(1);
    expect(a.value).toEqual(b.value);
    expect(a.value).not.toBe(b.value);
    a.value.observations[0].rate = 'changed';
    expect(b.value.observations[0].rate).not.toBe('changed');
  });

  it('does not share requests that differ (other dates, other expectation)', async () => {
    const { client, fetch, timers } = setup([response(seriesBody)]);

    await Promise.all([
      settle(client.fetchRange({ from: '2026-09-01', to: '2026-10-12' }), timers),
      settle(client.fetchRange({ from: '2026-09-02', to: '2026-10-12' }), timers),
      settle(client.fetchRange({ from: '2026-09-01', to: '2026-10-12', expectation: 'any' }), timers)
    ]);
    expect(fetch.calls).toHaveLength(3);
  });

  it('does not cache: a later identical call is a new request', async () => {
    const { client, fetch, timers } = setup([response(latestBody)]);

    await settle(client.fetchLatest(), timers);
    await settle(client.fetchLatest(), timers);
    expect(fetch.calls).toHaveLength(2);
  });

  it('keeps the shared request alive when only one of two callers cancels', async () => {
    const { client, fetch, timers } = setup([response(latestBody)]);
    const controller = new AbortController();
    const cancelled = client.fetchLatest({ signal: controller.signal });
    const kept = client.fetchLatest();

    controller.abort();
    const [first, second] = await Promise.all([settle(cancelled, timers), settle(kept, timers)]);

    expect(first.error.code).toBe('aborted');
    expect(second.ok).toBe(true);
    expect(fetch.calls).toHaveLength(1);
  });

  it('cancels the shared request only when every caller has cancelled', async () => {
    const { client, fetch, timers } = setup(['hang']);
    const one = new AbortController();
    const two = new AbortController();
    const a = settle(client.fetchLatest({ signal: one.signal }), timers);
    const b = settle(client.fetchLatest({ signal: two.signal }), timers);

    await Promise.resolve();
    one.abort();
    await Promise.resolve();
    expect(fetch.calls[0].init.signal.aborted).toBe(false);
    two.abort();
    const [first, second] = await Promise.all([a, b]);

    expect(first.error.code).toBe('aborted');
    expect(second.error.code).toBe('aborted');
    expect(fetch.calls).toHaveLength(1);
    expect(fetch.calls[0].init.signal.aborted).toBe(true);
  });

  it('reports a shared failure to every caller', async () => {
    const { client, fetch, timers } = setup([response('', { status: 404 })]);
    const [a, b] = await Promise.all([settle(client.fetchLatest(), timers), settle(client.fetchLatest(), timers)]);

    expect(a.error.code).toBe('http-error');
    expect(b.error.code).toBe('http-error');
    expect(fetch.calls).toHaveLength(1);
  });
});
