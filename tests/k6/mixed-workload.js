/**
 * k6 — Mixed Workload (Real-World Simulation)
 * ============================================
 *
 * Simulates realistic café and motel POS usage patterns:
 *   - 40% Order creation (high frequency)
 *   - 20% Menu browsing
 *   - 20% Payment processing
 *   - 10% Room booking
 *   - 10% Dashboard loading
 *
 * INCLUDES authentication step at the start of each iteration.
 * The auth token is cached per VU using __VU-scoped variables.
 *
 * Target: 100+ concurrent users without noticeable slowdown
 *
 * Usage:
 *   k6 run tests/k6/mixed-workload.js
 *   k6 run --vus 250 --duration 10m tests/k6/mixed-workload.js
 *
 * Environment variables:
 *   K6_BASE_URL    - API base URL (default: http://localhost:5173)
 *   K6_ANON_KEY    - API anon key
 *   TEST_EMAIL     - Login email
 *   TEST_PASSWORD  - Login password
 */

import { check, sleep, group } from 'k6'
import http from 'k6/http'
import { BASE_URL, COMMON_OPTIONS, STAGES, thinkTime } from './config.js'

export const options = {
  ...COMMON_OPTIONS,
  stages: STAGES.load,
  thresholds: {
    http_req_duration: [
      { threshold: 'avg < 300', abortOnFail: false },
      { threshold: 'p(95) < 800', abortOnFail: false },
      { threshold: 'p(99) < 2000', abortOnFail: false },
    ],
    http_req_failed: [
      { threshold: 'rate < 0.01', abortOnFail: true },
    ],
  },
}

// ─── Per-VU authenticated state ──────────────────────────

const state = {
  token: '',
  tokenExpiry: 0,
}

function ensureAuthenticated() {
  if (state.token && Date.now() < state.tokenExpiry) return

  const payload = JSON.stringify({
    email: __ENV.TEST_EMAIL || 'test@pos.example.com',
    password: __ENV.TEST_PASSWORD || 'test-password-123',
  })

  const res = http.post(
    `${BASE_URL}/auth/v1/token?grant_type=password`,
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        'apikey': __ENV.ANON_KEY || '',
      },
    },
  )

  if (res.status === 200) {
    state.token = res.json('access_token')
    // Tokens typically last 1 hour — refresh after 50 minutes
    state.tokenExpiry = Date.now() + 3000000
  } else {
    console.error(`Auth failed: ${res.status} ${res.body}`)
  }
}

function authHeaders() {
  return {
    headers: {
      'Content-Type': 'application/json',
      'apikey': __ENV.ANON_KEY || '',
      'Authorization': `Bearer ${state.token}`,
      'Prefer': 'return=representation',
    },
  }
}

export default function () {
  // Authenticate first (token cached per VU, auto-refreshes)
  ensureAuthenticated()
  if (!state.token) {
    sleep(1)
    return  // Skip this iteration if auth failed
  }

  // Weighted random selection based on real-world usage patterns
  const rand = Math.random()

  if (rand < 0.40) {
    // 40% — Order creation (most common POS operation)
    orderFlow()
  } else if (rand < 0.60) {
    // 20% — Menu browsing
    menuFlow()
  } else if (rand < 0.80) {
    // 20% — Payment processing
    paymentFlow()
  } else if (rand < 0.90) {
    // 10% — Room booking
    bookingFlow()
  } else {
    // 10% — Dashboard loading
    dashboardFlow()
  }

  sleep(thinkTime(0.5, 3))
}

// ─── Order Creation ─────────────────────────────────────────────

