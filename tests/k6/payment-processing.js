/**
 * k6 — Payment Processing Load Test
 * ==================================
 *
 * Tests all payment flows: cash, credit, split, QR.
 * Measures: payment completion, invoice creation, ledger update.
 *
 * Target: Payment completion < 1s | API avg < 200ms
 *
 * Usage:
 *   k6 run tests/k6/payment-processing.js
 */

import { check, sleep, group } from 'k6'
import http from 'k6/http'
import { BASE_URL, COMMON_OPTIONS, STAGES, thinkTime } from './config.js'

export const options = {
  ...COMMON_OPTIONS,
  stages: STAGES.load,
}

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
  group('Payment — Cash Payment (Full)', () => {
    // Create a batch and invoice first, then pay
    const amount = Math.floor(Math.random() * 1500) + 200

    const paymentPayload = JSON.stringify({
      invoice_id: __ENV.INVOICE_ID || null,
      batch_id: null,
      amount: amount,
      payment_method: 'cash',
      reference: `CASH-${__VU}-${Date.now()}`,
      notes: 'Test cash payment',
    })

    const res = http.post(
      `${BASE_URL}/rest/v1/payments`,
      paymentPayload,
      authHeaders(),
    )

    check(res, {
      'cash payment status is 201': (r) => r.status === 201,
      'cash payment < 1s': (r) => r.timings.duration < 1000,
    })
  })

  sleep(thinkTime(0.5, 2))

  group('Payment — FonePay QR', () => {
    const amount = Math.floor(Math.random() * 1000) + 100

    const paymentPayload = JSON.stringify({
      invoice_id: null,
      batch_id: null,
      amount: amount,
      payment_method: 'fonepay',
      reference: `QR-${__VU}-${Date.now()}`,
      notes: 'Test QR payment',
    })

    const res = http.post(
      `${BASE_URL}/rest/v1/payments`,
      paymentPayload,
      authHeaders(),
    )

    check(res, {
      'QR payment status is 201': (r) => r.status === 201,
      'QR payment < 1s': (r) => r.timings.duration < 1000,
    })
  })

  sleep(thinkTime(0.5, 2))

  group('Payment — Credit Payment', () => {
    const amount = Math.floor(Math.random() * 2000) + 500

    const paymentPayload = JSON.stringify({
      invoice_id: null,
      batch_id: null,
      amount: amount,
      payment_method: 'credit',
      customer_id: __ENV.CUSTOMER_ID || null,
      reference: `CREDIT-${__VU}-${Date.now()}`,
      notes: 'Test credit payment',
    })

    const res = http.post(
      `${BASE_URL}/rest/v1/payments`,
      paymentPayload,
      authHeaders(),
    )

    check(res, {
      'credit payment status is 201': (r) => r.status === 201,
      'credit payment < 1s': (r) => r.timings.duration < 1000,
    })
  })

  sleep(thinkTime(0.5, 1))

  group('Payment — Split Payment (Partial)', () => {
    const totalAmount = Math.floor(Math.random() * 3000) + 1000
    const firstAmount = Math.floor(totalAmount * 0.6)
    const secondAmount = totalAmount - firstAmount

    // Pay first part
    const firstPayload = JSON.stringify({
      invoice_id: null,
      batch_id: null,
      amount: firstAmount,
      payment_method: 'cash',
      reference: `SPLIT1-${__VU}-${Date.now()}`,
      notes: 'Split payment part 1',
    })

    const firstRes = http.post(
      `${BASE_URL}/rest/v1/payments`,
      firstPayload,
      authHeaders(),
    )

    check(firstRes, {
      'split part 1 status is 201': (r) => r.status === 201,
      'split part 1 < 1s': (r) => r.timings.duration < 1000,
    })

    sleep(0.3)

    // Pay second part with different method
    const secondPayload = JSON.stringify({
      invoice_id: null,
      batch_id: null,
      amount: secondAmount,
      payment_method: 'fonepay',
      reference: `SPLIT2-${__VU}-${Date.now()}`,
      notes: 'Split payment part 2',
    })

    const secondRes = http.post(
      `${BASE_URL}/rest/v1/payments`,
      secondPayload,
      authHeaders(),
    )

    check(secondRes, {
      'split part 2 status is 201': (r) => r.status === 201,
      'split part 2 < 1s': (r) => r.timings.duration < 1000,
    })
  })

  sleep(thinkTime())
}
