import { CssBaseline } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCachedExchangeRates,
  setCachedExchangeRates
} from '../lib/exchangeRatesCache.js';
import {
  defaultExchangeRatesUrl,
  settingsStorageKey,
  getCustomExchangeRatesUrl,
  getExchangeRatesUrl,
  setCustomExchangeRatesUrl
} from '../services/settingsService.js';
import theme from '../theme.js';
import SettingsPage from './SettingsPage.jsx';

/*
 * Course requirement (R-092/R-093): drives the real Settings UI (save/test
 * custom source, restore default) against real localStorage settings and
 * a mocked fetch, protecting the validate-before-persist guarantee: a
 * failing custom URL must never overwrite a previously working source.
 */
const validRates = {
  USD: 1,
  GBP: 0.5,
  EUR: 0.8,
  ILS: 4
};

const defaultRates = {
  USD: 1,
  GBP: 0.6,
  EUR: 0.7,
  ILS: 3.4
};

const originalFetch = globalThis.fetch;

function renderSettingsPage() {
  return render(
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <SettingsPage />
    </ThemeProvider>
  );
}

function setupUser() {
  return userEvent.setup();
}

function mockFetchResponse(payload, options = {}) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: options.ok ?? true,
    status: options.status ?? 200,
    json: vi.fn().mockResolvedValue(payload)
  });
}

function mockFailedFetch() {
  globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Network error'));
}

async function saveCustomSource(user, url) {
  const input = screen.getByLabelText('Custom exchange-rate source');

  await user.clear(input);
  await user.type(input, url);
  await user.click(screen.getByRole('button', { name: 'Save & Test Source' }));
}

function expectCurrentSourceType(sourceType) {
  const label = screen.getByText('Current source type');

  expect(label.nextElementSibling).toHaveTextContent(sourceType);
}

function expectEffectiveSource(source) {
  const label = screen.getByText('Current effective source');

  expect(label.nextElementSibling).toHaveTextContent(source);
}

