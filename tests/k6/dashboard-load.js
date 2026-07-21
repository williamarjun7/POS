/**
 * k6 — Dashboard Loading Load Test
 * =================================
 *
 * Tests the dashboard API endpoints that power the main dashboard page.
 * Measures: revenue cards, charts, recent orders, rooms, tables, expenses.
 *
 * Target: Entire dashboard < 1s (all parallel fetches combined)
 *
 * Usage:
 *   k6 run tests/k6/dashboard-load.js
 */

import { check, sleep, group } from 'k6'
import http from 'k6/http'
import { BASE_URL, COMMON_OPTIONS, STAGES, thinkTime } from './config.js'

export const options = {
  ...COMMON_OPTIONS,
  stages: STAGES.load,
  // Dashboard is the most critical page — stricter thresholds
  thresholds: {
    http_req_duration: [
      { threshold: 'avg < 500', abortOnFail: false },
      { threshold: 'p(95) < 1000', abortOnFail: false },
      { threshold: 'p(99) < 2000', abortOnFail: false },
    ],
    http_req_failed: [
      { threshold: 'rate < 0.01', abortOnFail: true },
    ],
  },
}

function authHeaders() {
  return {
    headers: {
      'Content-Type': 'application/json',
      'apikey': __ENV.ANON_KEY || '',
      'Authorization': `Bearer ${__ENV.AUTH_TOKEN}`,
    },
  }
}

export default function () {
  group('Dashboard — Tables', () => {
    const res = http.get(
      `${BASE_URL}/rest/v1/restaurant_tables?select=*&order=display_order.asc`,
      authHeaders(),
    )

    check(res, {
      'tables status is 200': (r) => r.status === 200,
      'tables response < 500ms': (r) => r.timings.duration < 500,
    })
  })

  sleep(0.2)

  group('Dashboard — Rooms', () => {
    const res = http.get(
      `${BASE_URL}/rest/v1/rooms?select=*,room_types(name)&order=room_number.asc`,
      authHeaders(),
    )

    check(res, {
      'rooms status is 200': (r) => r.status === 200,
      'rooms response < 500ms': (r) => r.timings.duration < 500,
    })
  })

  sleep(0.2)

  group('Dashboard — Invoices (Pending)', () => {
    const res = http.get(
      `${BASE_URL}/rest/v1/invoices?select=*,restaurant_tables!left(table_number),payments!left(amount,payment_method)&not=status.in.(paid,refunded,cancelled)&order=created_at.desc&limit=50`,
      authHeaders(),
    )

    check(res, {
      'invoices status is 200': (r) => r.status === 200,
      'invoices response < 500ms': (r) => r.timings.duration < 500,
    })
  })

  sleep(0.2)

  group('Dashboard — Activity Feed', () => {
    const res = http.get(
      `${BASE_URL}/rest/v1/activity_logs?select=*&order=created_at.desc&limit=10`,
      authHeaders(),
    )

    check(res, {
      'activity status is 200': (r) => r.status === 200,
      'activity response < 500ms': (r) => r.timings.duration < 500,
    })
  })

  sleep(0.2)

  group('Dashboard — Payments Today', () => {
    const today = new Date().toISOString().split('T')[0]

    const res = http.get(
      `${BASE_URL}/rest/v1/payments?select=amount,payment_method&gte=created_at.${today}T00:00:00Z&lte=created_at.${today}T23:59:59Z`,
      authHeaders(),
    )

    check(res, {
      'payments today status is 200': (r) => r.status === 200,
      'payments today < 500ms': (r) => r.timings.duration < 500,
    })
  })

  sleep(0.2)

  group('Dashboard — Expenses Today', () => {
    const today = new Date().toISOString().split('T')[0]

    const res = http.get(
      `${BASE_URL}/rest/v1/expenses?select=amount&gte=date.${today}&lte=date.${today}`,
      authHeaders(),
    )

    check(res, {
      'expenses today status is 200': (r) => r.status === 200,
      'expenses today < 500ms': (r) => r.timings.duration < 500,
    })
  })

  sleep(thinkTime(0.5, 2))
}
