/*
 * M2B.1: constants of the ECB historical exchange-rate infrastructure.
 *
 * DORMANT: nothing in the running application imports src/lib/fx yet. It is
 * exercised by tests and will be wired in by M2B.2 (ADR-049).
 */
import { supportedCurrencies } from '../../constants/currencies.js';

export const fxProvider = 'ECB';
// Observations are quoted against the euro: "1 EUR = rate QUOTE".
export const fxBaseCurrency = 'EUR';

// The non-base supported currencies, in a fixed order. EUR itself is 1 by
// definition and has no observations.
export const fxQuoteCurrencies = supportedCurrencies
  .filter((currency) => currency !== fxBaseCurrency)
  .sort();

// Frankfurter v2, provider-specific family. The blended default feed
// (/v2/rates) is never used.
export const frankfurterOrigin = 'https://api.frankfurter.dev';
export const ecbProviderPath = '/v2/providers/ecb';
export const ecbRatesPath = `${ecbProviderPath}/rates`;

// Start of the ECB reference-rate series (provider metadata start_date).
export const ecbFirstObservationDate = '1999-01-04';

// A series may start with the observation preceding `from` (seen when `from`
// is a holiday). The largest gap seen between observations is 5 days, so an
// observation more than this many days before `from` is not plausible.
export const maxAnchorDays = 10;

export const fxCacheKey = 'cost-manager-pro:fx:ecb:v1';
export const fxCacheFormat = 'cost-manager-pro-fx-cache';
export const fxCacheSchemaVersion = 1;

// Rates are kept as decimal text. 15 significant digits is the conservative
// boundary at which a JavaScript Number still round-trips exactly.
export const maxRateSignificantDigits = 15;

export const clientDefaults = {
  timeoutMs: 10_000,
  maxRetries: 2,
  baseDelayMs: 500,
  maxDelayMs: 8_000,
  // A Retry-After longer than this is not waited for; the failure is
  // reported with the delay so the caller can decide.
  maxRetryAfterMs: 30_000
};

// Bounds that keep the cache small and rebuildable.
export const cacheLimits = {
  // Serialized size cap (characters). The whole ECB history for three
  // currencies is far below this.
  maxSerializedLength: 1_000_000,
  maxFetchRecords: 200,
  maxFailureRecords: 50,
  maxPendingRevisions: 200,
  maxRevisionLog: 500,
  writeRetries: 3
};
