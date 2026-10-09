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
    globals: true,
    setupFiles: './src/test/setup.js'
  }
});
