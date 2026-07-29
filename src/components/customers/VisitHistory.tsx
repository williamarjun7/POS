/**
 * VisitHistory — Chronological Customer Visit History
 * ────────────────────────────────────────────────────
 *
 * Displays customer interactions grouped into "visits" — each visit
 * represents a complete customer interaction (order → invoice → payment).
 *
 * Features:
 *   - Chronological visit cards with date grouping (Today / Yesterday / Earlier)
 *   - Expandable visit details showing items, totals, payment breakdown
 *   - Bill preview and reprint actions per visit
 *   - Date range filtering
 *   - Search by invoice number, table, item name
 *   - Server-side rendering optimized with lazy detail loading
 */

import { useState, useMemo, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  ChevronRight,
  Clock,
  ShoppingBag, UtensilsCrossed, CreditCard,
  Search, MapPin, Eye, Receipt,
  Info, AlertCircle, CheckCircle2,
  Loader2, RotateCcw, Filter,
} from "lucide-react"
import { cn, formatCurrency } from "@/lib/utils"
import { StatusBadge } from "@/components/StatusBadge"
import { PaymentMethodBadge } from "@/components/PaymentMethodBadge"
import DateFilterBar, { type DateFilterState, getDateRange } from "@/components/filters/DateFilterBar"
import { BillPreview } from "./BillPreview"
import type { PaymentMethod } from "@/types"
import { getPaymentMethodLabel } from "@/lib/payment-methods"

/* ─── Status badge icon lookup ─────────────────────────────── */
const statusIcons = {
  AlertCircle: <AlertCircle className="h-3 w-3" aria-hidden="true" />,
  CheckCircle2: <CheckCircle2 className="h-3 w-3" aria-hidden="true" />,
  Info: <Info className="h-3 w-3" aria-hidden="true" />,
} as const

/* ─── Types ────────────────────────────────────────────────── */

export interface VisitItem {
  name: string
  quantity: number
  unitPrice: number
  notes?: string
  totalPrice: number
  servingType?: 'dine_in' | 'takeaway'
  packagingFee?: number
}

export interface PaymentInfo {
  method: PaymentMethod
  amount: number
  collected: number
  outstanding: number
}

export interface CustomerVisit {
  /** Unique visit ID (uses invoice ID) */
  id: string
  /** Invoice ID for linking */
  invoiceId: string
  /** Invoice number */
  invoiceNumber: string
  /** Visit date string */
  date: string
  /** Visit time string */
  time: string
  /** Display label (e.g. "Table 4" or "Room 301") */
  tableOrRoom?: string
  /** Order type classification */
  orderType: "dine_in" | "takeaway" | "room_service" | "unknown"
  /** Number of items ordered */
  itemsCount: number
  /** Line items for this visit */
  items: VisitItem[]
  /** Subtotal before discount */
  subtotal: number
  /** Discount applied */
  discount: number
  /** Grand total */
  total: number
  /** Amount paid (non-credit payments) */
  paidAmount: number
  /** Outstanding amount */
  outstandingAmount: number
  /** Payment methods used */
  paymentMethods: PaymentInfo[]
  /** Visit/invoice status */
  status: string
  /** Cashier name */
  cashier?: string
  /** Human-readable payment summary */
  paymentSummary: string
}

/* ─── Helpers ──────────────────────────────────────────────── */

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate())

  if (target.getTime() === today.getTime()) return "Today"
  if (target.getTime() === yesterday.getTime()) return "Yesterday"
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
}

function getDateGroup(dateStr: string): "today" | "yesterday" | "week" | "earlier" {
  const d = new Date(dateStr)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const weekAgo = new Date(today.getTime() - 7 * 86400000)
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate())

  if (target.getTime() === today.getTime()) return "today"
  if (target.getTime() === yesterday.getTime()) return "yesterday"
  if (target >= weekAgo) return "week"
  return "earlier"
}

