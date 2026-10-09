/*
 * The application's expense database API. It began as the course's
 * required db.js (vanilla/db.js is the frozen standalone copy from that
 * time). Keeping the two files in step is no longer required (ADR-037):
 * since M1 this module stores data through the safe storage layer in
 * ./storage/ and under the Cost Manager Pro namespace, while vanilla/db.js
 * keeps its original behavior.
 *
 * Public API, kept stable because the whole app depends on it:
 *
 *   const ob = db.openCostsDB(databaseName, databaseVersion);
 *   ob.addCost({ sum, currency, category, description });
 *   ob.getReport(currency, year, month);
 *
 * getReport() lives on the object returned by openCostsDB(), not on `db`
 * itself — the official course document was corrected to `ob.getReport(...)`
 * rather than `db.getReport(...)`, and this module follows that correction.
 *
 * Everything else exported from the returned object (getAllCosts,
 * getCostById, updateCost, deleteCost) is a TEAM EXTENSION used to power the
 * Manage Costs screen. The course Q&A explicitly allows extra db.js
 * functions, but the four required properties on `cost` — sum, currency,
 * category, description — and the required method signatures above are
 * treated as a protected, external contract throughout this file.
 */
import { getCachedExchangeRates } from './exchangeRatesCache.js';
import { convertCurrency } from '../utils/currency.js';
import {
  copyCostRecord,
  isSupportedCurrency,
  validateCost,
  validateCostDate,
  validateCostId
} from './costValidation.js';
import { createCostStore } from './storage/costStore.js';

// Application-specific namespace (ADR-042). The original course app used the
// "cost-manager" prefix for the same keys; Cost Manager Pro never writes there.
export const storageNamespace = 'cost-manager-pro';

// R-035: every cost gets its "added on" date automatically, from the
// system clock, rather than from caller input. Day/month/year are what the
// required getReport() date shape and month/year filtering need; hour/minute
// are a team extension (see X-004) used only in the app's own detailed
// reports, never returned from the official getReport() report-item shape.
function getCurrentDateParts() {
  const now = new Date();

  return {
    day: now.getDate(),
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    hour: now.getHours(),
    minute: now.getMinutes()
  };
}

