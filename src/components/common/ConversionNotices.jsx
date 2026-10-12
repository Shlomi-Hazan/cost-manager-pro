import { Alert, AlertTitle } from '@mui/material';
import RateDisclosureAlert from './RateDisclosureAlert.jsx';

/*
 * M2B.2: what a user must know about HOW a converted figure was produced:
 * the ECB provenance (only when rates were really used) and, separately, an
 * explicit notice when some expenses could not be converted so the total is
 * unavailable. The incomplete notice is a status region so it is announced
 * when a report finishes, and it is text, not color alone.
 */
function ConversionNotices({ incompleteNotice = null, rateDisclosure = null }) {
  return (
    <>
      {incompleteNotice ? (
        <Alert data-conversion-status="incomplete" role="status" severity="warning">
          <AlertTitle>{incompleteNotice.title}</AlertTitle>
          {incompleteNotice.message}
        </Alert>
      ) : null}
      <RateDisclosureAlert disclosure={rateDisclosure} />
    </>
  );
}

export default ConversionNotices;
