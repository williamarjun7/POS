/**
 * CustomerAnalytics — Customer Insights & Analytics
 * ──────────────────────────────────────────────────
 *
 * Displays useful customer insights based on their visit history:
 *   - Total Visits, First Visit, Last Visit
 *   - Average Spend, Highest Bill
 *   - Favorite Items (most ordered)
 *   - Preferred Payment Method
 *   - Preferred Table
 *   - Peak Visit Time
 *   - Lifetime Value
 */

import { useMemo } from "react"
import { motion } from "framer-motion"
import {
  TrendingUp, Calendar, Clock, Coffee,
  CreditCard, MapPin, Award, Zap,
  Star, Crown, ShoppingBag, UtensilsCrossed,
  Loader2, Sparkles,
} from "lucide-react"
import { cn, formatCurrency, formatNumber } from "@/lib/utils"
import { SectionCard } from "@/components/ui/card"
import type { CustomerVisit } from "./VisitHistory"
import { getPaymentMethodLabel } from "@/lib/payment-methods"

/* ─── Types ────────────────────────────────────────────────── */

export interface CustomerInsight {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  sublabel?: string
  accent: string
  bg: string
}

export interface FavoriteItem {
  name: string
  count: number
  total: number
}

export interface CustomerAnalyticsData {
  totalVisits: number
  firstVisit: string
  lastVisit: string
  averageSpend: number
  highestBill: number
  highestBillInvoice?: string
  favoriteItems: FavoriteItem[]
  preferredPaymentMethod: string
  preferredTable?: string
  peakVisitTime?: string
  lifetimeValue: number
  daysSinceLastVisit: number
}

/* ─── Compute analytics from visits ───────────────────────── */

export function computeCustomerAnalytics(
  visits: CustomerVisit[],
  customerCreatedAt?: string,
): CustomerAnalyticsData {
  if (visits.length === 0) {
    return {
      totalVisits: 0,
      firstVisit: customerCreatedAt ?? new Date().toISOString(),
      lastVisit: customerCreatedAt ?? new Date().toISOString(),
      averageSpend: 0,
      highestBill: 0,
      favoriteItems: [],
      preferredPaymentMethod: "—",
      lifetimeValue: 0,
      daysSinceLastVisit: 0,
    }
  }

  // Sort visits by date
  const sorted = [...visits].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  // First and last visit
  const firstVisit = sorted[0].date
  const lastVisit = sorted[sorted.length - 1].date

  // Total visits
  const totalVisits = sorted.length

  // Total spent (lifetime value)
  const lifetimeValue = sorted.reduce((sum, v) => sum + v.total, 0)

  // Average spend
  const averageSpend = lifetimeValue / totalVisits

  // Highest bill
  let highestBill = 0
  let highestBillInvoice: string | undefined
  for (const v of sorted) {
    if (v.total > highestBill) {
      highestBill = v.total
      highestBillInvoice = v.invoiceNumber
    }
  }

  // Favorite items
  const itemCounts = new Map<string, { count: number; total: number }>()
  for (const v of sorted) {
    for (const item of v.items) {
      const current = itemCounts.get(item.name) ?? { count: 0, total: 0 }
      current.count += item.quantity
      current.total += item.totalPrice
      itemCounts.set(item.name, current)
    }
  }
  const favoriteItems = Array.from(itemCounts.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([name, data]) => ({ name, count: data.count, total: data.total }))

  // Preferred payment method
  const methodCounts = new Map<string, number>()
  for (const v of sorted) {
    for (const pm of v.paymentMethods) {
      if (pm.method === 'credit') continue
      methodCounts.set(pm.method, (methodCounts.get(pm.method) ?? 0) + pm.amount)
    }
  }
  const preferredMethod = Array.from(methodCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([method]) => getPaymentMethodLabel(method))
    .join(", ") || "—"

  // Preferred table
  const tableCounts = new Map<string, number>()
  for (const v of sorted) {
    if (v.tableOrRoom) {
      tableCounts.set(v.tableOrRoom, (tableCounts.get(v.tableOrRoom) ?? 0) + 1)
    }
  }
  const preferredTable = Array.from(tableCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([table]) => table)[0]

  // Peak visit time (hour of day)
  const hourCounts = new Map<number, number>()
  for (const v of sorted) {
    const hour = new Date(v.date).getHours()
    hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1)
  }
  const peakHour = Array.from(hourCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([hour]) => hour)[0]
  const peakVisitTime = peakHour !== undefined
    ? `${peakHour.toString().padStart(2, '0')}:00 - ${(peakHour + 1).toString().padStart(2, '0')}:00`
    : undefined

  // Days since last visit
  const lastVisitDate = new Date(lastVisit)
  const now = new Date()
  const daysSinceLastVisit = Math.floor((now.getTime() - lastVisitDate.getTime()) / (1000 * 60 * 60 * 24))

  return {
    totalVisits,
    firstVisit,
    lastVisit,
    averageSpend: Math.round(averageSpend * 100) / 100,
    highestBill,
    highestBillInvoice,
    favoriteItems,
    preferredPaymentMethod: preferredMethod,
    preferredTable,
    peakVisitTime,
    lifetimeValue: Math.round(lifetimeValue),
    daysSinceLastVisit,
  }
}

