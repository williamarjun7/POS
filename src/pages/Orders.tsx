import { useState, useMemo, useRef } from "react"
import { createPortal } from "react-dom"
import { motion } from "framer-motion"
import { PageTransition } from "@/components/ui/PageTransition"
import { PageHeader } from "@/components/PageHeader"
import { StatusBadge } from "@/components/StatusBadge"
import { Tabs } from "@/components/Tabs"
import { DataTable, type Column } from "@/components/DataTable"
import { StatCard } from "@/components/ui/stat-card"
import { BaseModal } from "@/components/ui/modal"
import { cn, formatCurrency } from "@/lib/utils"
import { showSuccess, showError } from "@/components/ui/toast"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { Button } from "@/components/ui/button"
import { PosPaymentDialog } from "@/components/payments"
import { useOrders as useOrdersFromDb } from "@/lib/hooks"
import { useOrderBatches } from "@/lib/services/order-batch-service"
import type { Order, OrderItem, OrderStatus, SalesChannel } from "@/types"
import {
  MoreHorizontal, Trash2, XCircle, RefreshCw, Download,
  Clock, Filter, Eye, Package, User,
  MapPin, CreditCard, Receipt, ArrowUpDown, Banknote, Ban
} from "lucide-react"
import { pageTransitionFast, staggerContainerFast } from "@/lib/animations/presets"

const statusFlow: Record<string, OrderStatus> = {
  pending: "processing",
  processing: "completed",
}

const statusVariant: Record<OrderStatus, "default" | "success" | "warning" | "destructive" | "info" | "secondary"> = {
  completed: "success",
  pending: "warning",
  processing: "info",
  cancelled: "destructive",
}

const channelLabels: Record<SalesChannel, string> = {
  dine_in: "Dine In",
  takeaway: "Takeaway",
  room_service: "Room Service",
  online: "Online",
}

const channelColors: Record<SalesChannel, string> = {
  dine_in: "text-blue-500 bg-blue-500/10",
  takeaway: "text-amber-500 bg-amber-500/10",
  room_service: "text-purple-500 bg-purple-500/10",
  online: "text-emerald-500 bg-emerald-500/10",
}

// Using pageTransitionFast, staggerContainerFast from presets

// ── Order Detail Modal ──────────────────────────────────────────────────────