describe('SettingsPage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();

    if (originalFetch === undefined) {
      delete globalThis.fetch;
    } else {
      globalThis.fetch = originalFetch;
    }
  });

  it('renders the Settings heading', () => {
    renderSettingsPage();

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
  });

  it('shows the default source initially', () => {
    renderSettingsPage();

    expect(screen.getByRole('heading', { name: 'Exchange Rate Source' })).toBeInTheDocument();
    expect(screen.getAllByText(defaultExchangeRatesUrl)).toHaveLength(2);
    expectEffectiveSource(defaultExchangeRatesUrl);
  });

  it('shows Default as the current source type initially', () => {
    renderSettingsPage();

    expectCurrentSourceType('Default');
  });

  it('renders the custom source input and action buttons', () => {
    renderSettingsPage();

    expect(
      screen.getByLabelText('Custom exchange-rate source')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Save & Test Source' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Use Default Source' })
    ).toBeInTheDocument();
  });

  it('rejects an empty custom source before Fetch', async () => {
    const user = setupUser();
    globalThis.fetch = vi.fn();
    renderSettingsPage();

    await user.click(screen.getByRole('button', { name: 'Save & Test Source' }));

    expect(screen.getByText('Enter an exchange-rate source.')).toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(getCustomExchangeRatesUrl()).toBeNull();
  });

  it('fetches, validates, caches, and persists a valid custom source', async () => {
    const user = setupUser();
    mockFetchResponse(validRates);
    renderSettingsPage();

    await saveCustomSource(user, '/custom-rates.json');

    expect(globalThis.fetch).toHaveBeenCalledWith('/custom-rates.json');
    expect(getCustomExchangeRatesUrl()).toBe('/custom-rates.json');
    expect(getExchangeRatesUrl()).toBe('/custom-rates.json');
    expect(getCachedExchangeRates()).toEqual(validRates);
    expect(
      screen.getByText('Exchange-rate source saved and validated successfully.')
    ).toBeInTheDocument();
  });

  it('persists a valid custom source only after successful validation', async () => {
    const user = setupUser();
    mockFailedFetch();
    renderSettingsPage();

    await saveCustomSource(user, '/broken-rates.json');

    expect(getCustomExchangeRatesUrl()).toBeNull();
    expect(getExchangeRatesUrl()).toBe(defaultExchangeRatesUrl);
  });

  it('shows Custom as the current source type after a successful save', async () => {
    const user = setupUser();
    mockFetchResponse(validRates);
    renderSettingsPage();

    await saveCustomSource(user, '/custom-rates.json');

    expectCurrentSourceType('Custom');
  });

  it('displays the custom source as the effective source after success', async () => {
    const user = setupUser();
    mockFetchResponse(validRates);
    renderSettingsPage();

    await saveCustomSource(user, '/custom-rates.json');

    expectEffectiveSource('/custom-rates.json');
  });

  it('accepts a relative custom path', async () => {
    const user = setupUser();
    mockFetchResponse(validRates);
    renderSettingsPage();

    await saveCustomSource(user, '/my-rates.json');

    expect(getExchangeRatesUrl()).toBe('/my-rates.json');
  });

  it('accepts an absolute custom URL', async () => {
    const user = setupUser();
    mockFetchResponse(validRates);
    renderSettingsPage();

    await saveCustomSource(user, 'https://example.test/rates.json');

    expect(getExchangeRatesUrl()).toBe('https://example.test/rates.json');
  });

  it('does not persist a candidate after a network Fetch failure', async () => {
    const user = setupUser();
    mockFailedFetch();
    renderSettingsPage();

    await saveCustomSource(user, '/network-failure.json');

    expect(getCustomExchangeRatesUrl()).toBeNull();
    expect(
      screen.getByText(
        'Could not validate this exchange-rate source. Check the URL and try again.'
      )
    ).toBeInTheDocument();
  });

  it('does not persist a candidate after an HTTP failure', async () => {
    const user = setupUser();
    mockFetchResponse(validRates, {
      ok: false,
      status: 404
    });
    renderSettingsPage();

    await saveCustomSource(user, '/missing-rates.json');

    expect(getCustomExchangeRatesUrl()).toBeNull();
  });

  it('does not persist a candidate with an invalid payload', async () => {
    const user = setupUser();
    mockFetchResponse({
      USD: 1,
      GBP: 0.5,
      EUR: 0.8
    });
    renderSettingsPage();

    await saveCustomSource(user, '/invalid-rates.json');

    expect(getCustomExchangeRatesUrl()).toBeNull();
  });

  it('preserves a previous valid custom source after a failed replacement attempt', async () => {
    const user = setupUser();
    setCustomExchangeRatesUrl('/working-rates.json');
    mockFailedFetch();
    renderSettingsPage();

    await saveCustomSource(user, '/broken-rates.json');

    expect(getCustomExchangeRatesUrl()).toBe('/working-rates.json');
    expect(getExchangeRatesUrl()).toBe('/working-rates.json');
    expectEffectiveSource('/working-rates.json');
  });

  it('preserves an existing valid cache after invalid candidate validation', async () => {
    const user = setupUser();
    setCachedExchangeRates(validRates);
    mockFetchResponse({
      USD: 1,
      GBP: 0.5,
      EUR: 0.8
    });
    renderSettingsPage();

    await saveCustomSource(user, '/invalid-cache-candidate.json');

    expect(getCachedExchangeRates()).toEqual(validRates);
  });

  it('loads an existing persisted custom URL', () => {
    setCustomExchangeRatesUrl('/persisted-rates.json');

    renderSettingsPage();

    expect(screen.getByLabelText('Custom exchange-rate source')).toHaveValue(
      '/persisted-rates.json'
    );
    expectCurrentSourceType('Custom');
    expectEffectiveSource('/persisted-rates.json');
  });

  it('clears custom source only after successful default validation', async () => {
    const user = setupUser();
    setCustomExchangeRatesUrl('/custom-rates.json');
    mockFetchResponse(defaultRates);
    renderSettingsPage();

    await user.click(screen.getByRole('button', { name: 'Use Default Source' }));

    expect(globalThis.fetch).toHaveBeenCalledWith(defaultExchangeRatesUrl);
    expect(getCustomExchangeRatesUrl()).toBeNull();
    expect(getExchangeRatesUrl()).toBe(defaultExchangeRatesUrl);
    expect(getCachedExchangeRates()).toEqual(defaultRates);
  });

  it('updates the UI when default source is restored', async () => {
    const user = setupUser();
    setCustomExchangeRatesUrl('/custom-rates.json');
    mockFetchResponse(defaultRates);
    renderSettingsPage();

    await user.click(screen.getByRole('button', { name: 'Use Default Source' }));

    expectCurrentSourceType('Default');
    expectEffectiveSource(defaultExchangeRatesUrl);
    expect(
      screen.getByText('Default exchange-rate source restored successfully.')
    ).toBeInTheDocument();
  });

  it('preserves existing custom source when default validation fails', async () => {
    const user = setupUser();
    setCustomExchangeRatesUrl('/working-rates.json');
    mockFailedFetch();
    renderSettingsPage();

    await user.click(screen.getByRole('button', { name: 'Use Default Source' }));

    expect(getCustomExchangeRatesUrl()).toBe('/working-rates.json');
    expect(getExchangeRatesUrl()).toBe('/working-rates.json');
    expectEffectiveSource('/working-rates.json');
    expect(
      screen.getByText(
        'Could not restore the default exchange-rate source. Please try again.'
      )
    ).toBeInTheDocument();
  });

  it('disables duplicate save actions while validation is pending', async () => {
    const user = setupUser();
    let resolveFetch;

    globalThis.fetch = vi.fn().mockImplementation(() => {
      return new Promise((resolve) => {
        resolveFetch = resolve;
      });
    });
    renderSettingsPage();

    const input = screen.getByLabelText('Custom exchange-rate source');

    await user.type(input, '/slow-rates.json');
    await user.click(screen.getByRole('button', { name: 'Save & Test Source' }));

    expect(screen.getByRole('button', { name: 'Testing...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Use Default Source' })).toBeDisabled();

    resolveFetch({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(validRates)
    });

    expect(
      await screen.findByText('Exchange-rate source saved and validated successfully.')
    ).toBeInTheDocument();
  });

  it('disables duplicate default restore actions while validation is pending', async () => {
    const user = setupUser();
    let resolveFetch;

    setCustomExchangeRatesUrl('/custom-rates.json');
    globalThis.fetch = vi.fn().mockImplementation(() => {
      return new Promise((resolve) => {
        resolveFetch = resolve;
      });
    });
    renderSettingsPage();

    await user.click(screen.getByRole('button', { name: 'Use Default Source' }));

    expect(screen.getByRole('button', { name: 'Restoring...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save & Test Source' })).toBeDisabled();

    resolveFetch({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(defaultRates)
    });

    expect(
      await screen.findByText('Default exchange-rate source restored successfully.')
    ).toBeInTheDocument();
  });

  it('shows success feedback after saving a valid source', async () => {
    const user = setupUser();
    mockFetchResponse(validRates);
    renderSettingsPage();

    await saveCustomSource(user, '/custom-rates.json');

    expect(
      screen.getByText('Exchange-rate source saved and validated successfully.')
    ).toBeInTheDocument();
  });

  it('falls back to the default UI when stored settings are malformed', () => {
    localStorage.setItem(settingsStorageKey, '{not-json');

    renderSettingsPage();

    expectCurrentSourceType('Default');
    expectEffectiveSource(defaultExchangeRatesUrl);
    expect(screen.getByLabelText('Custom exchange-rate source')).toHaveValue('');
  });

  it('does not poison a valid cache when JSON parsing fails', async () => {
    const user = setupUser();
    setCachedExchangeRates(validRates);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockRejectedValue(new SyntaxError('Invalid JSON'))
    });
    renderSettingsPage();

    await saveCustomSource(user, '/bad-json-rates.json');

    expect(getCachedExchangeRates()).toEqual(validRates);
  });
});