/* ─── Helpers ──────────────────────────────────────────────── */

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

/* ─── Main Component ──────────────────────────────────────── */

interface CustomerAnalyticsProps {
  visits: CustomerVisit[]
  customerCreatedAt?: string
  loading?: boolean
}

export function CustomerAnalytics({ visits, customerCreatedAt, loading = false }: CustomerAnalyticsProps) {
  const analytics = useMemo(
    () => computeCustomerAnalytics(visits, customerCreatedAt),
    [visits, customerCreatedAt],
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const insights: CustomerInsight[] = [
    {
      icon: ShoppingBag,
      label: "Total Visits",
      value: formatNumber(analytics.totalVisits),
      sublabel: analytics.totalVisits === 1 ? "1 visit" : `${analytics.totalVisits} visits`,
      accent: "text-primary",
      bg: "bg-primary/10",
    },
    {
      icon: Calendar,
      label: "First Visit",
      value: analytics.totalVisits > 0 ? formatDate(analytics.firstVisit) : "—",
      sublabel: analytics.totalVisits > 0 ? undefined : "No visits yet",
      accent: "text-sky-600",
      bg: "bg-sky-50 dark:bg-sky-950/20",
    },
    {
      icon: TrendingUp,
      label: "Average Spend",
      value: analytics.averageSpend > 0 ? formatCurrency(analytics.averageSpend) : "—",
      sublabel: analytics.averageSpend > 0 ? "Per visit average" : undefined,
      accent: "text-emerald-600",
      bg: "bg-emerald-50 dark:bg-emerald-950/20",
    },
    {
      icon: Award,
      label: "Highest Bill",
      value: analytics.highestBill > 0 ? formatCurrency(analytics.highestBill) : "—",
      sublabel: analytics.highestBillInvoice ?? undefined,
      accent: "text-amber-600",
      bg: "bg-amber-50 dark:bg-amber-950/20",
    },
    {
      icon: Star,
      label: "Preferred Payment",
      value: analytics.preferredPaymentMethod,
      sublabel: undefined,
      accent: "text-purple-600",
      bg: "bg-purple-50 dark:bg-purple-950/20",
    },
    {
      icon: Zap,
      label: "Lifetime Value",
      value: formatCurrency(analytics.lifetimeValue),
      sublabel: `${analytics.totalVisits} visit${analytics.totalVisits !== 1 ? 's' : ''}`,
      accent: "text-rose-600",
      bg: "bg-rose-50 dark:bg-rose-950/20",
    },
  ]

  if (analytics.preferredTable) {
    insights.push({
      icon: MapPin,
      label: "Preferred Table",
      value: analytics.preferredTable,
      sublabel: undefined,
      accent: "text-indigo-600",
      bg: "bg-indigo-50 dark:bg-indigo-950/20",
    })
  }

  if (analytics.peakVisitTime) {
    insights.push({
      icon: Clock,
      label: "Peak Visit Time",
      value: analytics.peakVisitTime,
      sublabel: undefined,
      accent: "text-teal-600",
      bg: "bg-teal-50 dark:bg-teal-950/20",
    })
  }

  return (
    <div className="space-y-5">
      {/* Insight Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
        {insights.map((item, i) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04, duration: 0.25 }}
            className="relative overflow-hidden rounded-xl border border-border bg-card/50 p-3.5 transition-all duration-200 hover:shadow-sm"
          >
            <div className="flex items-start justify-between mb-2.5">
              <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg", item.bg)}>
                <item.icon className={cn("h-3.5 w-3.5", item.accent)} />
              </div>
            </div>
            <p className={cn("text-base font-bold leading-tight", item.accent)}>{item.value}</p>
            <p className="mt-0.5 text-[11px] font-medium text-muted-foreground truncate">{item.label}</p>
            {item.sublabel && (
              <p className="text-[10px] text-muted-foreground/60 mt-0.5 truncate">{item.sublabel}</p>
            )}
          </motion.div>
        ))}
      </div>

      {/* Favorite Items */}
      {analytics.favoriteItems.length > 0 && (
        <SectionCard title="Most Ordered Items" icon="Coffee" iconColor="text-amber-600">
          <div className="space-y-2">
            {analytics.favoriteItems.map((item, idx) => (
              <div
                key={item.name}
                className="flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg shrink-0 text-sm font-bold",
                    idx === 0 ? "bg-amber-50 text-amber-600 dark:bg-amber-950/20" :
                    idx === 1 ? "bg-slate-100 text-slate-500 dark:bg-slate-900/20" :
                    idx === 2 ? "bg-orange-50 text-orange-600 dark:bg-orange-950/20" :
                    "bg-muted text-muted-foreground"
                  )}>
                    {idx + 1}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Ordered {item.count} time{item.count > 1 ? 's' : ''}
                      <span className="mx-1.5">·</span>
                      {formatCurrency(item.total)} total
                    </p>
                  </div>
                </div>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, (item.count / Math.max(...analytics.favoriteItems.map(i => i.count))) * 100)}%` }}
                  transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 + idx * 0.1 }}
                  className="absolute bottom-0 left-0 h-0.5 rounded-full bg-primary/30"
                  style={{ maxWidth: "30%" }}
                />
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  )
}
