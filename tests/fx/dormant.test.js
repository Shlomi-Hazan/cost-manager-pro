import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import process from 'node:process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { costsDatabase } from '../../src/lib/costsDatabase.js';
import { exchangeRatesCacheKey } from '../../src/lib/exchangeRatesCache.js';
import { fxCacheKey } from '../../src/lib/fx/constants.js';
import { createFxCache } from '../../src/lib/fx/fxCache.js';
import { buildBackupFile } from '../../src/services/dataManagementService.js';
import { refreshExchangeRates } from '../../src/services/exchangeRatesService.js';
import { clientResult, fixture, response } from './helpers.js';
import { parseEcbObservations } from '../../src/lib/fx/ecbParser.js';

/*
 * M2B.1 is DORMANT: nothing in the running application uses it, and it
 * changes no behaviour, request, storage write, or number. These tests are
 * the proof.
 */
const root = process.cwd();

function sourceFiles(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);

    if (statSync(path).isDirectory()) {
      return sourceFiles(path);
    }

    return /\.(js|jsx)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

describe('nothing in the application imports the FX infrastructure', () => {
  const application = sourceFiles(join(root, 'src')).filter((file) => !relative(root, file).startsWith(join('src', 'lib', 'fx')));

  it('scans the whole application source (not an empty list)', () => {
    expect(application.length).toBeGreaterThan(50);
  });

  it('has no import of src/lib/fx anywhere outside it, including startup and report paths', () => {
    const importers = application.filter((file) => /from\s+['"][^'"]*\/fx\/|from\s+['"][^'"]*\/fx['"]|import\(\s*['"][^'"]*\/fx\//.test(readFileSync(file, 'utf8')));

    expect(importers.map((file) => relative(root, file))).toEqual([]);
    expect(readFileSync(join(root, 'src/main.jsx'), 'utf8')).not.toMatch(/fx/i);
  });

  it('is not reachable from the report, chart, export or database modules', () => {
    ['src/lib/db.js', 'src/lib/money/financials.js', 'src/lib/money/money.js', 'src/services/detailedReportsService.js', 'src/services/exchangeRatesService.js', 'src/lib/exchangeRatesCache.js', 'src/services/settingsService.js', 'src/utils/currency.js'].forEach((file) => {
      expect(readFileSync(join(root, file), 'utf8')).not.toMatch(/lib\/fx|\.\/fx\//);
    });
  });
});

describe('the FX infrastructure depends on nothing that stores or reports expenses', () => {
  const files = sourceFiles(join(root, 'src/lib/fx'));
  const specifiers = files.flatMap((file) =>
    [...readFileSync(file, 'utf8').matchAll(/from\s+'([^']+)'/g)].map((match) => ({ file: relative(root, file), specifier: match[1] }))
  );

  it('imports only its own modules, the currency list, date validation, the decimal engine and the storage wrappers', () => {
    const allowed = [/^\.\/[a-zA-Z]+\.js$/, /^\.\.\/\.\.\/constants\/currencies\.js$/, /^\.\.\/costValidation\.js$/, /^\.\.\/money\/decimal\.js$/, /^\.\.\/storage\/browserStorage\.js$/];
    const disallowed = specifiers.filter(({ specifier }) => !allowed.some((pattern) => pattern.test(specifier)));

    expect(disallowed).toEqual([]);
  });

  it('never imports React, the database, the cost store, the demo-rate cache, or settings', () => {
    specifiers.forEach(({ specifier }) => {
      expect(specifier).not.toMatch(/react|@mui|db\.js|costStore|costsDatabase|exchangeRatesCache|settingsService|exchangeRatesService|costDocument|backupFormat/);
    });
  });
});

describe('loading it has no side effects', () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('issues no request and touches no storage when imported', async () => {
    const fetchSpy = vi.fn();

    globalThis.fetch = fetchSpy;
    const storageSpies = ['getItem', 'setItem', 'removeItem', 'clear'].map((method) => vi.spyOn(Storage.prototype, method));

    vi.resetModules();
    const module = await import('../../src/lib/fx/index.js');

    expect(Object.keys(module).length).toBeGreaterThan(20);
    expect(fetchSpy).not.toHaveBeenCalled();
    storageSpies.forEach((spy) => expect(spy).not.toHaveBeenCalled());
  });

  it('creating a client or a cache performs no request and no write by itself', async () => {
    const fetchSpy = vi.fn();

    globalThis.fetch = fetchSpy;
    const { createEcbClient } = await import('../../src/lib/fx/ecbClient.js');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    createEcbClient();
    createFxCache().inspect();
    createFxCache().getTable();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });
});

describe('the running application still uses the demonstration rates, unchanged', () => {
  const realFetch = globalThis.fetch;
  const expenses = JSON.stringify({
    schemaVersion: 2,
    costs: [
      { id: 'a', sum: 34, currency: 'ILS', category: 'Food', description: 'Lunch', date: { day: 5, month: 10, year: 2026, hour: 9, minute: 0 } },
      { id: 'b', sum: 10, currency: 'USD', category: 'Food', description: 'Coffee', date: { day: 6, month: 10, year: 2026, hour: 9, minute: 0 } }
    ]
  });

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('cost-manager-pro:costsdb:v2:costs', expenses);
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    localStorage.clear();
  });

  it('refreshes the demo rates from the bundled file only, and never contacts the ECB provider', async () => {
    const calls = [];

    globalThis.fetch = vi.fn(async (url) => {
      calls.push(String(url));

      return response({ USD: 1, GBP: 0.6, EUR: 0.7, ILS: 3.4 }, { url: String(url) });
    });
    await refreshExchangeRates();

    expect(calls).toEqual(['/exchange-rates.json']);
    expect(calls.some((url) => url.includes('frankfurter'))).toBe(false);
    expect(localStorage.getItem(exchangeRatesCacheKey)).toBe(JSON.stringify({ USD: 1, ILS: 3.4, GBP: 0.6, EUR: 0.7 }));
    expect(localStorage.getItem(fxCacheKey)).toBeNull();
  });

  it('reports the same converted total as before: 34 ILS at the demo 3.4 is exactly 10 USD', async () => {
    globalThis.fetch = vi.fn(async (url) => response({ USD: 1, GBP: 0.6, EUR: 0.7, ILS: 3.4 }, { url: String(url) }));
    await refreshExchangeRates();

    // Even with a populated FX cache present, the live report ignores it.
    const cache = createFxCache();
    const { observations } = parseEcbObservations(fixture('ecb-series-2026-09-01_to_2026-10-12.json'), { quotes: ['GBP', 'ILS', 'USD'] });

    cache.recordObservations(clientResult({ observations, quotes: ['GBP', 'ILS', 'USD'], from: '2026-09-01', to: '2026-10-12' }));

    const report = costsDatabase.getReport('USD', 2026, 10);

    expect(report.total).toEqual({ currency: 'USD', sum: 20 });
    expect(report.costs.map((cost) => cost.sum)).toEqual([34, 10]);
  });

  it('keeps the expense data, the demo cache, and the settings untouched by FX activity', () => {
    const before = ['cost-manager-pro:costsdb:v2:costs', exchangeRatesCacheKey, 'cost-manager-pro:settings'].map((key) => localStorage.getItem(key));
    const cache = createFxCache();
    const { observations } = parseEcbObservations(fixture('ecb-series-2026-09-01_to_2026-10-12.json'), { quotes: ['GBP', 'ILS', 'USD'] });

    cache.recordObservations(clientResult({ observations, quotes: ['GBP', 'ILS', 'USD'], from: '2026-09-01', to: '2026-10-12' }));
    expect(['cost-manager-pro:costsdb:v2:costs', exchangeRatesCacheKey, 'cost-manager-pro:settings'].map((key) => localStorage.getItem(key))).toEqual(before);
  });

  it('a backup never contains FX data, and a stored FX cache never enters or leaves a backup', () => {
    const cache = createFxCache();
    const { observations } = parseEcbObservations(fixture('ecb-series-2026-09-01_to_2026-10-12.json'), { quotes: ['GBP', 'ILS', 'USD'] });

    cache.recordObservations(clientResult({ observations, quotes: ['GBP', 'ILS', 'USD'], from: '2026-09-01', to: '2026-10-12' }));
    const backup = JSON.parse(buildBackupFile().content);

    expect(Object.keys(backup).sort()).toEqual(['app', 'costCount', 'costs', 'exportedAt', 'format', 'formatVersion']);
    expect(JSON.stringify(backup)).not.toMatch(/ecb|observations|coverage|fx-cache/i);
    expect(backup.formatVersion).toBe(2);
  });
});
