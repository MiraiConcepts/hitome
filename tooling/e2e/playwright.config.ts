import { defineConfig } from '@playwright/test';

// Runs inside the Playwright container on the compose network (see run.sh);
// E2E_BASE_URL overrides for running against another origin.
export default defineConfig({
  testDir: '.',
  globalSetup: './seed.mjs',
  // One long test per file walks the whole flow; CI runners take about
  // twice as long as a laptop, so the per-test budget is generous.
  timeout: 180_000,
  fullyParallel: false,
  reporter: [['list']],
  outputDir: './test-results',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://e2e-proxy:8881',
    // Phone-ish portrait viewport: the agenda must actually overflow so the
    // scroll assertions mean something.
    viewport: { width: 480, height: 900 },
    // Pin locale + timezone so date labels computed in the spec (node) match
    // what the app renders in the browser. TZ comes from run.sh (host zone).
    locale: 'en-GB',
    timezoneId: process.env.TZ || 'UTC',
    screenshot: 'only-on-failure',
  },
});
