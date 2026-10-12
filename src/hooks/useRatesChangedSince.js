import { useEffect, useState } from 'react';
import { fxCacheKey, fxChangedEvent, getFxOverview } from '../services/fxRatesService.js';

/*
 * M2B.3: true when accepted rates changed AFTER a report was generated (a rate
 * revision was accepted here or in another tab). It only reports that fact: it
 * never recomputes or edits the report; the user regenerates it explicitly.
 * Nothing runs until such an event, and nothing polls.
 * @param {number|null} revisionCountAtGeneration - fxStatus.revisionCount of the
 *   displayed snapshot, or null when there is no snapshot.
 */
export function useRatesChangedSince(revisionCountAtGeneration) {
  // The newest accepted-revision count seen in an event. "Changed" is derived
  // by comparing it with the snapshot's own count, so a new report simply
  // starts a new comparison with no reset needed.
  const [observedCount, setObservedCount] = useState(null);
  const hasSnapshot = revisionCountAtGeneration !== null && revisionCountAtGeneration !== undefined;

  useEffect(() => {
    if (!hasSnapshot) {
      return undefined;
    }

    function check() {
      try {
        setObservedCount(getFxOverview().revisionCount);
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
  }, [hasSnapshot]);

  return hasSnapshot && observedCount !== null && observedCount !== revisionCountAtGeneration;
}
