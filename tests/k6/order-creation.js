/**
 * k6 — Order Creation Load Test
 * ==============================
 *
 * Simulates the full order creation flow:
 *   1. Create order batch
 *   2. Add items to batch
 *   3. Update batch totals
 *
 * This is the most critical POS workflow.
 * Target: avg < 200ms per operation | P95 < 500ms
 *
 * Usage:
 *   k6 run tests/k6/order-creation.js
 *   k6 run --vus 100 --duration 5m tests/k6/order-creation.js
 */

import { check, sleep, group, fail } from 'k6'
import http from 'k6/http'
import { BASE_URL, COMMON_OPTIONS, STAGES, thinkTime } from './config.js'

export const options = {
  ...COMMON_OPTIONS,
  stages: STAGES.load,
  thresholds: {
    ...COMMON_OPTIONS.thresholds,
    // Cart updates must be fast < 50ms
    http_req_duration: [
      { threshold: 'avg < 200', abortOnFail: false },
      { threshold: 'p(95) < 500', abortOnFail: false },
      { threshold: 'p(99) < 1000', abortOnFail: false },
    ],
  },
}

const MENU_ITEM_IDS = (__ENV.MENU_ITEM_IDS || '').split(',').filter(Boolean)
const TABLE_IDS = (__ENV.TABLE_IDS || '').split(',').filter(Boolean)

function authHeaders() {
  return {
    headers: {
      'Content-Type': 'application/json',
      'apikey': __ENV.ANON_KEY || '',
      'Authorization': `Bearer ${__ENV.AUTH_TOKEN}`,
      'Prefer': 'return=representation',
    },
  }
}

export default function () {
  group('Order — Create Batch', () => {
    const tableId = TABLE_IDS[Math.floor(Math.random() * TABLE_IDS.length)] || null
    const payload = JSON.stringify({
      table_id: tableId,
      customer_name: `Test Customer ${__VU}`,
      status: 'pending',
      subtotal: 0,
      discount: 0,
      paid_amount: 0,
    })

    const res = http.post(
      `${BASE_URL}/rest/v1/order_batches`,
      payload,
      authHeaders(),
    )

    check(res, {
      'batch created status is 201': (r) => r.status === 201,
      'batch has id': (r) => !!r.json('id'),
      'batch creation < 200ms': (r) => r.timings.duration < 200,
    })

    if (res.status !== 201) {
      fail('Failed to create order batch')
    }

    const batchId = res.json('id')

    // ── Add items to batch ──────────────────────────────────
    group('Order — Add Items', () => {
      const itemsToAdd = Math.floor(Math.random() * 5) + 1

      for (let i = 0; i < itemsToAdd; i++) {
        const menuItemId = MENU_ITEM_IDS.length > 0
          ? MENU_ITEM_IDS[Math.floor(Math.random() * MENU_ITEM_IDS.length)]
          : null

        const itemPayload = JSON.stringify({
          batch_id: batchId,
          menu_item_id: menuItemId,
          name: `Test Item ${i}`,
          quantity: Math.floor(Math.random() * 3) + 1,
          unit_price: Math.floor(Math.random() * 500) + 50,
          notes: '',
          status: 'pending',
        })

        const itemRes = http.post(
          `${BASE_URL}/rest/v1/order_batch_items`,
          itemPayload,
          authHeaders(),
        )

        check(itemRes, {
          'item added status is 201': (r) => r.status === 201,
          'item addition < 50ms': (r) => r.timings.duration < 50,  // Cart update target
        })

        sleep(0.1)  // Short delay between item additions
      }
    })

    // ── Update batch totals ─────────────────────────────────
    group('Order — Update Totals', () => {
      const updatePayload = JSON.stringify({
        subtotal: Math.floor(Math.random() * 2000) + 500,
      })

      const updateRes = http.patch(
        `${BASE_URL}/rest/v1/order_batches?id=eq.${batchId}`,
        updatePayload,
        authHeaders(),
      )

      check(updateRes, {
        'batch update status is 200': (r) => r.status === 200,
        'batch update < 200ms': (r) => r.timings.duration < 200,
      })
    })
  })

  sleep(thinkTime(1, 5))
}
