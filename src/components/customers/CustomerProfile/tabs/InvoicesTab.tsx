import { useState } from "react"
import { motion } from "framer-motion"
import { ChevronUp, ChevronDown, Loader2, Plus, AlertCircle, CheckCircle2, Info } from "lucide-react"

/* ─── Status badge icon lookup ─────────────────────────────── */
const statusIcons = {
  AlertCircle: <AlertCircle className="h-3 w-3" aria-hidden="true" />,
  CheckCircle2: <CheckCircle2 className="h-3 w-3" aria-hidden="true" />,
  Info: <Info className="h-3 w-3" aria-hidden="true" />,
} as const
import { cn, formatCurrency } from "@/lib/utils"
import { StatusBadge } from "@/components/StatusBadge"
import { EmptyState } from "@/components/EmptyState"
import type { CustomerVisit } from "@/components/customers/VisitHistory"

interface Invoice {
  id: string; invoiceNumber: string; date: string
  amount: number; paid: number; remaining: number; status: string; paymentMethod: string
}

function formatDate(d: string) {
  const date = new Date(d); const now = new Date()
  const diff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
  if (diff === 0) return "Today"; if (diff === 1) return "Yesterday"
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function statusVariant(s: string) {
  switch (s) {
    case "paid": return "success" as const
    case "completed": return "success" as const
    case "pending": return "warning" as const
    case "overdue": case "cancelled": return "destructive" as const
    case "partial": case "credit_invoice": return "info" as const
    default: return "default" as const
  }
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

interface InvoicesTabProps {
  invoices: Invoice[]
  visits: CustomerVisit[]
  loading: boolean
  onViewBill?: (visit: CustomerVisit) => void
  customerId?: string
}

export function InvoicesTab({ invoices, visits, loading, onViewBill, customerId }: InvoicesTabProps) {
  const { displayed, hasMore, showAll, toggle } = usePaginatedDisplay(invoices, 15)

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
  if (invoices.length === 0) return (
    <EmptyState icon="Receipt" title="No invoices found" description="This customer has no invoices yet."
      action={
        <button onClick={() => window.location.href = `/pos?customer=${customerId}`}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors">
          <Plus className="h-3.5 w-3.5" /> Create Sale
        </button>
      }
    />
  )

  return (
    <div className="p-5 pt-4">
      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Invoice</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Date</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Amount</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Paid</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Remaining</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((inv, i) => {
              const matchingVisit = visits.find(v => v.id === inv.id || v.invoiceId === inv.id)
              return (
                <motion.tr key={inv.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
                  onClick={() => matchingVisit && onViewBill?.(matchingVisit)}
                  className={cn("border-b border-border/50 last:border-0 transition-colors", matchingVisit && "cursor-pointer hover:bg-muted/20")}>
                  <td className="px-4 py-3.5 font-medium text-foreground truncate max-w-[130px]" title={inv.invoiceNumber}>{inv.invoiceNumber}</td>
                  <td className="px-4 py-3.5 text-muted-foreground whitespace-nowrap">{formatDate(inv.date)}</td>
                  <td className="px-4 py-3.5 text-right font-medium text-foreground tabular-nums">{formatCurrency(inv.amount)}</td>
                  <td className={cn("px-4 py-3.5 text-right font-medium tabular-nums", inv.paid > 0 ? "text-success" : "text-muted-foreground")}>{inv.paid > 0 ? formatCurrency(inv.paid) : "—"}</td>
                  <td className={cn("px-4 py-3.5 text-right font-semibold tabular-nums", inv.remaining > 0 ? "text-destructive" : "text-muted-foreground")}>{inv.remaining > 0 ? formatCurrency(inv.remaining) : "—"}</td>
                  <td className="px-4 py-3.5 text-center">
                    <StatusBadge
                      label={inv.status.replace('_', ' ')}
                      variant={statusVariant(inv.status)}
                      icon={
                        inv.status === 'paid' || inv.status === 'completed' ? statusIcons.CheckCircle2 :
                        inv.status === 'pending' || inv.status === 'partial' || inv.status === 'credit_invoice' ? statusIcons.AlertCircle :
                        inv.status === 'cancelled' || inv.status === 'overdue' ? statusIcons.AlertCircle :
                        statusIcons.Info
                      }
                    />
                  </td>
                </motion.tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {hasMore && (
        <div className="flex justify-center mt-5">
          <button onClick={toggle} className="flex items-center gap-1.5 rounded-xl border border-border px-5 py-2.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            {showAll ? <><ChevronUp className="h-3.5 w-3.5" /> Show less</> : <><ChevronDown className="h-3.5 w-3.5" /> Show all {invoices.length} invoices</>}
          </button>
        </div>
      )}
    </div>
  )
}
