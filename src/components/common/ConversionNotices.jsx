import { Alert, AlertTitle, Button, Stack } from '@mui/material';
import RateDisclosureAlert from './RateDisclosureAlert.jsx';

/*
 * M2B.3: what a user must know about HOW a converted figure was produced:
 *  - an incomplete notice with the cause in plain words and, only when trying
 *    again can help, a "Try again" button (an explicit regeneration);
 *  - the ECB provenance (only when rates were really used);
 *  - short notes: saving failed, unreadable cache, proposed rate changes;
 *  - "rates changed since this report": informational only. It never changes
 *    the numbers on screen; the user regenerates when they choose to.
 * Notices are text, not color alone, and the incomplete notice is a status
 * region so it is announced when a report finishes.
 */
function ConversionNotices({ incompleteNotice = null, onRetry = null, rateDisclosure = null, ratesChanged = false, statusNotes = [], isBusy = false }) {
  return (
    <Stack spacing={1.5}>
      {incompleteNotice ? (
        <Alert
          action={
            incompleteNotice.retryable && onRetry ? (
              <Button color="inherit" disabled={isBusy} onClick={onRetry} size="small">
                Try again
              </Button>
            ) : null
          }
          data-conversion-status="incomplete"
          role="status"
          severity="warning"
        >
          <AlertTitle>{incompleteNotice.title}</AlertTitle>
          {incompleteNotice.message}
        </Alert>
      ) : null}
      <RateDisclosureAlert disclosure={rateDisclosure} />
      {statusNotes.map((note) => (
        <Alert data-fx-note={note.id} key={note.id} role="note" severity={note.id === 'persistence' ? 'warning' : 'info'}>
          {note.text}
        </Alert>
      ))}
      {ratesChanged ? (
        <Alert
          action={
            onRetry ? (
              <Button color="inherit" disabled={isBusy} onClick={onRetry} size="small">
                Generate again
              </Button>
            ) : null
          }
          data-fx-note="rates-changed"
          role="status"
          severity="info"
        >
          Exchange rates were updated after this was generated. The figures below are unchanged. Generate it again to use the updated rates.
        </Alert>
      ) : null}
    </Stack>
  );
}

export default ConversionNotices;
