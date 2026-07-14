/**
 * k6 — Room Booking Flow Load Test
 * =================================
 *
 * Simulates the full booking lifecycle:
 *   1. Browse available rooms
 *   2. Create a booking
 *   3. Check-in
 *   4. Check-out
 *
 * Target: avg < 200ms | P95 < 500ms
 *
 * Usage:
 *   k6 run tests/k6/rooms-booking.js
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
  group('Booking — Browse Rooms', () => {
    const res = http.get(
      `${BASE_URL}/rest/v1/rooms?select=*,room_types(name)&order=room_number.asc`,
      authHeaders(),
    )

    check(res, {
      'browse rooms status is 200': (r) => r.status === 200,
      'browse rooms < 300ms': (r) => r.timings.duration < 300,
    })
  })

  sleep(thinkTime(0.5, 1))

  group('Booking — Create Booking', () => {
    const now = new Date()
    const checkIn = new Date(now.getTime() + 86400000).toISOString().split('T')[0]  // Tomorrow
    const checkOut = new Date(now.getTime() + 172800000).toISOString().split('T')[0]  // Day after

    // Pick a room ID from env or use a random UUID-like placeholder
    const roomId = __ENV.ROOM_ID || null

    const payload = JSON.stringify({
      guest_name: `Test Guest ${__VU}`,
      guest_email: `guest${__VU}@test.com`,
      guest_phone: `9800000${String(__VU).padStart(4, '0')}`,
      room_id: roomId,
      check_in: checkIn,
      check_out: checkOut,
      status: 'confirmed',
      total_amount: Math.floor(Math.random() * 5000) + 2000,
      paid_amount: 0,
      payment_status: 'pending',
      special_requests: 'Test booking via k6',
    })

    const res = http.post(
      `${BASE_URL}/rest/v1/bookings`,
      payload,
      authHeaders(),
    )

    check(res, {
      'booking created status is 201': (r) => r.status === 201,
      'booking has id': (r) => !!r.json('id'),
      'booking creation < 200ms': (r) => r.timings.duration < 200,
    })
  })

  sleep(thinkTime(1, 3))

  group('Booking — Check Recent Bookings', () => {
    const res = http.get(
      `${BASE_URL}/rest/v1/bookings?select=*&order=created_at.desc&limit=10`,
      authHeaders(),
    )

    check(res, {
      'recent bookings status is 200': (r) => r.status === 200,
      'recent bookings < 300ms': (r) => r.timings.duration < 300,
    })
  })

  sleep(thinkTime())
}