function getDateGroupLabel(group: "today" | "yesterday" | "week" | "earlier"): string {
  switch (group) {
    case "today": return "Today"
    case "yesterday": return "Yesterday"
    case "week": return "This Week"
    case "earlier": return "Earlier"
  }
}

function classifyOrderType(invoice: any, batches: any[]): CustomerVisit["orderType"] {
  if (invoice.table_id) return "dine_in"
  if (invoice.booking_id) return "room_service"
  // Check if any batch has room_id
  if (batches.some(b => b.room_id)) return "room_service"
  // If no table and no room, it's takeaway
  if (batches.length === 0 && !invoice.table_id && !invoice.booking_id) return "takeaway"
  return "dine_in"
}

function getOrderTypeLabel(type: CustomerVisit["orderType"]): string {
  switch (type) {
    case "dine_in": return "Dine In"
    case "takeaway": return "Takeaway"
    case "room_service": return "Room Service"
    default: return "—"
  }
}

function getOrderTypeIcon(type: CustomerVisit["orderType"]) {
  switch (type) {
    case "dine_in": return UtensilsCrossed
    case "takeaway": return ShoppingBag
    case "room_service": return MapPin
    default: return Info
  }
}

function getTableLabel(invoice: any, batches: any[]): string | undefined {
  if (invoice.table_id) {
    // Try to find table number from batches
    const batchWithTable = batches.find(b => b.table_number || b.restaurant_tables?.table_number)
    const tableNum = batchWithTable?.table_number ?? batchWithTable?.restaurant_tables?.table_number
    return tableNum ? `Table ${tableNum}` : undefined
  }
  if (invoice.booking_id) {
    const batchWithRoom = batches.find(b => b.room_id || b.room_number)
    const roomNum = batchWithRoom?.room_number ?? batchWithRoom?.room_id?.slice(0, 8).toUpperCase()
    return roomNum ? `Room ${roomNum}` : undefined
  }
  return undefined
}

function buildPaymentSummary(payments: any[], invoiceTotal: number): { methods: PaymentInfo[]; paid: number; summary: string } {
  const methodMap = new Map<string, { amount: number }>()
  let totalPaid = 0

  for (const p of payments) {
    if (p.payment_method === 'credit') continue
    const key = p.payment_method
    const current = methodMap.get(key) ?? { amount: 0 }
    current.amount += Number(p.amount)
    totalPaid += Number(p.amount)
    methodMap.set(key, current)
  }

  const methods = Array.from(methodMap.entries()).map(([method, data]) => ({
    method: method as PaymentMethod,
    amount: data.amount,
    collected: data.amount,
    outstanding: Math.max(0, invoiceTotal - totalPaid),
  }))

  // If outstanding, add credit method
  const outstanding = Math.max(0, invoiceTotal - totalPaid)
  if (outstanding > 0) {
    methods.push({
      method: 'credit' as PaymentMethod,
      amount: outstanding,
      collected: 0,
      outstanding,
    })
  }

  const methodLabels = methods
    .filter(m => m.method !== 'credit')
    .map(m => `${getPaymentMethodLabel(m.method)}`)
  const summary = methodLabels.length > 0
    ? methodLabels.join(' + ')
    : outstanding > 0
      ? 'Credit'
      : '—'

  return { methods, paid: totalPaid, summary }
}

/* ─── Build Visits from raw data ──────────────────────────── */

export interface RawVisitData {
  invoices: any[]
  orders: any[]
  payments: any[]
  invoiceItems: any[]
}