function orderFlow() {
  group('Mixed — Order Creation', () => {
    const batchPayload = JSON.stringify({
      table_id: null,
      customer_name: `Customer ${__VU}`,
      status: 'pending',
      subtotal: 0,
      discount: 0,
      paid_amount: 0,
    })

    const batchRes = http.post(
      `${BASE_URL}/rest/v1/order_batches`,
      batchPayload,
      authHeaders(),
    )

    check(batchRes, { 'order batch created': (r) => r.status === 201 })

    if (batchRes.status === 201) {
      const batchId = batchRes.json('id')

      const itemCount = Math.floor(Math.random() * 3) + 1
      for (let i = 0; i < itemCount; i++) {
        const itemPayload = JSON.stringify({
          batch_id: batchId,
          name: `Item ${i}`,
          quantity: Math.floor(Math.random() * 2) + 1,
          unit_price: Math.floor(Math.random() * 400) + 100,
          notes: '',
          status: 'pending',
        })

        const itemRes = http.post(
          `${BASE_URL}/rest/v1/order_batch_items`,
          itemPayload,
          authHeaders(),
        )

        check(itemRes, { 'item added': (r) => r.status === 201 })
        sleep(0.1)
      }
    }
  })
}

// ─── Menu Browsing ─────────────────────────────────────────────

function menuFlow() {
  group('Mixed — Menu Browse', () => {
    const res = http.get(
      `${BASE_URL}/rest/v1/menu_items?select=*,menu_categories(name)&order=name.asc&limit=30`,
      authHeaders(),
    )

    check(res, {
      'menu loaded': (r) => r.status === 200,
      'menu fast': (r) => r.timings.duration < 300,
    })
  })
}

// ─── Payment Processing ─────────────────────────────────────────

function paymentFlow() {
  group('Mixed — Payment', () => {
    const methods = ['cash', 'fonepay', 'reception_qr']
    const method = methods[Math.floor(Math.random() * methods.length)]

    const paymentPayload = JSON.stringify({
      invoice_id: null,
      batch_id: null,
      amount: Math.floor(Math.random() * 2000) + 100,
      payment_method: method,
      reference: `${method.toUpperCase()}-${__VU}-${Date.now()}`,
    })

    const res = http.post(
      `${BASE_URL}/rest/v1/payments`,
      paymentPayload,
      authHeaders(),
    )

    check(res, {
      'payment recorded': (r) => r.status === 201,
      'payment < 1s': (r) => r.timings.duration < 1000,
    })
  })
}

// ─── Room Booking ────────────────────────────────────────────────

function bookingFlow() {
  group('Mixed — Booking', () => {
    const now = new Date()
    const checkIn = new Date(now.getTime() + 86400000).toISOString().split('T')[0]
    const checkOut = new Date(now.getTime() + 172800000).toISOString().split('T')[0]

    const payload = JSON.stringify({
      guest_name: `Guest ${__VU}`,
      guest_email: `guest${__VU}@test.com`,
      guest_phone: `9800000${String(__VU).padStart(4, '0')}`,
      room_id: __ENV.ROOM_ID || null,
      check_in: checkIn,
      check_out: checkOut,
      status: 'confirmed',
      total_amount: Math.floor(Math.random() * 5000) + 2000,
      paid_amount: 0,
      payment_status: 'pending',
    })

    const res = http.post(
      `${BASE_URL}/rest/v1/bookings`,
      payload,
      authHeaders(),
    )

    check(res, {
      'booking created': (r) => r.status === 201,
      'booking < 500ms': (r) => r.timings.duration < 500,
    })
  })
}

// ─── Dashboard Loading ───────────────────────────────────────────

function dashboardFlow() {
  group('Mixed — Dashboard', () => {
    const endpoints = [
      'rest/v1/restaurant_tables?select=*&order=display_order.asc',
      'rest/v1/rooms?select=*,room_types(name)',
      'rest/v1/invoices?select=*,payments!left(amount)&not=status.in.("paid","refunded","cancelled")&limit=20',
      'rest/v1/activity_logs?select=*&order=created_at.desc&limit=10',
      'rest/v1/payments?select=amount,payment_method&order=created_at.desc&limit=20',
    ]

    const numEndpoints = Math.floor(Math.random() * 2) + 2
    const shuffled = endpoints.sort(() => Math.random() - 0.5).slice(0, numEndpoints)

    for (const endpoint of shuffled) {
      const res = http.get(`${BASE_URL}/${endpoint}`, authHeaders())
      check(res, {
        'dashboard data loaded': (r) => r.status === 200,
        'dashboard < 1s': (r) => r.timings.duration < 1000,
      })
      sleep(0.2)
    }
  })
}
