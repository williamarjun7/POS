import { useState, useMemo, useCallback, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useQueryClient } from '@tanstack/react-query'
import { PageTransition } from "@/components/ui/PageTransition"
import { PageHeader } from "@/components/PageHeader"
import { SplitPane } from "@/components/ui/SplitPane"
import { DataTable, type Column } from "@/components/DataTable"
import { BaseModal } from "@/components/ui/modal"
import { FormInput, FormActions } from "@/components/ui/form-field"
import { StatCard } from "@/components/ui/card"
import { StatusBadge } from "@/components/StatusBadge"
import { EmptyState } from "@/components/EmptyState"

import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { cn, formatCurrency, formatNumber } from "@/lib/utils"
import { showSuccess, showError } from "@/components/ui/toast"
import { useCustomers } from "@/lib/services/customer-service"
import { logActivitySafe } from '@/lib/services/activity-log-service'
import { insforge } from '@/lib/services/auth-service'
import { customerKeys } from '@/lib/services/customer-ledger'
import { useServerPagination } from "@/lib/hooks/useServerPagination"
import type { Customer } from "@/lib/services/customer-service"
import type { CustomerStats } from "@/lib/services/customer-aggregation"
import { computeAllCustomerStats } from "@/lib/services/customer-aggregation"
import DateFilterBar, { type DateFilterState, getDateRange } from "@/components/filters/DateFilterBar"
import { PosPaymentDialog, type PaymentResult } from "@/components/payments"
import {
  Plus, Edit, Trash2, Phone, Mail, Search, Filter, X, ArrowUpDown,
  CreditCard, TrendingUp, CheckCircle2, Users, AlertCircle, Eye, ShoppingBag, ChevronRight
} from "lucide-react"
import { CustomerProfile } from "@/components/customers/CustomerProfile"
import { CustomerSearchCombobox } from "@/components/customers/CustomerSearchCombobox"
import { RecentCustomersSection } from "@/components/customers/RecentCustomersSection"
import { FavoritesSection } from "@/components/customers/FavoritesSection"
import { useRecentCustomers } from "@/components/customers/hooks/useRecentCustomers"
import { useFavorites } from "@/components/customers/hooks/useFavorites"
import { useKeyboardShortcuts } from "@/components/customers/hooks/useKeyboardShortcuts"

/* ─── Reusable sub-components ───────────────────────────────── */

function StatusChip({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer select-none",
        active
          ? "border-primary bg-primary/10 text-primary shadow-sm"
          : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {icon}
      {label}
    </button>
  )
}

/* ─── Payment types ────────────────────────────── */

interface PosPaymentItem {
  id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  payment_status: string;
}



function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
}


function daysSince(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  const diff = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
  return diff
}

function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const initials = getInitials(name)
  const sizeClasses = {
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-16 w-16 text-lg",
  }
  return (
    <div className={cn(
      "flex shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary",
      sizeClasses[size]
    )}>
      {initials}
    </div>
  )
}

function CustomerFormModal({
  open,
  customer,
  onSave,
  onClose,
}: {
  open: boolean
  customer?: Customer | null
  onSave: (data: Customer) => void
  onClose: () => void
}) {      const [name, setName] = useState(customer?.name ?? "")
  const [phone, setPhone] = useState(customer?.phone ?? "")
  const [email, setEmail] = useState(customer?.email ?? "")
  const [address, setAddress] = useState(customer?.address ?? "")
  const [nameError, setNameError] = useState("")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setNameError("Name is required")
      return
    }
    if (name.trim().length < 2) {
      setNameError("Name must be at least 2 characters")
      return
    }
    onSave({
      id: customer?.id ?? `c${Date.now()}`,
      name: name.trim(),
      phone,
      email,
      address: address || undefined,
      lastVisit: customer?.lastVisit ?? new Date().toISOString(),
      notes: customer?.notes,
    })
    onClose()
  }

  return (
    <BaseModal open={open} onClose={onClose} title={customer ? "Edit Customer" : "Add Customer"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormInput
          label="Full Name"
          required
          value={name}
          onChange={(e) => { setName(e.target.value); setNameError("") }}
          placeholder="e.g. Ram Sharma"
          error={nameError}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormInput
            label="Phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+977-9841XXXXXX"
          />
          <FormInput
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="john@example.com"
          />
        </div>
        <FormInput
          label="Address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="City, Nepal"
        />
        <FormActions>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">
            {customer ? "Save Changes" : "Add Customer"}
          </Button>
        </FormActions>
      </form>
    </BaseModal>
  )
}


