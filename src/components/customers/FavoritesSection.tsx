/**
 * FavoritesSection — Automatically surfaced top customers
 * ──────────────────────────────────────────────────────────
 *
 * Displays the top-ranked customers by visit frequency, total spend,
 * and recency. No manual pinning required.
 */

import { motion } from "framer-motion"
import { Star, TrendingUp, ShoppingBag } from "lucide-react"
import { cn, formatCurrency, formatNumber } from "@/lib/utils"
import type { Customer } from "@/lib/services/customer-service"
import type { CustomerStats } from "@/lib/services/customer-aggregation"

interface FavoritesSectionProps {
  favoriteIds: string[]
  customers: Customer[]
  statsMap: Map<string, CustomerStats>
  onOpen: (customerId: string) => void
}

function getInitials(name: string) {
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
}

export function FavoritesSection({
  favoriteIds,
  customers,
  statsMap,
  onOpen,
}: FavoritesSectionProps) {
  if (favoriteIds.length === 0) return null

  const favoriteCustomers = favoriteIds
    .map(id => customers.find(c => c.id === id))
    .filter((c): c is Customer => c !== undefined)

  if (favoriteCustomers.length === 0) return null

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-2.5">
        <Star className="h-4 w-4 text-amber-500" />
        <span className="text-xs font-semibold uppercase tracking-wider text-amber-500/70">
          Top Customers
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {favoriteCustomers.map((customer, idx) => {
          const stats = statsMap.get(customer.id)
          const visits = stats?.totalOrders ?? 0
          const spent = stats?.totalSpent ?? 0
          const outstanding = stats?.outstandingCredit ?? 0
          const initials = getInitials(customer.name)

          return (
            <motion.button
              key={customer.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.04, duration: 0.2 }}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onOpen(customer.id)}
              className={cn(
                "flex items-center gap-3 rounded-xl border border-border bg-card/50 px-3.5 py-2 text-left transition-all hover:shadow-sm hover:border-amber-300/30",
                outstanding > 0 && "border-l-2 border-l-amber-400/60"
              )}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-950/30 dark:to-amber-900/20 text-[10px] font-bold text-amber-600 dark:text-amber-400 shadow-sm">
                {initials}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground truncate max-w-[120px]">
                  {customer.name}
                </p>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-0.5">
                    <ShoppingBag className="h-2.5 w-2.5 inline" />
                    {formatNumber(visits)}
                  </span>
                  <span className="flex items-center gap-0.5">
                    <TrendingUp className="h-2.5 w-2.5 inline" />
                    {formatCurrency(spent)}
                  </span>
                </div>
              </div>
              {outstanding > 0 && (
                <span className="shrink-0 rounded-full bg-amber-50 dark:bg-amber-950/20 px-2 py-0.5 text-[9px] font-semibold text-amber-600 dark:text-amber-400">
                  Due {formatCurrency(outstanding)}
                </span>
              )}
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
