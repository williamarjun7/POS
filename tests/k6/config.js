/**
 * k6 Shared Configuration
 * ========================
 *
 * Usage:
 *   import { BASE_URL, COMMON_OPTIONS, STAGES } from './config.js'
 *
 * Set the environment variable before running:
 *   export K6_BASE_URL=https://your-app.region.insforge.app
 *   k6 run --env BASE_URL=$K6_BASE_URL tests/k6/login.js
 */

// ─── Environment ────────────────────────────────────────────────

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:5173'

// ─── Test User Credentials (set via env or defaults for dev) ────

export const TEST_EMAIL = __ENV.TEST_EMAIL || 'test@pos.example.com'
export const TEST_PASSWORD = __ENV.TEST_PASSWORD || 'test-password-123'

// ─── Threshold Presets ──────────────────────────────────────────

/**
 * API response time thresholds matching your targets:
 *   Average < 200ms | P95 < 500ms | P99 < 1s | Error rate < 1%
 */
export const THRESHOLDS = {
  // Strict: average under 200ms, P95 under 500ms
  http_req_duration: [
    { threshold: 'avg < 200', abortOnFail: false },
    { threshold: 'p(95) < 500', abortOnFail: false },
    { threshold: 'p(99) < 1000', abortOnFail: false },
  ],
  http_req_failed: [
    { threshold: 'rate < 0.01', abortOnFail: true },  // < 1% errors
  ],
}

// ─── Common Options ─────────────────────────────────────────────

export const COMMON_OPTIONS = {
  thresholds: THRESHOLDS,
  // Don't follow external redirects during auth
  noRedirects: false,
  // DNS cache TTL
  dns: { ttl: '30s' },
}

// ─── Load Stage Presets ─────────────────────────────────────────

/**
 * Gradual ramp-up to detect breaking points.
 * Use one of these in your scenario's `stages`.
 */
export const STAGES = {
  // Smoke test — minimal load to verify script works
  smoke: [
    { duration: '10s', target: 1 },
    { duration: '10s', target: 1 },
    { duration: '5s', target: 0 },
  ],

  // Load test — ramp up to 50 VUs
  load: [
    { duration: '30s', target: 10 },
    { duration: '30s', target: 25 },
    { duration: '30s', target: 50 },
    { duration: '1m', target: 50 },
    { duration: '30s', target: 0 },
  ],

  // Stress test — find the breaking point
  stress: [
    { duration: '1m', target: 50 },
    { duration: '1m', target: 100 },
    { duration: '1m', target: 200 },
    { duration: '1m', target: 300 },
    { duration: '1m', target: 500 },
    { duration: '1m', target: 1000 },
    { duration: '2m', target: 1000 },
    { duration: '1m', target: 0 },
  ],

  // Endurance test — 20 VUs for 8 hours
  endurance: [
    { duration: '5m', target: 20 },
    { duration: '8h', target: 20 },
    { duration: '5m', target: 0 },
  ],

  // Spike test — sudden surge
  spike: [
    { duration: '2m', target: 10 },
    { duration: '30s', target: 200 },
    { duration: '2m', target: 200 },
    { duration: '1m', target: 0 },
  ],
}

// ─── Helpers ────────────────────────────────────────────────────

/** Generate a unique email for each VU */
export function vuEmail(vuId) {
  return `test+${vuId}@pos.example.com`
}

/** Random delay to simulate user think time */
export function thinkTime(min = 0.5, max = 3) {
  return Math.random() * (max - min) + min
}
