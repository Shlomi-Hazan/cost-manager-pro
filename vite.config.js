import os from 'node:os';
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
    // At most 4 workers, and never more workers than cores. The jsdom + MUI UI
    // tests are CPU-heavy, so too many workers starve each other and hit the 5 s
    // default timeout. Measured on this 11-core machine: uncapped (10 workers)
    // had AddCostPage at 2.4-6.7 s; 4 workers brought it to ~1 s.
    // On a 2-core machine a fixed 4 is itself too many: under a quota emulating
    // Vercel's 2-core build (calibrated to its observed 136 s run), 4 workers
    // took 140-149 s with the slowest test at 4.8-5.0 s (one timeout in 3 runs),
    // while 2 workers took 116-119 s with the slowest test at 2.3 s. The
    // timeout is unchanged and no test is skipped.
    maxWorkers: Math.min(4, os.availableParallelism?.() ?? os.cpus().length),
    globals: true,
    setupFiles: './src/test/setup.js'
  }
});
