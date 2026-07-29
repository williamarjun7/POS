/**
 * OverviewTab — Analytics + Recent Visits + Payment Breakdown
 * ───────────────────────────────────────────────────────────
 * Extracted from CustomerProfile.tsx for modularity.
 */

import { useMemo } from "react"
import { motion } from "framer-motion"
import {
  FileText, ShoppingBag, CreditCard, Wallet, Loader2,
  AlertCircle, CheckCircle2, Info,
} from "lucide-react"

/* ─── Status badge icon lookup ─────────────────────────────── */
const statusIcons = {
  AlertCircle: <AlertCircle className="h-3 w-3" aria-hidden="true" />,
  CheckCircle2: <CheckCircle2 className="h-3 w-3" aria-hidden="true" />,
  Info: <Info className="h-3 w-3" aria-hidden="true" />,
} as const
import { cn, formatCurrency } from "@/lib/utils"
import { StatusBadge } from "@/components/StatusBadge"
import { SectionCard } from "@/components/ui/card"
import { CustomerAnalytics } from "@/components/customers/CustomerAnalytics"
import { getPaymentMethodLabel } from "@/lib/payment-methods"
import type { CustomerVisit } from "@/components/customers/VisitHistory"

/* ─── Internal types (mirrored from parent) ──────────────── */

interface CustomerInvoice {
  id: string; invoiceNumber: string; date: string
  amount: number; paid: number; remaining: number; status: string; paymentMethod: string
}

interface CustomerPayment {
  id: string; date: string; method: string; amount: number
  reference: string; relatedInvoice: string; status: string; notes?: string
}

interface CustomerOrder {
  id: string; orderNumber: string; date: string; tableRoom?: string
  itemsCount: number; grandTotal: number; payStatus: string; status: string
  items: any[]; discount: number; paidAmount: number; customerName?: string
}

/* ─── Helpers ──────────────────────────────────────────────── */

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  const diff = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
  if (diff === 0) return "Today"
  if (diff === 1) return "Yesterday"
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
}

function statusVariant(status: string): "default" | "success" | "warning" | "destructive" | "info" | "secondary" {
  switch (status) {
    case "paid": return "success"
    case "completed": return "success"
    case "pending": return "warning"
    case "overdue": return "destructive"
    case "partial": return "info"
    case "credit_invoice": return "info"
    case "cancelled": return "destructive"
    default: return "default"
  }
}

/* ─── Component ────────────────────────────────────────────── */

interface OverviewTabProps {
  visits: CustomerVisit[]
  invoices: CustomerInvoice[]
  payments: CustomerPayment[]
  orders: CustomerOrder[]
  loading: boolean
  customerCreatedAt?: string
  onViewBill?: (visit: CustomerVisit) => void
}

