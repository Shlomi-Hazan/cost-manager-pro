/*
 * M2A.2 test oracle: an independent exact-rational implementation using
 * BigInt only (no big.js, no Number arithmetic), so the production decimal
 * engine is checked against a different implementation.
 */
export function gcd(a, b) {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;

  while (y !== 0n) {
    [x, y] = [y, x % y];
  }
  return x;
}

export function rational(numerator, denominator = 1n) {
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }
  const divisor = gcd(numerator, denominator) || 1n;

  return { n: numerator / divisor, d: denominator / divisor };
}

// Parses a plain decimal string ("-12.345") exactly.
export function parseDecimal(text) {
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = text.replace('-', '').split('.');
  const numerator = BigInt(whole + fraction) * (negative ? -1n : 1n);

  return rational(numerator, 10n ** BigInt(fraction.length));
}

export const add = (a, b) => rational(a.n * b.d + b.n * a.d, a.d * b.d);
export const mul = (a, b) => rational(a.n * b.n, a.d * b.d);
export const div = (a, b) => rational(a.n * b.d, a.d * b.n);

// Half away from zero, to `decimals` places; returns "-1.50" style text.
export function roundHalfAway(value, decimals) {
  const scale = 10n ** BigInt(decimals);
  const scaled = value.n * scale;
  const magnitude = scaled < 0n ? -scaled : scaled;
  let quotient = magnitude / value.d;

  if ((magnitude % value.d) * 2n >= value.d) {
    quotient += 1n;
  }
  const signed = scaled < 0n ? -quotient : quotient;
  const negative = signed < 0n;
  const digits = (negative ? -signed : signed).toString().padStart(decimals + 1, '0');
  const body = decimals === 0 ? digits : `${digits.slice(0, -decimals)}.${digits.slice(-decimals)}`;

  return negative ? `-${body}` : body;
}

// Small deterministic generator (mulberry32) so failures are reproducible.
export function createRandom(seed) {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
