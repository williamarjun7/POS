/**
 * PaymentBreakdown
 * ────────────────
 * Displays payment methods with their corresponding amounts for an invoice.
 * Fetches payment records by invoice ID and shows a clean breakdown.
 *
 * Usage:
 *   <PaymentBreakdown invoiceId="..." />
 *   <PaymentBreakdown payments={paymentRecords} total={invoiceTotal} />
 *
 * Data Source: Uses the actual payment records from the payments table.
 * Never infers or reconstructs amounts from invoice totals.
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchPaymentsByInvoiceFromDb } from '@/lib/services/payment-service'
import { invoiceKeys } from '@/lib/core/query-keys'
import { getPaymentMethodLabel, getPaymentMethodColor } from '@/lib/payment-methods'
import { formatCurrency, cn } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────

export interface PaymentBreakdownEntry {
  id: string
  method: string
  amount: number
  createdAt: string
  reference?: string
}

interface PaymentBreakdownProps {
  /** Invoice ID to fetch payments for (alternative to passing payments directly) */
  invoiceId?: string
  /** Pre-fetched payment records (alternative to invoiceId) */
  payments?: PaymentBreakdownEntry[]
  /** Total invoice amount (for comparison with total paid) */
  total?: number
  /** Visual variant */
  variant?: 'detailed' | 'compact' | 'inline'
  /** Additional classes */
  className?: string
  /** Whether to show individual timestamps */
  showTimestamps?: boolean
  /** Whether to show the total row */
  showTotal?: boolean
  /** Max items before collapsing */
  maxItems?: number
}

// ─── Fetch Hook ─────────────────────────────────────────────

function useInvoicePayments(invoiceId: string | undefined) {
  return useQuery<PaymentBreakdownEntry[]>({
    queryKey: invoiceKeys.payments(invoiceId ?? '__missing__'),
    queryFn: async () => {
      const rows = await fetchPaymentsByInvoiceFromDb(invoiceId!)
      return rows.map(r => ({
        id: r.id,
        method: r.paymentMethod,
        amount: r.amount,
        createdAt: r.createdAt,
        reference: r.reference,
      }))
    },
    enabled: !!invoiceId,
    staleTime: 10_000,
  })
}

// ─── Helpers ─────────────────────────────────────────────────

function aggregateByMethod(entries: PaymentBreakdownEntry[]): Array<{
  method: string
  amount: number
  count: number
  lastDate: string
}> {
  const map = new Map<string, { amount: number; count: number; lastDate: string }>()
  for (const e of entries) {
    const existing = map.get(e.method)
    if (existing) {
      existing.amount += e.amount
      existing.count += 1
      if (e.createdAt > existing.lastDate) existing.lastDate = e.createdAt
    } else {
      map.set(e.method, { amount: e.amount, count: 1, lastDate: e.createdAt })
    }
  }
  return Array.from(map.entries())
    .map(([method, data]) => ({ method, ...data }))
    .sort((a, b) => new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime())
}

// ─── Skeleton ────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      <div className="h-4 w-24 rounded bg-muted" />
      <div className="h-4 w-32 rounded bg-muted" />
      <div className="h-4 w-28 rounded bg-muted" />
    </div>
  )
}

// ─── Component ───────────────────────────────────────────────

