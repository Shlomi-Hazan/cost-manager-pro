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

const pad = (value) => String(value).padStart(2, '0');

/**
 * ISO time -> "2026-10-13 08:00 UTC". Always UTC and labeled, so it is never
 * confused with the expense date or the user's local day.
 */
export function formatCheckedAt(iso) {
  const date = new Date(iso);

  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

/**
 * @param {object} conversion - A conversion summary with `usesRates`
 *   and `observation` (see historicalConversion.js).
 * @param {object} [status] - The availability status (fxAvailability.js).
 * @returns {object|null} null when no exchange rate contributed.
 */
export function getEcbDisclosure(conversion, status = null) {
  if (!conversion?.usesRates || !conversion.observation) {
    return null;
  }

  const { observation } = conversion;
  const base =
    'Converted amounts use European Central Bank (ECB) euro reference rates, delivered through the Frankfurter API, ' +
    `using ${dateText(observation)}: for each expense, the latest ECB observation on or before its date. ` +
    'Reference rates are informational and are not necessarily the rate you were charged. ' +
    'Cross rates are calculated by Cost Manager Pro from the ECB euro-based rates.';
  const checked = status?.lastCheckedAt ? ` Rates last checked with the ECB: ${formatCheckedAt(status.lastCheckedAt)}.` : '';
  const origin = status ? (status.loadedNow ? ' Some rates were loaded while making this report.' : ' These rates were already saved on this device.') : '';
  const provisional = observation.provisional
    ? ' Some amounts use the latest earlier ECB observation because a newer one may not be published yet; they can change when it is.'
    : '';
  const message = base + checked + origin + provisional;

  return {
    kind: conversionKinds.ecb,
    title: 'ECB reference rates',
    message,
    exportNote: message,
    provisional: observation.provisional,
    observation,
    checkedAt: status?.lastCheckedAt ?? null,
    origin: status ? (status.loadedNow ? 'loaded' : 'saved') : null
  };
}

const causeText = {
  offline: 'Your browser reports that you are offline, so the ECB rates could not be loaded.',
  network: 'The ECB rate service could not be reached.',
  timeout: 'The ECB rate service did not answer in time.',
  'rate-limited': 'The rate service is limiting requests right now.',
  'provider-error': 'The rate service is temporarily unavailable.',
  'invalid-response': 'The rate service sent data that did not pass validation, so it was not used.',
  'not-fetched': 'The rates for these dates have not been loaded yet.',
  'provider-no-data': 'The ECB has no published rate for these dates.',
  'currency-unavailable': 'The ECB has no rate history for this currency on these dates.',
  'before-history': 'These expenses are dated before the ECB rate history begins.',
  'future-date': 'These expenses are dated in the future, so no rate exists yet. A total becomes available on or after their date.',
  'no-common-date': 'The ECB has no observation covering both currencies on these dates.'
};

const retryAdvice = 'Your expenses are unchanged. Try again when the connection or service is back.';
const permanentAdvice = 'Your expenses are unchanged. Trying again will not change this.';

/**
 * @param {object} conversion - Result with `counts.unavailable`.
 * @param {object} [status] - The availability status (fxAvailability.js).
 * @returns {{count: number, title: string, message: string, exportNote: string,
 *   retryable: boolean, causes: string[]}|null} null when every expense converted.
 */
export function getIncompleteNotice(conversion, status = null) {
  const count = conversion?.counts?.unavailable ?? 0;

  if (count === 0) {
    return null;
  }

  const noun = count === 1 ? 'expense' : 'expenses';
  const causes = status?.causes ?? [];
  const causeLines = causes.map((cause) => causeText[cause.code]).filter(Boolean);
  const retryable = causes.length === 0 ? true : causes.some((cause) => cause.retryable);
  const reasons = causeLines.length > 0 ? ` ${causeLines.join(' ')}` : '';
  const advice = retryable ? retryAdvice : permanentAdvice;
  const message = `${count} ${noun} could not be converted, so the total is shown as unavailable instead of a partial figure.${reasons} ${advice}`;

  return {
    count,
    title: 'Total unavailable',
    message,
    exportNote: `Incomplete: ${count} ${noun} could not be converted. The total is unavailable.`,
    retryable,
    causes: causes.map((cause) => cause.code)
  };
}

/**
 * Short, optional notes about the data behind a report (not errors).
 * @param {object} status - The availability status.
 * @returns {{id: string, text: string}[]}
 */
export function getStatusNotes(status) {
  const notes = [];

  if (!status) {
    return notes;
  }

  if (status.persistenceFailed) {
    notes.push({ id: 'persistence', text: 'These rates could not be saved on this device (storage may be full or blocked). This report is correct, but the rates will have to be loaded again next time.' });
  }

  if (status.cacheProblem) {
    notes.push({ id: 'cache', text: 'The saved rate data could not be read, so it was ignored and rates were loaded again. Your expenses were not affected.' });
  }

  if (status.pendingRevisions > 0) {
    const noun = status.pendingRevisions === 1 ? 'rate' : 'rates';

    notes.push({ id: 'revisions', text: `The ECB now reports different values for ${status.pendingRevisions} ${noun} used here. This report keeps the accepted values. Review the changes in Settings; accepted changes apply only when you generate the report again.` });
  }

  return notes;
}
