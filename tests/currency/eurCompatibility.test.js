import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { supportedCurrencies } from '../../src/constants/currencies.js';
import { costsDatabase } from '../../src/lib/costsDatabase.js';
import {
  clearCachedExchangeRates,
  exchangeRatesCacheKey,
  getCachedExchangeRates,
  setCachedExchangeRates
} from '../../src/lib/exchangeRatesCache.js';
import { buildCategoryFinancials, sumCostsExact } from '../../src/lib/money/financials.js';
import { formatMoney, getMinorUnitDigits } from '../../src/lib/money/format.js';
import { getRateDisclosure } from '../../src/services/rateDisclosureService.js';
import { fetchExchangeRates, refreshExchangeRates } from '../../src/services/exchangeRatesService.js';
import { convertCurrency, isSupportedCurrency, validateExchangeRates } from '../../src/utils/currency.js';
import { appDataKey, makeCost, schemaOneDocument } from '../storage/fixtures.js';

/*
 * M2A.3: the canonical EUR identifier, the transition for rate sources that
 * still use "EURO", and proof that migrated data reports identically.
 */
const euroRates = { USD: 1, GBP: 0.6, EUR: 0.7, ILS: 3.4 };
const legacyRates = { USD: 1, GBP: 0.6, EURO: 0.7, ILS: 3.4 };

describe('canonical currencies', () => {
  it('are exactly USD, ILS, GBP and EUR, and EURO is never offered', () => {
    expect(supportedCurrencies).toEqual(['USD', 'ILS', 'GBP', 'EUR']);
    expect(isSupportedCurrency('EUR')).toBe(true);
    expect(isSupportedCurrency('EURO')).toBe(false);
  });

  it('are valid ISO 4217 codes for Intl formatting, with two minor digits', () => {
    supportedCurrencies.forEach((currency) => {
      expect(() => new Intl.NumberFormat('en-US', { style: 'currency', currency })).not.toThrow();
      expect(getMinorUnitDigits(currency)).toBe(2);
    });
    expect(formatMoney('1234.5', 'EUR')).toBe('€1,234.50');
    expect(formatMoney('1234.5', 'EUR', 'he-IL')).toContain('1,234.50');
  });

  it('the bundled demo rates use EUR and no other key', () => {
    const demo = JSON.parse(readFileSync('public/exchange-rates.json', 'utf8'));

    expect(Object.keys(demo).sort()).toEqual(['EUR', 'GBP', 'ILS', 'USD']);
    expect(validateExchangeRates(demo)).toEqual(euroRates);
  });
});

describe('rate sources that still say EURO (compatibility, read-only)', () => {
  it('reads EURO as the same euro rate and emits only canonical keys', () => {
    const rates = validateExchangeRates(legacyRates);

    expect(rates).toEqual(euroRates);
    expect(Object.keys(rates)).toEqual(['USD', 'ILS', 'GBP', 'EUR']);
    expect('EURO' in rates).toBe(false);
  });

  it('accepts a source that gives both keys with the same value', () => {
    expect(validateExchangeRates({ ...legacyRates, EUR: 0.7 })).toEqual(euroRates);
  });

  it('rejects a source that gives different EUR and EURO values instead of guessing', () => {
    expect(() => validateExchangeRates({ ...legacyRates, EUR: 0.9 })).toThrow(
      'Exchange rates give different values for EUR and EURO.'
    );
  });

  it('still requires a euro rate, and validates the legacy value like any other', () => {
    expect(() => validateExchangeRates({ USD: 1, GBP: 0.6, ILS: 3.4 })).toThrow('Exchange rates must include EUR.');
    expect(() => validateExchangeRates({ ...legacyRates, EURO: 0 })).toThrow(TypeError);
    expect(() => validateExchangeRates({ ...legacyRates, EURO: 'x' })).toThrow(TypeError);
    expect(() => validateExchangeRates({ USD: 1, GBP: 0.6, ILS: 3.4, EURO: Number.NaN })).toThrow(TypeError);
  });

  it('never invents a euro rate from other keys or similar spellings', () => {
    ['euro', 'Euro', 'EUROS', 'EU'].forEach((key) => {
      expect(() => validateExchangeRates({ USD: 1, GBP: 0.6, ILS: 3.4, [key]: 0.7 })).toThrow(
        'Exchange rates must include EUR.'
      );
    });
  });

  it('an old cache with EURO is read as EUR and is not rewritten by reading', () => {
    const raw = JSON.stringify(legacyRates);

    localStorage.setItem(exchangeRatesCacheKey, raw);

    expect(getCachedExchangeRates()).toEqual(euroRates);
    expect(localStorage.getItem(exchangeRatesCacheKey)).toBe(raw);
  });

  it('a new cache is written with EUR only', () => {
    setCachedExchangeRates(legacyRates);

    expect(JSON.parse(localStorage.getItem(exchangeRatesCacheKey))).toEqual(euroRates);
    expect(localStorage.getItem(exchangeRatesCacheKey)).not.toContain('EURO');
  });

  it('a damaged or conflicting cache is treated as no rates, so no total is faked', () => {
    localStorage.setItem(exchangeRatesCacheKey, JSON.stringify({ ...legacyRates, EUR: 0.9 }));
    expect(getCachedExchangeRates()).toBeNull();

    localStorage.setItem(exchangeRatesCacheKey, '{not json');
    expect(getCachedExchangeRates()).toBeNull();
  });

  describe('a custom source over Fetch', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
      localStorage.clear();
    });

    function mockFetch(payload) {
      globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => payload }));
    }

    it('works when the source still uses EURO, and caches canonical EUR', async () => {
      mockFetch(legacyRates);

      expect(await fetchExchangeRates('https://rates.example.com/old.json')).toEqual(euroRates);
      await refreshExchangeRates('https://rates.example.com/old.json');
      expect(getCachedExchangeRates()).toEqual(euroRates);
    });

    it('rejects an unusable source without replacing a valid cache', async () => {
      setCachedExchangeRates(euroRates);
      mockFetch({ USD: 1, GBP: 0.6, ILS: 3.4, EURX: 0.7 });

      await expect(refreshExchangeRates('https://rates.example.com/bad.json')).rejects.toThrow(
        'Exchange rates must include EUR.'
      );
      expect(getCachedExchangeRates()).toEqual(euroRates);
    });
  });

  it('keeps the demo / unverified disclosure classification unchanged', () => {
    expect(getRateDisclosure(null).kind).toBe('demo');
    expect(getRateDisclosure('https://rates.example.com/old.json').kind).toBe('unverified');
  });
});

