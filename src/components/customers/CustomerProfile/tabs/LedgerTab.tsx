import { useState } from "react"
import { motion } from "framer-motion"
import { ChevronUp, ChevronDown, Loader2, Wallet } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { EmptyState } from "@/components/EmptyState"

interface Entry {
  id: string; date: string; description: string
  debit: number; credit: number; runningBalance: number
  type: 'invoice' | 'payment' | 'adjustment' | 'refund'
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

function usePaginatedDisplay<T>(items: T[], pageSize = 20) {
  const [showAll, setShowAll] = useState(false)
  return {
    displayed: showAll ? items : items.slice(0, pageSize),
    hasMore: items.length > pageSize,
    showAll,
    toggle: () => setShowAll(p => !p),
  }
}

interface LedgerTabProps {
  ledger: Entry[]
  loading: boolean
  currentBalance: number
}

export function LedgerTab({ ledger, loading, currentBalance }: LedgerTabProps) {
  const { displayed, hasMore, showAll, toggle } = usePaginatedDisplay(ledger, 20)

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
  if (ledger.length === 0) return <EmptyState icon="BookOpen" title="No ledger entries" description="No financial activity recorded for this customer." />

  return (
    <div className="p-5 pt-4">
      <div className="mb-4 rounded-xl bg-gradient-to-br from-amber-50 to-amber-50/50 dark:from-amber-950/20 dark:to-amber-950/10 border border-amber-200 dark:border-amber-900/30 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">Current Balance</p>
            <p className="text-lg font-bold text-amber-800 dark:text-amber-300 tabular-nums mt-0.5">{formatCurrency(currentBalance)}</p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/30">
            <Wallet className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Date</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Description</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Debit</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Credit</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Balance</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((entry, i) => (
              <motion.tr key={entry.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
                className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="text-sm text-foreground">{formatDate(entry.date)}</div>
                  <div className="text-xs text-muted-foreground">{formatTime(entry.date)}</div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-foreground">{entry.description}</span>
                  <span className="ml-2 text-[10px] uppercase font-semibold text-muted-foreground/50">{entry.type}</span>
                </td>
                <td className="px-4 py-3 text-right font-medium text-rose-600 tabular-nums">{entry.debit > 0 ? formatCurrency(entry.debit) : "—"}</td>
                <td className="px-4 py-3 text-right font-medium text-emerald-600 tabular-nums">{entry.credit > 0 ? formatCurrency(entry.credit) : "—"}</td>
                <td className="px-4 py-3 text-right font-semibold text-foreground tabular-nums">{formatCurrency(entry.runningBalance)}</td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasMore && (
        <div className="flex justify-center mt-5">
          <button onClick={toggle} className="flex items-center gap-1.5 rounded-xl border border-border px-5 py-2.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            {showAll ? <><ChevronUp className="h-3.5 w-3.5" /> Show less</> : <><ChevronDown className="h-3.5 w-3.5" /> Show all {ledger.length} entries</>}
          </button>
        </div>
      )}
    </div>
  )
}
