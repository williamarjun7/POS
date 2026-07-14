/**
 * Performance Benchmark Tests
 * ===========================
 *
 * Uses Vitest's `bench` function to measure critical POS operations.
 * Run with: npm run test:perf
 *
 * Note: These benchmarks test the COMPILED code paths, not actual API calls.
 * For real API latency testing, use the k6 scripts in tests/k6/ instead.
 *
 * Targets (from test plan):
 *   - Cart update:  < 50ms
 *   - Search:       < 100ms
 *   - Route change: < 150ms
 *   - Dashboard:    < 500ms
 */

import { describe, bench, expect } from 'vitest'

// ─── Data Formatting Benchmarks ──────────────────────────────────

import { formatCurrency, formatTimeAgo, formatDuration } from '@/lib/utils'

describe('Utility Functions', () => {
  bench('formatCurrency: large number', () => {
    formatCurrency(1234567.89, 2)
  }, {
    time: 100,  // Run for 100ms minimum
    throws: false,
  })

  bench('formatCurrency: small number', () => {
    formatCurrency(50, 0)
  })

  bench('formatTimeAgo: recent timestamp', () => {
    formatTimeAgo(new Date().toISOString())
  })

  bench('formatTimeAgo: old timestamp', () => {
    formatTimeAgo('2025-01-01T00:00:00Z')
  })

  bench('formatDuration: short duration', () => {
    formatDuration(5)
  })

  bench('formatDuration: long duration', () => {
    formatDuration(245)
  })
})

// ─── Array / Data Operations Benchmarks ────────────────────────

describe('Data Processing', () => {
  // Simulate dashboard data sorting
  const tables = Array.from({ length: 50 }, (_, i) => ({
    id: `table-${i}`,
    display_order: Math.floor(Math.random() * 999),
    table_number: String(i + 1),
    status: i < 20 ? 'occupied' : 'available',
  }))

  bench('sort tables by display_order + table_number', () => {
    const sorted = [...tables].sort(
      (a, b) => (a.display_order ?? 999) - (b.display_order ?? 999) ||
        (a.table_number?.localeCompare(b.table_number ?? '', undefined, { numeric: true }) ?? 0)
    )
    expect(sorted.length).toBe(50)
  })

  // Simulate invoice list filtering
  const invoices = Array.from({ length: 200 }, (_, i) => ({
    id: `inv-${i}`,
    total: Math.random() * 10000,
    status: ['paid', 'pending', 'partial', 'cancelled'][Math.floor(Math.random() * 4)],
  }))

  bench('filter unpaid invoices + calculate outstanding', () => {
    const unpaid = invoices.filter(inv =>
      !['paid', 'refunded', 'cancelled'].includes(inv.status)
    )
    const outstanding = unpaid.reduce((sum, inv) => sum + inv.total, 0)
    expect(outstanding).toBeGreaterThanOrEqual(0)
  })
})

// ─── Payment Method Resolution Benchmarks ──────────────────────

import { getPaymentMethodLabel } from '@/lib/payment-methods'

describe('Payment Method Resolution', () => {
  bench('resolve payment method label (all methods)', () => {
    for (const method of ['cash', 'reception_qr', 'fonepay', 'credit']) {
      getPaymentMethodLabel(method)
    }
  })

  bench('resolve single payment method (cash)', () => {
    getPaymentMethodLabel('cash')
  })
})

// ─── Date Manipulation Benchmarks ─────────────────────────────

describe('Date Operations', () => {
  bench('todayRange: start/end of day', () => {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const end = new Date(start.getTime() + 86400000 - 1)
    expect(end.getTime()).toBeGreaterThan(start.getTime())
  })

  bench('hour label generation (24 hours)', () => {
    for (let h = 0; h < 24; h++) {
      const label = h === 0 ? '12AM' : h < 12 ? `${h}AM` : h === 12 ? '12PM' : `${h - 12}PM`
      // Use label to satisfy lint
      void label
    }
  })
})
