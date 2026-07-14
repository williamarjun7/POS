/**
 * Lighthouse CI Configuration
 * ============================
 *
 * Run performance audits against the POS application.
 *
 * Targets:
 *   - Performance: 90+
 *   - Accessibility: 95+
 *   - Best Practices: 100
 *
 * Usage:
 *   # Install Lighthouse CI
 *   npm install -g @lhci/cli
 *
 *   # Run a single audit
 *   lhci collect --url=http://localhost:5173/dashboard
 *   lhci assert
 *   lhci upload
 *
 *   # Run full CI pipeline
 *   npx lhci autorun
 */

module.exports = {
  ci: {
    // ─── Collection settings ──────────────────────────────────
    collect: {
      // Start the dev server automatically
      startServerCommand: 'npm run dev',
      startServerReadyPattern: 'Local:',
      url: [
        'http://localhost:5173/login',
        'http://localhost:5173/dashboard',
        'http://localhost:5173/pos',
        'http://localhost:5173/orders',
        'http://localhost:5173/menu',
        'http://localhost:5173/operations',
        'http://localhost:5173/customers',
        'http://localhost:5173/finance',
        'http://localhost:5173/expenses',
        'http://localhost:5173/inventory',
      ],
      numberOfRuns: 3,  // Run each URL 3 times and take the median
      settings: {
        // Test on both desktop and mobile
        preset: 'desktop',
        // Clear storage between runs
        disableStorageReset: false,
        // Throttling settings for realistic network conditions
        throttling: {
          // Simulate 4G (40ms RTT, 9Mbps down, 10Mbps up)
          rttMs: 40,
          throughputKbps: 9000,
          requestLatencyMs: 0,
          downloadThroughputKbps: 9000,
          uploadThroughputKbps: 10000,
          cpuSlowdownMultiplier: 1,
        },
      },
    },

    // ─── Assertion thresholds ─────────────────────────────────
    assert: {
      // Use the Lighthouse scoring presets
      preset: 'lighthouse:no-pwa',
      assertions: {
        // Performance budget
        'first-contentful-paint': ['warn', { maxNumericValue: 2000 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'total-blocking-time': ['error', { maxNumericValue: 300 }],
        'interactive': ['error', { maxNumericValue: 4000 }],
        'speed-index': ['warn', { maxNumericValue: 3000 }],

        // Bundle size
        'unused-javascript': ['warn', { maxNumericValue: 0.3 }],
        'unused-css-rules': ['warn', { maxNumericValue: 0.2 }],

        // Accessibility — aim for 95+
        'color-contrast': ['error', { minScore: 1 }],
        'label': 'error',
        'tabindex': 'error',
        'aria-valid-attr': 'error',
        'aria-allowed-attr': 'error',
        'meta-viewport': 'error',

        // Best Practices
        'no-vulnerable-libraries': 'error',
        'geolocation-on-start': 'warn',
        'doctype': 'error',
        'charset': 'error',
        'errors-in-console': 'error',
        'image-aspect-ratio': 'warn',

        // SEO
        'meta-description': 'warn',
        'viewport': 'error',
        'document-title': 'error',
        'html-has-lang': 'error',

        // PWA (if applicable)
        'service-worker': 'off',
        'offline-start-url': 'off',
      },
    },

    // ─── Upload settings ──────────────────────────────────────
    upload: {
      target: 'filesystem',  // Save reports locally
      outputDir: './lighthouse-reports',
      reportFilenamePattern: '%%PATHNAME%%-%%DATETIME%%-%%RUN%%-report.%%EXTENSION%%',
    },
  },
}
