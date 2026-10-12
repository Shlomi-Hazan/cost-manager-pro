/*
 * The stored format of an expense dataset and its migrations.
 *
 * Current format (schema version 2), stored as one JSON string:
 *
 *   { "schemaVersion": 2, "costs": [ <cost record>, ... ] }
 *
 * Schema 2 differs from schema 1 only in the currency identifier: the euro
 * is "EUR" (ISO 4217) instead of the earlier nonstandard "EURO". Nothing
 * else about a record changes. Schema 1 is still read and is upgraded in
 * memory; like every upgrade it becomes durable only through the next
 * successful save, which keeps the original value as previous data.
 *
 * Older layout (schema version 0, written before M1): a bare JSON array of
 * the same cost records. It is still read and is upgraded in memory by the
 * migrations below; it is rewritten in the new format only on the next
 * successful save. Reading never writes.
 *
 * Every record of a dataset is validated before the dataset is accepted.
 * One bad record makes the whole dataset "damaged" rather than being
 * dropped, because silently discarding records would lose money data.
 */
import { legacyEuroIdentifier } from '../../constants/currencies.js';
import { validateStoredCost } from '../costValidation.js';
import { StorageError, storageErrorCodes } from './storageErrors.js';

export const currentCostSchemaVersion = 2;

function damaged(reason, message, details) {
  return new StorageError(storageErrorCodes.damaged, message, {
    details: { reason, ...details }
  });
}

// Schema 1 -> 2: "EURO" becomes "EUR". Only that exact identifier is
// renamed. Unknown or malformed currencies are left untouched (so they still
// fail validation and the dataset is reported as damaged, never silently
// turned into euros), and "EUR" itself was not a valid identifier under
// schema 1, so a schema 1 record that already says "EUR" is rejected rather
// than accepted by the upgrade. Every other field, the record order, and any
// excess amount precision are preserved by reference-free copying.
function migrateEuroIdentifier(document) {
  if (!Array.isArray(document.costs)) {
    return { ...document, schemaVersion: 2 };
  }

  const costs = document.costs.map((cost, index) => {
    if (cost === null || typeof cost !== 'object') {
      return cost;
    }

    if (cost.currency === 'EUR') {
      throw damaged(
        'invalid-record',
        `Stored expense #${index + 1} is invalid: cost.currency "EUR" is not valid in this schema version.`,
        { index }
      );
    }

    return cost.currency === legacyEuroIdentifier ? { ...cost, currency: 'EUR' } : cost;
  });

  return { ...document, schemaVersion: 2, costs };
}

// Each migration upgrades a document from version N to N + 1 and must be a
// pure function of its input.
const migrations = {
  0: (legacyCosts) => ({
    schemaVersion: 1,
    costs: legacyCosts
  }),
  1: migrateEuroIdentifier
};

/**
 * Upgrades a list of records written under `schemaVersion` to the current
 * schema, with the same migrations (and the same refusal of unknown or
 * future versions) as a stored document. Used for backup files.
 * @param {unknown} costs - Records exactly as they were written.
 * @param {number} schemaVersion - The schema they were written under.
 * @returns {unknown} The records under the current schema (not validated).
 */
export function upgradeCostRecords(costs, schemaVersion) {
  let document = { schemaVersion, costs: structuredClone(costs) };

  for (let version = schemaVersion; version < currentCostSchemaVersion; version += 1) {
    document = migrations[version](document);
  }

  return document.costs;
}

function detectSchemaVersion(document) {
  if (Array.isArray(document)) {
    return 0;
  }

  if (document !== null && typeof document === 'object') {
    const { schemaVersion } = document;

    if (Number.isInteger(schemaVersion) && schemaVersion >= 1) {
      return schemaVersion;
    }
  }

  throw damaged(
    'invalid-root',
    'Stored data is not a recognized expense dataset.'
  );
}

/**
 * Validates every record and rejects duplicate ids.
 * @param {unknown} costs - Candidate list of cost records.
 * @throws {StorageError} `damaged` with details.reason `invalid-record` or
 *   `duplicate-id`.
 */
export function validateCostList(costs) {
  if (!Array.isArray(costs)) {
    throw damaged('invalid-root', 'Stored expenses are not a list.');
  }

  const seenIds = new Set();

  costs.forEach((cost, index) => {
    try {
      validateStoredCost(cost);
    } catch (error) {
      throw damaged(
        'invalid-record',
        `Stored expense #${index + 1} is invalid: ${error.message}`,
        { index }
      );
    }

    if (seenIds.has(cost.id)) {
      throw damaged(
        'duplicate-id',
        `Stored expense #${index + 1} repeats the id of another expense.`,
        { index, id: cost.id }
      );
    }

    seenIds.add(cost.id);
  });
}

/**
 * Upgrades an already-parsed document to the current schema and validates
 * it. Never mutates its input.
 * @param {unknown} document - Parsed JSON value.
 * @returns {{costs: object[], sourceSchemaVersion: number}}
 * @throws {StorageError} `damaged` or `unsupported-version`.
 */
export function migrateCostDocument(document) {
  const sourceSchemaVersion = detectSchemaVersion(document);

  if (sourceSchemaVersion > currentCostSchemaVersion) {
    throw new StorageError(
      storageErrorCodes.unsupportedVersion,
      'Stored data was saved by a newer version of Cost Manager Pro.',
      { details: { schemaVersion: sourceSchemaVersion } }
    );
  }

  let migrated = structuredClone(document);

  for (
    let version = sourceSchemaVersion;
    version < currentCostSchemaVersion;
    version += 1
  ) {
    migrated = migrations[version](migrated);
  }

  validateCostList(migrated.costs);

  return { costs: migrated.costs, sourceSchemaVersion };
}

/**
 * @param {string} rawValue - The exact string read from storage.
 * @returns {{costs: object[], sourceSchemaVersion: number}}
 * @throws {StorageError} `damaged` or `unsupported-version`.
 */
export function parseCostDocument(rawValue) {
  let document;

  try {
    document = JSON.parse(rawValue);
  } catch (error) {
    throw damaged('invalid-json', 'Stored data is not valid JSON.', {
      parseError: error.message
    });
  }

  return migrateCostDocument(document);
}

export function serializeCostDocument(costs) {
  return JSON.stringify({
    schemaVersion: currentCostSchemaVersion,
    costs
  });
}