export function OverviewTab({
  visits, invoices, payments, orders, loading, customerCreatedAt, onViewBill,
}: OverviewTabProps) {
  const paymentBreakdown = useMemo(() => {
    const methodTotals = new Map<string, { collected: number; outstanding: number }>()
    let totalInvoiceAmount = 0

    for (const inv of invoices) {
      if (inv.status === 'cancelled') continue
      totalInvoiceAmount += inv.amount

      const invoicePayments = payments.filter(p =>
        p.method !== 'credit' && p.relatedInvoice.includes(inv.invoiceNumber.slice(-8))
      )
      for (const p of invoicePayments) {
        const key = getPaymentMethodLabel(p.method)
        const current = methodTotals.get(key) ?? { collected: 0, outstanding: 0 }
        current.collected += p.amount
        methodTotals.set(key, current)
      }

      if (inv.remaining > 0) {
        const key = 'Credit Account'
        const current = methodTotals.get(key) ?? { collected: 0, outstanding: 0 }
        current.outstanding += inv.remaining
        methodTotals.set(key, current)
      }
    }

    return {
      methods: Array.from(methodTotals.entries()).sort((a, b) => (b[1].collected + b[1].outstanding) - (a[1].collected + a[1].outstanding)),
      totalInvoiceAmount,
    }
  }, [payments, invoices])

  const { methods, totalInvoiceAmount } = paymentBreakdown
  const totalWithOutstanding = methods.reduce((s, [, v]) => s + v.collected + v.outstanding, 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading customer data...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5 p-5 pt-4">
      {/* ── Customer Analytics (insights) ── */}
      <CustomerAnalytics
        visits={visits}
        customerCreatedAt={customerCreatedAt}
        loading={false}
      />

      {/* ── Recent Visits (last 5) ── */}
      <SectionCard title="Recent Visits" icon="ShoppingBag" iconColor="text-primary">
        {visits.length > 0 ? (
          <div className="space-y-1.5">
            {visits.slice(0, 5).map((visit) => (
              <button
                key={visit.id}
                onClick={() => onViewBill?.(visit)}
                className="w-full text-left group flex items-center justify-between rounded-xl px-3 py-2.5 hover:bg-muted/50 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg shrink-0",
                    visit.outstandingAmount > 0 ? "bg-amber-50 dark:bg-amber-950/20" : "bg-primary/10"
                  )}>
                    <FileText className={cn(
                      "h-4 w-4",
                      visit.outstandingAmount > 0 ? "text-amber-600 dark:text-amber-400" : "text-primary"
                    )} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{visit.invoiceNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(visit.date)} · {formatTime(visit.date)}
                      {visit.tableOrRoom && <span className="mx-1.5">· {visit.tableOrRoom}</span>}
                      <span className="mx-1.5">·</span>
                      {visit.itemsCount} item{visit.itemsCount > 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-semibold text-foreground tabular-nums">{formatCurrency(visit.total)}</span>
                  <StatusBadge
                    label={visit.outstandingAmount > 0 ? 'Due' : 'Paid'}
                    variant={visit.outstandingAmount > 0 ? 'warning' : 'success'}
                    icon={visit.outstandingAmount > 0 ? statusIcons.AlertCircle : statusIcons.CheckCircle2}
                    size="sm"
                  />
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center py-6 text-center">
            <ShoppingBag className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">No visits yet</p>
          </div>
        )}
      </SectionCard>

      {/* ── Payment Breakdown ── */}
      {methods.length > 0 && (
        <SectionCard title="Payment Breakdown" icon="CreditCard" iconColor="text-info">
          {totalInvoiceAmount > 0 && (
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Billed</span>
              <span className="text-base font-bold text-foreground tabular-nums">{formatCurrency(totalInvoiceAmount)}</span>
            </div>
          )}

          <div className="space-y-4">
            {methods.map(([method, { collected, outstanding }]) => {
              const totalForMethod = collected + outstanding
              const pct = totalWithOutstanding > 0 ? (totalForMethod / totalWithOutstanding) * 100 : 0
              const isCredit = method === 'Credit Account'

              return (
                <div key={method}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "flex h-2.5 w-2.5 rounded-full",
                        isCredit ? "bg-amber-400" :
                        method.includes("Cash") ? "bg-emerald-500" :
                        method.includes("FonePay") ? "bg-blue-500" :
                        method.includes("QR") ? "bg-sky-500" :
                        "bg-muted-foreground"
                      )} />
                      <span className={cn("text-sm font-medium", isCredit && outstanding > 0 ? "text-amber-600 dark:text-amber-400" : "text-foreground")}>
                        {isCredit ? 'Credit (Outstanding)' : method}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn("text-sm font-semibold tabular-nums", isCredit ? "text-amber-600" : "text-foreground")}>
                        {formatCurrency(totalForMethod)}
                      </span>
                      <span className="text-xs text-muted-foreground w-8 text-right tabular-nums">{pct.toFixed(0)}%</span>
                    </div>
                  </div>

                  {!isCredit && collected > 0 && (
                    <div className="flex items-center justify-between pl-4 mb-1 text-xs text-muted-foreground">
                      <span>Collected</span>
                      <span className="text-emerald-600 font-medium tabular-nums">{formatCurrency(collected)}</span>
                    </div>
                  )}
                  {isCredit && outstanding > 0 && (
                    <div className="flex items-center justify-between pl-4 mb-1 text-xs text-muted-foreground">
                      <span>Outstanding</span>
                      <span className="text-amber-600 font-medium tabular-nums">{formatCurrency(outstanding)}</span>
                    </div>
                  )}

                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                      className={cn(
                        "h-full rounded-full",
                        isCredit ? "bg-amber-400" :
                        method.includes("Cash") ? "bg-emerald-500" :
                        method.includes("FonePay") ? "bg-blue-500" :
                        method.includes("QR") ? "bg-sky-500" :
                        "bg-muted-foreground"
                      )}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </SectionCard>
      )}

      {/* ── Outstanding Invoices ── */}
      {(() => {
        const unpaidInvoices = invoices.filter(i => i.status !== 'paid' && i.status !== 'cancelled')
        if (unpaidInvoices.length === 0) return null

        return (
          <SectionCard title="Outstanding Invoices" icon="Wallet" iconColor="text-amber-600">
            <div className="overflow-hidden rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/30 border-b border-border">
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Invoice</th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Total</th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Paid</th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Due</th>
                    <th className="px-4 py-2.5 text-center text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {unpaidInvoices.slice(0, 10).map(inv => {
                    const matchingVisit = visits.find(v => v.id === inv.id || v.invoiceId === inv.id)
                    return (
                      <tr
                        key={inv.id}
                        onClick={() => matchingVisit && onViewBill?.(matchingVisit)}
                        className={cn(
                          "border-b border-border/50 last:border-0 transition-colors",
                          matchingVisit && "cursor-pointer hover:bg-muted/20"
                        )}
                      >
                        <td className="px-4 py-3 font-medium text-foreground text-sm truncate max-w-[120px]" title={inv.invoiceNumber}>{inv.invoiceNumber}</td>
                        <td className="px-4 py-3 text-right text-foreground tabular-nums">{formatCurrency(inv.amount)}</td>
                        <td className="px-4 py-3 text-right text-emerald-600 tabular-nums">{formatCurrency(inv.paid)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-destructive tabular-nums">{formatCurrency(inv.remaining)}</td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge
                            label={inv.status === 'credit_invoice' ? 'Outstanding' : inv.status.replace('_', ' ')}
                            variant={inv.status === 'credit_invoice' ? 'warning' : statusVariant(inv.status)}
                            icon={
                              inv.status === 'paid' ? statusIcons.CheckCircle2 :
                              inv.status === 'credit_invoice' || inv.status === 'pending' || inv.status === 'partial' ? statusIcons.AlertCircle :
                              statusIcons.Info
                            }
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {unpaidInvoices.length > 10 && (
              <p className="mt-3 text-xs text-muted-foreground text-center">
                + {unpaidInvoices.length - 10} more unpaid invoice{unpaidInvoices.length - 10 > 1 ? 's' : ''}
              </p>
            )}
          </SectionCard>
        )
      })()}
    </div>
  )
}
