/**
 * CustomerProfile — Redesigned Customer Profile Panel
 * ──────────────────────────────────────────────────
 *
 * A comprehensive 360° customer workspace with tabs for:
 *   Overview | Orders | Invoices | Payments | Ledger
 *
 * Designed for both Restaurant and Motel operations.
 */

import { useState, useMemo, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Phone, Mail, MapPin, Calendar, Clock, Edit, Plus,
  CreditCard, TrendingUp, Wallet, ShoppingBag, Star,
  FileText, ArrowUpRight, ArrowDownRight,
  AlertTriangle, CheckCircle2,
  ChevronRight, Loader2, UtensilsCrossed,
  Activity, Coffee, RotateCcw,
} from "lucide-react"
import { cn, formatCurrency, formatNumber } from "@/lib/utils"
import { StatusBadge } from "@/components/StatusBadge"
import { Card, SectionCard } from "@/components/ui/card"
import { EmptyState } from "@/components/EmptyState"
import { Tabs, type Tab } from "@/components/Tabs"
import { Button } from "@/components/ui/button"
import { PaymentMethodBadge } from "@/components/PaymentMethodBadge"
import { insforge } from "@/lib/services/auth-service"
import type { Customer } from "@/lib/services/customer-service"
import type { InvoiceRow, PaymentRow, OrderBatchRow, OrderBatchItemRow } from "@/lib/db/types"
import { getPaymentMethodLabel } from "@/lib/payment-methods"

/* ─── Types ────────────────────────────────────────────────── */

interface CustomerOrder {
  id: string
  orderNumber: string
  date: string
  tableRoom?: string
  itemsCount: number
  grandTotal: number
  payStatus: string
  status: string
  items: CustomerOrderItem[]
  discount: number
  paidAmount: number
  customerName?: string
}

interface CustomerOrderItem {
  name: string
  quantity: number
  unitPrice: number
  notes: string
  status: string
}

interface CustomerInvoice {
  id: string
  invoiceNumber: string
  date: string
  amount: number
  paid: number
  remaining: number
  status: string
  paymentMethod: string
}

interface CustomerPayment {
  id: string
  date: string
  method: string
  amount: number
  reference: string
  relatedInvoice: string
  status: string
  notes?: string
}

interface LedgerEntry {
  id: string
  date: string
  description: string
  debit: number
  credit: number
  runningBalance: number
  type: 'invoice' | 'payment' | 'adjustment' | 'refund'
}

interface RecentActivity {
  id: string
  type: 'purchase' | 'payment' | 'credit' | 'invoice'
  description: string
  amount: number
  date: string
}

/* ─── Helpers ──────────────────────────────────────────────── */

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
}

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