export function PaymentBreakdown({
  invoiceId,
  payments: propPayments,
  total,
  variant = 'detailed',
  className,
  showTimestamps = false,
  showTotal = true,
  maxItems = 10,
}: PaymentBreakdownProps) {
  // Fetch if invoiceId provided, otherwise use prop payments
  const { data: fetchedPayments, isLoading } = useInvoicePayments(
    propPayments ? undefined : invoiceId,
  )

  const rawEntries = propPayments ?? fetchedPayments ?? []
  const entries = rawEntries.slice(0, maxItems)
  const remaining = rawEntries.length - maxItems

  // Aggregate by method for compact/inline variants
  const aggregated = useMemo(
    () => (variant === 'compact' || variant === 'inline' ? aggregateByMethod(entries) : []),
    [entries, variant],
  )

  const totalPaid = useMemo(
    () => rawEntries.reduce((s, e) => s + e.amount, 0),
    [rawEntries],
  )

  if (isLoading) {
    return <Skeleton />
  }

  if (rawEntries.length === 0) {
    return null
  }

  // ── Inline variant (single line, e.g. "Cash (Rs. 500), Fonepay (Rs. 200)") ──
  if (variant === 'inline') {
    return (
      <span className={cn('inline-flex flex-wrap items-center gap-x-2 gap-y-1', className)}>
        {aggregated.map(({ method, amount, count }) => (
          <span
            key={method}
            className="inline-flex items-center gap-1 text-xs font-medium"
            style={{ color: getPaymentMethodColor(method) }}
          >
            <span
              className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: getPaymentMethodColor(method) }}
            />
            {getPaymentMethodLabel(method)}
            <span className="tabular-nums">({formatCurrency(amount)})</span>
            {count > 1 && <span className="text-muted-foreground/60">×{count}</span>}
          </span>
        ))}
        {remaining > 0 && (
          <span className="text-xs text-muted-foreground">+{remaining} more</span>
        )}
      </span>
    )
  }

  // ── Compact variant (stacked with amounts, no timestamps) ──
  if (variant === 'compact') {
    return (
      <div className={cn('space-y-1', className)}>
        {aggregated.map(({ method, amount, count }) => (
          <div key={method} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: getPaymentMethodColor(method) }}
              />
              <span className="font-medium">{getPaymentMethodLabel(method)}</span>
              {count > 1 && (
                <span className="text-xs text-muted-foreground">×{count}</span>
              )}
            </div>
            <span className="tabular-nums font-semibold">{formatCurrency(amount)}</span>
          </div>
        ))}
        {remaining > 0 && (
          <p className="text-xs text-muted-foreground pt-0.5">
            +{remaining} more payment{remaining > 1 ? 's' : ''}
          </p>
        )}
        {showTotal && (
          <>
            <hr className="border-border my-1" />
            <div className="flex items-center justify-between text-sm font-bold">
              <span>Total Paid</span>
              <span className="tabular-nums text-success">{formatCurrency(totalPaid)}</span>
            </div>
            {total !== undefined && total > totalPaid && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Outstanding</span>
                <span className="tabular-nums text-amber-600">{formatCurrency(total - totalPaid)}</span>
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  // ── Detailed variant (full history with individual entries and timestamps) ──
  return (
    <div className={cn('space-y-2', className)}>
      <div className="space-y-1.5">
        {entries.map((entry) => {
          const time = entry.createdAt?.split('T')[1]?.slice(0, 5)
          const date = entry.createdAt?.split('T')[0]
          return (
            <div
              key={entry.id}
              className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="inline-block w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: getPaymentMethodColor(entry.method) }}
                />
                <span
                  className="font-medium truncate"
                  style={{ color: getPaymentMethodColor(entry.method) }}
                >
                  {getPaymentMethodLabel(entry.method)}
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {(showTimestamps || variant === 'detailed') && date && (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {date}{time ? ` ${time}` : ''}
                  </span>
                )}
                <span className="font-semibold tabular-nums">{formatCurrency(entry.amount)}</span>
              </div>
            </div>
          )
        })}
        {remaining > 0 && (
          <p className="text-xs text-muted-foreground text-center pt-1">
            +{remaining} more payment{remaining > 1 ? 's' : ''}
          </p>
        )}
      </div>
      {showTotal && (
        <div className="pt-1.5 border-t border-border">
          <div className="flex items-center justify-between text-sm font-bold">
            <span>Total Paid</span>
            <span className="tabular-nums text-success">{formatCurrency(totalPaid)}</span>
          </div>
          {total !== undefined && total > totalPaid && (
            <div className="flex items-center justify-between text-xs text-muted-foreground mt-0.5">
              <span>Outstanding</span>
              <span className="tabular-nums text-amber-600">{formatCurrency(total - totalPaid)}</span>
            </div>
          )}
          {total !== undefined && total <= totalPaid && totalPaid > 0 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground mt-0.5">
              <span>Invoice Total</span>
              <span className="tabular-nums">{formatCurrency(total)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Standalone helper to format a single payment line ──────

export function formatPaymentLine(method: string, amount: number): string {
  return `${getPaymentMethodLabel(method)} (${formatCurrency(amount)})`
}
