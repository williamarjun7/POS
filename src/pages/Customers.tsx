import { useState, useMemo, useCallback, useEffect } from "react"
import { motion } from "framer-motion"
import { useQueryClient } from '@tanstack/react-query'
import { PageTransition } from "@/components/ui/PageTransition"
import { PageHeader } from "@/components/PageHeader"
import { DataTable, type Column } from "@/components/DataTable"
import { BaseModal } from "@/components/ui/modal"
import { FormInput, FormSelect, FormActions } from "@/components/ui/form-field"
import { StatCard } from "@/components/ui/stat-card"
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
  Plus, Edit, Trash2, Phone, Mail, Search, Filter, X,
  CreditCard, TrendingUp, CheckCircle2, Users
} from "lucide-react"
import { pageTransitionFast, staggerContainer } from "@/lib/animations/presets"
import { CustomerProfile } from "@/components/customers/CustomerProfile"

/* ─── Payment types ────────────────────────────── */

interface PosPaymentItem {
  id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  payment_status: string;
}



const stagger = staggerContainer
const fadeUp = pageTransitionFast

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
  const activeCustomers = activeCustomerCount

  // Filtered list for display
  // Derive customer's display status based on computed stats
  function getCustomerStatus(c: {
    totalOrders: number
    outstandingCredit: number
    lastVisit: string
  }): { label: string; variant: 'success' | 'warning' | 'default' | 'secondary' } {
    if (c.outstandingCredit > 0) return { label: 'Outstanding', variant: 'warning' }
    if (c.totalOrders > 0) return { label: 'Paid', variant: 'success' }
    return { label: 'No Orders', variant: 'default' }
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
    _status: { label: string; variant: 'success' | 'warning' | 'default' | 'secondary' }
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
              <StatusBadge label={row._status.label} variant={row._status.variant} />
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
      key: "id",
      header: "",
      className: "w-20",
      render: (row: CustomerRow) => (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => { setEditingCustomer(row); setShowForm(true) }}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Edit"
          >
            <Edit className="h-4 w-4" />
          </button>
          <button
            onClick={() => setDeleteConfirm(row)}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ]

  return (
    <PageTransition>
      <PageHeader
        title="Customer Management"
        icon="Users"
        description="Manage your customers, invoices, and credit accounts"
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowCustomerSelect(true)}
            >
              <CreditCard className="h-4 w-4" /> Receive Payment
            </Button>
            <Button
              size="sm"
              onClick={() => { setEditingCustomer(null); setShowForm(true) }}
            >
              <Plus className="h-4 w-4" /> Add Customer
            </Button>
          </div>
        }
      />

      {/* Date Filter Bar */}
      <motion.div variants={fadeUp}>
        <DateFilterBar filter={dateFilter} dateRange={dateRange} onChange={setDateFilter} />
      </motion.div>

      <motion.div
        variants={stagger}
        initial="hidden"
        animate="visible"
        className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <motion.div variants={fadeUp} whileHover={{ y: -3, scale: 1.02 }} className="backdrop-blur-sm">
          <StatCard label="Total Customers" value={formatNumber(totalCustomers)} icon="Users" color="text-primary" index={0} />
        </motion.div>
        <motion.div variants={fadeUp} whileHover={{ y: -3, scale: 1.02 }} className="backdrop-blur-sm">
          <StatCard label={`Active (${dateRange.label})`} value={formatNumber(activeCustomers)} icon="TrendingUp" color="text-success" index={1} />
        </motion.div>
        <motion.div variants={fadeUp} whileHover={{ y: -3, scale: 1.02 }} className="backdrop-blur-sm">
          <StatCard label={`Credit (${dateRange.label})`} value={formatNumber(creditCustomerCount)} icon="CreditCard" color="text-warning" index={2} />
        </motion.div>
        <motion.div variants={fadeUp} whileHover={{ y: -3, scale: 1.02 }} className="backdrop-blur-sm">
          <StatCard label={`Outstanding (${dateRange.label})`} value={formatCurrency(realOutstandingBalance)} icon="AlertCircle" color="text-destructive" index={3} />
        </motion.div>
      </motion.div>

      {/* ── Status Filter Chips ── */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {([
          { key: 'all' as const, label: 'All Customers', icon: 'Users' },
          { key: 'credit' as const, label: 'Credit', icon: 'CreditCard' },
          { key: 'paid' as const, label: 'Paid', icon: 'CheckCircle2' },
          { key: 'active' as const, label: 'Active', icon: 'TrendingUp' },
          { key: 'inactive' as const, label: 'Inactive', icon: 'X' },
        ] as const).map(({ key, label, icon: _icon }) => (
          <button
            key={key}
            onClick={() => setStatusFilter(key)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all',
              statusFilter === key
                ? 'border-primary bg-primary/10 text-primary shadow-sm'
                : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            {key === 'credit' && <CreditCard className="h-3.5 w-3.5" />}
            {key === 'paid' && <CheckCircle2 className="h-3.5 w-3.5" />}
            {key === 'active' && <TrendingUp className="h-3.5 w-3.5" />}
            {key === 'inactive' && <X className="h-3.5 w-3.5" />}
            {key === 'all' && <Users className="h-3.5 w-3.5" />}
            {label}
          </button>
        ))}
      </div>

      <div className="mb-4 rounded-xl border border-border bg-card/70 backdrop-blur-sm p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, phone, or email..."
              className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex items-center gap-2">
            {/* Sort by Outstanding */}
            <div className="flex rounded-lg border p-0.5 bg-muted/50">
              <button
                onClick={() => setSortOutstanding(sortOutstanding === 'desc' ? 'none' : 'desc')}
                className={cn(
                  "inline-flex items-center justify-center rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-all whitespace-nowrap",
                  sortOutstanding === 'desc'
                    ? 'bg-amber-500 text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                title="Highest outstanding first"
              >
                Highest
              </button>
              <button
                onClick={() => setSortOutstanding(sortOutstanding === 'asc' ? 'none' : 'asc')}
                className={cn(
                  "inline-flex items-center justify-center rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-all whitespace-nowrap",
                  sortOutstanding === 'asc'
                    ? 'bg-amber-500 text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                title="Lowest outstanding first"
              >
                Lowest
              </button>
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                "flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors",
                showFilters
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted"
              )}
            >
              <Filter className="h-4 w-4" /> Filters
              {hasFilters && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  {[search, spendMin, spendMax].filter(Boolean).length}
                </span>
              )}
            </button>
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="flex h-10 items-center gap-1.5 rounded-xl border border-border px-3 text-sm text-muted-foreground hover:bg-muted transition-colors"
              >
                <X className="h-3 w-3" /> Clear
              </button>
            )}
          </div>
        </div>

        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mt-4 grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-2"
          >
            <FormInput
              label="Min Spend"
              type="number"
              value={spendMin}
              onChange={(e) => setSpendMin(e.target.value)}
              placeholder="e.g. 10000"
            />
            <FormInput
              label="Max Spend"
              type="number"
              value={spendMax}
              onChange={(e) => setSpendMax(e.target.value)}
              placeholder="e.g. 100000"
            />
          </motion.div>
        )}
      </div>

      {/* Two-column layout: table on left, profile on right */}
      <div className={cn(
        "flex gap-4",
        viewingCustomer ? "flex-col lg:flex-row" : "flex-col"
      )}>
        {/* Customer table - takes full width when no profile, splits when profile is open */}
        <div className={cn(
          "min-w-0",
          viewingCustomer ? "w-full lg:w-1/2 xl:w-3/5" : "w-full"
        )}>
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="rounded-xl border border-border bg-card/70 backdrop-blur-sm p-5 shadow-sm overflow-x-auto"
          >
            {filteredCustomers.length === 0 && !customerLoading ? (
            <EmptyState
              icon={statusFilter === 'credit' ? 'CreditCard' : statusFilter === 'paid' ? 'CheckCircle2' : statusFilter === 'active' ? 'TrendingUp' : statusFilter === 'inactive' ? 'X' : 'Users'}
              title={emptyTitle(statusFilter)}
              description={emptyDescription(statusFilter)}
            />
          ) : (
            <DataTable
              columns={columns}
              data={filteredCustomers}
              searchable={false}
              loading={customerLoading}
              totalPages={customerPages}
              currentPage={customerPageNum}
              onPageChange={setCustomerPage}
              onRowClick={(row) => setViewingCustomer(row)}
            />
          )}
          </motion.div>
        </div>

        {/* Profile Panel - Fullscreen overlay on mobile, sidebar on desktop */}
        <div className={cn(
          viewingCustomer
            ? "fixed inset-0 z-50 flex flex-col lg:relative lg:inset-auto lg:z-auto lg:w-1/2 xl:w-2/5 lg:block"
            : "hidden"
        )}>
          {/* Backdrop for mobile */}
          {viewingCustomer && (
            <div
              className="fixed inset-0 bg-black/30 lg:hidden"
              onClick={() => setViewingCustomer(null)}
            />
          )}
          <div className="relative flex-1 overflow-y-auto lg:max-h-[calc(100dvh-16rem)] lg:rounded-xl lg:border lg:border-border lg:shadow-sm">
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
                // CustomerProfile already has access to the customer name
                const cust = customers.find(c => c.id === customerId)
                if (cust) handleOpenPosPayment(customerId, cust.name)
              }}
              isMobile={false}
              refreshKey={profileRefreshCounter}
            />
          </div>
        </div>
      </div>

      <CustomerFormModal
        open={showForm}
        customer={editingCustomer}
        onSave={handleSave}
        onClose={() => { setShowForm(false); setEditingCustomer(null) }}
      />

      {/* ── Customer selector dialog (toolbar "Receive Payment") ── */}
      <BaseModal
        open={showCustomerSelect}
        onClose={() => setShowCustomerSelect(false)}
        title="Select Customer"
        size="sm"
      >
        <div className="space-y-3">
          <FormSelect
            label="Customer"
            value=""
            onChange={(e) => {
              const cust = customers.find(c => c.id === e.target.value)
              if (cust) {
                setShowCustomerSelect(false)
                handleOpenPosPayment(cust.id, cust.name)
              }
            }}
            options={[
              { value: "", label: "Choose a customer..." },
              ...customers.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
        </div>
      </BaseModal>

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
