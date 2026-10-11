/*
 * The currencies the app supports, and the single source of truth for that
 * list so no other module duplicates it.
 *
 * Identifiers are ISO 4217 codes. Until M2A.3 the euro was stored as the
 * nonstandard "EURO" (a course requirement that no longer applies,
 * ADR-037). Existing data and old backups that use "EURO" are upgraded to
 * "EUR" by the schema 1 -> 2 migration (src/lib/storage/costDocument.js);
 * "EURO" is never offered or written again.
 */
export const supportedCurrencies = [
  'USD',
  'ILS',
  'GBP',
  'EUR'
];

// The identifier used before schema version 2. Read-only compatibility: it is
// accepted when upgrading old stored data, old backups, and old rate
// sources, and is never emitted.
export const legacyEuroIdentifier = 'EURO';
