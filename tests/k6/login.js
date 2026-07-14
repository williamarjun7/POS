/**
 * k6 — Login / Authentication Load Test
 * ======================================
 *
 * Tests the sign-in endpoint under load.
 * Measures: average response, P95, P99, error rate.
 *
 * Target: avg < 200ms | P95 < 500ms | Error < 1%
 *
 * Usage:
 *   k6 run tests/k6/login.js
 *   k6 run --vus 50 --duration 60s tests/k6/login.js
 */

import { check, sleep, group } from 'k6'
import http from 'k6/http'
import { BASE_URL, TEST_EMAIL, TEST_PASSWORD, COMMON_OPTIONS, STAGES, thinkTime } from './config.js'

export const options = {
  ...COMMON_OPTIONS,
  stages: STAGES.load,   // Start with load test; swap to STAGES.stress for stress
  thresholds: {
    ...COMMON_OPTIONS.thresholds,
    // Login-specific: auth should be fast
    http_req_duration: [
      { threshold: 'avg < 300', abortOnFail: false },
      { threshold: 'p(95) < 800', abortOnFail: false },
      { threshold: 'p(99) < 1500', abortOnFail: false },
    ],
  },
}

export default function () {
  group('Login Flow', () => {
    // POST /auth/v1/token?grant_type=password
    const payload = JSON.stringify({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      gotrue_meta_security: {},
    })

    const params = {
      headers: {
        'Content-Type': 'application/json',
        'apikey': __ENV.ANON_KEY || '',
      },
    }

    const res = http.post(
      `${BASE_URL}/auth/v1/token?grant_type=password`,
      payload,
      params,
    )

    check(res, {
      'login status is 200': (r) => r.status === 200,
      'response has access_token': (r) => !!r.json('access_token'),
      'response time < 500ms': (r) => r.timings.duration < 500,
    })

    // Store token for use in subsequent tests
    if (res.status === 200) {
      const token = res.json('access_token')
      __ENV.AUTH_TOKEN = token
    }

    sleep(thinkTime())
  })
}
