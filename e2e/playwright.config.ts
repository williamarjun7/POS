/**
 * Playwright E2E Test Configuration
 * ───────────────────────────────────
 *
 * Tests the real-time customer name sync flows end-to-end.
 * The dev server auto-starts before tests and stops after.
 */

import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  fullyParallel: false,
  retries: 1,
  workers: 1,
  reporter: [
    ['html', { outputFolder: '../playwright-report' }],
    ['list'],
  ],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'cd .. && npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