export function buildVisits(data: RawVisitData): CustomerVisit[] {
  const { invoices, orders, payments, invoiceItems } = data

  // Build payment map by invoice_id
  const paymentsByInvoice = new Map<string, any[]>()
  for (const p of payments) {
    const invId = p.invoice_id
    if (!invId) continue
    const existing = paymentsByInvoice.get(invId) ?? []
    existing.push(p)
    paymentsByInvoice.set(invId, existing)
  }

  // Build items map by invoice_id
  const itemsByInvoice = new Map<string, any[]>()
  for (const item of invoiceItems) {
    const invId = item.invoice_id
    if (!invId) continue
    const existing = itemsByInvoice.get(invId) ?? []
    existing.push(item)
    itemsByInvoice.set(invId, existing)
  }

  // Build order batches by invoice_id (from order_batch_ids array)
  const batchesByInvoice = new Map<string, any[]>()
  for (const inv of invoices) {
    if (inv.order_batch_ids && Array.isArray(inv.order_batch_ids)) {
      const matchingBatches = orders.filter(o => inv.order_batch_ids.includes(o.id))
      batchesByInvoice.set(inv.id, matchingBatches)
    }
  }

  const visits: CustomerVisit[] = []

  for (const inv of invoices) {
    if (inv.status === 'cancelled') continue

    const invPayments = paymentsByInvoice.get(inv.id) ?? []
    const invItems = itemsByInvoice.get(inv.id) ?? []
    const invBatches = batchesByInvoice.get(inv.id) ?? []

    // If no invoice items, try order batch items
    if (invItems.length === 0) {
      for (const batch of invBatches) {
        if (batch.order_batch_items) {
          for (const bi of batch.order_batch_items) {
            if (bi.status !== 'cancelled' && bi.status !== 'voided') {
              invItems.push({
                name: bi.name,
                quantity: bi.quantity,
                unit_price: bi.unit_price,
                notes: bi.notes,
                total_price: Number(bi.unit_price) * bi.quantity,
                serving_type: bi.serving_type ?? 'dine_in',
                packaging_fee: Number(bi.packaging_fee ?? 0),
              })
            }
          }
        }
      }
    }

    const { methods, paid, summary } = buildPaymentSummary(invPayments, Number(inv.total))
    const outstanding = Math.max(0, Number(inv.total) - paid)

    visits.push({
      id: inv.id,
      invoiceId: inv.id,
      invoiceNumber: inv.invoice_number,
      date: inv.created_at,
      time: inv.created_at,
      tableOrRoom: getTableLabel(inv, invBatches),
      orderType: classifyOrderType(inv, invBatches),
      itemsCount: invItems.length,
      items: invItems.map(item => ({
        name: item.name,
        quantity: item.quantity,
        unitPrice: Number(item.unit_price),
        notes: item.notes || undefined,
        totalPrice: Number(item.total_price ?? item.unit_price * item.quantity),
        servingType: (item.serving_type ?? 'dine_in') as 'dine_in' | 'takeaway',
        packagingFee: Number(item.packaging_fee ?? 0),
      })),
      subtotal: Number(inv.subtotal ?? inv.total),
      discount: Number(inv.discount ?? 0),
      total: Number(inv.total),
      paidAmount: paid,
      outstandingAmount: outstanding,
      paymentMethods: methods,
      status: inv.status,
      cashier: undefined, // Could be fetched from user_id if needed
      paymentSummary: summary,
    })
  }

  // Sort by date descending (most recent first)
  visits.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  return visits
}

/* ─── Date Filter Hook ─────────────────────────────────────── */

export function useDateFilterState() {
  const [filter, setFilter] = useState<DateFilterState>("today")
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: "", end: "" })

  const updateFilter = useCallback((newFilter: DateFilterState, newRange?: { start: string; end: string }) => {
    setFilter(newFilter)
    if (newRange) setDateRange(newRange)
  }, [])

  return { filter, dateRange, setFilter: updateFilter }
}

export function filterVisitsByDate(visits: CustomerVisit[], filter: DateFilterState, dateRange: { start: string; end: string }): CustomerVisit[] {
  if (filter === "all") return visits

  const range = getDateRange(filter)
  if (!range) return visits

  const start = new Date(range.start + 'T00:00:00+05:45')
  const end = new Date(range.end + 'T23:59:59+05:45')

  return visits.filter(v => {
    const d = new Date(v.date)
    return d >= start && d <= end
  })
}

/* ─── Visit Card Component ────────────────────────────────── */

