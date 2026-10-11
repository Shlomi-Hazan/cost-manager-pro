/*
 * Pre-M2 hotfix: tells the user which kind of exchange rates their converted
 * totals are based on, so demonstration values are never mistaken for market
 * rates.
 *
 * Only two classifications exist, and neither says "verified":
 * - demo: the bundled default file, which holds fixed sample values (not
 *   live, not dated, not from any provider);
 * - unverified: anything else (a custom source). Cost Manager Pro cannot
 *   know where a custom source's rates come from or how old they are.
 *
 * LIMITATION (by design, to keep this hotfix small): the rates cache records
 * no information about which source filled it, so the classification follows
 * the source that is configured NOW (the Settings URL, else the bundled
 * default). Cached rates that came from a different source than the one
 * configured now can therefore be described with the wrong one of the two
 * wordings. Both wordings are warnings, so a converted total is never shown
 * without one. Recording the source per cache entry belongs to the planned
 * rates work (M2B), not to this hotfix.
 */
import {
  defaultExchangeRatesUrl,
  getCustomExchangeRatesUrl
} from './settingsService.js';

export const rateSourceKinds = {
  demo: 'demo',
  unverified: 'unverified'
};

// All user-facing wording lives here so every screen and export agrees.
export const rateDisclosureContent = {
  [rateSourceKinds.demo]: {
    title: 'Demo exchange rates',
    message:
      'Currency conversions currently use demonstration rates, not live market rates. Converted totals are for testing only and should not be used for financial decisions.',
    settingsDetail:
      'The built-in default source is a bundled sample file with fixed values. It is not updated, has no date, and does not come from a rates provider. Converted totals in reports, charts, and exports are for testing only.',
    exportNote:
      'Demonstration exchange rates, not live market rates. Converted amounts are for testing only and should not be used for financial decisions.'
  },
  [rateSourceKinds.unverified]: {
    title: 'Exchange-rate source not verified',
    message:
      'Currency conversions use rates from a source that Cost Manager Pro has not verified. Converted totals may not match market rates.',
    settingsDetail:
      'You are using a custom exchange-rate source. Cost Manager Pro checks that its data has the expected shape, but cannot verify where its rates come from, how recent they are, or whether they match market rates.',
    exportNote:
      'Exchange-rate source not verified. Converted amounts may not match market rates.'
  }
};

// Compares full resolved URLs, so "/exchange-rates.json" and the same file
// written as an absolute URL on this site count as the same source.
function resolveUrl(url) {
  const baseUrl = globalThis.location?.href ?? 'http://localhost/';

  return new URL(url, baseUrl).href;
}

/**
 * @param {string|null} customUrl - The custom exchange-rate URL from
 *   Settings, or null when none is configured.
 * @returns {string} A rateSourceKinds value. Never claims verified data.
 */
export function classifyRateSource(customUrl) {
  if (customUrl === null || customUrl === undefined) {
    return rateSourceKinds.demo;
  }

  try {
    return resolveUrl(customUrl) === resolveUrl(defaultExchangeRatesUrl)
      ? rateSourceKinds.demo
      : rateSourceKinds.unverified;
  } catch {
    // An unparseable URL cannot be shown to be the bundled file.
    return rateSourceKinds.unverified;
  }
}

/**
 * @param {string|null} [customUrl] - Defaults to the URL currently saved in
 *   Settings.
 * @returns {{kind: string, title: string, message: string,
 *   settingsDetail: string, exportNote: string}}
 */
export function getRateDisclosure(customUrl = getCustomExchangeRatesUrl()) {
  const kind = classifyRateSource(customUrl);

  return { kind, ...rateDisclosureContent[kind] };
}

/**
 * Exchange rates are only used when at least one cost is in a different
 * currency than the report or chart currency, so only those outputs need a
 * disclosure.
 * @param {{currency: string}[]} costs - Costs behind a report or chart.
 * @param {string} targetCurrency - The report or chart currency.
 * @returns {boolean}
 */
export function costsRequireConversion(costs, targetCurrency) {
  return costs.some((cost) => cost.currency !== targetCurrency);
}

/**
 * @param {{currency: string}[]} costs - Costs behind a report or chart.
 * @param {string} targetCurrency - The report or chart currency.
 * @returns {object|null} The disclosure to show, or null when no rate was
 *   used.
 */
export function getRateDisclosureForCosts(costs, targetCurrency) {
  return costsRequireConversion(costs, targetCurrency) ? getRateDisclosure() : null;
}
