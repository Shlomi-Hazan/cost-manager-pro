/*
 * M2B.2: user-facing wording for how a converted figure was produced. It
 * describes only what the conversion actually did:
 *  - no rate was used (same-currency or empty output) -> no disclosure;
 *  - ECB observations were used -> ECB provenance, never "demo";
 *  - some expenses could not be converted -> an explicit incomplete notice.
 * The wording lives here so screens and exports agree.
 */
export const conversionKinds = { ecb: 'ecb' };

function dateText(observation) {
  return observation.firstDate === observation.lastDate
    ? `the observation dated ${observation.firstDate}`
    : `observations dated ${observation.firstDate} to ${observation.lastDate}`;
}

/**
 * @param {object} conversion - A conversion summary with `usesRates` and
 *   `observation` (see historicalConversion.js).
 * @returns {{kind: string, title: string, message: string, exportNote: string,
 *   provisional: boolean, observation: object}|null} null when no exchange
 *   rate contributed to the figures.
 */
export function getEcbDisclosure(conversion) {
  if (!conversion?.usesRates || !conversion.observation) {
    return null;
  }

  const { observation } = conversion;
  const base =
    'Converted amounts use European Central Bank (ECB) euro reference rates, delivered through the Frankfurter API, ' +
    `using ${dateText(observation)}: for each expense, the latest ECB observation on or before its date. ` +
    'Reference rates are informational and are not necessarily the rate you were charged. ' +
    'Cross rates are calculated by Cost Manager Pro from the ECB euro-based rates.';
  const provisional = observation.provisional
    ? ' Some amounts use the latest earlier ECB observation because a newer one may not be published yet; they can change when it is.'
    : '';

  return {
    kind: conversionKinds.ecb,
    title: 'ECB reference rates',
    message: base + provisional,
    exportNote: base + provisional,
    provisional: observation.provisional,
    observation
  };
}

const reasonText = {
  'rates-not-available': 'the ECB rates for their dates are not saved on this device and could not be loaded',
  'rates-not-prepared': 'no exchange rates were loaded',
  'future-date': 'they are dated in the future, so no rate exists yet',
  'before-provider-history': 'they are dated before the ECB rate history begins',
  'currency-unavailable': 'the ECB has no rate history for their currency on those dates',
  'no-common-observation-date': 'the ECB has no observation covering both currencies on those dates'
};

/**
 * @param {object} conversion - Result with `counts.unavailable` and
 *   `unavailableReasons`.
 * @returns {{count: number, title: string, message: string, exportNote: string}|null}
 *   null when every expense was converted.
 */
export function getIncompleteNotice(conversion) {
  const count = conversion?.counts?.unavailable ?? 0;

  if (count === 0) {
    return null;
  }

  const reasons = (conversion.unavailableReasons ?? []).map((reason) => reasonText[reason] ?? 'a rate is not available').join('; ');
  const noun = count === 1 ? 'expense' : 'expenses';
  const message =
    `${count} ${noun} could not be converted because ${reasons}. ` +
    'The total is shown as unavailable instead of a partial figure. Your expenses are unchanged; check your connection and generate the report again.';

  return { count, title: 'Total unavailable', message, exportNote: `Incomplete: ${count} ${noun} could not be converted. The total is unavailable.` };
}
