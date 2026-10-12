import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { quotaError } from '../storage/fixtures.js';

/*
 * Deterministic helpers for the FX tests: frozen fixtures, a scripted fetch,
 * manual timers, and an in-memory storage that can inject failures. Nothing
 * here touches the network, the real clock, or localStorage.
 */
export function fixture(name) {
  // Resolved from the project root (vitest runs there); the jsdom URL class
  // does not resolve import.meta.url reliably.
  return readFileSync(join(process.cwd(), 'tests/fx/fixtures', name), 'utf8');
}

export function fixtureJson(name) {
  return JSON.parse(fixture(name));
}

export const ecbOrigin = 'https://api.frankfurter.dev';

// A minimal Response stand-in: what the client reads, nothing more.
export function response(body, { status = 200, headers = {}, url = `${ecbOrigin}/v2/providers/ecb/rates` } = {}) {
  const lower = Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]));

  return {
    ok: status >= 200 && status < 300,
    status,
    url,
    headers: { get: (name) => lower[name.toLowerCase()] ?? null },
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    json: async () => (typeof body === 'string' ? JSON.parse(body) : body)
  };
}

// Manual timers: nothing fires until the test advances them.
export function createFakeTimers() {
  let current = 0;
  let sequence = 0;
  const pending = new Map();

  function runEarliest(limit = Infinity) {
    const entries = [...pending.entries()].sort((a, b) => a[1].at - b[1].at || a[0] - b[0]);
    const [id, timer] = entries[0] ?? [];

    if (!timer || timer.at > limit) {
      return false;
    }

    pending.delete(id);
    current = Math.max(current, timer.at);
    timer.callback();

    return true;
  }

  return {
    setTimeout(callback, ms) {
      sequence += 1;
      pending.set(sequence, { at: current + ms, callback });

      return sequence;
    },
    clearTimeout(id) {
      pending.delete(id);
    },
    runNext: () => runEarliest(),
    advance(ms) {
      const limit = current + ms;

      while (runEarliest(limit)) {
        // keep firing everything due within the window
      }

      current = limit;
    },
    pendingCount: () => pending.size,
    now: () => current
  };
}

const flush = async () => {
  for (let index = 0; index < 20; index += 1) {
    await Promise.resolve();
  }
};

/**
 * Drives a promise that depends on fake timers to completion and returns
 * { ok, value } or { ok: false, error }.
 */
export async function settle(promise, timers, { maxSteps = 100 } = {}) {
  let outcome = null;

  promise.then(
    (value) => {
      outcome = { ok: true, value };
    },
    (error) => {
      outcome = { ok: false, error };
    }
  );

  for (let step = 0; step < maxSteps && outcome === null; step += 1) {
    await flush();

    if (outcome === null && !timers.runNext()) {
      await flush();
    }
  }

  if (outcome === null) {
    throw new Error('The promise did not settle.');
  }

  return outcome;
}

function abortError() {
  return Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' });
}

/**
 * A fetch that plays a script, one step per call. A step is a response, a
 * function (url, init) => response | Promise, 'hang' (never answers, but
 * rejects when aborted), or 'offline' (a network failure). The last step
 * repeats. `calls` records every request.
 */
export function createFetchScript(steps) {
  const calls = [];

  async function scripted(url, init = {}) {
    const index = Math.min(calls.length, steps.length - 1);
    const step = steps[index];

    calls.push({ url, init });

    if (step === 'offline') {
      throw new TypeError('Failed to fetch');
    }

    if (step === 'hang') {
      return new Promise((_resolve, reject) => {
        if (init.signal?.aborted) {
          reject(abortError());
        }

        init.signal?.addEventListener('abort', () => reject(abortError()), { once: true });
      });
    }

    return typeof step === 'function' ? step(url, init) : step;
  }

  scripted.calls = calls;

  return scripted;
}

// In-memory storage with failure injection, shaped like the cache's adapter.
export function createMemoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  const failures = { read: null, write: null, remove: null };
  const log = [];

  return {
    data,
    failures,
    log,
    read(key) {
      log.push(['read', key]);

      if (failures.read) {
        throw failures.read;
      }

      return data.get(key) ?? null;
    },
    write(key, value) {
      log.push(['write', key]);

      if (failures.write) {
        throw failures.write();
      }

      data.set(key, value);
    },
    remove(key) {
      log.push(['remove', key]);
      data.delete(key);
    },
    writes: () => log.filter(([operation]) => operation === 'write').length
  };
}

export const quota = () => quotaError();

// A client result as the real client returns it, built from fixture text.
export function clientResult({ observations, kind = 'range', from, to, date, quotes, fetchedAt = '2026-10-12T08:00:00.000Z', expectation = 'data' }) {
  const request = { kind, quotes: [...quotes].sort() };

  [['from', from], ['to', to], ['date', date]].forEach(([name, value]) => {
    if (value !== undefined) {
      request[name] = value;
    }
  });

  return { observations, isEmpty: observations.length === 0, precisionMode: 'exact-token', expectation, request, fetchedAt };
}
