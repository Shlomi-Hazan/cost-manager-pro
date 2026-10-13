/*
 * M2B.1: the browser cache of ECB observations, stored under its own key
 * (cost-manager-pro:fx:ecb:v1). It is independent of expense storage and of
 * the live demo-rate cache: it never reads or writes any other key, so a
 * failure here cannot touch an expense. DORMANT: nothing in the application
 * creates it yet (ADR-049).
 *
 * Storage safety
 *  - One document in one key, written with a single setItem, which stores the
 *    whole value or throws without changing the old one.
 *  - Every read validates the whole document (schema, formats, references,
 *    checksum). A corrupt document is never trusted; a document from a newer
 *    schema is never overwritten.
 *  - A write that fails (quota, blocked storage, failed read-back) keeps the
 *    result in memory for this session, reports `persisted: false`, and the
 *    next successful write includes it.
 *  - The cache is rebuildable public data, so it is bounded in size by
 *    dropping the oldest dates (and the coverage for them).
 *
 * Concurrent tabs (honest limits). localStorage has no transactions and no
 * compare-and-swap. Each write re-reads the stored value right before writing
 * and, if another tab changed it, rebuilds from the fresh value (a union, so
 * observations from both tabs survive) up to a few times. A short window
 * remains between that check and the write in which another tab's write can
 * still be overwritten. reconcile() heals that case: it merges what this tab
 * last wrote back into whatever is stored now, and is meant to be called when
 * the browser's `storage` event reports a change to this key. Observations are
 * idempotent, so the repeated merge is safe. Disagreeing rates are never
 * overwritten: they become pending revisions.
 */
import { isQuotaExceededError, readItem, removeItem, writeItem } from '../storage/browserStorage.js';
import { cacheLimits, fxCacheKey } from './constants.js';
import { fxErrorCodes as codes, isFxError } from './fxErrors.js';
import { createObservationIndex, selectObservationSet } from './observationSelection.js';
import {
  applyPendingRevision as applyRevisionToTable,
  createEmptyTable,
  evaluateRevisionTarget,
  discardPendingRevision as discardRevisionFromTable,
  enforceSizeLimit,
  mergeTables,
  parseTable,
  recordFailure as recordFailureInTable,
  recordObservations as recordObservationsInTable,
  recordProviderMetadata as recordMetadataInTable,
  serializeTable
} from './rateTable.js';

export const cacheStatus = {
  empty: 'empty',
  ready: 'ready',
  corrupt: 'corrupt',
  unsupported: 'unsupported',
  unavailable: 'unavailable'
};

// Errors that mean the provider ANSWERED but the answer failed validation
// (recorded as "partial"); everything else retryable is a failed request.
const answerProblemCodes = new Set([
  codes.invalidJson,
  codes.invalidRoot,
  codes.emptyResponse,
  codes.invalidObservation,
  codes.invalidDate,
  codes.dateOutOfRange,
  codes.futureObservation,
  codes.wrongBase,
  codes.unsupportedCurrency,
  codes.unexpectedQuote,
  codes.unexpectedProvider,
  codes.invalidRate,
  codes.unsupportedPrecision,
  codes.duplicateObservation,
  codes.conflictingObservation,
  codes.missingRequiredCurrency
]);

const defaultStorage = {
  read: readItem,
  write: writeItem,
  remove: removeItem
};

/**
 * @param {object} [options]
 * @param {object} [options.storage] - { read, write, remove } (defaults to the
 *   browser's localStorage through the M1 wrappers).
 * @param {string} [options.key] - Storage key.
 * @param {number} [options.maxSerializedLength] - Size cap in characters.
 */
