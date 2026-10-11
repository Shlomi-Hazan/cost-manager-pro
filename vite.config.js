import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The app is built for the root of its domain (Vercel, ADR-044), so assets
// are referenced as /assets/... and the default exchange-rate file resolves
// to /exchange-rates.json. The GitHub Pages subpath used by the original
// course deployment (/cost-manager-front-end/) no longer applies.
export default defineConfig({
  base: '/',
  plugins: [react()],
  // jsdom simulates a browser DOM for Vitest so component tests can render
  // React components and touch localStorage without a real browser;
  // setupFiles wires up @testing-library/jest-dom's extra assertions.
  test: {
    environment: 'jsdom',
    // Capped at 4 workers: with one worker per core, the jsdom + MUI heavy UI
    // tests starve each other and intermittently hit the 5 s default timeout
    // (measured: AddCostPage went from 2.4-6.7 s to ~1 s, and 0 failures in
    // 10 loaded/unloaded runs, versus repeated failures on uncapped main).
    // The timeout is unchanged and no test is skipped.
    maxWorkers: 4,
    globals: true,
    setupFiles: './src/test/setup.js'
  }
});
