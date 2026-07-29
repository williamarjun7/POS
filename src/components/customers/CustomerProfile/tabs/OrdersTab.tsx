/**
 * OrdersTab — Customer Order History
 * ──────────────────────────────────
 * Extracted from CustomerProfile.tsx.
 */

import { useState } from "react"
import { motion } from "framer-motion"
import { ChevronRight, ChevronDown, ChevronUp, Loader2, Plus, AlertCircle, CheckCircle2, Info } from "lucide-react"

/* ─── Status badge icon lookup ─────────────────────────────── */
const statusIcons = {
  AlertCircle: <AlertCircle className="h-3 w-3" aria-hidden="true" />,
  CheckCircle2: <CheckCircle2 className="h-3 w-3" aria-hidden="true" />,
  Info: <Info className="h-3 w-3" aria-hidden="true" />,
} as const
import { cn, formatCurrency } from "@/lib/utils"
import { StatusBadge } from "@/components/StatusBadge"
import { EmptyState } from "@/components/EmptyState"

/* ─── Internal types ──────────────────────────────────────── */

interface OrderItem {
  name: string; quantity: number; unitPrice: number; notes: string; status: string
}

interface Order {
  id: string; orderNumber: string; date: string; tableRoom?: string
  itemsCount: number; grandTotal: number; payStatus: string; status: string
  items: OrderItem[]; discount: number; paidAmount: number; customerName?: string
}

/* ─── Helpers ──────────────────────────────────────────────── */

function formatDate(dateStr: string) {
  const d = new Date(dateStr); const now = new Date()
  const diff = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
  if (diff === 0) return "Today"; if (diff === 1) return "Yesterday"
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function statusVariant(s: string): "default" | "success" | "warning" | "destructive" | "info" | "secondary" {
  switch (s) {
    case "paid": case "completed": return "success"
    case "pending": return "warning"
    case "overdue": case "cancelled": return "destructive"
    case "partial": case "credit_invoice": return "info"
    default: return "default"
  }
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

/* ─── Component ────────────────────────────────────────────── */

interface OrdersTabProps {
  orders: Order[]
  loading: boolean
  customerId?: string
}

export function OrdersTab({ orders, loading, customerId }: OrdersTabProps) {
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null)
  const { displayed, hasMore, showAll, toggle } = usePaginatedDisplay(orders, 15)

  if (loading) return (
    <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
  )
  if (orders.length === 0) return (
    <EmptyState icon="ShoppingBag" title="No orders yet"
      description="This customer hasn't placed any orders yet."
      action={
        <button onClick={() => window.location.href = `/pos?customer=${customerId}`}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors">
          <Plus className="h-3.5 w-3.5" /> New Sale
        </button>
      }
    />
  )

  return (
    <div className="p-5 pt-4">
      <div className="hidden md:grid md:grid-cols-[1fr_110px_70px_100px_100px_100px] gap-3 px-4 py-2.5 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider bg-muted/30 rounded-xl border border-border">
        <span>Order</span><span>Date</span><span className="text-center">Items</span><span className="text-right">Total</span><span className="text-center">Pay Status</span><span className="text-center">Status</span>
      </div>
      <div className="space-y-2">
        {displayed.map((order, i) => (
          <motion.div key={order.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
            <button onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
              className="w-full text-left rounded-xl border border-border bg-card/50 hover:bg-card/80 hover:border-foreground/20 transition-all">
              <div className="grid grid-cols-1 md:grid-cols-[1fr_110px_70px_100px_100px_100px] gap-3 px-4 py-3.5 items-center">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg shrink-0 transition-transform duration-200", expandedOrder === order.id && "rotate-90")}>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{order.orderNumber}</p>
                    {order.tableRoom && <p className="text-xs text-muted-foreground">{order.tableRoom}</p>}
                  </div>
                </div>
                <span className="text-sm text-muted-foreground hidden md:block">{formatDate(order.date)}</span>
                <span className="text-sm text-muted-foreground text-center hidden md:block tabular-nums">{order.itemsCount}</span>
                <span className="text-sm font-semibold text-foreground text-right hidden md:block tabular-nums">{formatCurrency(order.grandTotal)}</span>
                <span className="hidden md:flex justify-center">
                  <StatusBadge
                    label={order.payStatus === 'paid' ? 'Paid' : order.payStatus === 'partial' ? 'Partial' : 'Unpaid'}
                    variant={order.payStatus === 'paid' ? 'success' : order.payStatus === 'partial' ? 'info' : 'warning'}
                    icon={order.payStatus === 'paid' ? statusIcons.CheckCircle2 : order.payStatus === 'partial' ? statusIcons.Info : statusIcons.AlertCircle}
                  />
                </span>
                <span className="hidden md:flex justify-center">
                  <StatusBadge
                    label={order.status}
                    variant={statusVariant(order.status)}
                    icon={order.status === 'completed' || order.status === 'paid' ? statusIcons.CheckCircle2 : statusIcons.Info}
                  />
                </span>
              </div>
              {expandedOrder === order.id && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                  <div className="border-t border-border px-4 py-4 space-y-4">
                    {order.items.length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Items</p>
                        <div className="space-y-1.5">
                          {order.items.map((item, idx) => (
                            <div key={idx} className="flex items-center justify-between text-sm py-1.5 px-2 rounded-lg hover:bg-muted/30">
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="text-muted-foreground w-6 text-right shrink-0 tabular-nums">×{item.quantity}</span>
                                <span className="text-foreground truncate">{item.name}</span>
                                {item.servingType && (
                                  <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                                    item.servingType === 'takeaway'
                                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                                      : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                  }`}>
                                    {item.servingType === 'takeaway' ? '📦 Takeaway' : '🍽 Dine In'}
                                  </span>
                                )}
                                {item.notes && <span className="text-xs text-muted-foreground truncate italic">({item.notes})</span>}
                              </div>
                              <span className="font-medium text-foreground shrink-0 ml-2 tabular-nums">{formatCurrency(item.unitPrice * item.quantity)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="border-t border-border pt-3 space-y-1.5">
                      <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span className="text-foreground tabular-nums">{formatCurrency(order.grandTotal)}</span></div>
                      {order.discount > 0 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Discount</span><span className="text-destructive tabular-nums">-{formatCurrency(order.discount)}</span></div>}
                      <div className="flex justify-between text-sm font-semibold border-t border-border pt-1.5 mt-1.5"><span className="text-foreground">Grand Total</span><span className="text-foreground tabular-nums">{formatCurrency(order.grandTotal - order.discount)}</span></div>
                    </div>
                  </div>
                </motion.div>
              )}
            </button>
          </motion.div>
        ))}
      </div>
      {hasMore && (
        <div className="flex justify-center mt-5">
          <button onClick={toggle} className="flex items-center gap-1.5 rounded-xl border border-border px-5 py-2.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            {showAll ? <><ChevronUp className="h-3.5 w-3.5" /> Show less</> : <><ChevronDown className="h-3.5 w-3.5" /> Show all {orders.length} orders</>}
          </button>
        </div>
      )}
    </div>
  )
}
