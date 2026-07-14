/**
 * k6 — Menu Loading Load Test
 * ============================
 *
 * Simulates staff browsing the menu — categories + items.
 * Measures: average response, P95, P99, error rate.
 *
 * Target: avg < 200ms | P95 < 500ms | Menu load < 300ms
 *
 * Usage:
 *   k6 run tests/k6/menu-load.js
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
    },
  }
}

export default function () {
  group('Menu — Load Categories', () => {
    const res = http.get(
      `${BASE_URL}/rest/v1/menu_categories?select=*&order=name.asc`,
      authHeaders(),
    )

    check(res, {
      'categories status is 200': (r) => r.status === 200,
      'categories returned': (r) => r.json().length > 0,
      'categories response < 300ms': (r) => r.timings.duration < 300,
    })
  })

  sleep(thinkTime(0.5, 1))

  group('Menu — Load Items', () => {
    const res = http.get(
      `${BASE_URL}/rest/v1/menu_items?select=*,menu_categories(name)&order=name.asc&limit=50`,
      authHeaders(),
    )

    check(res, {
      'items status is 200': (r) => r.status === 200,
      'items returned': (r) => r.json().length > 0,
      'items response < 300ms': (r) => r.timings.duration < 300,
    })
  })

  sleep(thinkTime(0.5, 1))

  group('Menu — Search Items', () => {
    const searchTerms = ['coffee', 'tea', 'rice', 'chicken', 'dessert']
    const term = searchTerms[Math.floor(Math.random() * searchTerms.length)]

    const res = http.get(
      `${BASE_URL}/rest/v1/menu_items?select=*&name=ilike.*${term}*&limit=20`,
      authHeaders(),
    )

    check(res, {
      'search status is 200': (r) => r.status === 200,
      'search response < 100ms': (r) => r.timings.duration < 100,  // Target for search
    })
  })

  sleep(thinkTime())
}