export function createFxCache(options = {}) {
  const storage = options.storage ?? defaultStorage;
  const key = options.key ?? fxCacheKey;
  const maxSerializedLength = options.maxSerializedLength ?? cacheLimits.maxSerializedLength;
  // Results that could not be persisted yet, and what this tab last wrote.
  let overlay = null;
  let lastWritten = null;

  // Reads and classifies the stored document without changing anything.
  function readState() {
    let raw;

    try {
      raw = storage.read(key);
    } catch (error) {
      return { status: cacheStatus.unavailable, raw: null, stored: null, error };
    }

    if (raw === null) {
      return { status: cacheStatus.empty, raw, stored: null };
    }

    try {
      return { status: cacheStatus.ready, raw, stored: parseTable(raw) };
    } catch (error) {
      if (!isFxError(error)) {
        throw error;
      }

      return {
        status: error.code === codes.cacheUnsupportedVersion ? cacheStatus.unsupported : cacheStatus.corrupt,
        raw,
        stored: null,
        error
      };
    }
  }

  function effective(state) {
    const base = state.stored ?? createEmptyTable();

    return overlay ? mergeTables(base, overlay) : base;
  }

  /**
   * What is stored and what the cache will use.
   * @returns {{status: string, table: object, persistence: string,
   *   error: FxError|null}} `table` is always a trusted table (empty when the
   *   stored value is missing, corrupt, unsupported, or unreadable).
   */
  function inspect() {
    const state = readState();

    return {
      status: state.status,
      table: effective(state),
      persistence: overlay ? 'memory-only' : 'storage',
      error: state.error ?? null
    };
  }

  /**
   * Applies `mutate` to the latest table and persists the result.
   * @param {function(object): {table: object, info?: object}} mutate - Must
   *   be re-applicable to a fresher table (a union/merge), because a retry
   *   re-runs it.
   * @returns {{persisted: boolean, reason: string|null, info: object}}
   */
  function commit(mutate) {
    let last = null;

    for (let attempt = 0; attempt <= cacheLimits.writeRetries; attempt += 1) {
      const state = readState();
      const outcome = mutate(effective(state));
      const next = enforceSizeLimit(outcome.table, maxSerializedLength);

      last = { next, info: outcome.info ?? {} };

      // Never write (or keep) a table that would not pass validation when it
      // is read back: that would turn a good cache into a corrupt one.
      try {
        parseTable(serializeTable(next));
      } catch (error) {
        if (!isFxError(error)) {
          throw error;
        }

        return { persisted: false, reason: 'invalid-table', info: last.info };
      }

      if (state.status === cacheStatus.unavailable || state.status === cacheStatus.unsupported) {
        // Cannot persist (blocked storage) or must not overwrite (newer
        // schema): keep it for this session only.
        overlay = next;

        return { persisted: false, reason: state.status, info: last.info };
      }

      // Another tab may have written since the read above.
      let current;

      try {
        current = storage.read(key);
      } catch {
        overlay = next;

        return { persisted: false, reason: cacheStatus.unavailable, info: last.info };
      }

      if (current !== state.raw) {
        continue;
      }

      const text = serializeTable(next);

      try {
        storage.write(key, text);
      } catch (error) {
        overlay = next;

        return {
          persisted: false,
          reason: isQuotaExceededError(error) || error?.code === 'quota-exceeded' ? 'quota-exceeded' : 'write-failed',
          info: last.info
        };
      }

      let readBack;

      try {
        readBack = storage.read(key);
      } catch {
        readBack = null;
      }

      if (readBack !== text) {
        overlay = next;

        return { persisted: false, reason: 'verify-failed', info: last.info };
      }

      overlay = null;
      lastWritten = next;

      return { persisted: true, reason: null, info: last.info };
    }

    // Another tab kept changing the value: keep the work in memory.
    overlay = last.next;

    return { persisted: false, reason: 'conflict', info: last.info };
  }

  return {
    inspect,

    /** @returns {object} The trusted table (see inspect()). */
    getTable() {
      return inspect().table;
    },

    /**
     * Stores a validated provider answer (from the client).
     * @param {object} result - A client result for observations.
     * @returns {{persisted: boolean, reason: string|null, added: number,
     *   unchanged: number, revisions: number}}
     */
    recordObservations(result) {
      const committed = commit((table) => {
        const recorded = recordObservationsInTable(table, result);

        return { table: recorded.table, info: { added: recorded.added, unchanged: recorded.unchanged, revisions: recorded.revisions } };
      });

      return { persisted: committed.persisted, reason: committed.reason, ...committed.info };
    },

    /**
     * Records that a request failed, so "tried and failed" is not mistaken
     * for "never tried". A cancellation is not a failure and is ignored.
     * @param {object} request - The request descriptor ({kind, quotes, from?, to?, date?}).
     * @param {FxError} error
     * @param {string} at - ISO time of the failure.
     */
    recordFailure(request, error, at) {
      if (error?.code === codes.aborted) {
        return { persisted: true, reason: null };
      }

      const committed = commit((table) => ({
        table: recordFailureInTable(table, {
          ...request,
          at,
          errorCode: error?.code ?? 'unknown',
          partial: answerProblemCodes.has(error?.code)
        })
      }));

      return { persisted: committed.persisted, reason: committed.reason };
    },

    /** Stores the provider's series start / newest date snapshot. */
    recordProviderMetadata(metadata, checkedAt) {
      const committed = commit((table) => ({ table: recordMetadataInTable(table, metadata, checkedAt) }));

      return { persisted: committed.persisted, reason: committed.reason };
    },

    /**
     * Selects the observation set for one expense (see observationSelection).
     * Synchronous: it only reads the local table. It re-validates the whole
     * stored table on every call (about 50 ms for a full 26-year history), so
     * for many expenses use createIndex() once instead.
     */
    select(args) {
      return selectObservationSet({ table: inspect().table, ...args });
    },

    /** @returns {{select: function}} An index for many lookups on the current table. */
    createIndex() {
      return createObservationIndex(inspect().table);
    },

    /** @returns {object[]} Revisions detected but not applied. */
    listPendingRevisions() {
      return inspect().table.pendingRevisions;
    },

    /**
     * Explicitly accepts a detected revision. Nothing recalculates by itself:
     * reports keep their accepted values until the application chooses to
     * apply this and recompute. Pass `accepted` and `candidate` (the values the
     * user was shown) so a stale decision is refused instead of applied.
     * @returns {{persisted: boolean, reason: string|null, outcome: string}}
     *   outcome: 'applied' | 'not-found' | 'conflict'.
     */
    applyPendingRevision(target) {
      const committed = commit((table) => {
        const { outcome } = evaluateRevisionTarget(table, target);

        return { table: outcome === 'applied' ? applyRevisionToTable(table, target) : table, info: { outcome } };
      });

      return { persisted: committed.persisted, reason: committed.reason, outcome: committed.info.outcome };
    },

    /**
     * Keeps the accepted value and dismisses ONE proposal. The identity
     * (quote, date, and, when given, accepted and candidate) is checked against
     * the latest stored table INSIDE the commit, so a stale decision cannot
     * remove a newer proposal. (localStorage still has no cross-tab
     * transaction: see the concurrency notes at the top of this file.)
     * @returns {{persisted: boolean, reason: string|null, outcome: string}}
     *   outcome: 'discarded' | 'not-found' | 'conflict'.
     */
    discardPendingRevision(target) {
      const committed = commit((table) => {
        const { outcome } = evaluateRevisionTarget(table, target);

        return { table: outcome === 'applied' ? discardRevisionFromTable(table, target) : table, info: { outcome: outcome === 'applied' ? 'discarded' : outcome } };
      });

      return { persisted: committed.persisted, reason: committed.reason, outcome: committed.info.outcome };
    },

    /**
     * Merges what this tab last wrote (and anything not yet persisted) into
     * the stored value. Call it when another tab changes the key.
     */
    reconcile() {
      if (!lastWritten && !overlay) {
        return { persisted: true, reason: null };
      }

      const committed = commit((table) => ({ table: mergeTables(table, lastWritten ?? createEmptyTable()) }));

      return { persisted: committed.persisted, reason: committed.reason };
    },

    /** Removes the stored cache (explicit; the data can be fetched again). */
    clear() {
      overlay = null;
      lastWritten = null;
      storage.remove(key);
    }
  };
}

