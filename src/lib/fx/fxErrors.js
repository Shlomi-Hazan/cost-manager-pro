/*
 * One error type for the FX infrastructure, with a stable machine-readable
 * `code` and structured `details`. Callers must branch on `code`, never on
 * message text. A valid empty result is NOT an error (see ecbParser.js).
 */
export const fxErrorCodes = {
  // Provider client
  aborted: 'aborted',
  timeout: 'timeout',
  network: 'network-error',
  rateLimited: 'rate-limited',
  unavailable: 'provider-unavailable',
  httpError: 'http-error',
  unexpectedEndpoint: 'unexpected-endpoint',
  invalidRequest: 'invalid-request',
  // Response parsing and validation
  invalidJson: 'invalid-json',
  invalidRoot: 'invalid-root',
  emptyResponse: 'empty-response',
  invalidObservation: 'invalid-observation',
  invalidDate: 'invalid-date',
  dateOutOfRange: 'date-out-of-range',
  futureObservation: 'future-observation',
  wrongBase: 'wrong-base',
  unsupportedCurrency: 'unsupported-currency',
  unexpectedQuote: 'unexpected-quote',
  unexpectedProvider: 'unexpected-provider',
  invalidRate: 'invalid-rate',
  unsupportedPrecision: 'unsupported-precision',
  duplicateObservation: 'duplicate-observation',
  conflictingObservation: 'conflicting-observation',
  missingRequiredCurrency: 'missing-required-currency',
  invalidMetadata: 'invalid-metadata',
  // Cache
  cacheCorrupt: 'cache-corrupt',
  cacheUnsupportedVersion: 'cache-unsupported-version',
  cacheUnavailable: 'cache-unavailable'
};

export class FxError extends Error {
  constructor(code, message, { details, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'FxError';
    this.code = code;
    this.details = details ?? null;
  }
}

export function isFxError(error) {
  return error instanceof FxError;
}