function VisitCard({
  visit,
  isExpanded,
  onToggle,
  onViewBill,
  onReprintBill,
  index,
}: {
  visit: CustomerVisit
  isExpanded: boolean
  onToggle: () => void
  onViewBill: (visit: CustomerVisit) => void
  onReprintBill: (visit: CustomerVisit) => void
  index: number
}) {
  const TypeIcon = getOrderTypeIcon(visit.orderType)
  const isOutstanding = visit.outstandingAmount > 0
  const isPaidFully = visit.paidAmount >= visit.total

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.25 }}
      className="group"
    >
      {/* Main card — clickable to expand */}
      <button
        onClick={onToggle}
        className={cn(
          "w-full text-left rounded-xl border bg-card/50 transition-all duration-200",
          "hover:shadow-sm hover:border-foreground/15",
          isExpanded && "shadow-sm border-foreground/15",
          isOutstanding && "border-l-2 border-l-amber-400/60"
        )}
      >
        <div className="px-4 py-3.5">
          {/* Top row: type icon + invoice + actions */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {/* Type icon */}
              <div className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                isOutstanding ? "bg-amber-50 dark:bg-amber-950/20" :
                isPaidFully ? "bg-emerald-50 dark:bg-emerald-950/20" :
                "bg-muted"
              )}>
                <TypeIcon className={cn(
                  "h-5 w-5",
                  isOutstanding ? "text-amber-600 dark:text-amber-400" :
                  isPaidFully ? "text-emerald-600" :
                  "text-muted-foreground"
                )} />
              </div>

              {/* Info */}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground leading-tight truncate">
                    {visit.invoiceNumber}
                  </span>
                  {visit.tableOrRoom && (
                    <span className="text-xs text-muted-foreground/70 font-medium shrink-0">
                      · {visit.tableOrRoom}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatTime(visit.date)}
                  </span>
                  <span className="text-muted-foreground/30">|</span>
                  <span className="inline-flex items-center gap-1">
                    <ShoppingBag className="h-3 w-3" />
                    {visit.itemsCount} item{visit.itemsCount !== 1 ? 's' : ''}
                  </span>
                  <span className="text-muted-foreground/30 hidden sm:inline">|</span>
                  <span className="hidden sm:inline-flex items-center gap-1">
                    {getOrderTypeLabel(visit.orderType)}
                  </span>
                </div>
              </div>
            </div>

            {/* Expand chevron */}
            <motion.div
              animate={{ rotate: isExpanded ? 90 : 0 }}
              transition={{ duration: 0.2 }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground/40 group-hover:text-muted-foreground transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </motion.div>
          </div>

          {/* Bottom row: amounts + status */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm font-bold text-foreground tabular-nums">{formatCurrency(visit.total)}</p>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">Total</p>
              </div>
              <div className="h-6 w-px bg-border/50" />
              <div className="text-right">
                {isOutstanding ? (
                  <p className="text-sm font-bold text-amber-600 dark:text-amber-400 tabular-nums">{formatCurrency(visit.outstandingAmount)}</p>
                ) : (
                  <p className="text-sm font-bold text-emerald-600 tabular-nums">{formatCurrency(visit.paidAmount)}</p>
                )}
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">{isOutstanding ? 'Due' : 'Paid'}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {visit.paymentSummary && visit.paymentSummary !== '—' && (
                <span className="hidden sm:inline-flex items-center gap-1 rounded-md bg-muted/60 px-2 py-1 text-[10px] font-medium text-muted-foreground">
                  <CreditCard className="h-3 w-3" />
                  {visit.paymentSummary}
                </span>
              )}
              <StatusBadge
                label={isPaidFully ? 'Paid' : isOutstanding ? 'Outstanding' : visit.status.replace('_', ' ')}
                variant={isPaidFully ? 'success' : isOutstanding ? 'warning' : 'default'}
                icon={isPaidFully ? statusIcons.CheckCircle2 : isOutstanding ? statusIcons.AlertCircle : statusIcons.Info}
                size="sm"
              />
            </div>
          </div>
        </div>
      </button>

      {/* ── Expanded Details ── */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="mt-1 rounded-xl border border-border/70 bg-muted/20 px-4 py-4 space-y-4">
              {/* Items list */}
              {visit.items.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2.5 px-1">
                    Ordered Items
                  </p>
                  <div className="space-y-1">
                    {visit.items.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-muted/40 transition-colors text-sm"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-muted-foreground w-5 text-right shrink-0 tabular-nums font-medium">
                            ×{item.quantity}
                          </span>
                          <span className="text-foreground truncate font-medium">{item.name}</span>
                          {item.servingType && (
                            <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                              item.servingType === 'takeaway'
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                            }`}>
                              {item.servingType === 'takeaway' ? '📦 Takeaway' : '🍽 Dine In'}
                            </span>
                          )}
                          {item.notes && (
                            <span className="text-xs text-muted-foreground/60 truncate italic hidden sm:inline">
                              ({item.notes})
                            </span>
                          )}
                        </div>
                        <span className="text-foreground font-semibold shrink-0 ml-3 tabular-nums">
                          {formatCurrency(item.totalPrice)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Totals breakdown */}
              <div className="border-t border-border/50 pt-3 space-y-1.5 px-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="text-foreground tabular-nums">{formatCurrency(visit.subtotal)}</span>
                </div>
                {visit.discount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Discount</span>
                    <span className="text-destructive tabular-nums">-{formatCurrency(visit.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold border-t border-border/40 pt-1.5 mt-1.5">
                  <span className="text-foreground">Grand Total</span>
                  <span className="text-foreground tabular-nums">{formatCurrency(visit.total)}</span>
                </div>

                {/* Payment breakdown */}
                {visit.paymentMethods.length > 0 && (
                  <div className="border-t border-border/40 pt-2 mt-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                      Payment Breakdown
                    </p>
                    {visit.paymentMethods.map((pm, idx) => (
                      <div key={idx} className="flex items-center justify-between py-1 text-sm">
                        <div className="flex items-center gap-2">
                          {pm.method === 'credit' ? (
                            <span className="flex h-2 w-2 rounded-full bg-amber-400" />
                          ) : (
                            <span className={cn(
                              "flex h-2 w-2 rounded-full",
                              pm.method === 'cash' ? "bg-emerald-500" :
                              pm.method === 'fonepay' ? "bg-blue-500" :
                              pm.method === 'reception_qr' ? "bg-sky-500" :
                              "bg-muted-foreground"
                            )} />
                          )}
                          <span className={cn(
                            "text-muted-foreground",
                            pm.method === 'credit' && pm.outstanding > 0 && "text-amber-600 dark:text-amber-400 font-medium"
                          )}>
                            {pm.method === 'credit' ? 'Credit (Outstanding)' : getPaymentMethodLabel(pm.method)}
                          </span>
                        </div>
                        <span className={cn(
                          "tabular-nums font-medium",
                          pm.method === 'credit' ? "text-amber-600 dark:text-amber-400" : "text-foreground"
                        )}>
                          {formatCurrency(pm.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 border-t border-border/50 pt-3">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={(e) => { e.stopPropagation(); onViewBill(visit); }}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
                >
                  <Eye className="h-3.5 w-3.5" />
                  View Bill
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={(e) => { e.stopPropagation(); onReprintBill(visit); }}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reprint Bill
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/* ─── Main VisitHistory Component ─────────────────────────── */

interface VisitHistoryProps {
  visits: CustomerVisit[]
  loading?: boolean
  /** Allow date filtering? Default true */
  showDateFilter?: boolean
  /** External date filter state */
  dateFilter?: DateFilterState
  dateRange?: { start: string; end: string }
  onDateFilterChange?: (filter: DateFilterState, range?: { start: string; end: string }) => void
}

export function VisitHistory({
  visits,
  loading = false,
  showDateFilter = true,
  dateFilter,
  dateRange,
  onDateFilterChange,
}: VisitHistoryProps) {
  const [expandedVisit, setExpandedVisit] = useState<string | null>(null)
  const [billPreviewVisit, setBillPreviewVisit] = useState<CustomerVisit | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [showDateFilterInternal, setShowDateFilterInternal] = useState(false)

  // Internal date filter state if external not provided
  const internalDateFilter = useDateFilterState()
  const activeFilter = dateFilter ?? internalDateFilter.filter
  const activeRange = dateRange ?? internalDateFilter.dateRange
  const handleDateChange = onDateFilterChange ?? internalDateFilter.setFilter

  // Filter by date
  const dateFiltered = useMemo(() => {
    return filterVisitsByDate(visits, activeFilter, activeRange)
  }, [visits, activeFilter, activeRange])

  // Filter by search
  const searched = useMemo(() => {
    if (!searchQuery.trim()) return dateFiltered
    const q = searchQuery.toLowerCase()
    return dateFiltered.filter(v =>
      v.invoiceNumber.toLowerCase().includes(q) ||
      v.tableOrRoom?.toLowerCase().includes(q) ||
      v.items.some(i => i.name.toLowerCase().includes(q)) ||
      v.paymentSummary.toLowerCase().includes(q)
    )
  }, [dateFiltered, searchQuery])

  // Group by date
  const groupedVisits = useMemo(() => {
    const groups = new Map<"today" | "yesterday" | "week" | "earlier", CustomerVisit[]>()
    for (const v of searched) {
      const group = getDateGroup(v.date)
      const existing = groups.get(group) ?? []
      existing.push(v)
      groups.set(group, existing)
    }
    return groups
  }, [searched])

  const groupOrder: Array<"today" | "yesterday" | "week" | "earlier"> = ["today", "yesterday", "week", "earlier"]

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading visit history...</p>
        </div>
      </div>
    )
  }

  // ── Empty ──
  if (visits.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <Receipt className="h-12 w-12 text-muted-foreground/20 mb-4" />
        <p className="text-base font-semibold text-muted-foreground">No visits yet</p>
        <p className="text-sm text-muted-foreground/60 mt-1 max-w-xs">
          Visits will appear here once this customer makes a purchase.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── Toolbar: Search + Date Filter ── */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <input
            type="text"
            placeholder="Search by invoice, item, table..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>
        {showDateFilter && (
          <div className="shrink-0">
            <DateFilterBar
              filter={activeFilter}
              dateRange={activeRange}
              onChange={(f, r) => handleDateChange(f, r)}
            />
          </div>
        )}
        <p className="text-xs text-muted-foreground shrink-0 tabular-nums">
          {searched.length} visit{searched.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* ── No results ── */}
      {searched.length === 0 && (
        <div className="flex flex-col items-center py-12 text-center">
          <Search className="h-10 w-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No matching visits</p>
          <p className="text-xs text-muted-foreground/60 mt-0.5">Try adjusting your search or date filter</p>
        </div>
      )}

      {/* ── Grouped visits ── */}
      {searched.length > 0 && (
        <div className="space-y-6">
          {groupOrder.map(group => {
            const groupVisits = groupedVisits.get(group)
            if (!groupVisits || groupVisits.length === 0) return null
            return (
              <div key={group}>
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">
                    {getDateGroupLabel(group)}
                  </h3>
                  <div className="flex-1 h-px bg-border/50" />
                  <span className="text-[10px] text-muted-foreground/40 tabular-nums">
                    {groupVisits.length} visit{groupVisits.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="space-y-2">
                  {groupVisits.map((visit, idx) => (
                    <VisitCard
                      key={visit.id}
                      visit={visit}
                      isExpanded={expandedVisit === visit.id}
                      onToggle={() => setExpandedVisit(expandedVisit === visit.id ? null : visit.id)}
                      onViewBill={setBillPreviewVisit}
                      onReprintBill={setBillPreviewVisit}
                      index={idx}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Bill Preview Modal ── */}
      {billPreviewVisit && (
        <BillPreview
          visit={billPreviewVisit}
          onClose={() => setBillPreviewVisit(null)}
        />
      )}
    </div>
  )
}
