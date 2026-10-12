/*
 * M2A.3: optional, non-blocking remarks about STORED values that would not
 * pass today's new-input rules (zero or negative amounts, more decimals than
 * the currency uses, and so on). These are information for the user only:
 * nothing is rejected, rewritten, or hidden because of them, and reading data
 * never depends on them. The remark codes are stable; wording is in
 * utils/costInputMessages.js-style tables so it can be localized.
 */
import { costInputErrorCodes, parseAmountInput } from './costInput.js';
import { normalizeAmount } from './money/decimal.js';

export const dataQualityCodes = {
  amountNotPositive: 'amount-not-positive',
  amountMoreDecimalsThanCurrency: 'amount-more-decimals-than-currency',
  amountMorePrecisionThanNewInput: 'amount-more-precision-than-new-input'
};

/**
 * @param {{sum: number, currency: string}} cost - A stored record.
 * @returns {string[]} Zero or more dataQualityCodes for the stored amount.
 */
export function getAmountDataQualityNotes(cost) {
  const result = parseAmountInput(normalizeAmount(cost.sum), cost.currency);

  if (result.ok) {
    return [];
  }

  switch (result.error.code) {
    case costInputErrorCodes.amountNotPositive:
      return [dataQualityCodes.amountNotPositive];
    case costInputErrorCodes.amountTooManyDecimals:
      return [dataQualityCodes.amountMoreDecimalsThanCurrency];
    default:
      // Syntax (for example a very small stored value written with an
      // exponent is normalized first, so this is rare), or too many digits.
      return [dataQualityCodes.amountMorePrecisionThanNewInput];
  }
}
