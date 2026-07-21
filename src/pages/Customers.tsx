import { useState, useMemo, useCallback, useEffect } from "react"
import { motion } from "framer-motion"
import { useQueryClient } from '@tanstack/react-query'
import { PageTransition } from "@/components/ui/PageTransition"
import { PageHeader } from "@/components/PageHeader"
import { StatusBadge } from "@/components/StatusBadge"
import { DataTable, type Column } from "@/components/DataTable"
import { BaseModal } from "@/components/ui/modal"
import { FormInput, FormSelect, FormActions } from "@/components/ui/form-field"
import { StatCard } from "@/components/ui/stat-card"

import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { cn, formatCurrency, formatNumber } from "@/lib/utils"
import { showSuccess, showError } from "@/components/ui/toast"
import { useCustomers } from "@/lib/services/customer-service"
import { idempotencyGuard } from "@/lib/services/idempotency-guard"
import { logActivitySafe } from '@/lib/services/activity-log-service'
import { insforge } from '@/lib/services/auth-service'
import { customerKeys } from '@/lib/services/customer-ledger'
import { invoiceKeys } from '@/lib/core/query-keys'
import { useServerPagination } from "@/lib/hooks/useServerPagination"
import type { Customer } from "@/lib/services/customer-service"
import { PaymentMethodBadge } from "@/components/PaymentMethodBadge"
import { getPaymentMethodLabel } from "@/lib/payment-methods"
import type { PaymentMethod } from "@/types"
import {
  Plus, Edit, Trash2, Phone, Mail, Search, Filter, X, Check,
  CreditCard, TrendingUp, Loader2, CheckCircle2
} from "lucide-react"
import { pageTransitionFast, staggerContainer } from "@/lib/animations/presets"
import { CustomerProfile } from "@/components/customers/CustomerProfile"

/* ─── Invoice types ────────────────────────────── */

interface Invoice {
  id: string
  invoiceNumber: string
  customerId: string
  customerName: string
  items: { name: string; quantity: number; price: number }[]
  subtotal: number
  tax: number
  discount: number
  total: number
  paid: number
  status: "paid" | "pending" | "overdue" | "partial"
  paymentMethod: PaymentMethod
  createdAt: string
  dueDate?: string
}

interface PaymentSplit {
  method: string
  amount: number
}

const paymentMethodOptions = (["cash", "fonepay", "reception_qr"] as PaymentMethod[]).map(m => ({
  value: m,
  label: getPaymentMethodLabel(m),
}))

const paymentStatusVariant: Record<string, "default" | "success" | "warning" | "destructive" | "info" | "secondary"> = {
  paid: "success",
  pending: "warning",
  overdue: "destructive",
  partial: "info",
}



const stagger = staggerContainer
const fadeUp = pageTransitionFast

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
}

