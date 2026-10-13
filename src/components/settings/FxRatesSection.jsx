import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography
} from '@mui/material';
import LoadingButtonLabel from '../common/LoadingButtonLabel.jsx';
import SectionCard from '../common/SectionCard.jsx';
import { describeOperationResult, formatCheckedAt } from '../../services/conversionDisclosure.js';
import {
  applyRevision,
  checkForNewRates,
  checkSavedRatesForRevisions,
  fxCacheKey,
  getFxOverview,
  keepRevision
} from '../../services/fxRatesService.js';

/*
 * M2B.3: the one place a user controls the saved ECB rates. Three separate,
 * explicit actions (never combined, never automatic):
 *   - check for new rates      (adds data)
 *   - check saved rates        (finds values the ECB now reports differently)
 *   - use / keep a change      (the user's decision about ONE proposal)
 * Reports already open are never rewritten by any of them; they only say that
 * rates changed and the user regenerates.
 */
const maxRowsShown = 50;

// Below the md breakpoint each proposal becomes a stacked card (label: value)
// so it fits 360 px without sideways scrolling. The column headers stay in the
// accessibility tree (visually hidden) and each cell carries its label.
const stackedRowsSx = {
  '& thead': {
    display: { xs: 'block', md: 'table-header-group' },
    '& tr': { display: { xs: 'block', md: 'table-row' } },
    '& th': {
      border: { xs: 0, md: undefined },
      clip: { xs: 'rect(0 0 0 0)', md: 'auto' },
      height: { xs: '1px', md: 'auto' },
      overflow: { xs: 'hidden', md: 'visible' },
      p: { xs: 0, md: undefined },
      position: { xs: 'absolute', md: 'static' },
      width: { xs: '1px', md: 'auto' }
    }
  },
  '& tbody tr': {
    borderBottom: { xs: '1px solid', md: 0 },
    borderColor: 'divider',
    display: { xs: 'block', md: 'table-row' },
    py: { xs: 1, md: 0 }
  },
  '& tbody td': {
    alignItems: 'center',
    border: { xs: 0, md: undefined },
    display: { xs: 'flex', md: 'table-cell' },
    gap: 2,
    justifyContent: 'space-between',
    '&::before': {
      content: 'attr(data-label)',
      display: { xs: 'block', md: 'none' },
      fontWeight: 700
    }
  }
};

function rateText(quote, rate) {
  return `1 EUR = ${rate} ${quote}`;
}

function describeDecision(outcome, persisted) {
  if (outcome === 'applied') {
    return {
      severity: persisted ? 'success' : 'warning',
      text: `Rate change applied. Reports that are already open are not changed; generate them again to use it.${persisted ? '' : ' It could not be saved on this device, so it only lasts until you close this tab.'}`
    };
  }

  if (outcome === 'kept') {
    return { severity: 'success', text: 'Kept the current rate. The proposed change was dismissed.' };
  }

  return { severity: 'warning', text: 'That change was updated or already handled, so nothing was applied. The list has been refreshed.' };
}