function OrderDetailModal({
  open,
  order,
  onClose,
  onAdvance,
  onCancel,
}: {
  open: boolean
  order: Order | null
  onClose: () => void
  onAdvance: (id: string) => void
  onCancel: (id: string) => void
}) {
  if (!order) return null

  const canAdvance = !!statusFlow[order.status]
  const canCancel = order.status !== "cancelled" && order.status !== "completed"

  const timeline = [
    { time: "10:30 AM", event: "Order placed", done: true },
    { time: "10:31 AM", event: "Payment received", done: order.status !== "cancelled" },
    { time: "10:35 AM", event: "Preparing", done: order.status === "processing" || order.status === "completed" },
    { time: "10:50 AM", event: "Completed", done: order.status === "completed" },
  ]

  return (
    <BaseModal open={open} onClose={onClose} title="Order Details" size="lg">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-foreground">{order.order_number || `#${order.id.slice(0, 8)}`}</h3>
            <p className="text-sm text-muted-foreground">{order.time}</p>
          </div>
          <StatusBadge label={order.status} variant={statusVariant[order.status]} />
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-xl bg-muted/50 p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <User className="h-3.5 w-3.5" />
              Customer
            </div>
            <p className="text-sm font-medium text-foreground">{order.customer}</p>
          </div>
          <div className="rounded-xl bg-muted/50 p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <MapPin className="h-3.5 w-3.5" />
              Table/Room
            </div>
            <p className="text-sm font-medium text-foreground">{order.tableRoom}</p>
          </div>
          <div className="rounded-xl bg-muted/50 p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Package className="h-3.5 w-3.5" />
              Channel
            </div>
            <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium", channelColors[order.channel ?? 'dine_in'])}>
              {channelLabels[order.channel ?? 'dine_in']}
            </span>
          </div>
          <div className="rounded-xl bg-muted/50 p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <CreditCard className="h-3.5 w-3.5" />
              Total
            </div>
            <p className="text-lg font-bold text-foreground">{formatCurrency(order.total ?? 0)}</p>
          </div>
        </div>

        {/* Items */}
        <div>
          <h4 className="text-sm font-semibold text-foreground mb-3">Order Items</h4>
          <div className="rounded-xl border border-border divide-y divide-border">
            {(order.items || []).map((item: string | OrderItem, i: number) => (
              <div key={i} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-xs font-medium text-primary">
                    {i + 1}
                  </span>
                  <span className="text-sm font-medium text-foreground">{typeof item === 'string' ? item : item.name}</span>
                </div>
                <Receipt className="h-4 w-4 text-muted-foreground" />
              </div>
            ))}
          </div>
        </div>

        {/* Timeline */}
        <div>
          <h4 className="text-sm font-semibold text-foreground mb-3">Order Timeline</h4>
          <div className="space-y-3">
            {timeline.map((step, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full",
                  step.done ? "bg-success text-white" : "bg-muted text-muted-foreground"
                )}>
                  {step.done ? (
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-current" />
                  )}
                </div>
                <div className="flex-1">
                  <p className={cn("text-sm", step.done ? "text-foreground font-medium" : "text-muted-foreground")}>
                    {step.event}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">{step.time}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2 border-t border-border">
          {canAdvance && (
            <Button onClick={() => { onAdvance(order.id); onClose() }} className="flex-1">
              <RefreshCw className="h-4 w-4 mr-2" />
              {order.status === "pending" ? "Start Processing" : "Mark Completed"}
            </Button>
          )}
          {canCancel && (
            <Button variant="destructive" onClick={() => { onCancel(order.id); onClose() }} className="flex-1">
              <XCircle className="h-4 w-4 mr-2" />
              Cancel Order
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </BaseModal>
  )
}

// ── Order Actions ───────────────────────────────────────────────────────────

function OrderActions({
  order,
  onView,
  onAdvance,
  onCancel,
  onDelete,
  onPay,
}: {
  order: Order
  onView: () => void
  onAdvance: (id: string) => void
  onCancel: (id: string) => void
  onDelete: (id: string) => void
  onPay?: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [menuCoords, setMenuCoords] = useState<{ top: number; right: number } | null>(null)

  const handleToggle = () => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setMenuCoords({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    }
    setOpen(!open)
  }

  return (
    <>
      <button
        ref={triggerRef}
        onClick={handleToggle}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground shrink-0"
        aria-label="Order actions"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && menuCoords && createPortal(
        <>
          {/* backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          {/* menu */}
          <div
            style={{
              position: 'fixed',
              top: menuCoords.top,
              right: menuCoords.right,
              zIndex: 50,
              minWidth: '12rem',
            }}
            className="rounded-xl border bg-popover p-1.5 shadow-lg"
          >
            <button
              onClick={() => { onView(); setOpen(false) }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent whitespace-nowrap min-h-[44px]"
            >
              <Eye className="h-4 w-4 text-blue-500" />
              View Details
            </button>
            {statusFlow[order.status] && (
              <button
                onClick={() => { onAdvance(order.id); setOpen(false) }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent whitespace-nowrap min-h-[44px]"
              >
                <RefreshCw className="h-4 w-4 text-emerald-500" />
                {order.status === "pending" ? "Start Processing" : "Mark Completed"}
              </button>
            )}
            {order.status !== "cancelled" && order.status !== "completed" && (
              <button
                onClick={() => { onCancel(order.id); setOpen(false) }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent whitespace-nowrap min-h-[44px]"
              >
                <XCircle className="h-4 w-4 text-amber-500" />
                Cancel Order
              </button>
            )}
            {order.status === "completed" && onPay && (
              <button
                onClick={() => { onPay(order.id); setOpen(false) }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent whitespace-nowrap min-h-[44px]"
              >
                <Banknote className="h-4 w-4 text-emerald-500" />
                Process Payment
              </button>
            )}
            <button
              onClick={() => { onDelete(order.id); setOpen(false) }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10 whitespace-nowrap min-h-[44px]"
            >
              <Trash2 className="h-4 w-4" />
              Delete Order
            </button>
          </div>
        </>,
        document.body
      )}
    </>
  )
}  // ── Main Component ──────────────────────────────────────────────────────────

export function Orders() {
  const { data: dbOrders = [], isLoading: _isLoading, refetch } = useOrdersFromDb()
  const { advanceStatus, cancelBatch } = useOrderBatches()
  const [activeTab, setActiveTab] = useState("all")

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null)
  const [channelFilter, setChannelFilter] = useState<SalesChannel | "all">("all")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc")
  const [showPayment, setShowPayment] = useState(false)
  const [payingOrder, setPayingOrder] = useState<Order | null>(null)

  const stats = useMemo(() => ({
    total: dbOrders.length,
    pending: dbOrders.filter((o) => o.status === "pending").length,
    processing: dbOrders.filter((o) => o.status === "processing").length,
    completed: dbOrders.filter((o) => o.status === "completed").length,
    cancelled: dbOrders.filter((o) => o.status === "cancelled").length,
    totalRevenue: dbOrders.filter((o) => o.status === "completed").reduce((s, o) => s + (o.total ?? 0), 0),
  }), [dbOrders])

  const advanceOrder = async (id: string) => {
    try {
      const order = dbOrders.find((o) => o.id === id)
      if (!order) return
      const nextStatus = statusFlow[order.status]
      if (!nextStatus) return

      await advanceStatus(id)
      refetch()
      showSuccess(`Order ${order.order_number || order.id} ${nextStatus === "completed" ? "completed" : "processing"}`)
    } catch {
      showError('Failed to update order')
    }
  }

  const cancelOrder = async (id: string) => {
    try {
      await cancelBatch(id)
      refetch()
      const order = dbOrders.find((o) => o.id === id)
      showSuccess(`Order ${order?.order_number || order?.id || ""} cancelled`)
    } catch {
      showError('Failed to cancel order')
    }
  }

  const deleteOrder = async () => {
    if (!deleteConfirm) return
    try {
      await cancelBatch(deleteConfirm)
      refetch()
      showSuccess("Order deleted")
    } catch {
      showError('Failed to delete order')
    }
    setDeleteConfirm(null)
  }

  const handlePay = (id: string) => {
    const order = dbOrders.find((o) => o.id === id)
    if (order) {
      setPayingOrder(order)
      setShowPayment(true)
    }
  }

  const exportOrders = () => {
    const headers = ["Order ID", "Customer", "Table/Room", "Items", "Channel", "Total", "Status", "Time"]
    const rows = filtered.map((o) => [
      o.order_number || o.id, o.customer, o.tableRoom, o.items.join(", "),
      channelLabels[o.channel ?? 'dine_in'], String(o.total), o.status, o.time
    ])
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `orders-${new Date().toISOString().split("T")[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    showSuccess("Orders exported successfully")
  }

  const filtered = useMemo(() => {
    let result = activeTab === "all" ? dbOrders : dbOrders.filter((o) => o.status === activeTab)
    if (channelFilter !== "all") {
      result = result.filter((o) => o.channel === channelFilter)
    }
    return result.sort((a, b) => {
      const aTime = new Date(a.created_at || a.createdAt || 0).getTime()
      const bTime = new Date(b.created_at || b.createdAt || 0).getTime()
      return sortOrder === "desc" ? bTime - aTime : aTime - bTime
    })
  }, [activeTab, dbOrders, channelFilter, sortOrder])

  const statusTabs = useMemo(
    () => [
      { id: "all", label: "All", count: dbOrders.length },
      { id: "pending", label: "Pending", count: stats.pending },
      { id: "processing", label: "Processing", count: stats.processing },
      { id: "completed", label: "Completed", count: stats.completed },
      { id: "cancelled", label: "Cancelled", count: stats.cancelled },
    ],
    [dbOrders, stats]
  )

  const columns: Column<Order>[] = [
    { key: "order_number", header: "Order ID", render: (row) => (
      <button onClick={() => setViewingOrder(row)} className="font-medium text-primary hover:underline">{row.order_number || `#${row.id.slice(0, 8)}`}</button>
    )},
    { key: "customer", header: "Customer", render: (row) => <span className="text-foreground">{row.customer}</span> },
    { key: "tableRoom", header: "Table/Room", render: (row) => <span className="text-muted-foreground">{row.tableRoom}</span> },
    { key: "items", header: "Items", render: (row) => (
      <div className="flex items-center gap-1.5">
        <Package className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">{row.items.length} item{row.items.length !== 1 ? "s" : ""}</span>
      </div>
    )},
    {
      key: "voided", header: "Voided",
      render: (row) => {
        const voidedItems = (row.items as Array<any>).filter(
          i => typeof i !== 'string' && i.status === 'voided'
        )
        const voidedCount = voidedItems.reduce((s: number, i: any) => s + (i.quantity || 1), 0)
        if (voidedCount === 0) return <span className="text-muted-foreground/40">—</span>
        return (
          <div className="flex items-center gap-1.5">
            <Ban className="h-3.5 w-3.5 text-red-500/60" />
            <span className="font-medium text-red-600 dark:text-red-400">{voidedCount} voided</span>
          </div>
        )
      },
    },
    { key: "channel", header: "Channel", render: (row) => (
      <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium", channelColors[row.channel ?? 'dine_in'])}>
        {channelLabels[row.channel ?? 'dine_in']}
      </span>
    )},
    { key: "total", header: "Total", render: (row) => <span className="font-semibold text-foreground">{formatCurrency(row.total ?? 0)}</span> },
    { key: "status", header: "Status", render: (row) => <StatusBadge label={row.status} variant={statusVariant[row.status]} /> },
    { key: "time", header: "Time", render: (row) => (
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        <span>{row.time}</span>
      </div>
    )},
    {
      key: "actions", header: "", className: "w-10",
      render: (row) => (
        <OrderActions
          order={row}
          onView={() => setViewingOrder(row)}
          onAdvance={advanceOrder}
          onCancel={cancelOrder}
          onDelete={(id) => setDeleteConfirm(id)}
          onPay={handlePay}
        />
      ),
    },
  ]

  return (
    <PageTransition>
      <motion.div initial="hidden" animate="visible" variants={staggerContainerFast} className="space-y-6">
        <motion.div variants={pageTransitionFast}>
          <PageHeader
            title="Orders"
            icon="ClipboardList"
            description="Manage all orders across channels"
            actions={
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={exportOrders}>
                  <Download className="h-4 w-4 mr-1.5" />
                  Export CSV
                </Button>
              </div>
            }
          />
        </motion.div>

        <motion.div variants={pageTransitionFast} className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Total Orders" value={stats.total} icon="ShoppingBag" color="text-blue-500" index={0} />
          <StatCard label="Pending" value={stats.pending} icon="Clock" color="text-amber-500" index={1} />
          <StatCard label="Processing" value={stats.processing} icon="Timer" color="text-cyan-500" index={2} />
          <StatCard label="Completed" value={stats.completed} icon="CheckCircle2" color="text-success" index={3} />
          <StatCard label="Cancelled" value={stats.cancelled} icon="XCircle" color="text-destructive" index={4} />
          <StatCard label="Revenue" value={formatCurrency(stats.totalRevenue)} icon="DollarSign" color="text-emerald-500" index={5} />
        </motion.div>

        <motion.div variants={pageTransitionFast}>
          <Tabs tabs={statusTabs} activeTab={activeTab} onChange={setActiveTab} />
        </motion.div>

        <motion.div variants={pageTransitionFast}>
          <div className="rounded-xl border border-border bg-card p-5">
            {/* Filter Bar */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
              <div className="flex flex-wrap items-center gap-2">
                <Filter className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="text-sm text-muted-foreground shrink-0">Filters:</span>
                <div className="flex flex-wrap gap-1.5">
                  {(["all", "dine_in", "takeaway", "room_service", "online"] as const).map((ch) => (
                    <button
                      key={ch}
                      onClick={() => setChannelFilter(ch)}
                      className={cn(
                        "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                        channelFilter === ch
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {ch === "all" ? "All Channels" : channelLabels[ch]}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={() => setSortOrder((p) => p === "desc" ? "asc" : "desc")}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowUpDown className="h-3.5 w-3.5" />
                {sortOrder === "desc" ? "Newest First" : "Oldest First"}
              </button>
            </div>
            <DataTable columns={columns} data={filtered} searchable searchKey="orderId" pageSize={12} />
          </div>
        </motion.div>
      </motion.div>

      <OrderDetailModal
        open={!!viewingOrder}
        order={viewingOrder}
        onClose={() => setViewingOrder(null)}
        onAdvance={advanceOrder}
        onCancel={cancelOrder}
      />

      <ConfirmDialog
        open={!!deleteConfirm}
        title="Delete Order"
        message="Are you sure you want to delete this order? This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={deleteOrder}
        onCancel={() => setDeleteConfirm(null)}
      />

      {showPayment && payingOrder && (
        <PosPaymentDialog
          orderId={payingOrder.orderId || payingOrder.id}
          unpaidItems={(payingOrder.items || []).map((item, idx) => ({
            id: `pay-item-${idx}`,
            item_name: typeof item === 'string' ? item : item.name || `Item ${idx + 1}`,
            quantity: 1,
            unit_price: Math.round((payingOrder.total ?? 0) / Math.max((payingOrder.items || []).length, 1)),
            payment_status: 'pending',
          }))}
          customerName={payingOrder.customer}
          selectedTableId={payingOrder.tableRoom || 'walk-in'}
          onClose={() => { setShowPayment(false); setPayingOrder(null) }}
          onComplete={() => {
            setShowPayment(false);
            setPayingOrder(null);
            showSuccess(`Payment processed for ${payingOrder.order_number || payingOrder.id}`);
          }}
        />
      )}
    </PageTransition>
  )
}
