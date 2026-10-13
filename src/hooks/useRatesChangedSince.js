import { useEffect, useState } from 'react';
import { fxCacheKey, fxChangedEvent, getChangedUsedRates } from '../services/fxRatesService.js';

/*
 * M2B.3: true when a rate THIS report used now has a different accepted value
 * (a revision was accepted here or in another tab). Unrelated currencies or
 * dates, pending proposals, and reports that used no rate never trigger it. It
 * only reports that fact: it never recomputes or edits the report; the user
 * regenerates it explicitly. Nothing runs until such an event, and nothing polls.
 * @param {{quote: string, date: string, rate: string}[]|null} used - fxStatus.usedObservations
 *   of the displayed report, or null when there is no snapshot or no rate was used.
 */
export function useRatesChangedSince(used) {
  // The result is remembered together with the snapshot it was computed for, so
  // a newly generated report starts clean without any reset.
  const [result, setResult] = useState({ used: null, changed: false });
  const hasSnapshot = Array.isArray(used) && used.length > 0;

  useEffect(() => {
    if (!hasSnapshot) {
      return undefined;
    }

    function check() {
      try {
        setResult({ used, changed: getChangedUsedRates(used) });
      } catch {
        // An unreadable cache is not evidence that rates changed.
      }
    }

    function onStorage(event) {
      if (event.key === null || event.key === fxCacheKey) {
        check();
      }
    }

    window.addEventListener('storage', onStorage);
    window.addEventListener(fxChangedEvent, check);

    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(fxChangedEvent, check);
    };
  }, [hasSnapshot, used]);

  return hasSnapshot && result.used === used && result.changed;
}