// TEAM EXTENSION (X-001): a stable per-cost id. Without it, two costs that
// happen to share identical sum/currency/category/description could not be
// distinguished for editing or deleting one specific row in Manage Costs.
// crypto.randomUUID() is preferred; the fallback exists only for older
// environments where it might be unavailable.
function generateCostId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `cost-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

// The localStorage key a given (databaseName, databaseVersion) pair maps to.
// Both arguments genuinely affect where data is stored (rather than being
// accepted and ignored), so opening the database with a different name or
// version starts from a separate, empty cost list.
export function getCostsStorageKey(databaseName, databaseVersion) {
  return `${storageNamespace}:${encodeURIComponent(databaseName)}:v${databaseVersion}:costs`;
}

function validateDatabaseIdentity(databaseName, databaseVersion) {
  if (typeof databaseName !== 'string') {
    throw new TypeError('databaseName must be a string.');
  }

  if (typeof databaseVersion !== 'number' || !Number.isFinite(databaseVersion)) {
    throw new TypeError('databaseVersion must be a finite number.');
  }
}

// validateCost, validateCostId, and validateCostDate live in
// costValidation.js so stored records and backup files are checked by
// exactly the same rules as API input.

// TEAM EXTENSION — combines both validators for updateCost()'s full payload.
function validateEditableCost(cost) {
  validateCost(cost);
  validateCostDate(cost.date);
}

// Guards the required getReport() arguments once defaults have been applied.
function validateReportArguments(currency, year, month) {
  if (!isSupportedCurrency(currency)) {
    throw new TypeError('currency must be one of USD, ILS, GBP, EURO.');
  }

  if (typeof year !== 'number' || !Number.isInteger(year)) {
    throw new TypeError('year must be an integer.');
  }

  if (
    typeof month !== 'number' ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    throw new TypeError('month must be an integer from 1 to 12.');
  }
}

// Defensive copy for callers, so they can never mutate stored records.
const copyStoredCost = copyCostRecord;

function toReportCost(cost) {
  return {
    sum: cost.sum,
    currency: cost.currency,
    category: cost.category,
    description: cost.description,
    // Store day/month/year internally, but expose only day for the report
    // shape, matching the official example. OQ-002 is resolved — the
    // lecturer confirmed this { day }-only shape is correct (see
    // docs/REQUIREMENTS.md).
    date: {
      day: cost.date.day
    }
  };
}

// Computes a report's total in a single target currency. Individual report
// rows always keep their original sum/currency (R-036) — only this total is
// converted. When every matching cost already shares the target currency,
// no conversion (and therefore no cached-rates lookup) is needed at all,
// which is what lets the official same-currency sample test
// (200 USD + 400 USD, getReport("USD")) pass with no rates cache populated.
function calculateSameCurrencyTotal(costs, targetCurrency) {
  const requiresConversion = costs.some((cost) => cost.currency !== targetCurrency);

  if (!requiresConversion) {
    return costs.reduce((total, cost) => total + cost.sum, 0);
  }

  const cachedRates = getCachedExchangeRates();

  if (cachedRates === null) {
    // getReport() remains synchronous; exchange rates must be fetched and cached
    // before cross-currency totals can be calculated.
    throw new Error(
      'Cross-currency report totals require cached exchange rates.'
    );
  }

  return costs.reduce((total, cost) => {
    return total + convertCurrency(cost.sum, cost.currency, targetCurrency, cachedRates);
  }, 0);
}

/**
 * Required entry point of the protected db.js contract. Returns a fresh
 * database object bound to one (databaseName, databaseVersion) storage key;
 * nothing is cached at module scope, so multiple calls with the same
 * identity independently read/write the same underlying localStorage entry.
 * @param {string} databaseName - Name of the costs database.
 * @param {number} databaseVersion - Version of the costs database.
 * @returns {object} Database object exposing addCost/getReport (required)
 *   plus getAllCosts/getCostById/updateCost/deleteCost (team extensions).
 */
function openCostsDB(databaseName, databaseVersion) {
  validateDatabaseIdentity(databaseName, databaseVersion);

  // Every method reads through the store, which throws a StorageError when
  // the stored data is unavailable, damaged, or from a newer version, and
  // refuses to save over such data. It never falls back to an empty list.
  const store = createCostStore(getCostsStorageKey(databaseName, databaseVersion));

  return {
    /**
     * Required method. Stores a new cost item, stamping on a generated id
     * (team extension) and the automatic added-on date (R-035).
     * @param {object} cost - The cost to add.
     * @param {number} cost.sum - Cost amount.
     * @param {string} cost.currency - One of USD, ILS, GBP, EURO.
     * @param {string} cost.category - Free-text category.
     * @param {string} cost.description - Free-text description.
     * @returns {object} The stored cost, including its generated id/date
     *   alongside the four required properties (extra properties beyond
     *   those four are not addressed by the official spec; see OQ in
     *   docs/REQUIREMENTS.md).
     */
    addCost(cost) {
      validateCost(cost);

      const storedCost = {
        id: generateCostId(),
        sum: cost.sum,
        currency: cost.currency,
        category: cost.category,
        description: cost.description,
        date: getCurrentDateParts()
      };
      store.modifyCosts((costs) => [...costs, storedCost]);

      return copyStoredCost(storedCost);
    },

    /**
     * TEAM EXTENSION — powers the Manage Costs list view.
     * @returns {object[]} Every stored cost, each with its full internal
     *   date/time (unlike getReport()'s { day }-only report shape).
     */
    getAllCosts() {
      return store.readCosts().map(copyStoredCost);
    },

    /**
     * TEAM EXTENSION — used by Manage Costs to load a single row for editing.
     * @param {string} id - Id of the cost to look up.
     * @returns {object|null} The matching cost, or null if no cost has
     *   this id.
     */
    getCostById(id) {
      validateCostId(id);

      const matchingCost = store.readCosts().find((cost) => cost.id === id);

      return matchingCost ? copyStoredCost(matchingCost) : null;
    },

    /**
     * TEAM EXTENSION — full-record edit, used by Manage Costs. Preserves the
     * original id.
     * @param {string} id - Id of the cost to update.
     * @param {object} cost - Full editable payload: sum, currency,
     *   category, description, and date ({ day, month, year, hour, minute }).
     * @returns {object|null} The updated cost, or null for an unknown id
     *   (expected outcome, not an error); a malformed id or payload still
     *   throws via validation.
     */
    updateCost(id, cost) {
      validateCostId(id);

      const costs = store.readCosts();

      if (!costs.some((storedCost) => storedCost.id === id)) {
        return null;
      }

      validateEditableCost(cost);

      // Full editable payload replaces the stored record; id is kept.
      const updatedCost = {
        id,
        sum: cost.sum,
        currency: cost.currency,
        category: cost.category,
        description: cost.description,
        // Full internal date/time, unlike toReportCost()'s { day }-only shape.
        date: {
          day: cost.date.day,
          month: cost.date.month,
          year: cost.date.year,
          hour: cost.date.hour,
          minute: cost.date.minute
        }
      };

      store.modifyCosts((currentCosts) => currentCosts.map((storedCost) => {
        return storedCost.id === id ? updatedCost : storedCost;
      }));

      return copyStoredCost(updatedCost);
    },

    /**
     * TEAM EXTENSION — id-based deletion so that two costs which otherwise
     * look identical can be told apart and deleted independently.
     * @param {string} id - Id of the cost to delete.
     * @returns {object|null} The deleted cost, or null if no cost has
     *   this id.
     */
    deleteCost(id) {
      validateCostId(id);

      const deletedCost = store.readCosts().find((storedCost) => storedCost.id === id);

      if (!deletedCost) {
        return null;
      }

      store.modifyCosts((currentCosts) => {
        return currentCosts.filter((storedCost) => storedCost.id !== id);
      });

      return copyStoredCost(deletedCost);
    },

    /**
     * Required method of the protected db.js contract.
     * @param {string} currency - Currency to report the total in; one of
     *   USD, ILS, GBP, EURO.
     * @param {number} [year] - Report year; defaults to the current year
     *   (R-052) when omitted, matching the official `ob.getReport("USD")`
     *   sample.
     * @param {number} [month] - Report month (1-12); defaults to the
     *   current month when omitted.
     * @returns {object} { year, month, costs, total }: rows keep their
     *   original sum/currency and an official-shape { day } date, while
     *   `total` is calculated in the requested currency.
     */
    getReport(currency, year, month) {
      const currentDate = getCurrentDateParts();
      const reportYear = year ?? currentDate.year;
      const reportMonth = month ?? currentDate.month;

      validateReportArguments(currency, reportYear, reportMonth);

      const matchingCosts = store.readCosts().filter((cost) => {
        return cost.date.year === reportYear && cost.date.month === reportMonth;
      });

      // total is the only converted value; costs keep their own currency (R-036).
      return {
        year: reportYear,
        month: reportMonth,
        costs: matchingCosts.map(toReportCost),
        total: {
          currency,
          sum: calculateSameCurrencyTotal(matchingCosts, currency)
        }
      };
    }
  };
}

export const db = {
  openCostsDB
};
