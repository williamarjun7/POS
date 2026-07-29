/**
 * CustomerTimeline — Chronological Customer Activity Timeline
 * ───────────────────────────────────────────────────────────
 *
 * Displays a chronological feed of everything that has happened
 * with this customer: creation, orders, invoices, payments, etc.
 *
 * Each entry links back to the related visit where applicable.
 */

import { useMemo } from "react"
import { motion } from "framer-motion"
import {
  UserPlus, FileText, CreditCard, ShoppingBag,
  Wallet, RotateCcw, Receipt, CalendarCheck,
  Activity, Loader2, CheckCircle2,
} from "lucide-react"
import { cn, formatCurrency } from "@/lib/utils"
import { EmptyState } from "@/components/EmptyState"
import type { CustomerVisit } from "./VisitHistory"

/* ─── Types ────────────────────────────────────────────────── */

export interface TimelineEvent {
  id: string
  type: "customer_created" | "invoice_generated" | "bill_printed" | "credit_sale" | "partial_payment" | "full_payment" | "credit_settlement" | "refund" | "room_booking"
  description: string
  amount?: number
  date: string
  visitId?: string
  invoiceNumber?: string
}

/* ─── Build timeline events from raw data ─────────────────── */

export function buildTimelineEvents(
  customerCreatedAt: string,
  visits: CustomerVisit[],
): TimelineEvent[] {
  const events: TimelineEvent[] = []

  // Customer created
  events.push({
    id: "customer-created",
    type: "customer_created",
    description: "Customer Created",
    date: customerCreatedAt,
  })

  for (const visit of visits) {
    // Invoice generated
    events.push({
      id: `invoice-${visit.id}`,
      type: "invoice_generated",
      description: `Invoice Generated — ${visit.invoiceNumber}`,
      amount: visit.total,
      date: visit.date,
      visitId: visit.id,
      invoiceNumber: visit.invoiceNumber,
    })

    // Credit sale vs payment
    if (visit.outstandingAmount > 0 && visit.paidAmount === 0) {
      events.push({
        id: `credit-${visit.id}`,
        type: "credit_sale",
        description: `Credit Sale — ${visit.invoiceNumber}`,
        amount: visit.total,
        date: visit.date,
        visitId: visit.id,
        invoiceNumber: visit.invoiceNumber,
      })
    } else if (visit.outstandingAmount > 0 && visit.paidAmount > 0) {
      events.push({
        id: `partial-${visit.id}`,
        type: "partial_payment",
        description: `Partial Payment — ${visit.invoiceNumber}`,
        amount: visit.paidAmount,
        date: visit.date,
        visitId: visit.id,
        invoiceNumber: visit.invoiceNumber,
      })
    } else if (visit.paidAmount >= visit.total) {
      events.push({
        id: `paid-${visit.id}`,
        type: "full_payment",
        description: `Full Payment — ${visit.invoiceNumber}`,
        amount: visit.paidAmount,
        date: visit.date,
        visitId: visit.id,
        invoiceNumber: visit.invoiceNumber,
      })
    }

    // Payment method details
    for (const pm of visit.paymentMethods) {
      if (pm.method === 'credit') continue
      events.push({
        id: `pay-${visit.id}-${pm.method}`,
        type: pm.amount >= visit.total ? "full_payment" : "partial_payment",
        description: `Payment via ${pm.method} — ${visit.invoiceNumber}`,
        amount: pm.amount,
        date: visit.date,
        visitId: visit.id,
        invoiceNumber: visit.invoiceNumber,
      })
    }
  }

  // Sort chronologically (oldest first)
  events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  return events
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

/* ─── Event Icon Config ───────────────────────────────────── */

const eventIconConfig: Record<TimelineEvent["type"], { icon: React.ComponentType<{ className?: string }>; bg: string; color: string }> = {
  customer_created: { icon: UserPlus, bg: "bg-primary/10", color: "text-primary" },
  invoice_generated: { icon: FileText, bg: "bg-blue-50 dark:bg-blue-950/20", color: "text-blue-600 dark:text-blue-400" },
  bill_printed: { icon: Receipt, bg: "bg-purple-50 dark:bg-purple-950/20", color: "text-purple-600 dark:text-purple-400" },
  credit_sale: { icon: Wallet, bg: "bg-amber-50 dark:bg-amber-950/20", color: "text-amber-600 dark:text-amber-400" },
  partial_payment: { icon: CreditCard, bg: "bg-sky-50 dark:bg-sky-950/20", color: "text-sky-600 dark:text-sky-400" },
  full_payment: { icon: CheckCircle2, bg: "bg-emerald-50 dark:bg-emerald-950/20", color: "text-emerald-600" },
  credit_settlement: { icon: RotateCcw, bg: "bg-teal-50 dark:bg-teal-950/20", color: "text-teal-600" },
  refund: { icon: RotateCcw, bg: "bg-rose-50 dark:bg-rose-950/20", color: "text-rose-600" },
  room_booking: { icon: CalendarCheck, bg: "bg-indigo-50 dark:bg-indigo-950/20", color: "text-indigo-600" },
}

/* ─── Timeline Entry ──────────────────────────────────────── */

function TimelineEntry({ event, isLast }: { event: TimelineEvent; isLast: boolean }) {
  const config = eventIconConfig[event.type]
  const Icon = config.icon

  return (
    <div className="relative flex gap-3 pb-4 last:pb-0">
      {/* Connector line */}
      {!isLast && (
        <div className="absolute left-[15px] top-8 bottom-0 w-px bg-border" />
      )}

      {/* Icon */}
      <div className={cn(
        "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
        config.bg
      )}>
        <Icon className={cn("h-4 w-4", config.color)} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{event.description}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {formatDate(event.date)} · {formatTime(event.date)}
            </p>
          </div>
          {event.amount !== undefined && (
            <span className={cn(
              "text-sm font-semibold shrink-0 whitespace-nowrap tabular-nums",
              event.type === "full_payment" || event.type === "partial_payment" ? "text-emerald-600" :
              event.type === "credit_sale" ? "text-amber-600" :
              "text-foreground"
            )}>
              {formatCurrency(event.amount)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── Main Component ──────────────────────────────────────── */

interface CustomerTimelineProps {
  events: TimelineEvent[]
  loading?: boolean
}

export function CustomerTimeline({ events, loading = false }: CustomerTimelineProps) {
  // Display most recent first, oldest last
  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [events])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (sortedEvents.length === 0) {
    return (
      <EmptyState
        icon="Activity"
        title="No activity yet"
        description="Customer activity will appear here over time."
      />
    )
  }

  return (
    <div className="px-1">
      {sortedEvents.map((event, idx) => (
        <motion.div
          key={event.id}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: idx * 0.02, duration: 0.2 }}
        >
          <TimelineEntry
            event={event}
            isLast={idx === sortedEvents.length - 1}
          />
        </motion.div>
      ))}
    </div>
  )
}


