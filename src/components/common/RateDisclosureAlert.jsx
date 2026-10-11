import { Alert, AlertTitle } from '@mui/material';

/*
 * The one visible warning about exchange-rate trustworthiness. It is not
 * color-only: it has a warning icon, a bold title, and full text. It uses
 * role="note" (not "alert") because it is persistent context rather than an
 * interruption, and is placed before the numbers it qualifies so it is read
 * first. `data-rate-source` exposes the classification for tests.
 *
 * `detail` selects the longer Settings wording instead of the short one.
 */
function RateDisclosureAlert({ detail = false, disclosure, sx }) {
  if (!disclosure) {
    return null;
  }

  return (
    <Alert
      aria-label={disclosure.title}
      data-rate-source={disclosure.kind}
      role="note"
      severity="warning"
      sx={sx}
    >
      <AlertTitle>{disclosure.title}</AlertTitle>
      {detail ? disclosure.settingsDetail : disclosure.message}
    </Alert>
  );
}

export default RateDisclosureAlert;