function daysSince(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
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

/* ─── Data Fetching Hook ───────────────────────────────────── */

interface CustomerProfileData {
  orders: CustomerOrder[]
  invoices: CustomerInvoice[]
  payments: CustomerPayment[]
  ledger: LedgerEntry[]
  loading: boolean
  error: string | null
}

function useCustomerProfileData(customer: Customer | null, refreshKey: number = 0): CustomerProfileData {
  const [orders, setOrders] = useState<CustomerOrder[]>([])
  const [invoices, setInvoices] = useState<CustomerInvoice[]>([])
  const [payments, setPayments] = useState<CustomerPayment[]>([])
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!customer) {
      setOrders([])
      setInvoices([])
      setPayments([])
      setLedger([])
      return
    }

    setLoading(true)
    setError(null)

    try {
      const customerName = customer.name
      const customerId = customer.id

      // Fetch all raw data in parallel
      const [
        ordersResult,
        invoicesResult,
      ] = await Promise.all([
        insforge.database
          .from('order_batches')
          .select('*, order_batch_items(*), restaurant_tables!left(table_number)')
          .eq('customer_name', customerName)
          .order('created_at', { ascending: false })
          .limit(200),

        insforge.database
          .from('invoices')
          .select('*')
          .eq('customer_name', customerName)
          .order('created_at', { ascending: false })
          .limit(200),
      ])

      // ── Payments: match by customer_id OR by invoice_id (for older records) ──
      // Extract invoice IDs from the invoices result (avoids an extra query)
      const customerInvoiceIds = (invoicesResult.data ?? []).map((inv: any) => inv.id)
      // Build an OR filter: customer_id matches OR invoice_id is in the customer's invoices
      const paymentFilters = [`customer_id.eq.${customerId}`]
      if (customerInvoiceIds.length > 0) {
        paymentFilters.push(`invoice_id.in.(${customerInvoiceIds.join(',')})`)
      }
      const paymentsResponse = await insforge.database
        .from('payments')
        .select('*')
        .or(paymentFilters.join(','))
        .order('created_at', { ascending: false })
        .limit(200)

      // ── Process Payments (FIRST — needed by invoice processing) ──
      const paymentsData = (paymentsResponse as { data: PaymentRow[] | null }).data ?? []
      const paymentRows = paymentsData as PaymentRow[]
      const paidByInvoice = new Map<string, number>()
      for (const p of paymentRows) {
        if (p.invoice_id) {
          paidByInvoice.set(p.invoice_id, (paidByInvoice.get(p.invoice_id) ?? 0) + Number(p.amount))
        }
      }

      const mappedPayments: CustomerPayment[] = paymentRows.map(p => ({
        id: p.id,
        date: p.created_at,
        method: p.payment_method,
        amount: Number(p.amount),
        reference: p.reference ?? '',
        relatedInvoice: p.invoice_id ? `INV-${p.invoice_id.slice(0, 8).toUpperCase()}` : '-',
        status: 'completed',
        notes: p.notes ?? undefined,
      }))
      setPayments(mappedPayments)

      // ── Process Invoices ──
      const invoiceRows = (invoicesResult.data ?? []) as InvoiceRow[]
      const mappedInvoices: CustomerInvoice[] = invoiceRows.map(inv => {
        const invPaid = paidByInvoice.get(inv.id) ?? 0
        return {
          id: inv.id,
          invoiceNumber: inv.invoice_number,
          date: inv.created_at,
          amount: Number(inv.total),
          paid: inv.status === 'paid' || invPaid >= Number(inv.total) ? Number(inv.total) : invPaid,
          remaining: Math.max(0, Number(inv.total) - invPaid),
          status: inv.status,
          paymentMethod: inv.payment_method ?? 'cash',
        }
      })
      setInvoices(mappedInvoices)

      // ── Process Orders ──
      type BatchWithJoin = OrderBatchRow & {
        order_batch_items?: OrderBatchItemRow[]
        restaurant_tables?: { table_number: string } | null
      }
      const batchRows = (ordersResult.data ?? []) as BatchWithJoin[]
      const mappedOrders: CustomerOrder[] = batchRows.map(batch => {
        const items = (batch.order_batch_items ?? []).map(item => ({
          name: item.name,
          quantity: item.quantity,
          unitPrice: Number(item.unit_price),
          notes: item.notes,
          status: item.status,
        }))
        const tableLabel = batch.restaurant_tables?.table_number
          ? `Table ${batch.restaurant_tables.table_number}`
          : batch.room_id
            ? `Room ${batch.room_id.slice(0, 8).toUpperCase()}`
            : undefined
        return {
          id: batch.id,
          orderNumber: `ORD-${batch.id.slice(0, 8).toUpperCase()}`,
          date: batch.created_at,
          tableRoom: tableLabel,
          itemsCount: items.length,
          grandTotal: Number(batch.subtotal),
          payStatus: batch.status === 'paid' ? 'paid' : batch.status === 'partial' ? 'partial' : 'unpaid',
          status: batch.status,
          items,
          discount: Number(batch.discount),
          paidAmount: Number(batch.paid_amount),
          customerName: batch.customer_name ?? undefined,
        }
      })
      setOrders(mappedOrders)

      // ── Build Ledger (credit is NOT payment — exclude it) ──
      const ledgerEntries: LedgerEntry[] = []

      for (const inv of invoiceRows) {
        const isCreditInvoice = inv.status === 'credit_invoice'
        ledgerEntries.push({
          id: `inv-${inv.id}`,
          date: inv.created_at,
          description: isCreditInvoice
            ? `Credit Sale — Invoice ${inv.invoice_number}`
            : `Invoice ${inv.invoice_number}`,
          debit: Number(inv.total),
          credit: 0,
          runningBalance: 0,
          type: 'invoice',
        })
      }

      // Only real payments (credit method = old-style financing, NOT money received)
      for (const p of paymentRows) {
        if (p.payment_method === 'credit') continue
        ledgerEntries.push({
          id: `pay-${p.id}`,
          date: p.created_at,
          description: p.notes ?? `Payment via ${getPaymentMethodLabel(p.payment_method)}`,
          debit: 0,
          credit: Number(p.amount),
          runningBalance: 0,
          type: 'payment',
        })
      }

      ledgerEntries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

      let balance = 0
      for (const entry of ledgerEntries) {
        balance += entry.debit - entry.credit
        entry.runningBalance = balance
      }

      ledgerEntries.reverse()
      setLedger(ledgerEntries)

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load customer data'
      setError(msg)
      if (import.meta.env.DEV) console.error('[CustomerProfile] fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [customer, refreshKey])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return { orders, invoices, payments, ledger, loading, error }
}

/* ─── Paginated Section Wrapper ────────────────────────────── */

function usePaginatedDisplay<T>(items: T[], pageSize: number = 20) {
  const [showAll, setShowAll] = useState(false)
  const displayed = showAll ? items : items.slice(0, pageSize)
  const hasMore = items.length > pageSize
  const toggle = () => setShowAll(prev => !prev)
  return { displayed, hasMore, showAll, toggle }
}

/* ─── Header Component ─────────────────────────────────────── */

function ProfileHeader({
  customer,
  onClose,
  onEdit,
  onNewSale,
  onRecordPayment,
}: {
  customer: Customer
  onClose: () => void
  onEdit: () => void
  onNewSale: () => void
  onRecordPayment: () => void
}) {
  const initials = getInitials(customer.name)
  const days = daysSince(customer.lastVisit)

  return (
    <div className="relative">
      <div className="absolute inset-0 rounded-t-2xl bg-gradient-to-br from-primary/5 via-primary/[0.02] to-transparent pointer-events-none" />

      <div className="relative p-5 pb-4">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Close profile"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-1.5">
            <button
              onClick={onEdit}
              className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Edit className="h-3.5 w-3.5" /> Edit
            </button>
            <button
              onClick={onNewSale}
              className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Sale
            </button>
            <button
              onClick={onRecordPayment}
              className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium bg-success/10 text-success hover:bg-success/20 transition-colors"
            >
              <CreditCard className="h-3.5 w-3.5" /> Pay
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-xl font-bold text-primary shadow-sm ring-4 ring-background">
              {initials}
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-success border-2 border-background">
              <span className="h-2 w-2 rounded-full bg-success" />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-foreground truncate">{customer.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              {customer.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3 w-3" /> {customer.phone}
                </span>
              )}
              {customer.email && (
                <span className="flex items-center gap-1">
                  <Mail className="h-3 w-3" /> {customer.email}
                </span>
              )}
              {customer.address && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {customer.address}
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Customer since {formatDate(customer.lastVisit)}
              </span>
              <span className={cn(
                "flex items-center gap-1",
                days <= 1 ? "text-success" : "text-muted-foreground"
              )}>
                <Clock className="h-3 w-3" /> Last visit: {formatDate(customer.lastVisit)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── KPI Summary Cards ────────────────────────────────────── */

interface KpiCardsProps {
  totalOrders: number
  totalSpent: number
  outstandingCredit: number
  avgOrderValue: number
  loyaltyPoints: number
  lastVisit: string
}

function KpiCards({ totalOrders, totalSpent, outstandingCredit, avgOrderValue, loyaltyPoints, lastVisit }: KpiCardsProps) {
  const kpis = useMemo(() => [
    {
      label: "Total Orders",
      value: formatNumber(totalOrders),
      icon: ShoppingBag,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "Total Spent",
      value: formatCurrency(totalSpent),
      icon: TrendingUp,
      color: "text-success",
      bg: "bg-success/10",
    },
    {
      label: "Outstanding Credit",
      value: formatCurrency(outstandingCredit),
      icon: Wallet,
      color: outstandingCredit > 0 ? "text-destructive" : "text-muted-foreground",
      bg: outstandingCredit > 0 ? "bg-destructive/10" : "bg-muted",
    },
    {
      label: "Avg. Order Value",
      value: totalOrders > 0 ? formatCurrency(avgOrderValue) : "—",
      icon: TrendingUp,
      color: "text-info",
      bg: "bg-primary/10",
    },
    {
      label: "Loyalty Points",
      value: formatNumber(loyaltyPoints),
      icon: Star,
      color: loyaltyPoints > 0 ? "text-warning" : "text-muted-foreground",
      bg: loyaltyPoints > 0 ? "bg-warning/10" : "bg-muted",
    },
    {
      label: "Last Visit",
      value: formatDate(lastVisit),
      icon: Clock,
      color: "text-muted-foreground",
      bg: "bg-muted",
    },
  ], [totalOrders, totalSpent, outstandingCredit, avgOrderValue, loyaltyPoints, lastVisit])

  return (
    <div className="px-5 pb-3">
      <div className="grid grid-cols-3 gap-2">
        {kpis.map((kpi, i) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04, duration: 0.25 }}
            className="rounded-xl border border-border bg-card/50 p-3 hover:bg-card/80 transition-colors"
          >
            <div className="flex items-center gap-2 mb-1.5">
              <div className={cn("flex h-6 w-6 items-center justify-center rounded-lg", kpi.bg)}>
                <kpi.icon className={cn("h-3.5 w-3.5", kpi.color)} />
              </div>
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider truncate">
                {kpi.label}
              </span>
            </div>
            <p className={cn("text-sm font-bold", kpi.color)}>{kpi.value}</p>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   TAB: OVERVIEW
   ══════════════════════════════════════════════════════════════ */

function OverviewTab({
  orders,
  invoices,
  payments,
  loading,
  outstandingCredit,
}: {
  orders: CustomerOrder[]
  invoices: CustomerInvoice[]
  payments: CustomerPayment[]
  loading: boolean
  outstandingCredit: number
}) {
  const recentActivity = useMemo<RecentActivity[]>(() => {
    const activities: RecentActivity[] = []
    for (const order of orders.slice(0, 5)) {
      activities.push({
        id: `order-${order.id}`,
        type: 'purchase' as const,
        description: `Purchased ${order.itemsCount} item(s)`,
        amount: order.grandTotal,
        date: order.date,
      })
    }
    for (const inv of invoices.slice(0, 5)) {
      activities.push({
        id: `inv-${inv.id}`,
        type: 'invoice' as const,
        description: inv.status === 'credit_invoice'
          ? `Credit Sale — Invoice ${inv.invoiceNumber}`
          : `Invoice ${inv.invoiceNumber}`,
        amount: inv.amount,
        date: inv.date,
      })
    }
    // Only real payments in activity (credit is NOT payment)
    const realPayments = payments.filter(p => p.method !== 'credit')
    for (const p of realPayments.slice(0, 5)) {
      activities.push({
        id: `pay-${p.id}`,
        type: 'payment' as const,
        description: `Payment received — ${getPaymentMethodLabel(p.method)}`,
        amount: p.amount,
        date: p.date,
      })
    }
    activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    return activities.slice(0, 10)
  }, [orders, invoices, payments])

  const favoriteItems = useMemo(() => {
    const itemCounts = new Map<string, { count: number; total: number }>()
    for (const order of orders) {
      for (const item of order.items) {
        const current = itemCounts.get(item.name) ?? { count: 0, total: 0 }
        current.count += item.quantity
        current.total += item.unitPrice * item.quantity
        itemCounts.set(item.name, current)
      }
    }
    return Array.from(itemCounts.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
  }, [orders])

  const paymentBreakdown = useMemo(() => {
    const methodTotals = new Map<string, number>()
    // Only count REAL money methods (credit is NOT payment)
    const realPayments = payments.filter(p => p.method !== 'credit')
    for (const p of realPayments) {
      const key = getPaymentMethodLabel(p.method)
      methodTotals.set(key, (methodTotals.get(key) ?? 0) + p.amount)
    }
    // Also count paid invoice amounts by their real payment method
    for (const inv of invoices.filter(i => i.status === 'paid' && i.paymentMethod !== 'credit')) {
      const key = getPaymentMethodLabel(inv.paymentMethod)
      methodTotals.set(key, (methodTotals.get(key) ?? 0) + inv.amount)
    }
    return Array.from(methodTotals.entries()).sort((a, b) => b[1] - a[1])
  }, [payments, invoices])

  const totalPayments = paymentBreakdown.reduce((s, [, v]) => s + v, 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4 p-5 pt-3">
      <SectionCard title="Recent Activity" icon="Activity" iconColor="text-primary">
        {recentActivity.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">No recent activity</p>
        ) : (
          <div className="space-y-2">
            {recentActivity.slice(0, 6).map((activity) => (
              <div
                key={activity.id}
                className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/50 transition-colors"
              >
                <div className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-lg shrink-0",
                  activity.type === 'purchase' ? "bg-primary/10" :
                  activity.type === 'payment' ? "bg-success/10" :
                  activity.type === 'invoice' ? "bg-warning/10" : "bg-muted"
                )}>
                  {activity.type === 'purchase' ? <ShoppingBag className="h-3.5 w-3.5 text-primary" /> :
                   activity.type === 'payment' ? <CreditCard className="h-3.5 w-3.5 text-success" /> :
                   activity.type === 'invoice' ? <FileText className="h-3.5 w-3.5 text-warning" /> :
                   <Activity className="h-3.5 w-3.5 text-muted-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">{activity.description}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(activity.date)} • {formatTime(activity.date)}</p>
                </div>
                <span className={cn(
                  "text-sm font-semibold shrink-0",
                  activity.type === 'payment' ? "text-success" : "text-foreground"
                )}>
                  {activity.type === 'payment' ? '+' : ''}{formatCurrency(activity.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Recent Orders" icon="ShoppingBag" iconColor="text-primary">
        {orders.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">No orders yet.</p>
        ) : (
          <div className="space-y-2">
            {orders.slice(0, 5).map((order) => (
              <div
                key={order.id}
                className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted shrink-0">
                    <UtensilsCrossed className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{order.orderNumber}</p>
                    <p className="text-xs text-muted-foreground">{order.itemsCount} item(s) • {formatDate(order.date)}</p>
                  </div>
                </div>
                <span className="text-sm font-semibold text-foreground shrink-0 ml-2">
                  {formatCurrency(order.grandTotal)}
                </span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {favoriteItems.length > 0 && (
        <SectionCard title="Most Ordered Items" icon="Star" iconColor="text-warning">
          <div className="space-y-2">
            {favoriteItems.map(([name, data]) => (
              <div
                key={name}
                className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-warning/10 shrink-0">
                    <Coffee className="h-3.5 w-3.5 text-warning" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{name}</p>
                    <p className="text-xs text-muted-foreground">Ordered {data.count} time{data.count > 1 ? 's' : ''}</p>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatCurrency(data.total)}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {paymentBreakdown.length > 0 && (
        <SectionCard title="Payment Breakdown" icon="PieChart" iconColor="text-info">
          <div className="space-y-2">
            {paymentBreakdown.map(([method, amount]) => {
              const pct = totalPayments > 0 ? (amount / totalPayments) * 100 : 0
              return (
                <div key={method} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-foreground">{method}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{formatCurrency(amount)}</span>
                      <span className="text-xs text-muted-foreground w-10 text-right">{pct.toFixed(0)}%</span>
                    </div>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                      className={cn(
                        "h-full rounded-full",
                        method.includes("Cash") ? "bg-success" :
                        method.includes("FonePay") ? "bg-blue-500" :
                        method.includes("QR") ? "bg-sky-500" :
                        method.includes("Credit") ? "bg-purple-500" : "bg-muted-foreground"
                      )}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </SectionCard>
      )}

      {outstandingCredit > 0 && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span className="text-sm font-semibold text-foreground">Outstanding Credit</span>
            </div>
            <span className="text-lg font-bold text-destructive">{formatCurrency(outstandingCredit)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {invoices.filter(i => i.status !== 'paid' && i.status !== 'cancelled').length} unpaid invoice(s)
          </p>
          {orders.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Last order: {formatDate(orders[0].date)}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   TAB: ORDERS
   ══════════════════════════════════════════════════════════════ */

function OrdersTab({
  orders,
  loading,
}: {
  orders: CustomerOrder[]
  loading: boolean
}) {
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null)
  const { displayed, hasMore, showAll, toggle } = usePaginatedDisplay(orders, 15)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (orders.length === 0) {
    return (
      <EmptyState
        icon="ShoppingBag"
        title="No orders yet"
        description="This customer hasn't placed any orders yet."
      />
    )
  }

  return (
    <div className="p-5 pt-3">
      <div className="space-y-2">
        <div className="hidden md:grid md:grid-cols-[1fr_120px_80px_100px_100px_100px] gap-2 px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          <span>Order</span>
          <span>Date</span>
          <span>Items</span>
          <span>Total</span>
          <span>Pay Status</span>
          <span>Status</span>
        </div>

        {displayed.map((order, i) => (
          <motion.div
            key={order.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
          >
            <button
              onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
              className="w-full text-left rounded-xl border border-border bg-card/50 hover:bg-card/80 hover:border-foreground/20 transition-all"
            >
              <div className="grid grid-cols-1 md:grid-cols-[1fr_120px_80px_100px_100px_100px] gap-2 px-4 py-3 items-center">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-lg shrink-0 transition-transform",
                    expandedOrder === order.id && "rotate-90"
                  )}>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{order.orderNumber}</p>
                    {order.tableRoom && (
                      <p className="text-xs text-muted-foreground">{order.tableRoom}</p>
                    )}
                  </div>
                </div>
                <span className="text-sm text-muted-foreground hidden md:block">{formatDate(order.date)}</span>
                <span className="text-sm text-muted-foreground hidden md:block">{order.itemsCount}</span>
                <span className="text-sm font-semibold text-foreground hidden md:block">{formatCurrency(order.grandTotal)}</span>
                <span className="hidden md:block">
                  <StatusBadge
                    label={order.payStatus === 'paid' ? 'Paid' : order.payStatus === 'partial' ? 'Partial' : 'Unpaid'}
                    variant={order.payStatus === 'paid' ? 'success' : order.payStatus === 'partial' ? 'info' : 'warning'}
                  />
                </span>
                <span className="hidden md:block">
                  <StatusBadge label={order.status} variant={statusVariant(order.status)} />
                </span>

                <div className="flex items-center justify-between md:hidden pt-1 border-t border-border/50">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{formatDate(order.date)}</span>
                    <span className="text-xs text-muted-foreground">•</span>
                    <span className="text-xs text-muted-foreground">{order.itemsCount} item(s)</span>
                  </div>
                  <span className="text-sm font-semibold text-foreground">{formatCurrency(order.grandTotal)}</span>
                </div>
              </div>

              <AnimatePresence>
                {expandedOrder === order.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-border px-4 py-3 space-y-3">
                      {order.items.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Items</p>
                          <div className="space-y-1">
                            {order.items.map((item, idx) => (
                              <div key={idx} className="flex items-center justify-between text-sm py-1">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-muted-foreground w-6 text-right shrink-0">×{item.quantity}</span>
                                  <span className="text-foreground truncate">{item.name}</span>
                                  {item.notes && (
                                    <span className="text-xs text-muted-foreground truncate">({item.notes})</span>
                                  )}
                                </div>
                                <span className="font-medium text-foreground shrink-0 ml-2">
                                  {formatCurrency(item.unitPrice * item.quantity)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="border-t border-border pt-2 space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Subtotal</span>
                          <span className="text-foreground">{formatCurrency(order.grandTotal)}</span>
                        </div>
                        {order.discount > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Discount</span>
                            <span className="text-destructive">-{formatCurrency(order.discount)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-sm font-semibold border-t border-border pt-1">
                          <span className="text-foreground">Grand Total</span>
                          <span className="text-foreground">{formatCurrency(order.grandTotal - order.discount)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Paid</span>
                          <span className="text-success">{formatCurrency(order.paidAmount)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Status</span>
                          <StatusBadge label={order.status} variant={statusVariant(order.status)} />
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>Order ID: {order.id}</span>
                        <span>Date: {formatDate(order.date)}</span>
                        <span>Time: {formatTime(order.date)}</span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </button>
          </motion.div>
        ))}
      </div>

      {hasMore && (
        <div className="flex justify-center mt-4">
          <button
            onClick={toggle}
            className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            {showAll ? "Show less" : `Show all ${orders.length} orders`}
          </button>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   TAB: INVOICES
   ══════════════════════════════════════════════════════════════ */

function InvoicesTab({
  invoices,
  loading,
}: {
  invoices: CustomerInvoice[]
  loading: boolean
}) {
  const { displayed, hasMore, showAll, toggle } = usePaginatedDisplay(invoices, 15)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (invoices.length === 0) {
    return (
      <EmptyState
        icon="Receipt"
        title="No invoices found"
        description="This customer has no invoices yet."
      />
    )
  }

  return (
    <div className="p-5 pt-3">
      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Invoice</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Date</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Amount</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Paid</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Remaining</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((inv, i) => (
              <motion.tr
                key={inv.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02 }}
                className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
              >
                <td className="px-4 py-3 font-medium text-foreground">{inv.invoiceNumber}</td>
                <td className="px-4 py-3 text-muted-foreground">{formatDate(inv.date)}</td>
                <td className="px-4 py-3 text-right font-medium text-foreground">{formatCurrency(inv.amount)}</td>
                <td className="px-4 py-3 text-right text-success">{formatCurrency(inv.paid)}</td>
                <td className={cn(
                  "px-4 py-3 text-right font-medium",
                  inv.remaining > 0 ? "text-destructive" : "text-muted-foreground"
                )}>
                  {inv.remaining > 0 ? formatCurrency(inv.remaining) : "—"}
                </td>
                <td className="px-4 py-3 text-center">
                  <StatusBadge label={inv.status.replace('_', ' ')} variant={statusVariant(inv.status)} />
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="flex justify-center mt-4">
          <button
            onClick={toggle}
            className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            {showAll ? "Show less" : `Show all ${invoices.length} invoices`}
          </button>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   TAB: PAYMENTS
   ══════════════════════════════════════════════════════════════ */

function PaymentsTab({
  payments,
  loading,
}: {
  payments: CustomerPayment[]
  loading: boolean
}) {
  // Filter out credit — credit is NOT payment
  const realPayments = useMemo(() => payments.filter(p => p.method !== 'credit'), [payments])
  const { displayed, hasMore, showAll, toggle } = usePaginatedDisplay(realPayments, 15)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (realPayments.length === 0) {
    return (
      <EmptyState
        icon="CreditCard"
        title="No payments recorded"
        description="This customer hasn't made any payments yet."
      />
    )
  }

  return (
    <div className="p-5 pt-3">
      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Method</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Amount</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Reference</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Invoice</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((p, i) => (
              <motion.tr
                key={p.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02 }}
                className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
              >
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                  <span className="text-foreground">{formatDate(p.date)}</span>
                  <br />
                  <span className="text-xs">{formatTime(p.date)}</span>
                </td>
                <td className="px-4 py-3">
                  <PaymentMethodBadge method={p.method as import('@/types').PaymentMethod} size="sm" showIcon={false} />
                </td>
                <td className="px-4 py-3 text-right font-semibold text-success">{formatCurrency(p.amount)}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {p.reference || "—"}
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {p.relatedInvoice}
                </td>
                <td className="px-4 py-3 text-center">
                  <StatusBadge label="completed" variant="success" />
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="flex justify-center mt-4">
          <button
            onClick={toggle}
            className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            {showAll ? "Show less" : `Show all ${payments.length} payments`}
          </button>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   TAB: LEDGER
   ══════════════════════════════════════════════════════════════ */

function LedgerTab({
  ledger,
  loading,
  currentBalance,
}: {
  ledger: LedgerEntry[]
  loading: boolean
  currentBalance: number
}) {
  const { displayed, hasMore, showAll, toggle } = usePaginatedDisplay(ledger, 15)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (ledger.length === 0) {
    return (
      <EmptyState
        icon="Wallet"
        title="No ledger entries"
        description="No financial transactions recorded for this customer."
      />
    )
  }

  return (
    <div className="p-5 pt-3 space-y-4">
      <div className={cn(
        "rounded-xl border p-4",
        currentBalance > 0
          ? "border-destructive/20 bg-destructive/5"
          : "border-success/20 bg-success/5"
      )}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {currentBalance > 0
              ? <AlertTriangle className="h-5 w-5 text-destructive" />
              : <CheckCircle2 className="h-5 w-5 text-success" />
            }
            <div>
              <p className="text-sm font-medium text-foreground">Current Balance</p>
              <p className="text-xs text-muted-foreground">
                {currentBalance > 0
                  ? `${formatCurrency(currentBalance)} outstanding`
                  : "Account settled"
                }
              </p>
            </div>
          </div>
          <span className={cn(
            "text-xl font-bold",
            currentBalance > 0 ? "text-destructive" : "text-success"
          )}>
            {formatCurrency(currentBalance)}
          </span>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Description</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Debit</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Credit</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Balance</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((entry, i) => (
              <motion.tr
                key={entry.id}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.015 }}
                className={cn(
                  "border-b border-border last:border-0 transition-colors",
                  entry.type === 'invoice' ? "hover:bg-warning/5" :
                  entry.type === 'payment' ? "hover:bg-success/5" :
                  "hover:bg-muted/30"
                )}
              >
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                  <span className="text-xs">{formatDate(entry.date)}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {entry.type === 'invoice' ? (
                      <ArrowUpRight className="h-3.5 w-3.5 text-destructive shrink-0" />
                    ) : entry.type === 'payment' ? (
                      <ArrowDownRight className="h-3.5 w-3.5 text-success shrink-0" />
                    ) : (
                      <RotateCcw className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    )}
                    <span className="text-foreground text-xs">{entry.description}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-medium text-destructive">
                  {entry.debit > 0 ? formatCurrency(entry.debit) : "—"}
                </td>
                <td className="px-4 py-3 text-right font-medium text-success">
                  {entry.credit > 0 ? formatCurrency(entry.credit) : "—"}
                </td>
                <td className={cn(
                  "px-4 py-3 text-right font-semibold",
                  entry.runningBalance > 0 ? "text-destructive" :
                  entry.runningBalance < 0 ? "text-success" :
                  "text-muted-foreground"
                )}>
                  {formatCurrency(Math.abs(entry.runningBalance))}
                  {entry.runningBalance > 0 ? " Dr" : entry.runningBalance < 0 ? " Cr" : ""}
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="flex justify-center mt-4">
          <button
            onClick={toggle}
            className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            {showAll ? "Show less" : `Show all ${ledger.length} entries`}
          </button>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════ */

interface CustomerProfileProps {
  customer: Customer | null
  open: boolean
  onClose: () => void
  onEdit: () => void
  onNewSale: () => void
  onRecordPayment: (customerId: string) => void
  isMobile?: boolean
  /** Increment to trigger re-fetch of customer data */
  refreshKey?: number
}

const tabs: Tab[] = [
  { id: "overview", label: "Overview" },
  { id: "orders", label: "Orders" },
  { id: "invoices", label: "Invoices" },
  { id: "payments", label: "Payments" },
  { id: "ledger", label: "Ledger" },
]

export function CustomerProfile({
  customer,
  open,
  onClose,
  onEdit,
  onNewSale,
  onRecordPayment,
  isMobile = false,
  refreshKey = 0,
}: CustomerProfileProps) {
  const [activeTab, setActiveTab] = useState("overview")
  const { orders, invoices, payments, ledger, loading, error } = useCustomerProfileData(customer, refreshKey)

  // ── Compute KPIs from fetched data (invoices = source of truth) ──
  const computedStats = useMemo(() => {
    const totalOrders = orders.length
    const totalSpent = invoices.reduce((sum, inv) => sum + inv.amount, 0)
    const outstandingCredit = invoices
      .filter(inv => inv.status !== 'paid' && inv.status !== 'cancelled')
      .reduce((sum, inv) => sum + inv.remaining, 0)
    const avgOrderValue = totalOrders > 0 ? totalSpent / totalOrders : 0
    // Current balance from ledger (last running balance if ledger is reversed)
    const currentBalance = ledger.length > 0
      ? ledger[0].runningBalance // ledger is reversed (most recent first)
      : 0
    return { totalOrders, totalSpent, outstandingCredit, avgOrderValue, currentBalance }
  }, [orders, invoices, ledger])

  const tabsWithCounts = useMemo(() => tabs.map(t => ({
    ...t,
    count: t.id === "orders" ? orders.length :
           t.id === "invoices" ? invoices.length :
           t.id === "payments" ? payments.filter(p => p.method !== 'credit').length :
           t.id === "ledger" ? ledger.length :
           undefined,
  })), [orders.length, invoices.length, payments, ledger.length])

  useEffect(() => {
    setActiveTab("overview")
  }, [customer?.id])

  if (!customer) return null

  return (
    <AnimatePresence mode="wait">
      {open && (
        <motion.div
          key={customer.id}
          initial={{ opacity: 0, x: 320 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 320 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className={cn(
            "bg-card border-l border-border overflow-hidden flex flex-col",
            isMobile
              ? "fixed inset-0 z-50"
              : "h-full"
          )}
        >
          <div className="flex-1 overflow-y-auto">
            <ProfileHeader
              customer={customer}
              onClose={onClose}
              onEdit={onEdit}
              onNewSale={onNewSale}
              onRecordPayment={() => onRecordPayment(customer.id)}
            />

            <KpiCards
              totalOrders={computedStats.totalOrders}
              totalSpent={computedStats.totalSpent}
              outstandingCredit={computedStats.outstandingCredit}
              avgOrderValue={computedStats.avgOrderValue}
              loyaltyPoints={customer.loyaltyPoints}
              lastVisit={customer.lastVisit}
            />

            {error && (
              <div className="mx-5 mb-3 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                  <p className="text-xs text-destructive">{error}</p>
                </div>
              </div>
            )}

            <div className="sticky top-0 z-10 bg-card/90 backdrop-blur-sm border-b border-border px-5 py-2">
              <Tabs
                tabs={tabsWithCounts}
                activeTab={activeTab}
                onChange={setActiveTab}
                className="w-full"
              />
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                {activeTab === "overview" && (
                  <OverviewTab
                    orders={orders}
                    invoices={invoices}
                    payments={payments}
                    loading={loading}
                    outstandingCredit={computedStats.outstandingCredit}
                  />
                )}
                {activeTab === "orders" && (
                  <OrdersTab orders={orders} loading={loading} />
                )}
                {activeTab === "invoices" && (
                  <InvoicesTab invoices={invoices} loading={loading} />
                )}
                {activeTab === "payments" && (
                  <PaymentsTab payments={payments} loading={loading} />
                )}
                {activeTab === "ledger" && (
                  <LedgerTab ledger={ledger} loading={loading} currentBalance={computedStats.currentBalance} />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