function formatDateTime(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
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
      totalOrders: customer?.totalOrders ?? 0,
      totalSpent: customer?.totalSpent ?? 0,
      lastVisit: customer?.lastVisit ?? new Date().toISOString(),
      loyaltyPoints: customer?.loyaltyPoints ?? 0,
      creditBalance: customer?.creditBalance ?? 0,
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
        <div className="grid grid-cols-2 gap-4">
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

function ReceivePaymentModal({
  open,
  customers,
  initialCustomerId,
  onClose,
  onReceive,
}: {
  open: boolean
  customers: Customer[]
  initialCustomerId?: string | null
  onClose: () => void
  onReceive: (customerId: string, amount: number, method: string, notes: string, invoiceIds?: string[]) => Promise<void> | void
}) {
  // ── State ─────────────────────────────────────────────────
  const fromProfile = !!initialCustomerId
  const [selectedCustomerId, setSelectedCustomerId] = useState(initialCustomerId ?? "")
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([])
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplit[]>([{ method: "cash", amount: 0 }])
  const [notes, setNotes] = useState("")
  const [customerInvoices, setCustomerInvoices] = useState<Invoice[]>([])
  const [invoicesLoading, setInvoicesLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [refreshCounter, setRefreshCounter] = useState(0)

  // ── Sync initialCustomerId from profile ────────────────────
  useEffect(() => {
    if (open && initialCustomerId) {
      setSelectedCustomerId(initialCustomerId)
      setSelectedInvoiceIds([])
      setPaymentSplits([{ method: "cash", amount: 0 }])
      setNotes("")
    }
  }, [initialCustomerId, open])

  // ── Fetch invoices for selected customer ───────────────────
  useEffect(() => {
    if (!selectedCustomerId || !open) {
      if (!selectedCustomerId) setCustomerInvoices([])
      return
    }
    const selected = customers.find(c => c.id === selectedCustomerId)
    if (!selected) return
    setInvoicesLoading(true)
    ;(async () => {
      try {
        const { data, error } = await insforge.database
          .from('invoices')
          .select('*')
          .eq('customer_name', selected.name)
          .order('created_at', { ascending: false })
        if (error) throw error
        const invoiceRows = data ?? []
        const invoiceIds = invoiceRows.map((r: any) => r.id)

        // ═══ Fetch already-paid amounts per invoice (real money only) ═══
        // Credit is NOT payment — filter it out so outstanding is correct.
        const paidByInvoice = new Map<string, number>()
        if (invoiceIds.length > 0) {
          const { data: paymentsData } = await insforge.database
            .from('payments')
            .select('invoice_id, amount, payment_method')
            .in('invoice_id', invoiceIds)
          const payments = (paymentsData ?? []) as Array<{ invoice_id: string; amount: number; payment_method: string }>
          for (const p of payments) {
            if (p.payment_method !== 'credit' && p.invoice_id) {
              paidByInvoice.set(p.invoice_id, (paidByInvoice.get(p.invoice_id) ?? 0) + p.amount)
            }
          }
        }

        const fetchedInvoices = invoiceRows.map((row: any) => {
          const paid = paidByInvoice.get(row.id) ?? 0
          return {
            id: row.id,
            invoiceNumber: row.invoice_number,
            customerId: row.customer_id ?? row.id,
            customerName: row.customer_name,
            items: [],
            subtotal: row.subtotal,
            tax: row.tax,
            discount: row.discount,
            total: row.total,
            paid,  // Add paid amount for outstanding calculation
            status: row.status as Invoice['status'],
            paymentMethod: (row.payment_method as Invoice['paymentMethod']) ?? 'cash',
            createdAt: row.created_at,
            dueDate: row.due_date ?? undefined,
          }
        })
        setCustomerInvoices(fetchedInvoices)

        // Auto-select all unpaid invoices when opened from profile
        if (initialCustomerId && fetchedInvoices.length > 0) {
          const unpaidIds = fetchedInvoices
            .filter(inv => inv.status !== 'paid' && inv.status !== 'cancelled')
            .map(inv => inv.id)
          if (unpaidIds.length > 0) {
            setSelectedInvoiceIds(unpaidIds)
          }
        }
      } catch {
        setCustomerInvoices([])
      } finally {
        setInvoicesLoading(false)
      }
    })()
  }, [selectedCustomerId, customers, refreshCounter, open, initialCustomerId])

  // ── Derived data ────────────────────────────────────────────
  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId),
    [customers, selectedCustomerId]
  )

  // Compute outstanding credit from fetched invoices (source of truth)
  const selectedOutstanding = useMemo(() => {
    return customerInvoices
      .filter(inv => inv.status !== 'paid' && inv.status !== 'cancelled')
      .reduce((sum, inv) => sum + Math.max(0, inv.total - inv.paid), 0)
  }, [customerInvoices])

  const outstandingInvoices = useMemo(() => {
    if (!selectedCustomerId) return []
    return customerInvoices.filter(
      (inv) => inv.status !== 'paid' && inv.status !== 'cancelled'
    )
  }, [selectedCustomerId, customerInvoices])

  const outstandingInvoicesWithBalance = useMemo(() => {
    return outstandingInvoices.map(inv => ({
      ...inv,
      outstanding: Math.max(0, inv.total - inv.paid),
    }))
  }, [outstandingInvoices])

  const selectedTotal = useMemo(() => {
    return outstandingInvoicesWithBalance
      .filter((inv) => selectedInvoiceIds.includes(inv.id))
      .reduce((sum, inv) => sum + inv.outstanding, 0)
  }, [outstandingInvoicesWithBalance, selectedInvoiceIds])

  const totalPaid = paymentSplits.reduce((sum, s) => sum + s.amount, 0)
  const remaining = selectedTotal - totalPaid

  // ── Handlers ───────────────────────────────────────────────
  const toggleInvoice = (id: string) => {
    setSelectedInvoiceIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    )
  }

  const selectAllInvoices = () => {
    if (selectedInvoiceIds.length === outstandingInvoices.length) {
      setSelectedInvoiceIds([])
    } else {
      setSelectedInvoiceIds(outstandingInvoices.map((i) => i.id))
    }
  }

  const addSplit = () => {
    setPaymentSplits((prev) => [...prev, { method: "cash", amount: 0 }])
  }

  const removeSplit = (index: number) => {
    if (paymentSplits.length <= 1) return
    setPaymentSplits((prev) => prev.filter((_, i) => i !== index))
  }

  const updateSplit = (index: number, field: keyof PaymentSplit, value: string | number) => {
    setPaymentSplits((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s))
    )
  }

  const handleReceive = async () => {
    if (!selectedCustomerId || selectedInvoiceIds.length === 0 || isSubmitting) return
    if (totalPaid <= 0) {
      showError('Enter payment amount')
      return
    }
    if (remaining < -1) {
      showError('Payment amount exceeds total')
      return
    }

    setIsSubmitting(true)
    try {
      // Pass all splits with their individual amounts so the parent can create
      // separate payment records per method
      const splitsJson = JSON.stringify(paymentSplits.map(s => ({
        method: s.method,
        amount: s.amount || 0,
      })))
      await onReceive(selectedCustomerId, totalPaid, splitsJson, notes, selectedInvoiceIds)
      showSuccess(`Payment of ${formatCurrency(totalPaid)} received${notes ? ` — ${notes}` : ''}`)
      setSelectedInvoiceIds([])
      setPaymentSplits([{ method: "cash", amount: 0 }])
      setNotes("")
      if (!fromProfile) {
        setSelectedCustomerId("")
      }
      // Close the modal after successful payment
      onClose()
    } catch {
      showError('Failed to record payment. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Keyboard shortcuts ─────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose()
      }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !isSubmitting) {
        handleReceive()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, isSubmitting, handleReceive, onClose])

  // ── Render ─────────────────────────────────────────────────
  const canSubmit = totalPaid > 0 && selectedInvoiceIds.length > 0 && !isSubmitting

  return (
    <BaseModal
      open={open}
      onClose={() => { if (!isSubmitting) onClose() }}
      title={fromProfile && selectedCustomer ? `Receive Payment — ${selectedCustomer.name}` : "Receive Payment"}
      size="md"
      footer={
        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting} size="sm">
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleReceive}
            disabled={!canSubmit}
            className="bg-success hover:bg-success/90 min-w-[140px]"
            size="sm"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Check className="h-4 w-4" /> Confirm Payment
              </>
            )}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Outstanding credit line - compact header replacement */}
        {fromProfile && selectedCustomer && (
          <div className="flex items-center justify-between -mt-1 mb-1">
            <span className="text-sm text-muted-foreground">
              Outstanding Credit: <span className="font-semibold text-foreground">{formatCurrency(selectedOutstanding)}</span>
            </span>
            {outstandingInvoices.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {outstandingInvoices.length} unpaid
              </span>
            )}
          </div>
        )}

        {/* Standalone customer selector */}
        {!fromProfile && (
          <FormSelect
            label="Select Customer"
            value={selectedCustomerId}
            onChange={(e) => {
              setSelectedCustomerId(e.target.value)
              setSelectedInvoiceIds([])
            }}
            options={[
              { value: "", label: "Choose a customer..." },
              ...customers.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
        )}

        {/* Loading state */}
        {invoicesLoading && (
          <div className="flex items-center justify-center py-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading invoices...
            </div>
          </div>
        )}

        {/* Outstanding invoices - compact design */}
        {!invoicesLoading && outstandingInvoices.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Outstanding Invoices
              </h4>
              {outstandingInvoices.length > 1 && (
                <button
                  type="button"
                  onClick={selectAllInvoices}
                  className="text-[11px] font-medium text-primary hover:text-primary/80 transition-colors"
                >
                  {selectedInvoiceIds.length === outstandingInvoices.length ? "Deselect All" : "Select All"}
                </button>
              )}
            </div>
            <div className="space-y-1 max-h-36 overflow-y-auto">
              {outstandingInvoicesWithBalance.map((inv) => (
                <label
                  key={inv.id}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-colors cursor-pointer",
                    selectedInvoiceIds.includes(inv.id)
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selectedInvoiceIds.includes(inv.id)}
                    onChange={() => toggleInvoice(inv.id)}
                    className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary shrink-0"
                  />
                  <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{inv.invoiceNumber}</p>
                      <p className="text-[11px] text-muted-foreground">{formatDateTime(inv.createdAt)}</p>
                      {inv.paid > 0 && (
                        <p className="text-[10px] text-success">{formatCurrency(inv.paid)} already paid</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-sm font-semibold text-foreground">
                        {formatCurrency(inv.outstanding)}
                      </span>
                      {inv.paid > 0 && (
                        <p className="text-[10px] text-muted-foreground">of {formatCurrency(inv.total)}</p>
                      )}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* No outstanding invoices */}
        {!invoicesLoading && selectedCustomerId && outstandingInvoices.length === 0 && (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success/10 mb-2">
              <CheckCircle2 className="h-5 w-5 text-success" />
            </div>
            <p className="text-sm font-medium text-foreground">All paid up</p>
            <p className="text-xs text-muted-foreground mt-0.5">This customer has no outstanding invoices.</p>
          </div>
        )}

        {/* Payment form */}
        {selectedInvoiceIds.length > 0 && (
          <>
            <div className="border-t border-border pt-3">
              <div className="flex items-center justify-between mb-2.5">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Payment</h4>
                <button
                  type="button"
                  onClick={addSplit}
                  className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                >
                  + Split
                </button>
              </div>
              <div className="space-y-2">
                {paymentSplits.map((split, index) => (
                  <div key={index} className="grid grid-cols-[1fr_130px] gap-2.5 items-end">
                    <FormSelect
                      label={index === 0 ? 'Method' : `Method ${index + 1}`}
                      value={split.method}
                      onChange={(e) => updateSplit(index, 'method', e.target.value)}
                      options={paymentMethodOptions}
                    />
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-muted-foreground">Amount</label>
                      <div className="flex gap-1">
                        <input
                          type="number"
                          value={split.amount || ''}
                          onChange={(e) => updateSplit(index, 'amount', parseFloat(e.target.value) || 0)}
                          onWheel={e => (e.target as HTMLInputElement).blur()}
                          className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                          placeholder="Enter amount"
                          min={0}
                          autoFocus={index === 0}
                        />
                        {paymentSplits.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeSplit(index)}
                            className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Quick-fill button */}
              {totalPaid === 0 && selectedTotal > 0 && (
                <button
                  type="button"
                  onClick={() => setPaymentSplits([{ method: paymentSplits[0].method, amount: selectedTotal }])}
                  className="mt-2 w-full rounded-lg border border-dashed border-muted-foreground/30 px-3 py-2 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-colors"
                >
                  Pay full amount — {formatCurrency(selectedTotal)}
                </button>
              )}
            </div>

            {/* Live summary - compact single line */}
            <div className="flex items-center justify-between gap-4 rounded-lg bg-muted/40 px-3 py-2.5 border border-border/50">
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-muted-foreground">Outstanding:</span>
                <span className="font-medium text-foreground">{formatCurrency(selectedTotal)}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-muted-foreground">Receiving:</span>
                <span className={cn('font-medium', totalPaid > 0 ? 'text-success' : 'text-muted-foreground')}>
                  {formatCurrency(totalPaid)}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-muted-foreground">Remaining:</span>
                <span className={cn(
                  'font-semibold',
                  remaining <= 0 ? 'text-success' : remaining > 0 && totalPaid > 0 ? 'text-destructive' : 'text-muted-foreground'
                )}>
                  {formatCurrency(remaining)}
                </span>
              </div>
            </div>

            {/* Notes - compact */}
            <div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes (optional)"
                rows={1}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors resize-none placeholder:text-muted-foreground/60"
              />
            </div>

          </>
        )}
      </div>
    </BaseModal>
  )
}

export function Customers() {
  const queryClient = useQueryClient()
  const { customers, isLoading: _isLoading, loadError: _loadError, isSaving: _isSaving, addCustomer, editCustomer, removeCustomer, refresh: refreshCustomers } = useCustomers()
  const [profileRefreshCounter, setProfileRefreshCounter] = useState(0)
  // Server-side pagination for the DataTable
  const {
    data: customerPage,
    totalPages: customerPages,
    page: customerPageNum,
    setPage: setCustomerPage,
    isLoading: customerLoading,
    refresh: refreshCustomerPage,
  } = useServerPagination<import('@/lib/db/types').CustomerRow>('customers', { pageSize: 15, orderBy: 'name', orderDir: 'asc' })

  // ═══ Compute real order/spend stats from invoices for displayed customers ═══
  // The stored total_orders / total_spent / credit_balance columns were dropped.
  // We compute these values from invoices instead.
  const [customerInvoiceStats, setCustomerInvoiceStats] = useState<
    Map<string, { totalOrders: number; totalSpent: number }>
  >(new Map())

  useEffect(() => {
    let cancelled = false
    const customerIds = customerPage.map(r => r.id).filter(Boolean)
    if (customerIds.length === 0) return

    ;(async () => {
      try {
        // Fetch all invoices belonging to any displayed customer
        const { data: invoicesData } = await insforge.database
          .from('invoices')
          .select('customer_id, total')
          .in('customer_id', customerIds)

        if (cancelled) return

        const invoiceRows = (invoicesData ?? []) as Array<{
          customer_id: string | null
          total: number
        }>

        // Aggregate: for each customer, count invoices and sum totals
        const stats = new Map<string, { totalOrders: number; totalSpent: number }>()
        for (const inv of invoiceRows) {
          if (!inv.customer_id) continue
          const current = stats.get(inv.customer_id) ?? { totalOrders: 0, totalSpent: 0 }
          current.totalOrders++
          current.totalSpent += Number(inv.total)
          stats.set(inv.customer_id, current)
        }

        setCustomerInvoiceStats(stats)
      } catch {
        // Non-critical — fall through to stale row values
      }
    })()

    return () => { cancelled = true }
  }, [customerPage])

  // Map DB rows to Customer type for DataTable display
  // Uses invoice-computed stats when available, falls back to row values
  const paginatedCustomers: import('@/lib/services/customer-service').Customer[] = customerPage.map(row => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    address: row.address || undefined,
    totalOrders: customerInvoiceStats.get(row.id)?.totalOrders ?? 0,
    totalSpent: customerInvoiceStats.get(row.id)?.totalSpent ?? 0,
    lastVisit: row.last_visit ?? new Date().toISOString(),
    loyaltyPoints: 0,
    creditBalance: 0,
    notes: row.notes ?? undefined,
  }))

  const [search, setSearch] = useState("")
  const [spendMin, setSpendMin] = useState("")
  const [spendMax, setSpendMax] = useState("")
  const [showFilters, setShowFilters] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<Customer | null>(null)
  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null)
  const [showPayment, setShowPayment] = useState(false)
  const [paymentCustomerId, setPaymentCustomerId] = useState<string | null>(null)
  const [paymentSelectedInvoiceIds, setPaymentSelectedInvoiceIds] = useState<string[]>([])

  // ═══ Fetch real outstanding stats from invoices (not stale customers.credit_balance) ═══
  const [realOutstandingBalance, setRealOutstandingBalance] = useState(0)
  const [creditCustomerCount, setCreditCustomerCount] = useState(0)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        // Fetch all non-paid, non-cancelled invoices
        const { data: outstandingInvoices } = await insforge.database
          .from('invoices')
          .select('id, customer_id, total, status')
          .not('status', 'in', ['paid', 'cancelled'])

        if (cancelled || !outstandingInvoices) return

        const invoiceIds = (outstandingInvoices as Array<{ id: string; customer_id: string | null; total: number }>)
          .map(inv => inv.id)

        // Get real payments for these invoices (credit is NOT payment)
        const paidByInvoice = new Map<string, number>()
        if (invoiceIds.length > 0) {
          const { data: payments } = await insforge.database
            .from('payments')
            .select('invoice_id, amount, payment_method')
            .in('invoice_id', invoiceIds)
          for (const p of (payments ?? []) as Array<{ invoice_id: string; amount: number; payment_method: string }>) {
            if (p.payment_method !== 'credit' && p.invoice_id) {
              paidByInvoice.set(p.invoice_id, (paidByInvoice.get(p.invoice_id) ?? 0) + Number(p.amount))
            }
          }
        }

        // Calculate outstanding per customer
        const customersWithDebt = new Set<string>()
        let totalOutstanding = 0
        for (const inv of outstandingInvoices as Array<{ id: string; customer_id: string | null; total: number }>) {
          const paid = paidByInvoice.get(inv.id) ?? 0
          const outstanding = Math.max(0, Number(inv.total) - paid)
          if (outstanding > 0) {
            totalOutstanding += outstanding
            if (inv.customer_id) customersWithDebt.add(inv.customer_id)
          }
        }

        if (!cancelled) {
          setRealOutstandingBalance(totalOutstanding)
          setCreditCustomerCount(customersWithDebt.size)
        }
      } catch {
        // Fallback to stale values on error — non-critical
      }
    })()
    return () => { cancelled = true }
  }, [])

  const totalCustomers = customers.length
  const activeCustomers = customers.filter((c) => daysSince(c.lastVisit) <= 7).length

  const filteredCustomers = useMemo(() => {
    let result = paginatedCustomers
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
    return result
  }, [paginatedCustomers, search, spendMin, spendMax])

  const hasFilters = search.trim() || spendMin || spendMax

  const clearFilters = useCallback(() => {
    setSearch("")
    setSpendMin("")
    setSpendMax("")
  }, [])

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
          totalOrders: data.totalOrders,
          totalSpent: data.totalSpent,
          lastVisit: data.lastVisit,
          loyaltyPoints: data.loyaltyPoints,
          creditBalance: data.creditBalance,
          notes: data.notes,
        })
        showSuccess("Customer added")
      }
    } catch {
      showError("Failed to save customer. Check your connection.")
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    try {
      await removeCustomer(deleteConfirm.id)
      showSuccess("Customer deleted")
    } catch {
      showError("Failed to delete customer. Check your connection.")
    }
    setDeleteConfirm(null)
  }

  const handleReceivePayment = async (
    customerId: string,
    amount: number,
    method: string,
    notes: string,
    invoiceIds?: string[],
  ) => {
    try {
      const current = customers.find((c) => c.id === customerId)
      if (!current) {
        showError('Customer not found')
        return
      }

      // Check idempotency (prevent duplicate payments)
      const { isDuplicate, proceed, idempotencyKey } = await idempotencyGuard.check({
        entityType: 'customer',
        entityId: customerId,
        amount,
        discriminator: method,
      })

      if (!proceed) {
        if (isDuplicate) {
          showSuccess('Payment already processed')
        }
        setShowPayment(false)
        return
      }

      // Parse splits — each split becomes one payment record
      let splits: Array<{ method: string; amount: number }>
      try {
        splits = JSON.parse(method)
      } catch {
        // Legacy: method is a simple string, treat as single split
        splits = [{ method, amount }]
      }

      // Create payment records via direct DB insert (customer-level, not invoice-level)
      // Using raw insert because createPaymentInDb requires a single invoiceId (UUID)
      // which doesn't fit the customer-payment pattern against multiple invoices.
      // ═══ invoice_id is ALWAYS set for non-credit payments ═══
      // This links the payment to an invoice so the ReceivePaymentModal can
      // find it later when computing already-paid amounts. Without this, payments
      // recorded through this modal are invisible to the outstanding calculation.
      // A DB CHECK constraint enforces this at the database level:
      //   payment_method != 'credit' → invoice_id IS NOT NULL
      // When multiple invoices are selected, all splits get attributed to the
      // first invoice (approximate but prevents FK violations). The per-invoice
      // status-update loop below independently handles each invoice's outstanding.
      const firstInvoiceId = invoiceIds && invoiceIds.length > 0 ? invoiceIds[0] : null
      for (const split of splits) {
        if (split.amount <= 0) continue
        const { error: payError } = await insforge.database
          .from('payments')
          .insert([{
            customer_id: customerId,
            invoice_id: split.method === 'credit' ? null : firstInvoiceId,
            amount: split.amount,
            payment_method: split.method,
            reference: idempotencyKey,
            notes: notes || `Payment received from ${current.name}`,
          }])
        if (payError) {
          throw new Error(`Payment insert failed: ${payError.message || 'Unknown DB error'}`)
        }
      }

      // NOTE: credit_balance is no longer stored on the customers table.
      // Outstanding credit is calculated dynamically from invoices.
      // Payment records inserted above are the source of truth.

      // Update invoice statuses — only for the selected invoices
      if (invoiceIds && invoiceIds.length > 0) {
        const { data: invData } = await insforge.database
          .from('invoices')
          .select('id, total')
          .in('id', invoiceIds)
        // Fetch already-paid amounts (real money only) to compute outstanding
        const invoiceIdSet = new Set(invoiceIds)
        const { data: payData } = await insforge.database
          .from('payments')
          .select('invoice_id, amount, payment_method')
          .in('invoice_id', invoiceIds)
        const paidByInvoice = new Map<string, number>()
        for (const p of (payData ?? []) as Array<{ invoice_id: string; amount: number; payment_method: string }>) {
          if (p.payment_method !== 'credit' && p.invoice_id) {
            paidByInvoice.set(p.invoice_id, (paidByInvoice.get(p.invoice_id) ?? 0) + p.amount)
          }
        }
        if (invData) {
          for (const row of invData as Array<{ id: string; total: number }>) {
            const paidSoFar = paidByInvoice.get(row.id) ?? 0
            const outstanding = Math.max(0, Number(row.total) - paidSoFar)
            const isFullyCovered = (amount - 0.01) >= outstanding
            const newStatus = isFullyCovered ? 'paid' : 'partial'
            await insforge.database
              .from('invoices')
              .update({ status: newStatus })
              .eq('id', row.id)
          }
        }
      }

      // Log activity (non-critical)
      logActivitySafe({
        activityType: 'payment_received',
        entityId: customerId,
        entityLabel: `Customer payment from ${current.name}`,
        status: 'completed',
        amount,
        details: `Payment of ${formatCurrency(amount)} received from ${current.name} via ${method}${notes ? ` — ${notes}` : ''}`,
      })

      // ── Invalidate ALL relevant React Query caches ──────────────
      // refetchType: 'all' ensures inactive queries (e.g., Finance tabs that
      // aren't currently open) also refetch when the user navigates back.
      queryClient.invalidateQueries({ queryKey: ['dashboard'], refetchType: 'all' })
      queryClient.invalidateQueries({ queryKey: ['batches'], refetchType: 'all' })
      queryClient.invalidateQueries({ queryKey: ['analytics'], refetchType: 'all' })
      queryClient.invalidateQueries({ queryKey: ['finance'], refetchType: 'all' })

      // Customer keys — so useCustomerBalance, useCustomerLedger, etc. refetch
      queryClient.invalidateQueries({ queryKey: customerKeys.all, refetchType: 'all' })

      // Invoice keys — so invoice detail pages update
      if (invoiceIds) {
        for (const invId of invoiceIds) {
          queryClient.invalidateQueries({ queryKey: invoiceKeys.detail(invId), refetchType: 'all' })
          queryClient.invalidateQueries({ queryKey: invoiceKeys.payments(invId), refetchType: 'all' })
        }
      }

      // ── Refresh local state ────────────────────────────────────
      // Trigger profile refresh if we're viewing this customer
      if (viewingCustomer?.id === customerId) {
        setProfileRefreshCounter(prev => prev + 1)
      }

      // Refresh the server-paginated table data as well
      await refreshCustomerPage()

      // Refresh customer list to update balances in the table
      await refreshCustomers()

    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error'
      showError(`Failed to record payment: ${errMsg}`)
      throw new Error('Payment recording failed')
    }
  }

  const columns: Column<Customer>[] = [
    {
      key: "name",
      header: "Customer",
      render: (row) => (
        <div className="flex items-center gap-3">
          <Avatar name={row.name} />
          <div className="min-w-0">
            <p className="font-medium text-foreground truncate">{row.name}</p>
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
      render: (row) => <span className="font-medium text-foreground">{formatNumber(row.totalOrders)}</span>,
    },
    {
      key: "totalSpent",
      header: "Total Spent",
      render: (row) => <span className="font-semibold text-foreground">{formatCurrency(row.totalSpent)}</span>,
    },
    {
      key: "lastVisit",
      header: "Last Visit",
      render: (row) => {
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
      render: (row) => (
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
              onClick={() => setShowPayment(true)}
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
          <StatCard label="Active (7d)" value={formatNumber(activeCustomers)} icon="TrendingUp" color="text-success" index={1} />
        </motion.div>
        <motion.div variants={fadeUp} whileHover={{ y: -3, scale: 1.02 }} className="backdrop-blur-sm">
          <StatCard label="Credit Customers" value={formatNumber(creditCustomerCount)} icon="CreditCard" color="text-warning" index={2} />
        </motion.div>
        <motion.div variants={fadeUp} whileHover={{ y: -3, scale: 1.02 }} className="backdrop-blur-sm">
          <StatCard label="Outstanding Balance" value={formatCurrency(realOutstandingBalance)} icon="AlertCircle" color="text-destructive" index={3} />
        </motion.div>
      </motion.div>



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
        <div className={cn(
          "min-w-0",
          viewingCustomer ? "lg:w-1/2 xl:w-3/5" : "w-full"
        )}>
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="rounded-xl border border-border bg-card/70 backdrop-blur-sm p-5 shadow-sm"
          >
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
          </motion.div>
        </div>

        {/* Profile Panel - Slide-in on desktop, overlay on mobile */}
        <div className={cn(
          viewingCustomer
            ? "fixed inset-0 z-50 lg:relative lg:inset-auto lg:z-auto lg:w-1/2 xl:w-2/5"
            : "hidden"
        )}>
          {/* Backdrop for mobile */}
          {viewingCustomer && (
            <div
              className="fixed inset-0 bg-black/30 lg:hidden"
              onClick={() => setViewingCustomer(null)}
            />
          )}
          <div className="relative h-full lg:h-auto lg:max-h-[calc(100vh-16rem)] lg:rounded-xl lg:border lg:border-border lg:shadow-sm lg:overflow-hidden">
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
                setPaymentCustomerId(customerId)
                setShowPayment(true)
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

      <ReceivePaymentModal
        open={showPayment}
        customers={customers}
        initialCustomerId={paymentCustomerId}
        onClose={() => { setShowPayment(false); setPaymentCustomerId(null) }}
        onReceive={handleReceivePayment}
      />

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
