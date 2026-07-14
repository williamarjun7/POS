import { useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  DollarSign,
  Package,
  CalendarDays,
  AlertTriangle,
  ShoppingCart,
  Wrench,
  CheckCircle2,
  X,
  Trash2,
  Bell,
  Sparkles,
} from "lucide-react"
import { PageTransition } from "@/components/ui/PageTransition"
import { Tabs } from "@/components/Tabs"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { EmptyState } from "@/components/EmptyState"
import { StatusBadge } from "@/components/StatusBadge"
import { Button } from "@/components/ui/button"
import { showSuccess, showError } from "@/components/ui/toast"
import { cn } from "@/lib/utils"
import { useNotifications } from "@/lib/services/notification-service"
import type { Notification, NotificationType } from "@/types"
import { pageTransitionFast, staggerContainerFast } from "@/lib/animations/presets"

const typeConfig: Record<NotificationType, {
  icon: typeof DollarSign
  color: string
  bg: string
  border: string
}> = {
  payment: { icon: DollarSign, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10", border: "border-l-emerald-500" },
  inventory: { icon: Package, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10", border: "border-l-amber-500" },
  reservation: { icon: CalendarDays, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10", border: "border-l-blue-500" },
  system: { icon: AlertTriangle, color: "text-red-600 dark:text-red-400", bg: "bg-red-500/10", border: "border-l-red-500" },
  order: { icon: ShoppingCart, color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-500/10", border: "border-l-violet-500" },
  maintenance: { icon: Wrench, color: "text-slate-600 dark:text-slate-400", bg: "bg-slate-500/10", border: "border-l-slate-500" },
}

const priorityConfig: Record<string, { label: string; variant: "destructive" | "warning" | "default" }> = {
  urgent: { label: "Urgent", variant: "destructive" },
  high: { label: "High", variant: "warning" },
  low: { label: "Low", variant: "default" },
}

function getPriority(n: Notification): string | null {
  if (n.type === "payment" && n.title.toLowerCase().includes("overdue")) return "urgent"
  if (n.type === "inventory" && n.title.toLowerCase().includes("low stock")) return "high"
  if (n.type === "order" && n.title.toLowerCase().includes("large order")) return "high"
  if (n.type === "system" && n.title.toLowerCase().includes("update")) return "high"
  return null
}

function getDateGroup(date: Date): string {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const notifDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())

  if (notifDate.getTime() === today.getTime()) return "Today"
  if (notifDate.getTime() === yesterday.getTime()) return "Yesterday"
  return "Earlier"
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return "yesterday"
  return `${days}d ago`
}

function groupNotifications(notifications: Notification[]): { label: string; items: Notification[] }[] {
  const groups: Record<string, Notification[]> = {}
  const order = ["Today", "Yesterday", "Earlier"]

  for (const n of notifications) {
    const group = getDateGroup(n.timestamp)
    if (!groups[group]) groups[group] = []
    groups[group].push(n)
  }

  return order
    .filter((label) => groups[label]?.length)
    .map((label) => ({ label, items: groups[label] }))
}

const listContainer = staggerContainerFast

const tabFilters: { id: string; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "payment", label: "Payments" },
  { id: "inventory", label: "Inventory" },
  { id: "reservation", label: "Reservations" },
  { id: "order", label: "Orders" },
  { id: "system", label: "System" },
  { id: "maintenance", label: "Maintenance" },
]

export function Notifications() {
  const [activeTab, setActiveTab] = useState("all")
  const { notifications: items, isLoading: _isLoading, loadError: _loadError, markAsRead, markAllRead, dismiss, clearAll, refresh: _refreshNotifications } = useNotifications()
  const [clearConfirm, setClearConfirm] = useState(false)

  const unreadCount = items.filter((n) => !n.read).length

  const filtered = useMemo(() => {
    return items.filter((n) => {
      if (activeTab === "all") return true
      if (activeTab === "unread") return !n.read
      return n.type === activeTab
    })
  }, [items, activeTab])

  const grouped = useMemo(() => groupNotifications(filtered), [filtered])

  const handleMarkAsRead = async (id: string) => {
    try {
      await markAsRead(id)
    } catch {
      showError("Failed to mark as read")
    }
  }

  const handleMarkAllRead = async () => {
    try {
      await markAllRead()
      showSuccess("All notifications marked as read")
    } catch {
      showError("Failed to mark all as read")
    }
  }

  const handleDismiss = async (id: string) => {
    try {
      await dismiss(id)
      showSuccess("Notification dismissed")
    } catch {
      showError("Failed to dismiss notification")
    }
  }

  const handleClearAll = async () => {
    try {
      await clearAll()
      showSuccess("All notifications cleared")
    } catch {
      showError("Failed to clear notifications")
    } finally {
      setClearConfirm(false)
    }
  }

  const tabsWithCounts = tabFilters.map((t) => ({
    ...t,
    count: t.id === "all"
      ? items.length
      : t.id === "unread"
        ? unreadCount
        : items.filter((n) => n.type === t.id).length,
  }))

  return (
    <PageTransition>
      <motion.div
        initial="hidden"
        animate="visible"
        variants={staggerContainerFast}
        className="space-y-6"
      >
        <motion.div variants={pageTransitionFast} className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <motion.div
              animate={{ rotate: [0, -10, 10, -10, 0] }}
              transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 4 }}
            >
              <Bell className="h-8 w-8 text-primary" />
            </motion.div>
            <div>
              <h1 className="text-2xl font-bold">Notifications</h1>
              <p className="text-sm text-muted-foreground">Stay updated with real-time alerts</p>
            </div>
            {unreadCount > 0 && (
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="relative"
              >
                <div className="flex h-7 items-center rounded-full bg-primary px-2.5 text-xs font-semibold text-primary-foreground">
                  {unreadCount}
                </div>
              </motion.div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <StatusBadge label={`${unreadCount} unread`} variant="info" />
            )}
            {unreadCount > 0 && (
              <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
                <CheckCircle2 className="mr-1.5 h-4 w-4" />
                Mark all read
              </Button>
            )}
            {items.length > 0 && (
              <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/5 hover:text-destructive" onClick={() => setClearConfirm(true)}>
                <Trash2 className="mr-1.5 h-4 w-4" />
                Clear All
              </Button>
            )}
          </div>
        </motion.div>

      <motion.div variants={pageTransitionFast}>
        <Tabs tabs={tabsWithCounts} activeTab={activeTab} onChange={setActiveTab} />
      </motion.div>

      {grouped.length === 0 ? (
        <motion.div variants={pageTransitionFast}>
          <EmptyState
            icon="Bell"
            title="No notifications"
            description="You're all caught up! New alerts will appear here."
          />
        </motion.div>
      ) : (
        <div className="space-y-6">
          <AnimatePresence mode="popLayout">
            {grouped.map((group) => (
              <motion.div
                key={group.label}
                variants={listContainer}
                initial="hidden"
                animate="visible"
                exit="hidden"
                className="space-y-2"
              >
                <div className="flex items-center gap-3 px-1">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </h3>
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground">{group.items.length}</span>
                </div>

                <div className="space-y-2">
                  {group.items.map((n) => {
                    const cfg = typeConfig[n.type]
                    const IconComp = cfg.icon
                    const priority = getPriority(n)

                    return (
                      <motion.button
                        key={n.id}
                        variants={pageTransitionFast}
                        layout
                        exit={{ opacity: 0, x: -20, transition: { duration: 0.2 } }}
                        whileHover={{ x: 4, scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        onClick={() => handleMarkAsRead(n.id)}
                        className={cn(
                          "group relative flex w-full items-start gap-4 rounded-xl border-l-4 border border-border p-4 text-left transition-all backdrop-blur-sm",
                          n.read ? "border-l-border bg-card/70 opacity-75 hover:opacity-100 hover:bg-card/90" : "border-l-primary bg-primary/[0.03] bg-card/80"
                        )}
                      >
                        <motion.div 
                          className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", cfg.bg)}
                          whileHover={{ rotate: 10, scale: 1.1 }}
                        >
                          <IconComp className={cn("h-5 w-5", cfg.color)} />
                        </motion.div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className={cn("text-sm", n.read ? "font-medium text-foreground/80" : "font-semibold text-foreground")}>
                              {n.title}
                            </h4>
                            {priority && (
                              <StatusBadge
                                label={priorityConfig[priority].label}
                                variant={priorityConfig[priority].variant}
                              />
                            )}
                          </div>
                          <p className="mt-0.5 text-sm text-muted-foreground">{n.message}</p>
                          <div className="mt-1.5 flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{timeAgo(n.timestamp)}</span>
                            {!n.read && (
                              <motion.span 
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                              >
                                <Sparkles className="h-3 w-3" />
                                New
                              </motion.span>
                            )}
                          </div>
                        </div>

                        <button
                          onClick={(e) => { e.stopPropagation(); handleDismiss(n.id) }}
                          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                        >
                          <X className="h-4 w-4" />
                        </button>

                        {!n.read && (
                          <div className="absolute left-0 top-4 h-2 w-2 -translate-x-1/2 rounded-full bg-primary" />
                        )}
                      </motion.button>
                    )
                  })}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <ConfirmDialog
        open={clearConfirm}
        onConfirm={handleClearAll}
        onCancel={() => setClearConfirm(false)}
        title="Clear All Notifications"
        message="Are you sure you want to clear all notifications? This action cannot be undone."
        confirmLabel="Clear All"
        variant="danger"
      />
    </motion.div>
    </PageTransition>
  )
}

