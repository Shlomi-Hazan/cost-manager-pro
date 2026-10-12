import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CostInputError,
  costInputErrorCodes as codes,
  parseAmountInput,
  validateCostInput
} from '../../src/lib/costInput.js';
import { db, getCostsStorageKey } from '../../src/lib/db.js';
import { normalizeAmount } from '../../src/lib/money/decimal.js';
import { applyRestore, prepareRestore } from '../../src/services/dataManagementService.js';
import { createCostStore } from '../../src/lib/storage/costStore.js';

/*
 * M2A.3 validation boundary. The database API (addCost / updateCost) enforces
 * the same input policy as the forms, with one difference that follows from
 * its input type: it receives a Number, not typed text (see the header of
 * src/lib/costInput.js). Legacy data is never touched by these checks: it
 * enters through migration, restore and import, and an update only validates
 * the fields whose value actually changed.
 */
const name = 'boundary';
const key = getCostsStorageKey(name, 1);
const valid = { sum: 10, currency: 'USD', category: 'Food', description: 'Lunch' };

function allStorage() {
  return Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)]));
}

function seed(costs) {
  localStorage.setItem(key, JSON.stringify({ schemaVersion: 2, costs }));
}

function record(overrides = {}) {
  return {
    id: 'legacy-1',
    sum: 12.34567,
    currency: 'USD',
    category: 'old   category !!',
    description: 'd'.repeat(500),
    date: { day: 1, month: 3, year: 1850, hour: 9, minute: 5 },
    ...overrides
  };
}

function outcome(action) {
  try {
    action();

    return 'ok';
  } catch (error) {
    expect(error).toBeInstanceOf(TypeError);

    return error instanceof CostInputError ? `${error.field}:${error.code}` : `other:${error.message}`;
  }
}