describe('EUR conversions and migrated data report identically', () => {
  beforeEach(() => {
    localStorage.clear();
    setCachedExchangeRates(euroRates);
  });

  afterEach(() => {
    clearCachedExchangeRates();
    localStorage.clear();
  });

  it('converts to and from EUR with the shared formula', () => {
    // 7 EUR / 0.7 * 1 = 10 USD, and back.
    expect(convertCurrency(7, 'EUR', 'USD', euroRates)).toBe(10);
    expect(convertCurrency(10, 'USD', 'EUR', euroRates)).toBe(7);
    expect(() => convertCurrency(1, 'EURO', 'USD', euroRates)).toThrow(TypeError);
    expect(() => convertCurrency(1, 'USD', 'EURO', euroRates)).toThrow(TypeError);
  });

  it('a schema 1 dataset with EURO and its migrated copy give the same exact totals', () => {
    const costs = [
      makeCost({ id: '1', sum: 33.33, currency: 'EURO', category: 'Food' }),
      makeCost({ id: '2', sum: 12.5, currency: 'GBP', category: 'Food' }),
      makeCost({ id: '3', sum: 0.333, currency: 'USD', category: 'Fun' }),
      makeCost({ id: '4', sum: 99.99, currency: 'ILS', category: 'Fun' })
    ];

    localStorage.setItem(appDataKey, schemaOneDocument(costs));
    const fromOldData = costsDatabase.getReport('USD', 2028, 2);

    // The same data written under the current schema.
    localStorage.setItem(
      appDataKey,
      JSON.stringify({ schemaVersion: 2, costs: costs.map((cost) => (cost.currency === 'EURO' ? { ...cost, currency: 'EUR' } : cost)) })
    );
    const fromNewData = costsDatabase.getReport('USD', 2028, 2);

    expect(fromOldData.total).toEqual(fromNewData.total);
    expect(fromOldData.costs.map((cost) => cost.sum)).toEqual(fromNewData.costs.map((cost) => cost.sum));
    expect(fromNewData.costs.filter((cost) => cost.currency === 'EUR')).toHaveLength(1);

    const stored = costsDatabase.getAllCosts();

    // Exact 33.33 / 0.7 + 12.5 / 0.6 + 0.333 + 99.99 / 3.4, unrounded.
    expect(sumCostsExact(stored, 'USD', euroRates)).toBe(
      sumCostsExact(stored.map((cost) => ({ ...cost })), 'USD', euroRates)
    );
    expect(buildCategoryFinancials(stored, 'USD', euroRates).totalAmount).toBe(
      sumCostsExact(stored, 'USD', euroRates)
    );
  });

  it('EUR as the report currency works for every stored currency', () => {
    localStorage.setItem(
      appDataKey,
      JSON.stringify({ schemaVersion: 2, costs: [makeCost({ id: '1', sum: 7, currency: 'EUR' }), makeCost({ id: '2', sum: 10, currency: 'USD' })] })
    );

    expect(costsDatabase.getReport('EUR', 2028, 2).total).toEqual({ currency: 'EUR', sum: 14 });
    expect(() => costsDatabase.getReport('EURO', 2028, 2)).toThrow(TypeError);
  });

  it('a euro report with no rates fails instead of inventing a total', () => {
    clearCachedExchangeRates();
    localStorage.setItem(
      appDataKey,
      JSON.stringify({ schemaVersion: 2, costs: [makeCost({ id: '1', sum: 7, currency: 'EUR' })] })
    );

    expect(() => costsDatabase.getReport('USD', 2028, 2)).toThrow(
      'Cross-currency report totals require cached exchange rates.'
    );
    expect(costsDatabase.getReport('EUR', 2028, 2).total).toEqual({ currency: 'EUR', sum: 7 });
  });
});
