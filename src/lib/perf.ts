/**
 * Performance Measurement Utility
 * ────────────────────────────────
 *
 * Lightweight wrapper around `performance.mark()` / `performance.measure()`
 * that logs structured timing data to the console.
 *
 * Enabled only in DEVELOPMENT — stripped from production builds by Vite's
 * tree-shaking (all calls are behind `import.meta.env.DEV`).
 *
 * Usage:
 *   import { perf } from '@/lib/perf'
 *
 *   async function loadDashboard() {
 *     perf.start('dashboard.load')
 *     await fetchData()
 *     perf.end('dashboard.load') // logs: [PERF] dashboard.load: 245ms
 *   }
 *
 * For operations with sub-steps:
 *   perf.start('payment.process')
 *   await createInvoice()
 *   perf.mark('payment.invoice_created')
 *   await recordPayment()
 *   perf.mark('payment.recorded')
 *   perf.measure('payment.process') // logs all marks
 */

// ─── Types ───────────────────────────────────────────────────

type PerfLabel = string

interface PerfEntry {
  label: PerfLabel
  startMark: string
  marks: string[]
}

// ─── Store active measurements ───────────────────────────────

const active = new Map<PerfLabel, PerfEntry>()

// ─── Helpers ─────────────────────────────────────────────────

function markName(label: PerfLabel, suffix: string): string {
  return `perf:${label}:${suffix}`
}

// ─── Public API ──────────────────────────────────────────────

export const perf = {
  /**
   * Start measuring an operation. Clears any previous measurement
   * with the same label.
   */
  start(label: PerfLabel): void {
    if (!import.meta.env.DEV) return

    const m = markName(label, 'start')
    performance.mark(m)
    active.set(label, { label, startMark: m, marks: [] })
  },

  /**
   * Record an intermediate milestone within an operation.
   */
  mark(label: PerfLabel, stepName?: string): void {
    if (!import.meta.env.DEV) return

    const entry = active.get(label)
    if (!entry) return

    const suffix = stepName ? `step:${stepName}` : `mark:${entry.marks.length}`
    const m = markName(label, suffix)
    performance.mark(m)
    entry.marks.push(m)
  },

  /**
   * End an operation and log the total time plus all intermediate steps.
   */
  end(label: PerfLabel): number | undefined {
    if (!import.meta.env.DEV) return undefined

    const entry = active.get(label)
    if (!entry) {
      console.warn(`[PERF] No active measurement for "${label}"`)
      return undefined
    }

    const endM = markName(label, 'end')
    performance.mark(endM)

    // Measure total: start → end
    const totalMeasure = markName(label, 'total')
    performance.measure(totalMeasure, entry.startMark, endM)

    const entries = performance.getEntriesByName(totalMeasure)
    const totalDur = entries.length > 0 ? Math.round(entries[0].duration) : 0

    // Build log string
    const parts: string[] = [`[PERF] ${label}: ${totalDur}ms`]

    // Measure each step
    let prevMark = entry.startMark
    for (const m of entry.marks) {
      const stepMeasure = markName(label, `step:${m}`)
      performance.measure(stepMeasure, prevMark, m)
      const stepEntries = performance.getEntriesByName(stepMeasure)
      if (stepEntries.length > 0) {
        parts.push(`  ├─ step ${entry.marks.indexOf(m)}: ${Math.round(stepEntries[0].duration)}ms`)
      }
      prevMark = m
    }

    // Log result
    console.log(parts.join('\n'))

    // Cleanup performance entries to avoid memory leaks
    performance.clearMarks(markName(label, 'start'))
    for (const m of entry.marks) {
      performance.clearMarks(m)
    }
    performance.clearMarks(endM)
    performance.clearMeasures(totalMeasure)
    for (const m of entry.marks) {
      performance.clearMeasures(markName(label, `step:${m}`))
    }

    active.delete(label)
    return totalDur
  },

  /**
   * One-shot measurement: time an async function.
   */
  async time<T>(label: PerfLabel, fn: () => Promise<T>): Promise<T> {
    perf.start(label)
    try {
      const result = await fn()
      return result
    } finally {
      perf.end(label)
    }
  },

  /**
   * One-shot synchronous measurement.
   */
  timeSync<T>(label: PerfLabel, fn: () => T): T {
    perf.start(label)
    try {
      const result = fn()
      return result
    } finally {
      perf.end(label)
    }
  },
}

// ─── Tag constants ───────────────────────────────────────────

/** Major operation tags for consistent labeling */
export const PERF_TAGS = {
  DASHBOARD_LOAD: 'dashboard.load',
  POS_LOAD: 'pos.load',
  TABLE_UPDATE: 'table.update',
  ORDER_CREATION: 'order.creation',
  PAYMENT_CONFIRMATION: 'payment.confirmation',
  INVOICE_CREATION: 'invoice.creation',
  INVENTORY_UPDATE: 'inventory.update',
  DASHBOARD_REFRESH: 'dashboard.refresh',
  CUSTOMER_LOOKUP: 'customer.lookup',
  PRINT_GENERATION: 'print.generation',
} as const