describe('addCost enforces the new-input policy', () => {
  let ob;

  beforeEach(() => {
    localStorage.clear();
    ob = db.openCostsDB(name, 1);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['zero', { sum: 0 }, `sum:${codes.amountNotPositive}`],
    ['negative', { sum: -5 }, `sum:${codes.amountNotPositive}`],
    ['negative zero', { sum: -0 }, `sum:${codes.amountNotPositive}`],
    ['excess decimals', { sum: 1.234 }, `sum:${codes.amountTooManyDecimals}`],
    ['float noise (0.1 + 0.2)', { sum: 0.1 + 0.2 }, `sum:${codes.amountTooManyDecimals}`],
    ['tiny (1e-21)', { sum: 1e-21 }, `sum:${codes.amountTooManyDecimals}`],
    ['huge (1e21)', { sum: 1e21 }, `sum:${codes.amountTooManyIntegerDigits}`],
    ['13 integer digits', { sum: 1234567890123 }, `sum:${codes.amountTooManyIntegerDigits}`],
    ['MAX_SAFE_INTEGER', { sum: Number.MAX_SAFE_INTEGER }, `sum:${codes.amountTooManyIntegerDigits}`],
    ['MAX_VALUE', { sum: Number.MAX_VALUE }, `sum:${codes.amountTooManyIntegerDigits}`],
    ['16 significant digits', { sum: 1234567890.123456 }, `sum:${codes.amountTooManyDecimals}`],
    ['category of 51 characters', { category: 'c'.repeat(51) }, `category:${codes.categoryTooLong}`],
    ['empty category', { category: '' }, `category:${codes.categoryRequired}`],
    ['blank category', { category: '   ' }, `category:${codes.categoryRequired}`],
    ['control character in category', { category: 'a\u0000b' }, `category:${codes.categoryInvalidCharacters}`],
    ['description of 201 characters', { description: 'd'.repeat(201) }, `description:${codes.descriptionTooLong}`],
    ['description of 100000 characters', { description: 'd'.repeat(100000) }, `description:${codes.descriptionTooLong}`],
    ['blank description', { description: '   ' }, `description:${codes.descriptionRequired}`],
    ['control character in description', { description: 'a\nb' }, `description:${codes.descriptionInvalidCharacters}`]
  ])('rejects %s with a stable field and code, and changes nothing', (_label, patch, expected) => {
    const before = allStorage();

    expect(outcome(() => ob.addCost({ ...valid, ...patch }))).toBe(expected);
    // No record, no previous-data copy, no pending copy, nothing at all.
    expect(allStorage()).toEqual(before);
  });

  it('keeps the existing structural errors and messages for non-numbers and unknown currencies', () => {
    expect(() => ob.addCost({ ...valid, sum: '10' })).toThrow('cost.sum must be a finite number.');
    expect(() => ob.addCost({ ...valid, sum: Number.NaN })).toThrow('cost.sum must be a finite number.');
    expect(() => ob.addCost({ ...valid, sum: Infinity })).toThrow('cost.sum must be a finite number.');
    expect(() => ob.addCost({ ...valid, currency: 'EURO' })).toThrow(
      'cost.currency must be one of USD, ILS, GBP, EUR.'
    );
  });

  it('reports field, code and parameters as data', () => {
    let error;

    try {
      ob.addCost({ ...valid, sum: 1.234 });
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({ name: 'CostInputError', field: 'sum', code: codes.amountTooManyDecimals, params: { max: 2 } });
  });

  it.each([
    [0.01], [1], [12.5], [100.1], [999999999999.99], [123456789012.34], [0.07], [4.35]
  ])('accepts %s in every supported currency', (sum) => {
    ['USD', 'ILS', 'GBP', 'EUR'].forEach((currency) => {
      expect(outcome(() => ob.addCost({ ...valid, sum, currency }))).toBe('ok');
    });
  });

  it('accepts the official sample values and the limits of the text fields', () => {
    expect(ob.addCost({ sum: 200, currency: 'USD', category: 'FOOD', description: 'pizza' }).sum).toBe(200);
    expect(ob.addCost({ sum: 400, currency: 'USD', category: 'CAR', description: 'fuel' }).sum).toBe(400);
    expect(ob.getReport('USD').total.sum).toBe(600);
    expect(outcome(() => ob.addCost({ ...valid, category: 'c'.repeat(50) }))).toBe('ok');
    expect(outcome(() => ob.addCost({ ...valid, description: '😀'.repeat(200) }))).toBe('ok');
    expect(outcome(() => ob.addCost({ ...valid, description: 'שלום'.repeat(50) }))).toBe('ok');
  });

  it('stamps the current date itself, so a supplied date can not smuggle in an invalid one', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 12, 8, 30, 0));
    const added = ob.addCost({ ...valid, date: { day: 31, month: 2, year: 1850, hour: 99, minute: 99 } });

    vi.useRealTimers();
    expect(ob.getCostById(added.id).date).toEqual({ day: 12, month: 10, year: 2026, hour: 8, minute: 30 });
  });
});

describe('what a Number can and cannot reveal (documented limits)', () => {
  let ob;

  beforeEach(() => {
    localStorage.clear();
    ob = db.openCostsDB(name, 1);
  });

  it('cannot see trailing zeros the user typed: 1.990 arrives as 1.99 and is accepted', () => {
    // The form rejects the text "1.990"; the database only ever sees 1.99.
    expect(parseAmountInput('1.990', 'USD')).toMatchObject({ ok: false });
    expect(outcome(() => ob.addCost({ ...valid, sum: Number('1.990') }))).toBe('ok');
  });

  it('judges a Number by its shortest round-trip decimal form', () => {
    expect(normalizeAmount(0.1 + 0.2)).toBe('0.30000000000000004');
    expect(normalizeAmount(1e-7)).toBe('0.0000001');
    expect(normalizeAmount(1e21)).toBe('1000000000000000000000');
    expect(normalizeAmount(-0)).toBe('0');
  });

  it('agrees with the form for every Number, judged by that decimal form', () => {
    const samples = [
      0, -0, -1, 0.01, 0.1, 0.5, 1, 1.1, 1.005, 2.675, 99.99, 100, 1e-7, 1e-21, 1e21, 123456789012.34,
      1234567890123, 0.1 + 0.2, 1 / 3, 4.35, Math.PI, Number.MAX_SAFE_INTEGER, Number.MIN_VALUE
    ];

    samples.forEach((sum) => {
      const form = parseAmountInput(normalizeAmount(sum), 'USD');
      const database = outcome(() => ob.addCost({ ...valid, sum }));

      expect(database === 'ok').toBe(form.ok);
      if (!form.ok) {
        expect(database).toBe(`sum:${form.error.code}`);
      }
    });
  });

  it('accepts every amount the form accepts (typed text -> Number -> database)', () => {
    let state = 42;
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;

      return state / 4294967296;
    };

    for (let run = 0; run < 300; run += 1) {
      const whole = String(Math.floor(random() * 10 ** Math.floor(1 + random() * 12))).replace(/^0+(?=\d)/, '');
      const text = random() < 0.5 ? `${whole}.${String(Math.floor(random() * 100)).padStart(2, '0')}` : whole;
      const typed = validateCostInput({ ...valid, sum: text });

      if (typed.isValid) {
        expect(outcome(() => ob.addCost({ ...valid, sum: typed.value.sum }))).toBe('ok');
        expect(ob.getAllCosts().at(-1).sum).toBe(Number(normalizeAmount(text)));
      }
    }
  });
});

