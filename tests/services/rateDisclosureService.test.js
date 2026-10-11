import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  classifyRateSource,
  costsRequireConversion,
  getRateDisclosure,
  getRateDisclosureForCosts,
  rateDisclosureContent,
  rateSourceKinds
} from '../../src/services/rateDisclosureService.js';
import {
  clearCustomExchangeRatesUrl,
  defaultExchangeRatesUrl,
  setCustomExchangeRatesUrl
} from '../../src/services/settingsService.js';

/*
 * Pre-M2 hotfix: the classification must always warn, must treat the
 * bundled file as demonstration data, and must never call any source
 * verified. Tests compare against the exported content objects, not
 * hard-coded wording, so rewording the message does not break them.
 */
describe('rate source classification', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('classifies the bundled default (no custom source) as demonstration data', () => {
    expect(classifyRateSource(null)).toBe(rateSourceKinds.demo);
    expect(classifyRateSource(undefined)).toBe(rateSourceKinds.demo);
    expect(getRateDisclosure().kind).toBe(rateSourceKinds.demo);
  });

  it('classifies the bundled file as demonstration data however it is written', () => {
    expect(classifyRateSource(defaultExchangeRatesUrl)).toBe(rateSourceKinds.demo);
    expect(classifyRateSource(`${window.location.origin}${defaultExchangeRatesUrl}`)).toBe(
      rateSourceKinds.demo
    );
  });

  it.each([
    'https://rates.example.com/latest.json',
    'https://api.frankfurter.dev/v2/rates?base=USD',
    '/some-other-file.json',
    `${defaultExchangeRatesUrl}?copy=1`,
    'not a valid url at all :::',
    ''
  ])('treats %j as an unverified source, never as demo or verified', (url) => {
    const kind = classifyRateSource(url);

    // "" resolves to the current page, which is not the bundled file.
    expect(kind).toBe(rateSourceKinds.unverified);
  });

  it('only ever offers the two warning classifications', () => {
    expect(Object.values(rateSourceKinds).sort()).toEqual(['demo', 'unverified']);
    expect(Object.keys(rateDisclosureContent).sort()).toEqual(['demo', 'unverified']);
  });

  it('follows the source saved in Settings', () => {
    expect(getRateDisclosure().kind).toBe(rateSourceKinds.demo);

    setCustomExchangeRatesUrl('https://rates.example.com/latest.json');
    expect(getRateDisclosure().kind).toBe(rateSourceKinds.unverified);

    clearCustomExchangeRatesUrl();
    expect(getRateDisclosure().kind).toBe(rateSourceKinds.demo);
  });

  it('does not depend on what is cached, so cached sample rates cannot suppress it', () => {
    localStorage.setItem(
      'cost-manager-pro:exchange-rates-cache',
      JSON.stringify({ USD: 1, GBP: 0.6, EURO: 0.7, ILS: 3.4 })
    );

    expect(getRateDisclosure().kind).toBe(rateSourceKinds.demo);
  });

  it('exposes complete wording for every classification and surface', () => {
    Object.values(rateDisclosureContent).forEach((content) => {
      expect(content.title.trim()).not.toBe('');
      // Sentences, not placeholders.
      ['message', 'settingsDetail', 'exportNote'].forEach((field) => {
        expect(content[field].length).toBeGreaterThan(40);
      });
    });
  });

  it('says plainly that demo rates are not live market rates', () => {
    const { title, message, exportNote } = rateDisclosureContent.demo;

    expect(title).toMatch(/demo/i);
    expect(message).toMatch(/not live market rates/i);
    expect(exportNote).toMatch(/not live market rates/i);
  });

  it('never describes an unverified source as demo or as verified market data', () => {
    Object.values(rateDisclosureContent.unverified).forEach((text) => {
      expect(text).not.toMatch(/demonstration/i);
      expect(text).not.toMatch(/(^|\s)verified market/i);
    });
  });
});

describe('when a disclosure is needed', () => {
  const usd = { currency: 'USD' };
  const ils = { currency: 'ILS' };

  it('requires one only when some cost is in another currency than the target', () => {
    expect(costsRequireConversion([usd, ils], 'USD')).toBe(true);
    expect(costsRequireConversion([usd, usd], 'USD')).toBe(false);
    expect(costsRequireConversion([], 'USD')).toBe(false);
    expect(costsRequireConversion([ils], 'USD')).toBe(true);
  });

  it('returns a disclosure only for outputs that used converted amounts', () => {
    expect(getRateDisclosureForCosts([usd, usd], 'USD')).toBeNull();
    expect(getRateDisclosureForCosts([usd, ils], 'USD')).toMatchObject({
      kind: rateSourceKinds.demo
    });
  });
});