export function Customers() {
  const queryClient = useQueryClient()
  const { customers, isLoading: _isLoading, loadError: _loadError, isSaving: _isSaving, addCustomer, editCustomer, removeCustomer, refresh: refreshCustomers } = useCustomers()
  const [profileRefreshCounter, setProfileRefreshCounter] = useState(0)

  // ── Date filter state (default: This Month) — affects stats and table data ──
  const [dateFilter, setDateFilter] = useState<DateFilterState>({ preset: 'this_month' })
  const dateRange = getDateRange(dateFilter)

  // Server-side pagination for the DataTable
  const {
    data: customerPage,
    totalPages: customerPages,
    page: customerPageNum,
    setPage: setCustomerPage,
    isLoading: customerLoading,
    refresh: refreshCustomerPage,
  } = useServerPagination<import('@/lib/db/types').CustomerRow>('customers', { pageSize: 15, orderBy: 'name', orderDir: 'asc' })

  // ═══ Customer stats computed by shared service (SINGLE source of truth) ═══
  // Uses computeAllCustomerStats() from customer-aggregation.ts
  // which properly filters cancelled invoices from Total Spent
  // and consistently counts order_batches for Total Orders.
  const [customerInvoiceStats, setCustomerInvoiceStats] = useState<
    Map<string, CustomerStats>
  >(new Map())

  // ── Fetch stats on mount + periodic background refresh (30s) ──
  const fetchCustomerStats = useCallback(async () => {
    const customerIds = customerPage.map(r => r.id).filter(Boolean)
    if (customerIds.length === 0) return

    try {
      // Pass the date range to filter invoices by created_at
      const result = await computeAllCustomerStats(
        customerIds,
        dateRange.startDate,
        dateRange.endDate,
      )

      // Convert to plain map for display
      const statsMap = new Map<string, CustomerStats>()
      for (const [id, stats] of result.statsByCustomer) {
        statsMap.set(id, stats)
      }
      setCustomerInvoiceStats(statsMap)

      // Also update header stats
      setRealOutstandingBalance(result.totalOutstandingBalance)
      setCreditCustomerCount(result.creditCustomerCount)

      // Active customer count = number of customers with totalOrders > 0
      // This matches the "Active" filter logic (both use invoice stats)
      let activeCount = 0
      for (const stats of result.statsByCustomer.values()) {
        if (stats.totalOrders > 0) activeCount++
      }
      setActiveCustomerCount(activeCount)
    } catch {
      // Non-critical
    }
  }, [customerPage, dateRange.startDate, dateRange.endDate])

  useEffect(() => {
    fetchCustomerStats()
    const interval = setInterval(() => {
      if (!document.hidden) fetchCustomerStats()
    }, 30_000)
    return () => clearInterval(interval)
  }, [fetchCustomerStats])

  // Map DB rows to display type
  // Stats come from shared aggregation service, not from deprecated DB columns
  const paginatedCustomers: (Customer & {
    totalOrders: number
    totalSpent: number
    outstandingCredit: number
  })[] = customerPage.map(row => {
    const stats = customerInvoiceStats.get(row.id)
    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      email: row.email,
      address: row.address || undefined,
      totalOrders: stats?.totalOrders ?? 0,
      totalSpent: stats?.totalSpent ?? 0,
      outstandingCredit: stats?.outstandingCredit ?? 0,
      lastVisit: row.last_visit ?? new Date().toISOString(),
      notes: row.notes ?? undefined,
    }
  })

  const [search, setSearch] = useState("")
  const [spendMin, setSpendMin] = useState("")
  const [spendMax, setSpendMax] = useState("")
  const [showFilters, setShowFilters] = useState(false)
  type CustomerStatusFilter = 'all' | 'credit' | 'paid' | 'active' | 'inactive'
  const [statusFilter, setStatusFilter] = useState<CustomerStatusFilter>('all')
  const [sortOutstanding, setSortOutstanding] = useState<'none' | 'asc' | 'desc'>('none')
  const [showForm, setShowForm] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<Customer | null>(null)
  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null)
  const [highlightedRowIndex, setHighlightedRowIndex] = useState(-1)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Recent + Favorite customers
  const { recentIds, addRecent, clearRecent } = useRecentCustomers()
  const { favoriteIds } = useFavorites(customers, customerInvoiceStats, { limit: 5 })

  // ═══ Global PosPaymentDialog state ═══
  const [showPosPayment, setShowPosPayment] = useState(false)
  const [posPaymentCustomer, setPosPaymentCustomer] = useState<{ id: string; name: string } | null>(null)
  const [posPaymentItems, setPosPaymentItems] = useState<PosPaymentItem[]>([])

  // ═══ Customer selector for toolbar "Receive Payment" ═══
  const [showCustomerSelect, setShowCustomerSelect] = useState(false)

  // ═══ Outstanding stats — consumed from shared aggregation service ═══
  // The fetchCustomerStats() above also updates these values via computeAllCustomerStats().
  // Initial values are set by the shared hook.
  const [realOutstandingBalance, setRealOutstandingBalance] = useState(0)
  const [creditCustomerCount, setCreditCustomerCount] = useState(0)
  const [activeCustomerCount, setActiveCustomerCount] = useState(0)

  const totalCustomers = customers.length

  // Active customers in the selected date range — derived from invoice stats,
  // matching the same business logic as the "Active" filter (totalOrders > 0).
  // Uses computeAllCustomerStats() which already scopes by date range, so
  // a customer is "active" when they have at least one invoice in the range.
  // This is the SAME data source as the Active filter — they will always agree.
  // The count is computed inside fetchCustomerStats alongside the other KPIs.
  // Filtered list for display
  // Derive customer's display status based on computed stats
  // Icon lookup for status badges
  const statusIcons = useMemo(() => ({
    AlertCircle: <AlertCircle className="h-3 w-3" aria-hidden="true" />,
    CheckCircle2: <CheckCircle2 className="h-3 w-3" aria-hidden="true" />,
    Users: <Users className="h-3 w-3" aria-hidden="true" />,
  }), [])

  function getCustomerStatus(c: {
    totalOrders: number
    outstandingCredit: number
    lastVisit: string
  }): { label: string; variant: 'success' | 'warning' | 'default' | 'secondary'; icon: string } {
    if (c.outstandingCredit > 0) return { label: 'Outstanding', variant: 'warning', icon: 'AlertCircle' }
    if (c.totalOrders > 0) return { label: 'Paid', variant: 'success', icon: 'CheckCircle2' }
    return { label: 'No Orders', variant: 'default', icon: 'Users' }
  }

  interface CustomerRow {
    id: string
    name: string
    phone: string
    email: string
    lastVisit: string
    totalSpent: number
    totalOrders: number
    outstandingCredit: number
    notes?: string
    _status: { label: string; variant: 'success' | 'warning' | 'default' | 'secondary'; icon: string }
  }

  const filteredCustomers = useMemo((): CustomerRow[] => {
    let result = paginatedCustomers.map(c => ({
      ...c,
      _status: getCustomerStatus(c),
    }))

    // Apply status filter
    if (statusFilter === 'credit') {
      result = result.filter(c => c.outstandingCredit > 0)
    } else if (statusFilter === 'paid') {
      result = result.filter(c => c.totalOrders > 0 && c.outstandingCredit === 0)
    } else if (statusFilter === 'active') {
      result = result.filter(c => c.totalOrders > 0)
    } else if (statusFilter === 'inactive') {
      result = result.filter(c => c.totalOrders === 0)
    }

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.phone.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q)
      )
    }
    if (spendMin) {
      result = result.filter((c) => c.totalSpent >= parseFloat(spendMin))
    }
    if (spendMax) {
      result = result.filter((c) => c.totalSpent <= parseFloat(spendMax))
    }
    // Sort by Outstanding if enabled
    if (sortOutstanding === 'asc') {
      result = [...result].sort((a, b) => a.outstandingCredit - b.outstandingCredit)
    } else if (sortOutstanding === 'desc') {
      result = [...result].sort((a, b) => b.outstandingCredit - a.outstandingCredit)
    }
    return result
  }, [paginatedCustomers, search, spendMin, spendMax, sortOutstanding, statusFilter])

  // ═══ Keyboard shortcuts for cashier productivity ═══
  useKeyboardShortcuts({
    itemCount: filteredCustomers.length,
    highlightedIndex: highlightedRowIndex,
    onHighlight: setHighlightedRowIndex,
    onOpen: (index) => {
      const customer = filteredCustomers[index]
      if (customer) {
        setViewingCustomer(customer)
        addRecent(customer.id)
      }
    },
    onClose: () => setViewingCustomer(null),
    onFocusSearch: () => {
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    },
    isModalOpen: showForm || showPosPayment || showCustomerSelect || !!deleteConfirm,
    isProfileOpen: !!viewingCustomer,
    isSearchFocused: document.activeElement === searchInputRef.current,
  })

  // Reset pagination when any filter changes — users should never remain
  // on a later page after changing the filtering criteria.
  useEffect(() => {
    setCustomerPage(0)
  }, [statusFilter, search, spendMin, spendMax, setCustomerPage])

  const hasFilters = search.trim() || spendMin || spendMax

  const clearFilters = useCallback(() => {
    setSearch("")
    setSpendMin("")
    setSpendMax("")
  }, [])

  const emptyTitle = (filter: CustomerStatusFilter): string => {
    switch (filter) {
      case 'credit': return 'No customers with outstanding balances'
      case 'paid': return 'No paid customers found'
      case 'active': return 'No active customers during the selected period'
      case 'inactive': return 'No inactive customers found'
      default: return 'No customers found'
    }
  }

  const emptyDescription = (filter: CustomerStatusFilter): string => {
    switch (filter) {
      case 'credit': return 'All outstanding balances have been settled. Customers with credit will appear here.'
      case 'paid': return 'Customers who have paid invoices with zero outstanding balance will appear here.'
      case 'active': return 'Customers with at least one order in the selected date range will appear here.'
      case 'inactive': return 'Customers with no orders in the selected date range will appear here.'
      default: return 'Try adjusting your search or filters to find what you are looking for.'
    }
  }

  const handleSave = async (data: Customer) => {
    try {
      if (customers.some((c) => c.id === data.id)) {
        await editCustomer(data.id, {
          name: data.name,
          phone: data.phone,
          email: data.email,
          address: data.address,
          notes: data.notes,
        })
        showSuccess("Customer updated")
      } else {
        await addCustomer({
          name: data.name,
          phone: data.phone,
          email: data.email,
          address: data.address,
          lastVisit: data.lastVisit,
          notes: data.notes,
        })
        showSuccess("Customer added")
      }
      // Refresh table, list, and stats after save
      await Promise.all([
        refreshCustomerPage(),
        refreshCustomers(),
        fetchCustomerStats(),
      ])
    } catch {
      showError("Failed to save customer. Check your connection.")
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    try {
      await removeCustomer(deleteConfirm.id)
      showSuccess("Customer deleted")
      // Refresh table, list, and stats after delete
      await Promise.all([
        refreshCustomerPage(),
        refreshCustomers(),
        fetchCustomerStats(),
      ])
    } catch {
      showError("Failed to delete customer. Check your connection.")
    }
    setDeleteConfirm(null)
  }

  // ─── Open global PosPaymentDialog with customer's outstanding invoices ───
  // Uses customer_id as the canonical identifier (not customer_name) to avoid
  // name collisions and ensure correct invoice matching.
  const handleOpenPosPayment = useCallback(async (customerId: string, customerName: string) => {
    try {
      // Fetch unpaid invoices for this customer using customer_id
      const { data: invoices } = await insforge.database
        .from('invoices')
        .select('id, invoice_number, total, discount, status')
        .eq('customer_id', customerId)
        .not('status', 'in', '(paid,cancelled)')
        .order('created_at', { ascending: false })

      if (!invoices || invoices.length === 0) {
        showError('No outstanding invoices for this customer')
        return
      }

      const invoiceIds = invoices.map((inv: any) => inv.id)

      // Fetch existing payments to compute outstanding per invoice
      const { data: payments } = await insforge.database
        .from('payments')
        .select('invoice_id, amount, payment_method')
        .in('invoice_id', invoiceIds)

      const paidByInvoice = new Map<string, number>()
      for (const p of (payments ?? []) as Array<{ invoice_id: string; amount: number; payment_method: string }>) {
        if (p.payment_method !== 'credit' && p.invoice_id) {
          paidByInvoice.set(p.invoice_id, (paidByInvoice.get(p.invoice_id) ?? 0) + Number(p.amount))
        }
      }

      // Convert to OrderItem[] for PosPaymentDialog (each invoice = one item)
      // Outstanding = total - real payments (total is already post-discount)
      const items: PosPaymentItem[] = invoices
        .map((inv: any) => {
          const paid = paidByInvoice.get(inv.id) ?? 0
          const outstanding = Math.max(0, Number(inv.total) - paid)
          return {
            id: inv.id,
            item_name: `Invoice ${inv.invoice_number}`,
            quantity: 1,
            unit_price: outstanding,
            payment_status: 'unpaid',
          }
        })
        .filter((item: PosPaymentItem) => item.unit_price > 0)

      if (items.length === 0) {
        showError('No outstanding balance for this customer')
        return
      }

      setPosPaymentCustomer({ id: customerId, name: customerName })
      setPosPaymentItems(items)
      setShowPosPayment(true)
    } catch {
      showError('Failed to load outstanding invoices')
    }
  }, [])

  // ─── Handle PosPaymentDialog completion ─────────────────────────
  // Creates payment records against invoices and updates statuses.
  const handlePosPaymentComplete = useCallback(async (_invoiceNumber?: string, paymentResult?: PaymentResult) => {
    if (!posPaymentCustomer || !paymentResult) {
      setShowPosPayment(false)
      setPosPaymentCustomer(null)
      setPosPaymentItems([])
      return
    }

    try {
      const { id: customerId, name: customerName } = posPaymentCustomer
      const paidItemIds = paymentResult.paidItemIds ?? []
      const method = paymentResult.paymentMethod ?? 'cash'
      const paidAmount = paymentResult.paidAmount
      const splitPayments = paymentResult.splitPayments
      const creditAmount = paymentResult.creditAmount

      // Determine payment methods: use splitPayments if available, otherwise single method
      const methods: Array<{ method: string; amount: number }> = splitPayments && splitPayments.length > 0
        ? splitPayments
        : [{ method, amount: paidAmount }]

      // ═══ Compute outstanding per invoice for proportional distribution ═══
      const invoiceOutstanding = new Map<string, number>()
      let totalSelectedOutstanding = 0
      for (const item of posPaymentItems) {
        if (paidItemIds.includes(item.id)) {
          invoiceOutstanding.set(item.id, item.unit_price)
          totalSelectedOutstanding += item.unit_price
        }
      }

      // ── Create payment records ───────────────────────────────────
      const createPaymentsForMethod = async (pm: string, pmAmount: number) => {
        if (pmAmount <= 0) return

        // Real-money payment: distribute proportionally across paid invoices
        let distributedSoFar = 0
        const entries = Array.from(invoiceOutstanding.entries())
        for (let i = 0; i < entries.length; i++) {
          const [invId, invOutstanding] = entries[i]
          const isLast = i === entries.length - 1

          let shareAmount = totalSelectedOutstanding > 0
            ? Math.round((pmAmount * (invOutstanding / totalSelectedOutstanding)) * 100) / 100
            : 0

          if (isLast) {
            shareAmount = Math.round((pmAmount - distributedSoFar) * 100) / 100
          }

          if (shareAmount <= 0) continue

          const { error } = await insforge.database
            .from('payments')
            .insert([{
              customer_id: customerId,
              invoice_id: invId,
              amount: shareAmount,
              payment_method: pm,
              notes: pm === 'credit'
                ? `Credit applied for ${customerName}`
                : `Payment received from ${customerName}`,
            }])
          if (error) throw new Error(`Payment insert failed: ${error.message}`)
          distributedSoFar += shareAmount
        }
      }

      for (const pm of methods) {
        await createPaymentsForMethod(pm.method, pm.amount)
      }

      // Handle credit amount from PosPaymentDialog (e.g. partial + auto-credit)
      // ⚠️ Credit payments are now linked to invoice_id (not null) so they
      // participate in invoice status calculation.
      if (creditAmount && creditAmount > 0) {
        await createPaymentsForMethod('credit', creditAmount)
      }

      // ═══ Update invoice statuses using remaining balance ═══
      // Remaining Balance = Invoice Total - Discount - ALL payments (including credit-applied)
      // This ensures a credit-settled invoice gets marked 'paid' when fully settled.
      for (const invId of paidItemIds) {
        const { data: payData } = await insforge.database
          .from('payments')
          .select('amount, payment_method')
          .eq('invoice_id', invId)

        // Include ALL payment methods (including credit) when computing settled status
        const totalPaid = (payData ?? [])
          .reduce((s: number, p: any) => s + Number(p.amount), 0)

        // Fetch actual invoice total from DB
        const { data: invRow } = await insforge.database
          .from('invoices')
          .select('total')
          .eq('id', invId)
          .single()

        if (!invRow) continue
        const invoiceTotal = Number((invRow as any).total)
        // total is already post-discount — don't subtract discount again
        const remaining = Math.max(0, invoiceTotal - totalPaid)
        const newStatus = remaining <= 0 ? 'paid' : 'partial'

        await insforge.database
          .from('invoices')
          .update({ status: newStatus })
          .eq('id', invId)
      }

      // ── Log activity ──────────────────────────────────────
      logActivitySafe({
        activityType: 'payment_received',
        entityId: customerId,
        entityLabel: `Customer payment from ${customerName}`,
        status: 'completed',
        amount: paidAmount,
        details: `Payment of ${formatCurrency(paidAmount)} received from ${customerName}`,
      })

      // ── Invalidate caches ──────────────────────────────────
      queryClient.invalidateQueries({ queryKey: ['dashboard'], refetchType: 'all' })
      queryClient.invalidateQueries({ queryKey: ['batches'], refetchType: 'all' })
      queryClient.invalidateQueries({ queryKey: ['analytics'], refetchType: 'all' })
      queryClient.invalidateQueries({ queryKey: ['finance'], refetchType: 'all' })
      queryClient.invalidateQueries({ queryKey: customerKeys.all, refetchType: 'all' })

      for (const invId of paidItemIds) {
        queryClient.invalidateQueries({ queryKey: ['invoices', 'detail', invId], refetchType: 'all' })
      }

      // ── Refresh local state ────────────────────────────────
      if (viewingCustomer?.id === customerId) {
        setProfileRefreshCounter(prev => prev + 1)
      }
      // Refresh table and customer list first
      await Promise.all([
        refreshCustomerPage(),
        refreshCustomers(),
      ])
      // Compute stats directly with the known customer ID (avoids stale closure)
      try {
        const freshStats = await computeAllCustomerStats(
          [customerId],
          dateRange.startDate,
          dateRange.endDate,
        )
        // Merge fresh stats into existing map
        setCustomerInvoiceStats(prev => {
          const updated = new Map(prev)
          for (const [id, stats] of freshStats.statsByCustomer) {
            updated.set(id, stats)
          }
          return updated
        })
        setRealOutstandingBalance(freshStats.totalOutstandingBalance)
        setCreditCustomerCount(freshStats.creditCustomerCount)
      } catch {
        // Non-critical — the useEffect will pick up changes on next interval
      }

      showSuccess(`Payment of ${formatCurrency(paidAmount)} received from ${customerName}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Payment recording failed'
      showError(msg)
    } finally {
      setShowPosPayment(false)
      setPosPaymentCustomer(null)
      setPosPaymentItems([])
    }
  }, [posPaymentCustomer, posPaymentItems, queryClient, viewingCustomer, refreshCustomerPage, refreshCustomers, dateRange.startDate, dateRange.endDate])

  const columns: Column<CustomerRow>[] = [
    {
      key: "name",
      header: "Customer",
      render: (row: CustomerRow) => (
        <div className="flex items-center gap-3">
          <Avatar name={row.name} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-medium text-foreground truncate">{row.name}</p>
              <StatusBadge label={row._status.label} variant={row._status.variant} icon={statusIcons[row._status.icon as keyof typeof statusIcons]} />
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Phone className="h-3 w-3" /> {row.phone}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Mail className="h-3 w-3" /> {row.email}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "totalOrders",
      header: "Orders",
      render: (row: CustomerRow) => <span className="font-medium text-foreground">{formatNumber(row.totalOrders)}</span>,
    },
    {
      key: "totalSpent",
      header: "Total Spent",
      render: (row: CustomerRow) => <span className="font-semibold text-foreground">{formatCurrency(row.totalSpent)}</span>,
    },
    {
      key: "outstandingCredit",
      header: "Outstanding",
      render: (row: CustomerRow) => {
        const balance = row.outstandingCredit
        const isZero = balance === 0
        const isHigh = balance > 10000
        return (
          <span className={cn(
            'font-semibold tabular-nums',
            isZero
              ? 'text-success'
              : isHigh
                ? 'text-destructive'
                : 'text-amber-600 dark:text-amber-400'
          )}>
            {formatCurrency(balance)}
          </span>
        )
      },
    },
    {
      key: "lastVisit",
      header: "Last Visit",
      render: (row: CustomerRow) => {
        const days = daysSince(row.lastVisit)
        const label = days === 0 ? "Today" : days === 1 ? "Yesterday" : `${days}d ago`
        return (
          <span className={cn(
            "text-muted-foreground",
            days <= 1 && "text-success font-medium"
          )}>
            {label}
          </span>
        )
      },
    },
    {
      key: "actions",
      header: "",
      className: "w-20",
      render: (row: CustomerRow) => (
        <div className="flex items-center justify-end gap-1">
          {/* Always-visible Edit/Delete */}
          <button
            onClick={(e) => { e.stopPropagation(); setEditingCustomer(row); setShowForm(true) }}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 transition-all duration-150 hover:bg-muted hover:text-foreground"
            title={`Edit ${row.name}`}
            aria-label={`Edit ${row.name}`}
          >
            <Edit className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setDeleteConfirm(row) }}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 transition-all duration-150 hover:bg-destructive/10 hover:text-destructive"
            title={`Delete ${row.name}`}
            aria-label={`Delete ${row.name}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          {/* Chevron — always visible to indicate clickability */}
          <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground/70 transition-colors" />
        </div>
      ),
    },
  ]

  // ── Open customer profile (or close if already selected) ──
  const handleSelectCustomer = useCallback((customer: CustomerRow) => {
    // Toggle: clicking the same customer closes the profile
    if (viewingCustomer?.id === customer.id) {
      setViewingCustomer(null)
      return
    }
    setViewingCustomer(customer)
    addRecent(customer.id)
    try {
      localStorage.setItem('customers-last-selected', customer.id)
    } catch { /* ignore */ }
    // Scroll to profile on mobile
    if (window.innerWidth < 1024) {
      setTimeout(() => {
        const profileEl = document.getElementById('customer-profile-panel')
        profileEl?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    }
  }, [viewingCustomer, addRecent])

  /* ─── Shared customer list content for both layouts ─── */
  const renderCustomerList = useCallback(() => (
    <div className="flex h-full flex-col gap-4 overflow-y-auto no-scrollbar">
      {/* Stats + Date Filter */}
      <div className="space-y-3">
        <DateFilterBar filter={dateFilter} dateRange={dateRange} onChange={setDateFilter} />
        <div className="grid grid-cols-3 gap-2">
          <StatCard
            label="Total"
            value={formatNumber(totalCustomers)}
            icon="Users"
            color="text-primary"
            iconBg="bg-primary/10"
            index={0}
          />
          <StatCard
            label="Credit"
            value={formatNumber(creditCustomerCount)}
            icon="CreditCard"
            color="text-amber-600"
            iconBg="bg-amber-50"
            sublabel={dateRange.label}
            index={1}
          />
          <StatCard
            label="Outstanding"
            value={formatCurrency(realOutstandingBalance)}
            icon="AlertCircle"
            color="text-destructive"
            iconBg="bg-destructive/10"
            sublabel={dateRange.label}
            index={2}
          />
        </div>
      </div>

      {/* Top Customers */}
      {favoriteIds.length > 0 && (
        <FavoritesSection
          favoriteIds={favoriteIds}
          customers={customers}
          statsMap={customerInvoiceStats}
          onOpen={(customerId) => {
            const cust = customers.find(c => c.id === customerId)
            if (cust) { setViewingCustomer(cust); addRecent(customerId) }
          }}
        />
      )}

      {/* Recent Customers */}
      <RecentCustomersSection
        recentIds={recentIds}
        customers={customers}
        statsMap={customerInvoiceStats}
        onOpen={(customerId) => {
          const cust = customers.find(c => c.id === customerId)
          if (cust) { setViewingCustomer(cust); addRecent(customerId) }
        }}
        onClear={clearRecent}
      />

      {/* Search, Filters, Status Chips */}
      <div className="rounded-xl border border-border bg-card/70 shadow-sm">
        <div className="p-3 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, phone, email... (Ctrl+F)"
              className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-1 flex-wrap">
              <StatusChip active={statusFilter === 'all'} icon={<Users className="h-3 w-3" />} label="All" onClick={() => setStatusFilter('all')} />
              <StatusChip active={statusFilter === 'credit'} icon={<CreditCard className="h-3 w-3" />} label="Credit" onClick={() => setStatusFilter('credit')} />
              <StatusChip active={statusFilter === 'paid'} icon={<CheckCircle2 className="h-3 w-3" />} label="Paid" onClick={() => setStatusFilter('paid')} />
              <StatusChip active={statusFilter === 'active'} icon={<TrendingUp className="h-3 w-3" />} label="Active" onClick={() => setStatusFilter('active')} />
              <StatusChip active={statusFilter === 'inactive'} icon={<X className="h-3 w-3" />} label="Inactive" onClick={() => setStatusFilter('inactive')} />
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setSortOutstanding(sortOutstanding === 'desc' ? 'none' : 'desc')}
                className={cn("rounded-md px-2 py-1 text-[10px] font-semibold transition-all", sortOutstanding === 'desc' ? 'bg-amber-500 text-white' : 'text-muted-foreground hover:text-foreground')}
                aria-pressed={sortOutstanding === 'desc'} role="radio" aria-label="Highest outstanding first">
                <ArrowUpDown className="h-3 w-3 mr-0.5 inline" />Highest
              </button>
              <button onClick={() => setShowFilters(!showFilters)}
                className={cn("rounded-md px-2 py-1 text-[10px] font-semibold transition-all", showFilters ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground')}>
                <Filter className="h-3 w-3 mr-0.5 inline" />Filters
              </button>
            </div>
          </div>
        </div>

        <AnimatePresence>
          {showFilters && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }} className="overflow-hidden">
              <div className="border-t border-border px-3 py-3">
                <div className="flex gap-2">
                  <input type="number" value={spendMin} onChange={(e) => setSpendMin(e.target.value)}
                    placeholder="Min" className="h-8 w-full rounded-lg border border-border bg-background px-2.5 text-xs outline-none focus:border-primary" />
                  <input type="number" value={spendMax} onChange={(e) => setSpendMax(e.target.value)}
                    placeholder="Max" className="h-8 w-full rounded-lg border border-border bg-background px-2.5 text-xs outline-none focus:border-primary" />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Customer table */}
      <div className="flex-1 min-h-0">
        {filteredCustomers.length === 0 && !customerLoading ? (
          <div className="rounded-xl border border-border bg-card/50 p-8">
            <EmptyState
              icon={statusFilter === 'credit' ? 'CreditCard' : statusFilter === 'paid' ? 'CheckCircle2' : statusFilter === 'active' ? 'TrendingUp' : statusFilter === 'inactive' ? 'X' : 'Users'}
              title={emptyTitle(statusFilter)}
              description={emptyDescription(statusFilter)}
            />
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={filteredCustomers}
            searchable={false}
            loading={customerLoading}
            totalPages={customerPages}
            currentPage={customerPageNum}
            onPageChange={setCustomerPage}
            onRowClick={handleSelectCustomer}
            highlightedIndex={highlightedRowIndex}
            selectedId={viewingCustomer?.id}
            dense
          />
        )}
      </div>
    </div>
  ), [
    dateFilter, dateRange, totalCustomers, creditCustomerCount, realOutstandingBalance,
    favoriteIds, customers, customerInvoiceStats, recentIds, addRecent,
    search, searchInputRef, statusFilter, sortOutstanding, showFilters, spendMin, spendMax,
    filteredCustomers, customerLoading, customerPages, customerPageNum, setCustomerPage,
    handleSelectCustomer, highlightedRowIndex, viewingCustomer, columns, emptyTitle,
    emptyDescription, setViewingCustomer, clearRecent, setShowFilters, setSortOutstanding,
    setStatusFilter, setSearch, setSpendMin, setSpendMax,
  ])

  return (
    <PageTransition>
      {/* Compact header bar with action buttons */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-bold text-foreground">Customers</h1>
          <p className="text-sm text-muted-foreground">Manage your customers, invoices and credit accounts</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowCustomerSelect(true)}>
            <CreditCard className="h-4 w-4" /> Receive Payment
          </Button>
          <Button size="sm" onClick={() => { setEditingCustomer(null); setShowForm(true) }}>
            <Plus className="h-4 w-4" /> Add Customer
          </Button>
        </div>
      </div>

      {/* ─── Conditional layout with smooth transition ─── */}
      <AnimatePresence>
        {viewingCustomer ? (
          <motion.div
            key="split-pane"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <SplitPane
              storageKey="customers-split-ratio"
              defaultLeftPercent={38}
              minLeftWidth={360}
              minRightWidth={480}
              className="h-[calc(100dvh-12rem)]"
              left={renderCustomerList()}
              right={
                <div id="customer-profile-panel" className="h-full overflow-y-auto no-scrollbar rounded-xl border border-border bg-card/70 shadow-sm">
                  <motion.div
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                  >
                    <CustomerProfile
                      customer={viewingCustomer}
                      open={!!viewingCustomer}
                      onClose={() => setViewingCustomer(null)}
                      onEdit={() => {
                        setEditingCustomer(viewingCustomer)
                        setShowForm(true)
                      }}
                      onNewSale={() => {
                        window.location.href = `/pos?customer=${viewingCustomer?.id}`
                      }}
                      onRecordPayment={(customerId) => {
                        const cust = customers.find(c => c.id === customerId)
                        if (cust) handleOpenPosPayment(customerId, cust.name)
                      }}
                      isMobile={false}
                      refreshKey={profileRefreshCounter}
                    />
                  </motion.div>
                </div>
              }
            />
          </motion.div>
        ) : (
          <motion.div
            key="full-table"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="h-[calc(100dvh-12rem)] overflow-y-auto no-scrollbar pr-0 lg:pr-2"
          >
            {renderCustomerList()}
          </motion.div>
        )}
      </AnimatePresence>

      <CustomerFormModal
        open={showForm}
        customer={editingCustomer}
        onSave={handleSave}
        onClose={() => { setShowForm(false); setEditingCustomer(null) }}
      />

      {/* ── Searchable Customer selector (toolbar "Receive Payment") ── */}
      <CustomerSearchCombobox
        open={showCustomerSelect}
        onClose={() => setShowCustomerSelect(false)}
        customers={customers}
        customerOutstanding={new Map(
          Array.from(customerInvoiceStats.entries()).map(([id, stats]) => [id, stats.outstandingCredit])
        )}
        customerStats={new Map(
          Array.from(customerInvoiceStats.entries()).map(([id, stats]) => [id, { totalOrders: stats.totalOrders }])
        )}
        onSelect={(customerId, customerName) => {
          handleOpenPosPayment(customerId, customerName)
        }}
      />

      {/* ── Global PosPaymentDialog ── */}
      {showPosPayment && posPaymentCustomer && (
        <PosPaymentDialog
          orderId={`cust-pay-${posPaymentCustomer.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}
          unpaidItems={posPaymentItems}
          customerName={posPaymentCustomer.name}
          selectedTableId=""
          onClose={() => {
            setShowPosPayment(false)
            setPosPaymentCustomer(null)
            setPosPaymentItems([])
          }}
          onComplete={handlePosPaymentComplete}
          isCustomerPayment
        />
      )}

      <ConfirmDialog
        open={!!deleteConfirm}
        title="Delete Customer"
        message={`Are you sure you want to delete "${deleteConfirm?.name}"? This will also remove their invoice history and cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(null)}
      />
    </PageTransition>
  )
}