describe('updateCost validates only what changed', () => {
  let ob;

  beforeEach(() => {
    localStorage.clear();
    ob = db.openCostsDB(name, 1);
    seed([record(), record({ id: 'legacy-2', sum: 0, description: 'zero' })]);
  });

  const payload = (patch = {}) => ({ ...record(), id: undefined, ...patch });

  it('keeps every unchanged legacy value exactly, even though it breaks today\'s rules', () => {
    const stored = ob.getCostById('legacy-1');
    const updated = ob.updateCost('legacy-1', payload({ currency: 'EUR' }));

    expect(updated).toEqual({ ...stored, currency: 'EUR' });
    expect(Object.is(updated.sum, 12.34567)).toBe(true);
    expect(updated.category).toBe('old   category !!');
    expect(updated.description).toBe('d'.repeat(500));
    expect(updated.date).toEqual({ day: 1, month: 3, year: 1850, hour: 9, minute: 5 });
  });

  it.each([[0], [-5.5], [12.34567], [1e-21], [123456789012345680000]])(
    'saves an update that leaves the stored amount %s alone',
    (sum) => {
      seed([record({ sum })]);

      expect(outcome(() => ob.updateCost('legacy-1', payload({ sum, description: 'renamed' })))).toBe('ok');
      expect(Object.is(ob.getCostById('legacy-1').sum, sum)).toBe(true);
      expect(ob.getCostById('legacy-1').description).toBe('renamed');
    }
  );

  it('changing only the time never revalidates an old date', () => {
    const date = { day: 1, month: 3, year: 1850, hour: 23, minute: 59 };

    expect(outcome(() => ob.updateCost('legacy-1', payload({ date })))).toBe('ok');
    expect(ob.getCostById('legacy-1').date).toEqual(date);
  });

  it.each([
    ['a changed sum of zero', { sum: 0 }, `sum:${codes.amountNotPositive}`],
    ['a changed negative sum', { sum: -5 }, `sum:${codes.amountNotPositive}`],
    ['a changed sum with 3 decimals', { sum: 1.234 }, `sum:${codes.amountTooManyDecimals}`],
    ['a changed huge sum', { sum: 1e21 }, `sum:${codes.amountTooManyIntegerDigits}`],
    ['a changed category of 51 characters', { category: 'c'.repeat(51) }, `category:${codes.categoryTooLong}`],
    ['a changed blank category', { category: ' ' }, `category:${codes.categoryRequired}`],
    ['a changed description of 201 characters', { description: 'd'.repeat(201) }, `description:${codes.descriptionTooLong}`],
    ['a changed date before 1900', { date: { day: 1, month: 3, year: 1899, hour: 9, minute: 5 } }, `date:${codes.dateYearOutOfRange}`],
    ['a changed date after 2999', { date: { day: 1, month: 3, year: 3000, hour: 9, minute: 5 } }, `date:${codes.dateYearOutOfRange}`]
  ])('rejects %s and leaves storage untouched', (_label, patch, expected) => {
    const before = allStorage();

    expect(outcome(() => ob.updateCost('legacy-1', payload(patch)))).toBe(expected);
    expect(allStorage()).toEqual(before);
  });

  it('keeps the existing structural checks (a changed impossible date, a wrong currency)', () => {
    expect(() => ob.updateCost('legacy-1', payload({ date: { day: 31, month: 2, year: 2026, hour: 1, minute: 1 } }))).toThrow(
      'cost.date must be a real calendar date.'
    );
    expect(() => ob.updateCost('legacy-1', payload({ currency: 'EURO' }))).toThrow(
      'cost.currency must be one of USD, ILS, GBP, EUR.'
    );
  });

  it('still returns null for an unknown id before looking at the payload', () => {
    expect(ob.updateCost('missing', payload({ sum: -1 }))).toBeNull();
  });

  it('accepts a changed amount that meets the rules, and keeps the rest', () => {
    const updated = ob.updateCost('legacy-1', payload({ sum: 12.34 }));

    expect(updated.sum).toBe(12.34);
    expect(updated.description).toBe('d'.repeat(500));
    expect(updated.date.year).toBe(1850);
  });

  it('a record changed to a valid value can be edited again without surprises', () => {
    ob.updateCost('legacy-1', payload({ sum: 12.34 }));

    expect(outcome(() => ob.updateCost('legacy-1', payload({ sum: 12.34, description: 'again' })))).toBe('ok');
  });
});

