/**
 * ProfileHeader — Customer profile header with actions, avatar, KPI cards
 * Extracted from CustomerProfile.tsx for modularity.
 */

import { useState } from "react"
import { motion } from "framer-motion"
import {
  Phone, Mail, Calendar, Clock, Edit, Plus,
  CreditCard, TrendingUp, Wallet, ShoppingBag,
  CheckCircle2, X, Percent, Star,
} from "lucide-react"
import { cn, formatCurrency, formatNumber } from "@/lib/utils"
import type { CustomerVisit } from "@/components/customers/VisitHistory"
import type { Customer } from "@/lib/services/customer-service"

/* ─── Helpers ──────────────────────────────────────────────── */

function getInitials(name: string) {
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  const diff = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
  if (diff === 0) return "Today"
  if (diff === 1) return "Yesterday"
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function daysSince(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
}

/* ─── Sub-components ──────────────────────────────────────── */

function AnimatedAvatar({ name, size = "lg" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const initials = getInitials(name)
  const [isHovered, setIsHovered] = useState(false)
  const sizeMap = { sm: "h-9 w-9 text-xs", md: "h-12 w-12 text-sm", lg: "h-16 w-16 text-lg" }
  const ringMap = { sm: "ring-2", md: "ring-3", lg: "ring-4" }

  return (
    <div className="relative shrink-0" onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      <motion.div
        animate={isHovered ? { scale: 1.05 } : { scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 10 }}
        className={cn("flex items-center justify-center rounded-full bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 font-bold text-primary shadow-sm", sizeMap[size], ringMap[size], "ring-background")}
      >
        {initials}
      </motion.div>
      <motion.div
        animate={isHovered ? { scale: 1.2, opacity: 0.8 } : { scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 15 }}
        className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-success border-2 border-background"
      >
        <span className="h-2 w-2 rounded-full bg-success" />
      </motion.div>
    </div>
  )
}

function ActionButton({ icon, label, onClick, className }: {
  icon: React.ReactNode; label: string; onClick: () => void; className?: string
}) {
  return (
    <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className={cn("flex h-8 items-center gap-1.5 rounded-xl px-3 text-[11px] font-semibold transition-all whitespace-nowrap", className)}
    >
      {icon}<span className="hidden sm:inline">{label}</span>
    </motion.button>
  )
}

/* ─── Main Component ──────────────────────────────────────── */

interface ProfileHeaderProps {
  customer: Customer
  visits: CustomerVisit[]
  onClose: () => void
  onEdit: () => void
  onNewSale: () => void
  onRecordPayment: () => void
  sticky?: boolean
}

export function ProfileHeader({
  customer, visits, onClose, onEdit, onNewSale, onRecordPayment, sticky = false,
}: ProfileHeaderProps) {
  const initials = getInitials(customer.name)
  const days = daysSince(customer.lastVisit)
  const outstandingAmount = visits.reduce((s, v) => s + v.outstandingAmount, 0)
  const totalVisits = visits.length
  const totalSpent = visits.reduce((s, v) => s + v.total, 0)
  const totalPaid = visits.reduce((s, v) => s + v.paidAmount, 0)
  const avgSpend = totalVisits > 0 ? totalSpent / totalVisits : 0

  const gradientIndex = initials.charCodeAt(0) % 5
  const gradients = [
    "from-violet-500/10 via-fuchsia-500/5 to-transparent",
    "from-emerald-500/10 via-teal-500/5 to-transparent",
    "from-amber-500/10 via-orange-500/5 to-transparent",
    "from-sky-500/10 via-blue-500/5 to-transparent",
    "from-rose-500/10 via-pink-500/5 to-transparent",
  ]

  return (
    <div className={cn("relative overflow-hidden", sticky && "sticky top-0 z-20")}>
      <div className={cn("absolute inset-0 rounded-t-2xl bg-gradient-to-br pointer-events-none", gradients[gradientIndex])} />
      <div className="absolute inset-0 rounded-t-2xl bg-gradient-to-t from-background/60 via-transparent to-transparent pointer-events-none" />

      <div className="relative p-5 pb-4">
        {/* Top bar — sticky actions */}
        <div className="flex items-center justify-between mb-5">
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Close profile"
          >
            <X className="h-4 w-4" />
          </motion.button>

          <div className="flex items-center gap-1.5">
            <ActionButton icon={<Edit className="h-3.5 w-3.5" />} label="Edit" onClick={onEdit}
              className="text-muted-foreground hover:bg-muted hover:text-foreground" />
            <ActionButton icon={<Plus className="h-3.5 w-3.5" />} label="New Sale" onClick={onNewSale}
              className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm" />
            <ActionButton icon={<CreditCard className="h-3.5 w-3.5" />} label="Receive" onClick={onRecordPayment}
              className="bg-success/10 text-success hover:bg-success/20 border border-success/20" />
          </div>
        </div>

        {/* Avatar + Info */}
        <div className="flex items-center gap-4">
          <AnimatedAvatar name={customer.name} size="lg" />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-foreground truncate leading-tight">{customer.name}</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {customer.phone && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-muted/70 px-2 py-1 text-[11px] font-medium text-muted-foreground">
                  <Phone className="h-3 w-3" /> {customer.phone}
                </span>
              )}
              {customer.email && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-muted/70 px-2 py-1 text-[11px] font-medium text-muted-foreground">
                  <Mail className="h-3 w-3" /> {customer.email}
                </span>
              )}
            </div>
            <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Customer since <span className="font-medium text-foreground">{formatDate(customer.lastVisit)}</span>
              </span>
              <span className="text-muted-foreground/40 hidden xs:inline">|</span>
              <span className={cn("inline-flex items-center gap-1", days <= 1 && "text-success")}>
                <Clock className="h-3 w-3" />
                Last visit: <span className={cn("font-medium", days <= 1 ? "text-success" : "text-foreground")}>
                  {days === 0 ? "Today" : formatDate(customer.lastVisit)}
                </span>
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold text-primary">
                <Star className="h-3 w-3" /> {totalVisits} visit{totalVisits !== 1 ? 's' : ''}
              </span>
              {outstandingAmount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-950/20 px-2.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                  <Wallet className="h-3 w-3" /> {formatCurrency(outstandingAmount)} due
                </span>
              )}
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
          {[
            { label: "Visits", value: formatNumber(totalVisits), icon: ShoppingBag, accent: "text-primary", bg: "bg-primary/10" },
            { label: "Total Spent", value: formatCurrency(totalSpent), icon: TrendingUp, accent: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/20" },
            { label: "Total Paid", value: formatCurrency(totalPaid), icon: CheckCircle2, accent: "text-success", bg: "bg-success/10" },
            { label: "Avg. / Visit", value: totalVisits > 0 ? formatCurrency(Math.round(avgSpend)) : "—", icon: Percent, accent: "text-sky-600", bg: "bg-sky-50 dark:bg-sky-950/20" },
          ].map((kpi, i) => (
            <motion.div key={kpi.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.3 }} whileHover={{ y: -2 }}
              className="relative overflow-hidden rounded-xl border border-border bg-card/50 p-3 transition-all hover:shadow-sm hover:border-foreground/15">
              <div className="flex items-center justify-between mb-2">
                <div className={cn("flex h-6 w-6 items-center justify-center rounded-lg", kpi.bg)}>
                  <kpi.icon className={cn("h-3.5 w-3.5", kpi.accent)} />
                </div>
              </div>
              <p className={cn("text-sm font-bold leading-tight", kpi.accent)}>{kpi.value}</p>
              <p className="mt-0.5 text-[10px] font-medium text-muted-foreground truncate">{kpi.label}</p>
            </motion.div>
          ))}
        </div>

        {/* Outstanding balance bar */}
        {outstandingAmount > 0 && (
          <div className="mt-3 flex items-center justify-between rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 px-3.5 py-2.5">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">Outstanding Balance</span>
            </div>
            <span className="text-sm font-bold text-amber-700 dark:text-amber-400 tabular-nums">{formatCurrency(outstandingAmount)}</span>
          </div>
        )}
      </div>
    </div>
  )
}
