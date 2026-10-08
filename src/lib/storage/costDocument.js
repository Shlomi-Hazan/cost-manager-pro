/*
 * The stored format of an expense dataset and its migrations.
 *
 * Current format (schema version 1), stored as one JSON string:
 *
 *   { "schemaVersion": 1, "costs": [ <cost record>, ... ] }
 *
 * Older layout (schema version 0, written before M1): a bare JSON array of
 * the same cost records. It is still read and is upgraded in memory by the
 * migrations below; it is rewritten in the new format only on the next
 * successful save.
 *
 * Every record of a dataset is validated before the dataset is accepted.
 * One bad record makes the whole dataset "damaged" rather than being
 * dropped, because silently discarding records would lose money data.
 */
import { validateStoredCost } from '../costValidation.js';
import { StorageError, storageErrorCodes } from './storageErrors.js';

export const currentCostSchemaVersion = 1;

// Each migration upgrades a document from version N to N + 1 and must be a
// pure function of its input.
const migrations = {
  0: (legacyCosts) => ({
    schemaVersion: 1,
    costs: legacyCosts
  })
};

function damaged(reason, message, details) {
  return new StorageError(storageErrorCodes.damaged, message, {
    details: { reason, ...details }
  });
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