describe('legacy data keeps entering through migration, restore and import', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const strictViolators = [
    { id: 'z', sum: 0, currency: 'EURO', category: 'c'.repeat(80), description: 'd'.repeat(500), date: { day: 1, month: 1, year: 1800, hour: 0, minute: 0 } },
    { id: 'n', sum: -5.5, currency: 'USD', category: 'Refund', description: 'neg', date: { day: 2, month: 2, year: 2026, hour: 1, minute: 1 } },
    { id: 't', sum: 1e-21, currency: 'GBP', category: 'Tiny', description: 'tiny', date: { day: 3, month: 3, year: 2026, hour: 2, minute: 2 } },
    { id: 'h', sum: 123456789012345680000, currency: 'ILS', category: 'Huge', description: 'huge', date: { day: 4, month: 4, year: 2026, hour: 3, minute: 3 } }
  ];

  it('restores a valid version 1 backup whose records break every new-input rule', () => {
    const backup = JSON.stringify({
      format: 'cost-manager-pro-backup',
      formatVersion: 1,
      exportedAt: '2026-10-01T10:00:00.000Z',
      app: 'Cost Manager Pro',
      costCount: strictViolators.length,
      costs: strictViolators
    });

    const prepared = prepareRestore(backup);

    expect(prepared.costs.map((cost) => cost.currency)).toEqual(['EUR', 'USD', 'GBP', 'ILS']);
    expect(prepared.costs.map((cost) => cost.sum)).toEqual(strictViolators.map((cost) => cost.sum));
    applyRestore(prepared, undefined, new Date('2026-10-12T00:00:00Z'));

    const ob = db.openCostsDB('costsdb', 2);

    expect(ob.getAllCosts()).toHaveLength(4);
    // ...and they stay editable without being rewritten or rejected.
    const first = ob.getCostById('z');
    const edited = ob.updateCost('z', { ...first, id: undefined, description: first.description });

    expect(edited).toEqual(first);
  });

  it('reads and saves schema 1 data with legacy values without applying the strict rules', () => {
    const store = createCostStore(key);

    localStorage.setItem(key, JSON.stringify({ schemaVersion: 1, costs: strictViolators }));
    expect(store.readCosts().map((cost) => cost.sum)).toEqual(strictViolators.map((cost) => cost.sum));
    // An ordinary save (the migrating one) writes them back unchanged.
    store.modifyCosts((costs) => costs, new Date('2026-10-12T00:00:00Z'));
    expect(JSON.parse(localStorage.getItem(key)).costs.map((cost) => cost.sum)).toEqual(strictViolators.map((cost) => cost.sum));
  });

  it('a deleteCost on a legacy record works and does not run the input policy', () => {
    seed([record(), record({ id: 'legacy-2', sum: 0 })]);
    const ob = db.openCostsDB(name, 1);

    expect(ob.deleteCost('legacy-2')).toMatchObject({ id: 'legacy-2', sum: 0 });
    expect(ob.getAllCosts()).toHaveLength(1);
  });
});
