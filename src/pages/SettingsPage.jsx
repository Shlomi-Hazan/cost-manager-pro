import { useState } from 'react';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';
import PublicOutlinedIcon from '@mui/icons-material/PublicOutlined';
import RestartAltOutlinedIcon from '@mui/icons-material/RestartAltOutlined';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import {
  Alert,
  Box,
  Button,
  Stack,
  TextField,
  Typography
} from '@mui/material';
// Shared UI components, then the exchange-rate service/settings modules.
import LoadingButtonLabel from '../components/common/LoadingButtonLabel.jsx';
import PageHeader from '../components/common/PageHeader.jsx';
import SectionCard from '../components/common/SectionCard.jsx';
import DataManagementSection from '../components/settings/DataManagementSection.jsx';
import { refreshExchangeRates } from '../services/exchangeRatesService.js';
import {
  defaultExchangeRatesUrl,
  clearCustomExchangeRatesUrl,
  getCustomExchangeRatesUrl,
  getExchangeRatesUrl,
  setCustomExchangeRatesUrl
} from '../services/settingsService.js';

/*
 * Course requirement: lets the user configure a custom exchange-rate URL,
 * with a working default when none is set (R-092/R-093). "Save & Test"
 * deliberately fetches the candidate URL BEFORE persisting it, so an
 * invalid/unreachable custom source is rejected without ever overwriting a
 * previously working source or the app's cached rates.
 */

// Reads the current custom/default URL split into the shape the page's
// state uses, so the same logic can seed state and refresh it after saves.
function getInitialState() {
  const customUrl = getCustomExchangeRatesUrl();

  return {
    customUrl,
    effectiveUrl: getExchangeRatesUrl(),
    inputUrl: customUrl ?? '',
    sourceType: customUrl === null ? 'Default' : 'Custom'
  };
}

function getValidationErrorMessage() {
  return 'Could not validate this exchange-rate source. Check the URL and try again.';
}

