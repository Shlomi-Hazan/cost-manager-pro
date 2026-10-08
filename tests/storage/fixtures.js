/*
 * Realistic stored records for storage tests. Amounts include values that
 * are easy to corrupt by rounding or float formatting, so round-trip tests
 * prove they are preserved exactly.
 */
export const appDataKey = 'cost-manager-pro:costsdb:v2:costs';
export const appSnapshotKey = `${appDataKey}:previous`;
export const originalAppKeys = {
  costs: 'cost-manager:costsdb:v2:costs',
  costsVersion1: 'cost-manager:costsdb:v1:costs',
  settings: 'cost-manager:settings',
  ratesCache: 'cost-manager:exchange-rates-cache'
};

export function makeCost(overrides = {}) {
  return {
    id: 'a3f1c2d4-0000-4000-8000-000000000001',
    sum: 1234.56789,
    currency: 'ILS',
    category: 'Food',
    description: 'Groceries',
    date: { day: 29, month: 2, year: 2028, hour: 23, minute: 59 },
    ...overrides
  };
}

// A dataset as written by the app before M1: a bare JSON array.
export const legacyCosts = [
  makeCost(),
  makeCost({
    id: 'a3f1c2d4-0000-4000-8000-000000000002',
    sum: 0.1,
    currency: 'EURO',
    category: 'Transportation',
    description: 'Bus ticket',
    date: { day: 1, month: 1, year: 2026, hour: 0, minute: 0 }
  }),
  makeCost({
    id: 'a3f1c2d4-0000-4000-8000-000000000003',
    sum: -5.5,
    currency: 'GBP',
    category: 'Refunds',
    description: 'Negative amount accepted before M2 validation',
    date: { day: 31, month: 12, year: 2025, hour: 12, minute: 30 }
  })
];

export function currentDocument(costs) {
  return JSON.stringify({ schemaVersion: 1, costs });
}

export function quotaError() {
  return new DOMException('The quota has been exceeded.', 'QuotaExceededError');
}
