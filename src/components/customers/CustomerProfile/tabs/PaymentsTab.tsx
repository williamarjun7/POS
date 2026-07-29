import { useState, useMemo } from "react"
import { motion } from "framer-motion"
import { ChevronUp, ChevronDown, Loader2, CreditCard, CheckCircle2 } from "lucide-react"

/* ─── Status badge icon lookup ─────────────────────────────── */
const statusIcons = {
  CheckCircle2: <CheckCircle2 className="h-3 w-3" aria-hidden="true" />,
} as const
import { cn, formatCurrency } from "@/lib/utils"
import { StatusBadge } from "@/components/StatusBadge"
import { EmptyState } from "@/components/EmptyState"
import { PaymentMethodBadge } from "@/components/PaymentMethodBadge"

interface Payment {
  id: string; date: string; method: string; amount: number
  reference: string; relatedInvoice: string; status: string; notes?: string
}

function formatDate(d: string) {
  const date = new Date(d); const now = new Date()
  const diff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
  if (diff === 0) return "Today"; if (diff === 1) return "Yesterday"
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function formatTime(d: string) {
  return new Date(d).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
}

function usePaginatedDisplay<T>(items: T[], pageSize = 15) {
  const [showAll, setShowAll] = useState(false)
  return {
    displayed: showAll ? items : items.slice(0, pageSize),
    hasMore: items.length > pageSize,
    showAll,
    toggle: () => setShowAll(p => !p),
  }
}

interface PaymentsTabProps {
  payments: Payment[]
  loading: boolean
  customerId?: string
}

export function PaymentsTab({ payments, loading, customerId }: PaymentsTabProps) {
  const realPayments = useMemo(() => payments.filter(p => p.method !== 'credit'), [payments])
  const { displayed, hasMore, showAll, toggle } = usePaginatedDisplay(realPayments, 15)

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>

  return (
    <div className="p-5 pt-4">
      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Date</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Method</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Amount</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground hidden md:table-cell">Reference</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground hidden md:table-cell">Invoice</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {displayed.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12">
                  <EmptyState icon="CreditCard" title="No payments recorded"
                    description="This customer hasn't made any payments yet."
                    action={
                      <button onClick={() => window.location.href = `/pos?customer=${customerId}`}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors">
                        <CreditCard className="h-3.5 w-3.5" /> Receive Payment
                      </button>
                    }
                  />
                </td>
              </tr>
            ) : (
              displayed.map((p, i) => (
                <motion.tr key={p.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
                  className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <div className="text-sm text-foreground">{formatDate(p.date)}</div>
                    <div className="text-xs text-muted-foreground">{formatTime(p.date)}</div>
                  </td>
                  <td className="px-4 py-3.5"><PaymentMethodBadge method={p.method as any} size="sm" showIcon={false} /></td>
                  <td className="px-4 py-3.5 text-right font-semibold text-success tabular-nums">{formatCurrency(p.amount)}</td>
                  <td className="px-4 py-3.5 text-muted-foreground text-xs hidden md:table-cell font-mono">{p.reference || "—"}</td>
                  <td className="px-4 py-3.5 text-muted-foreground text-xs hidden md:table-cell truncate max-w-[100px]" title={p.relatedInvoice}>{p.relatedInvoice}</td>
                  <td className="px-4 py-3.5 text-center">
                    <StatusBadge label="Completed" variant="success" icon={statusIcons.CheckCircle2} />
                  </td>
                </motion.tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {hasMore && (
        <div className="flex justify-center mt-5">
          <button onClick={toggle} className="flex items-center gap-1.5 rounded-xl border border-border px-5 py-2.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            {showAll ? <><ChevronUp className="h-3.5 w-3.5" /> Show less</> : <><ChevronDown className="h-3.5 w-3.5" /> Show all {realPayments.length} payments</>}
          </button>
        </div>
      )}
    </div>
  )
}