function FxRatesSection() {
  const [overview, setOverview] = useState(() => getFxOverview());
  const [running, setRunning] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const controllerRef = useRef(null);
  const isBusy = running !== null;

  function refreshOverview() {
    setOverview(getFxOverview());
  }

  // Another tab may have changed the saved rates; reflect it, never act on it.
  useEffect(() => {
    function onStorage(event) {
      if (event.key === null || event.key === fxCacheKey) {
        setOverview(getFxOverview());
      }
    }

    window.addEventListener('storage', onStorage);

    return () => window.removeEventListener('storage', onStorage);
  }, []);

  async function run(name, operation) {
    const controller = new AbortController();

    controllerRef.current = controller;
    setRunning(name);
    setFeedback(null);

    try {
      const result = await operation(controller.signal);

      setFeedback(describeOperationResult(result));
    } catch {
      setFeedback({ severity: 'error', text: 'Something went wrong while checking the rates. Your expenses were not affected.' });
    } finally {
      controllerRef.current = null;
      setRunning(null);
      refreshOverview();
    }
  }

  function decide(kind, revision) {
    const target = { quote: revision.quote, date: revision.date, accepted: revision.accepted, candidate: revision.candidate };
    const { outcome, persisted } = kind === 'apply' ? applyRevision(target) : keepRevision(target);

    setFeedback(describeDecision(outcome, persisted));
    refreshOverview();
  }

  const { pendingRevisions } = overview;
  const shown = pendingRevisions.slice(0, maxRowsShown);
  const hasRates = overview.observationCount > 0;

  return (
    <SectionCard>
      <Stack spacing={3}>
        <Box>
          <Typography component="h2" variant="h2">
            ECB Exchange Rates
          </Typography>
          <Typography color="text.secondary" variant="body1">
            Reports convert each expense with the ECB rate for its date. Rates are saved on this device and only loaded when a report needs them.
          </Typography>
        </Box>

        {overview.cacheStatus === 'corrupt' || overview.cacheStatus === 'unsupported' || overview.cacheStatus === 'unavailable' ? (
          <Alert role="note" severity="warning">
            The saved rate data cannot be read{overview.cacheStatus === 'unsupported' ? ' (it was made by a newer version of the app)' : ''}. It is ignored and rebuilt when a report needs it. Your expenses are not affected.
          </Alert>
        ) : null}
        {overview.persistence === 'memory-only' ? (
          <Alert role="note" severity="warning">
            Rates could not be saved on this device (storage may be full or blocked). They are kept only until you close this tab.
          </Alert>
        ) : null}

        <Box component="dl" sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', md: '260px 1fr' }, m: 0 }}>
          <Typography color="text.secondary" component="dt" variant="body2">Saved rates</Typography>
          <Typography component="dd" sx={{ m: 0 }}>
            {hasRates ? `${overview.observationCount} observations, dated ${overview.firstDate} to ${overview.lastDate}` : 'None yet. Generating a report that needs rates loads them.'}
          </Typography>
          <Typography color="text.secondary" component="dt" variant="body2">Last checked with the ECB</Typography>
          <Typography component="dd" sx={{ m: 0 }}>{overview.lastCheckedAt ? formatCheckedAt(overview.lastCheckedAt) : 'Never'}</Typography>
          <Typography color="text.secondary" component="dt" variant="body2">Newest ECB observation reported</Typography>
          <Typography component="dd" sx={{ m: 0 }}>{overview.providerNewest ?? 'Unknown until you check for new rates'}</Typography>
          <Typography color="text.secondary" component="dt" variant="body2">Accepted changes so far</Typography>
          <Typography component="dd" sx={{ m: 0 }}>{overview.revisionCount}</Typography>
        </Box>

        <Stack spacing={1.5}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <Button disabled={isBusy} onClick={() => run('check-new', (signal) => checkForNewRates({ signal }))} variant="contained">
              <LoadingButtonLabel isLoading={running === 'check-new'} loadingText="Checking...">Check for new rates</LoadingButtonLabel>
            </Button>
            <Button disabled={isBusy || !hasRates} onClick={() => run('check-revisions', (signal) => checkSavedRatesForRevisions({ signal }))} variant="outlined">
              <LoadingButtonLabel isLoading={running === 'check-revisions'} loadingText="Checking...">Check saved rates for changes</LoadingButtonLabel>
            </Button>
            {isBusy ? (
              <Button onClick={() => controllerRef.current?.abort()} variant="text">
                Cancel
              </Button>
            ) : null}
          </Stack>
          <Typography color="text.secondary" variant="body2">
            &quot;Check for new rates&quot; adds the newest ECB data. &quot;Check saved rates for changes&quot; re-asks the ECB about the last 90 days of saved dates and lists any value it now reports differently. Neither one replaces a saved rate or changes a report.
          </Typography>
        </Stack>

        {feedback ? (
          <Alert role="status" severity={feedback.severity}>
            {feedback.text}
          </Alert>
        ) : null}

        <Box>
          <Typography component="h3" variant="h3">
            Rate changes to review ({pendingRevisions.length})
          </Typography>
          {pendingRevisions.length === 0 ? (
            <Typography color="text.secondary" variant="body2">
              The ECB has not reported different values for any saved rate.
            </Typography>
          ) : (
            <Stack spacing={1.5} sx={{ mt: 1 }}>
              <Alert severity="info">
                <AlertTitle>Nothing has been replaced</AlertTitle>
                Reports keep using the current rate until you choose &quot;Use new rate&quot;. A rate you accept changes only reports you generate afterwards; expenses are never modified. Reports that are already open keep their figures.
              </Alert>
              <TableContainer sx={stackedRowsSx}>
                <Table aria-label="Proposed rate changes" size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Currency</TableCell>
                      <TableCell>Date</TableCell>
                      <TableCell>Current rate</TableCell>
                      <TableCell>Proposed rate</TableCell>
                      <TableCell>Proposed on</TableCell>
                      <TableCell>Decision</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {shown.map((revision) => (
                      <TableRow key={`${revision.quote}|${revision.date}|${revision.candidate}`}>
                        <TableCell data-label="Currency">{revision.quote}</TableCell>
                        <TableCell data-label="Date">{revision.date}</TableCell>
                        <TableCell data-label="Current rate">{rateText(revision.quote, revision.accepted)}</TableCell>
                        <TableCell data-label="Proposed rate">{rateText(revision.quote, revision.candidate)}</TableCell>
                        <TableCell data-label="Proposed on">{revision.candidateFetchedAt ? formatCheckedAt(revision.candidateFetchedAt) : 'Unknown'}</TableCell>
                        <TableCell data-label="Decision">
                          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                            <Button aria-label={`Use new rate for ${revision.quote} on ${revision.date}`} disabled={isBusy} onClick={() => decide('apply', revision)} size="small" variant="contained">
                              Use new rate
                            </Button>
                            <Button aria-label={`Keep current rate for ${revision.quote} on ${revision.date}`} disabled={isBusy} onClick={() => decide('keep', revision)} size="small" variant="outlined">
                              Keep current
                            </Button>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              {pendingRevisions.length > shown.length ? (
                <Typography color="text.secondary" variant="body2">
                  Showing the first {shown.length} of {pendingRevisions.length}. The rest appear after you decide on these.
                </Typography>
              ) : null}
            </Stack>
          )}
        </Box>
      </Stack>
    </SectionCard>
  );
}

export default FxRatesSection;
