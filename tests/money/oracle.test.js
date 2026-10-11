import { describe, expect, it } from 'vitest';
import { convertDecimalAmount, percentageOf, roundAmount, sumAmounts } from '../../src/lib/money/decimal.js';
import { add, createRandom, div, mul, parseDecimal, rational, roundHalfAway } from './oracle.js';

/*
 * M2A.2: the production decimal engine is compared with an independent
 * BigInt rational implementation on seeded random data.
 */
function randomDecimal(random, maxWhole, maxFraction) {
  const whole = Math.floor(random() * maxWhole);
  const fractionLength = Math.floor(random() * (maxFraction + 1));
  let fraction = '';

  for (let index = 0; index < fractionLength; index += 1) {
    fraction += Math.floor(random() * 10);
  }
  const sign = random() < 0.15 ? '-' : '';

  return `${sign}${whole}${fraction ? `.${fraction}` : ''}`;
}

describe('decimal engine against an independent rational oracle', () => {
  it('matches exact sums, to the last digit, on 2,000 seeded cases', () => {
    const random = createRandom(20260105);

    for (let run = 0; run < 2000; run += 1) {
      const amounts = Array.from({ length: 1 + Math.floor(random() * 12) }, () =>
        randomDecimal(random, 100000, 8)
      );
      const expected = amounts.map(parseDecimal).reduce(add, rational(0n));
      const decimals = 12;

      expect(roundAmount(sumAmounts(amounts), decimals)).toBe(roundHalfAway(expected, decimals));
    }
  });

  it('matches half-away rounding at every boundary-ish value', () => {
    const random = createRandom(7);

    for (let run = 0; run < 2000; run += 1) {
      const value = randomDecimal(random, 1000, 5);
      const places = Math.floor(random() * 4);

      expect(roundAmount(value, places)).toBe(roundHalfAway(parseDecimal(value), places));
    }
  });

  it('matches conversions within the documented half-unit-at-30-decimals bound', () => {
    const random = createRandom(99);

    for (let run = 0; run < 1000; run += 1) {
      const amount = randomDecimal(random, 1000000, 6).replace('-', '');
      const sourceRate = (0.2 + random() * 9).toFixed(4);
      const targetRate = (0.2 + random() * 9).toFixed(4);
      const exact = div(
        mul(parseDecimal(amount), parseDecimal(targetRate)),
        parseDecimal(sourceRate)
      );

      // The engine's single division rounds at 30 decimals, so it may differ
      // from the exact rational by at most half a unit of the 30th decimal.
      const engine = parseDecimal(convertDecimalAmount(amount, sourceRate, targetRate));
      const error = add(engine, rational(-exact.n, exact.d));
      const absoluteScaled = (error.n < 0n ? -error.n : error.n) * 2n * 10n ** 30n;

      expect(absoluteScaled <= error.d).toBe(true);
      // At the money level the answers are identical.
      expect(roundAmount(convertDecimalAmount(amount, sourceRate, targetRate), 2)).toBe(
        roundHalfAway(exact, 2)
      );
    }
  });

  it('matches percentage shares', () => {
    const random = createRandom(31337);

    for (let run = 0; run < 500; run += 1) {
      const part = randomDecimal(random, 1000, 4).replace('-', '');
      const whole = `${1 + Math.floor(random() * 5000)}.${Math.floor(random() * 100)}`;
      const expected = roundHalfAway(
        div(mul(parseDecimal(part), rational(100n)), parseDecimal(whole)),
        1
      );

      expect(percentageOf(part, whole, 1)).toBe(expected);
    }
  });
});
