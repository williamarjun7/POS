/**
 * RecentCustomersSection — Recently viewed customer quick-access bar
 * ──────────────────────────────────────────────────────────────────
 *
 * Displays the last 10–20 opened customers for one-click access.
 * Auto-updates when a customer is opened.
 */

import { motion } from "framer-motion"
import { X, Clock, Users } from "lucide-react"
import { cn, formatCurrency } from "@/lib/utils"
import type { Customer } from "@/lib/services/customer-service"
import type { CustomerStats } from "@/lib/services/customer-aggregation"

interface RecentCustomersSectionProps {
  recentIds: string[]
  customers: Customer[]
  statsMap: Map<string, CustomerStats>
  onOpen: (customerId: string) => void
  onClear: () => void
}

function getInitials(name: string) {
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
}

export function RecentCustomersSection({
  recentIds,
  customers,
  statsMap,
  onOpen,
  onClear,
}: RecentCustomersSectionProps) {
  if (recentIds.length === 0) return null

  const recentCustomers = recentIds
    .map(id => customers.find(c => c.id === id))
    .filter((c): c is Customer => c !== undefined)
    .slice(0, 10)

  if (recentCustomers.length === 0) return null

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground/60" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
            Recent Customers
          </span>
        </div>
        <button
          onClick={onClear}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-muted-foreground/40 hover:text-muted-foreground transition-colors"
          aria-label="Clear recent customers"
        >
          <X className="h-3 w-3" />
          Clear
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {recentCustomers.map((customer, idx) => {
          const stats = statsMap.get(customer.id)
          const outstanding = stats?.outstandingCredit ?? 0
          const initials = getInitials(customer.name)

          return (
            <motion.button
              key={customer.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.03, duration: 0.2 }}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onOpen(customer.id)}
              className={cn(
                "flex items-center gap-2.5 rounded-xl border border-border bg-card/50 px-3 py-2 text-left transition-all hover:shadow-sm hover:border-foreground/15",
                outstanding > 0 && "border-l-2 border-l-amber-400/60"
              )}
            >
              <div className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                outstanding > 0
                  ? "bg-amber-50 dark:bg-amber-950/20 text-amber-600"
                  : "bg-primary/10 text-primary"
              )}>
                {initials}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground truncate max-w-[100px]">
                  {customer.name}
                </p>
                <p className="text-[10px] text-muted-foreground truncate max-w-[100px]">
                  {customer.phone}
                </p>
              </div>
              {outstanding > 0 && (
                <span className="shrink-0 rounded-full bg-amber-50 dark:bg-amber-950/20 px-2 py-0.5 text-[9px] font-semibold text-amber-600 dark:text-amber-400">
                  {formatCurrency(outstanding)}
                </span>
              )}
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