function SettingsPage() {
  const [settingsState, setSettingsState] = useState(getInitialState);
  const [inputError, setInputError] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [activeAction, setActiveAction] = useState(null);

  const isBusy = activeAction !== null;

  // Re-derives settingsState from storage after a save/restore, rather than
  // guessing the new values, so it always reflects what was actually saved.
  function updateSettingsState(inputUrl) {
    const customUrl = getCustomExchangeRatesUrl();

    setSettingsState({
      customUrl,
      effectiveUrl: getExchangeRatesUrl(),
      inputUrl: inputUrl ?? customUrl ?? '',
      sourceType: customUrl === null ? 'Default' : 'Custom'
    });
  }

  // Typing clears any previous error/feedback, since the candidate URL has
  // changed and hasn't been validated yet.
  function handleInputChange(event) {
    setSettingsState((currentState) => ({
      ...currentState,
      inputUrl: event.target.value
    }));
    setInputError('');
    setFeedback(null);
  }

  // Validates non-empty, then fetches to prove the URL is a working source
  // before ever persisting it (see the fetch-before-persist note above).
  async function handleSaveCustomSource(event) {
    event.preventDefault();

    const candidateUrl = settingsState.inputUrl.trim();

    setInputError('');
    setFeedback(null);

    if (candidateUrl === '') {
      setInputError('Enter an exchange-rate source.');
      return;
    }

    setActiveAction('save');

    try {
      // Validate-then-persist: only fetch + validate succeeding causes the
      // candidate URL to be saved as the active custom source below. If
      // this throws, the catch block runs and the previous custom/default
      // source (and its cache) is left completely untouched.
      await refreshExchangeRates(candidateUrl);
      const savedUrl = setCustomExchangeRatesUrl(candidateUrl);

      updateSettingsState(savedUrl);
      setFeedback({
        message: 'Exchange-rate source saved and validated successfully.',
        severity: 'success'
      });
    } catch {
      updateSettingsState(settingsState.inputUrl);
      setFeedback({
        message: getValidationErrorMessage(),
        severity: 'error'
      });
    } finally {
      setActiveAction(null);
    }
  }

  // Explicitly re-validates the default URL too, so "restore default" can
  // never silently leave the app pointed at a source that turns out to be
  // unreachable — the same fetch-before-persist guarantee as Save & Test.
  async function handleUseDefaultSource() {
    setInputError('');
    setFeedback(null);
    setActiveAction('default');

    try {
      // Same fetch-before-persist guarantee as handleSaveCustomSource above.
      await refreshExchangeRates(defaultExchangeRatesUrl);
      clearCustomExchangeRatesUrl();
      updateSettingsState('');
      setFeedback({
        message: 'Default exchange-rate source restored successfully.',
        severity: 'success'
      });
    } catch {
      // Restore fails: keep showing the previous input, don't lose it.
      updateSettingsState(settingsState.inputUrl);
      setFeedback({
        message: 'Could not restore the default exchange-rate source. Please try again.',
        severity: 'error'
      });
    } finally {
      setActiveAction(null);
    }
  }

  return (
    <Stack spacing={3}>
      <PageHeader title="Settings">
        Manage your stored data and the exchange-rate source used by reports and charts.
      </PageHeader>

      {/* Custom-URL form: submitting it calls handleSaveCustomSource above. */}
      <SectionCard
        component="form"
        onSubmit={handleSaveCustomSource}
      >
        <Stack spacing={3}>
          <Box>
            <Typography component="h2" variant="h2">
              Exchange Rate Source
            </Typography>
            <Typography color="text.secondary" variant="body1">
              Validate a custom JSON source before making it active.
            </Typography>
          </Box>

          {feedback ? (
            <Alert severity={feedback.severity}>{feedback.message}</Alert>
          ) : null}

          {/* Read-only status grid: current type/source, then the default URL. */}
          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: {
                xs: '1fr',
                md: '220px 1fr'
              }
            }}
          >
            {/* "Default" vs "Custom", derived from whether a custom URL is saved. */}
            <Typography color="text.secondary" variant="body2">
              Current source type
            </Typography>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <PublicOutlinedIcon
                aria-hidden="true"
                color={settingsState.sourceType === 'Default' ? 'primary' : 'secondary'}
                fontSize="small"
              />
              <Typography>{settingsState.sourceType}</Typography>
            </Stack>

            {/* Effective source: whichever URL requests actually use right now. */}
            <Typography color="text.secondary" variant="body2">
              Current effective source
            </Typography>
            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: 'flex-start', minWidth: 0 }}
            >
              {/* Icon plus URL text, allowed to wrap across lines if long. */}
              <LinkOutlinedIcon
                aria-hidden="true"
                color="primary"
                fontSize="small"
                sx={{ mt: 0.25 }}
              />
              <Typography sx={{ overflowWrap: 'anywhere' }}>
                {settingsState.effectiveUrl}
              </Typography>
            </Stack>

            {/* The built-in fallback URL, always shown for reference. */}
            <Typography color="text.secondary" variant="body2">
              Default source
            </Typography>
            <Typography sx={{ overflowWrap: 'anywhere' }}>
              {defaultExchangeRatesUrl}
            </Typography>
          </Box>

          {/* Custom URL input, validated on submit before being saved. */}
          <TextField
            error={Boolean(inputError)}
            fullWidth
            helperText={
              inputError ||
              `Use a relative path such as ${defaultExchangeRatesUrl} or an absolute URL.`
            }
            label="Custom exchange-rate source"
            name="exchangeRatesUrl"
            onChange={handleInputChange}
            value={settingsState.inputUrl}
          />

          {/* Save (custom URL) and restore-default actions, side by side. */}
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 2
            }}
          >
            <Button disabled={isBusy} type="submit" variant="contained">
              {/* Submitting the form calls handleSaveCustomSource above. */}
              <LoadingButtonLabel
                isLoading={activeAction === 'save'}
                loadingText="Testing..."
              >
                <Stack component="span" direction="row" spacing={1}>
                  <SaveOutlinedIcon aria-hidden="true" fontSize="small" />
                  <span>Save & Test Source</span>
                </Stack>
              </LoadingButtonLabel>
            </Button>
            {/* type="button": this one bypasses the form's onSubmit entirely. */}
            <Button
              disabled={isBusy}
              onClick={handleUseDefaultSource}
              type="button"
              variant="outlined"
            >
              <LoadingButtonLabel
                isLoading={activeAction === 'default'}
                loadingText="Restoring..."
              >
                {/* Icon + label wrapped together so they never wrap separately. */}
                <Stack component="span" direction="row" spacing={1}>
                  <RestartAltOutlinedIcon aria-hidden="true" fontSize="small" />
                  <span>Use Default Source</span>
                </Stack>
              </LoadingButtonLabel>
            </Button>
          </Box>
        </Stack>
      </SectionCard>

      {/* M1: backup, restore, and recovery of stored expenses. */}
      <DataManagementSection />
    </Stack>
  );
}

export default SettingsPage;
