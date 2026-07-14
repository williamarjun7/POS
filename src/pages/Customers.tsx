import { useState, useMemo, useCallback, useEffect } from "react"
import { motion } from "framer-motion"
import { PageTransition } from "@/components/ui/PageTransition"
import { PageHeader } from "@/components/PageHeader"
import { StatusBadge } from "@/components/StatusBadge"
import { DataTable, type Column } from "@/components/DataTable"
import { BaseModal } from "@/components/ui/modal"
import { FormInput, FormSelect, FormTextarea, FormActions } from "@/components/ui/form-field"
import { StatCard } from "@/components/ui/stat-card"

import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { cn, formatCurrency, formatNumber } from "@/lib/utils"
import { showSuccess, showError } from "@/components/ui/toast"
import { useCustomers } from "@/lib/services/customer-service"
import { idempotencyGuard } from "@/lib/services/idempotency-guard"
import { logActivitySafe } from '@/lib/services/activity-log-service'
import { insforge } from '@/lib/services/auth-service'
import { useServerPagination } from "@/lib/hooks/useServerPagination"
import type { Customer } from "@/lib/services/customer-service"
import { PaymentMethodBadge } from "@/components/PaymentMethodBadge"
import { getPaymentMethodLabel } from "@/lib/payment-methods"
import type { PaymentMethod } from "@/types"
import {
  Plus, Edit, Trash2, Phone, Mail, Search, Filter, X,
  CreditCard, TrendingUp,
  FileText, Check, Star, Wallet, AlertTriangle
} from "lucide-react"
import { pageTransitionFast, staggerContainer } from "@/lib/animations/presets"

/* ─── Invoice types ────────────────────────────── */

interface InvoiceItem {
  name: string
  quantity: number
  price: number
}

interface Invoice {
  id: string
  invoiceNumber: string
  customerId: string
  customerName: string
  items: InvoiceItem[]
  subtotal: number
  tax: number
  discount: number
  total: number
  status: "paid" | "pending" | "overdue" | "partial"
  paymentMethod: PaymentMethod
  createdAt: string
  dueDate?: string
}

interface PaymentSplit {
  method: string
  amount: number
}

const paymentMethodOptions = (["cash", "fonepay", "credit", "reception_qr"] as PaymentMethod[]).map(m => ({
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

function CustomerProfileDrawer({
  open,
  customer,
  onClose,
  onReceivePayment,
}: {
  open: boolean
  customer: Customer | null
  onClose: () => void
  onReceivePayment: (customerId: string, amount: number, method: string, notes: string) => Promise<void> | void
}) {
  const [showPaymentInline, setShowPaymentInline] = useState(false)
  const [payMethod, setPayMethod] = useState("cash")
  const [payAmount, setPayAmount] = useState("")
  const [payNotes, setPayNotes] = useState("")

  const [customerInvoices, setCustomerInvoices] = useState<Invoice[]>([])
  const [_invoicesLoading, setInvoicesLoading] = useState(false)
  const [refreshCounter, setRefreshCounter] = useState(0)

  // Fetch invoices from DB when customer changes or after payment
  useEffect(() => {
    if (!customer) {
      setCustomerInvoices([])
      return
    }
    setInvoicesLoading(true)
    ;(async () => {
      try {
        const { data, error } = await insforge.database
          .from('invoices')
          .select('*')
          .eq('customer_name', customer.name)
          .order('created_at', { ascending: false })
        if (error) throw error
        setCustomerInvoices((data ?? []).map(row => ({
          id: row.id,
          invoiceNumber: row.invoice_number,
          customerId: row.customer_id ?? row.id,
          customerName: row.customer_name,
          items: [],
          subtotal: row.subtotal,
          tax: row.tax,
          discount: row.discount,
          total: row.total,
          status: row.status as Invoice['status'],
          paymentMethod: (row.payment_method as Invoice['paymentMethod']) ?? 'cash',
          createdAt: row.created_at,
          dueDate: row.due_date ?? undefined,
        })))
      } catch {
        setCustomerInvoices([])
      } finally {
        setInvoicesLoading(false)
      }
    })()
  }, [customer, refreshCounter])

  const outstandingInvoices = useMemo(() => {
    return customerInvoices.filter((inv) => inv.status !== "paid")
  }, [customerInvoices])

  const totalOutstanding = useMemo(() => {
    return outstandingInvoices.reduce((sum, inv) => sum + inv.total, 0)
  }, [outstandingInvoices])

  const paymentHistory = useMemo(() => {
    if (!customer) return []
    return customerInvoices
      .filter((inv) => inv.status === "paid")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [customerInvoices, customer])

  if (!customer) return null

  const stats = [
    { label: "Total Orders", value: customer.totalOrders, icon: FileText, color: "text-primary" },
    { label: "Total Spent", value: formatCurrency(customer.totalSpent), icon: TrendingUp, color: "text-success" },
    { label: "Loyalty Points", value: formatNumber(customer.loyaltyPoints), icon: Star, color: "text-warning" },
    { label: "Credit Balance", value: formatCurrency(customer.creditBalance), icon: Wallet, color: "text-destructive" },
  ]

  const handlePay = async () => {
    const amt = parseFloat(payAmount) || 0
    if (amt <= 0) { showError("Enter an amount"); return }
    await onReceivePayment(customer.id, amt, payMethod, payNotes)
    setShowPaymentInline(false)
    setPayAmount("")
    setPayNotes("")
    setRefreshCounter(prev => prev + 1)
  }

  return (
    <BaseModal open={open} onClose={onClose} title="Customer Profile" size="lg">
      <div className="space-y-6">
        <div className="flex items-start gap-4">
          <Avatar name={customer.name} size="lg" />
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-foreground truncate">{customer.name}</h3>
            <div className="mt-1 space-y-0.5 text-sm text-muted-foreground">
              {customer.phone && (
                <div className="flex items-center gap-1.5">
                  <Phone className="h-3 w-3" /> {customer.phone}
                </div>
              )}
              {customer.email && (
                <div className="flex items-center gap-1.5">
                  <Mail className="h-3 w-3" /> {customer.email}
                </div>
              )}
              {customer.address && (
                <div className="text-xs text-muted-foreground">{customer.address}</div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="flex items-center gap-3 rounded-xl border border-border bg-muted/50 px-4 py-3"
            >
              <stat.icon className={cn("h-5 w-5 shrink-0", stat.color)} />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="text-sm font-semibold text-foreground truncate">{stat.value}</p>
              </div>
            </div>
          ))}
        </div>

        {totalOutstanding > 0 && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <span className="text-sm font-medium text-foreground">Outstanding Balance</span>
              </div>
              <span className="text-lg font-bold text-destructive">{formatCurrency(totalOutstanding)}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{outstandingInvoices.length} unpaid invoice(s)</p>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => setShowPaymentInline(!showPaymentInline)}
            disabled={totalOutstanding === 0}
          >
            <CreditCard className="h-4 w-4" /> Receive Payment
          </Button>
        </div>

        {showPaymentInline && totalOutstanding > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            className="rounded-xl border border-border bg-muted/30 p-4 space-y-3"
          >
            <div className="grid grid-cols-2 gap-3">
              <FormSelect
                label="Method"
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
                options={paymentMethodOptions}
              />
              <FormInput
                label="Amount"
                type="number"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder={`Max: ${formatCurrency(totalOutstanding)}`}
                min={0}
              />
            </div>
            <FormTextarea
              label="Notes"
              value={payNotes}
              onChange={(e) => setPayNotes(e.target.value)}
              placeholder="Optional..."
              rows={1}
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowPaymentInline(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handlePay}
                disabled={!payAmount || parseFloat(payAmount) <= 0}
                className="bg-success hover:bg-success/90"
              >
                <Check className="h-4 w-4" /> Confirm
              </Button>
            </div>
          </motion.div>
        )}

        <div>
          <h4 className="mb-3 text-sm font-semibold text-foreground">All Invoices</h4>
          {customerInvoices.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No invoices found</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border max-h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Invoice</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Date</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Amount</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {customerInvoices.map((inv) => (
                    <tr key={inv.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2 font-medium text-foreground">{inv.invoiceNumber}</td>
                      <td className="px-3 py-2 text-muted-foreground">{formatDateTime(inv.createdAt)}</td>
                      <td className="px-3 py-2 text-right font-medium text-foreground">{formatCurrency(inv.total)}</td>
                      <td className="px-3 py-2 text-center">
                        <StatusBadge label={inv.status} variant={paymentStatusVariant[inv.status]} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {paymentHistory.length > 0 && (
          <div>
            <h4 className="mb-3 text-sm font-semibold text-foreground">Payment History</h4>
            <div className="space-y-2">
              {paymentHistory.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-success/10">
                      <Check className="h-4 w-4 text-success" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{inv.invoiceNumber}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(inv.createdAt)} &middot; <PaymentMethodBadge method={inv.paymentMethod} size="sm" showIcon={false} /></p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-success">{formatCurrency(inv.total)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {customer.notes && (
          <div>
            <h4 className="mb-2 text-sm font-semibold text-foreground">Notes</h4>
            <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
              <p className="text-sm text-muted-foreground">{customer.notes}</p>
            </div>
          </div>
        )}
      </div>
    </BaseModal>
  )
}

function ReceivePaymentModal({
  open,
  customers,
  onClose,
  onReceive,
}: {
  open: boolean
  customers: Customer[]
  onClose: () => void
  onReceive: (customerId: string, amount: number, method: string, notes: string) => Promise<void> | void
}) {
  const [selectedCustomerId, setSelectedCustomerId] = useState("")
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([])
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplit[]>([{ method: "cash", amount: 0 }])
  const [notes, setNotes] = useState("")
  const [customerInvoices, setCustomerInvoices] = useState<Invoice[]>([])
  const [_invoicesLoading, setInvoicesLoading] = useState(false)
  const [refreshCounter, setRefreshCounter] = useState(0)

  // Fetch invoices for the selected customer
  useEffect(() => {
    if (!selectedCustomerId) {
      setCustomerInvoices([])
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
        setCustomerInvoices((data ?? []).map(row => ({
          id: row.id,
          invoiceNumber: row.invoice_number,
          customerId: row.customer_id ?? row.id,
          customerName: row.customer_name,
          items: [],
          subtotal: row.subtotal,
          tax: row.tax,
          discount: row.discount,
          total: row.total,
          status: row.status as Invoice['status'],
          paymentMethod: (row.payment_method as Invoice['paymentMethod']) ?? 'cash',
          createdAt: row.created_at,
          dueDate: row.due_date ?? undefined,
        })))
      } catch {
        setCustomerInvoices([])
      } finally {
        setInvoicesLoading(false)
      }
    })()
  }, [selectedCustomerId, customers, refreshCounter])

  const creditCustomers = useMemo(
    () => customers.filter((c) => c.creditBalance > 0),
    [customers]
  )

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId),
    [customers, selectedCustomerId]
  )

  const outstandingInvoices = useMemo(() => {
    if (!selectedCustomerId) return []
    return customerInvoices.filter(
      (inv) => inv.status !== "paid"
    )
  }, [selectedCustomerId, customerInvoices])

  const selectedTotal = useMemo(() => {
    return outstandingInvoices
      .filter((inv) => selectedInvoiceIds.includes(inv.id))
      .reduce((sum, inv) => sum + inv.total, 0)
  }, [outstandingInvoices, selectedInvoiceIds])

  const totalPaid = paymentSplits.reduce((sum, s) => sum + s.amount, 0)
  const remaining = selectedTotal - totalPaid

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
    if (!selectedCustomerId || selectedInvoiceIds.length === 0) return
    if (totalPaid <= 0) {
      showError("Enter payment amount")
      return
    }
    if (remaining < -1) {
      showError("Payment amount exceeds total")
      return
    }
    await onReceive(selectedCustomerId, totalPaid, paymentSplits[0].method, notes)
    setSelectedCustomerId("")
    setSelectedInvoiceIds([])
    setPaymentSplits([{ method: "cash", amount: 0 }])
    setNotes("")
    setRefreshCounter(prev => prev + 1)
  }

  return (
    <BaseModal open={open} onClose={onClose} title="Receive Payment" size="lg">
      <div className="space-y-5">
        <FormSelect
          label="Select Customer"
          value={selectedCustomerId}
          onChange={(e) => {
            setSelectedCustomerId(e.target.value)
            setSelectedInvoiceIds([])
          }}
          options={[
            { value: "", label: "Choose a customer..." },
            ...creditCustomers.map((c) => ({ value: c.id, label: `${c.name} (${formatCurrency(c.creditBalance)} credit)` })),
          ]}
        />

        {outstandingInvoices.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-foreground">Outstanding Invoices</h4>
              <button
                type="button"
                onClick={selectAllInvoices}
                className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
              >
                {selectedInvoiceIds.length === outstandingInvoices.length ? "Deselect All" : "Select All"}
              </button>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {outstandingInvoices.map((inv) => (
                <label
                  key={inv.id}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors cursor-pointer",
                    selectedInvoiceIds.includes(inv.id)
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selectedInvoiceIds.includes(inv.id)}
                    onChange={() => toggleInvoice(inv.id)}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{inv.invoiceNumber}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(inv.createdAt)} &middot; {inv.items.length} item(s)</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-foreground">{formatCurrency(inv.total)}</p>
                    <StatusBadge label={inv.status} variant={paymentStatusVariant[inv.status]} />
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {selectedInvoiceIds.length > 0 && (
          <>
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-foreground">Payment Details</h4>
                <button
                  type="button"
                  onClick={addSplit}
                  className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                >
                  + Split Payment
                </button>
              </div>
              <div className="space-y-3">
                {paymentSplits.map((split, index) => (
                  <div key={index} className="grid grid-cols-[1fr_120px] gap-3 items-end">
                    <FormSelect
                      label={index === 0 ? "Payment Method" : `Method ${index + 1}`}
                      value={split.method}
                      onChange={(e) => updateSplit(index, "method", e.target.value)}
                      options={paymentMethodOptions}
                    />
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-muted-foreground">Amount</label>
                      <div className="flex gap-1">
                        <input
                          type="number"
                          value={split.amount || ""}
                          onChange={(e) => updateSplit(index, "amount", parseFloat(e.target.value) || 0)}
                          onWheel={e => (e.target as HTMLInputElement).blur()}
                          className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                          placeholder="0"
                          min={0}
                        />
                        {paymentSplits.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeSplit(index)}
                            className="h-10 w-10 shrink-0 flex items-center justify-center rounded-xl border border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Outstanding</span>
                <span className="font-medium text-foreground">{formatCurrency(selectedTotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Amount Paid</span>
                <span className="font-medium text-success">{formatCurrency(totalPaid)}</span>
              </div>
              <div className="border-t border-border pt-1.5 flex justify-between text-sm">
                <span className="text-muted-foreground font-medium">Remaining</span>
                <span className={cn(
                  "font-semibold",
                  remaining <= 0 ? "text-success" : "text-destructive"
                )}>
                  {formatCurrency(remaining)}
                </span>
              </div>
            </div>

            <FormTextarea
              label="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional payment notes..."
              rows={2}
            />

            <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
              <h4 className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Receipt Preview</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Customer</span>
                  <span className="font-medium text-foreground">{selectedCustomer?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Invoices</span>
                  <span className="text-foreground">{selectedInvoiceIds.map((id) => outstandingInvoices.find((i) => i.id === id)?.invoiceNumber).join(", ")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Payment</span>
                  <span className="text-foreground">{paymentSplits.map((s) => `${getPaymentMethodLabel(s.method)}: ${formatCurrency(s.amount)}`).join(" + ")}</span>
                </div>
                <div className="border-t border-border pt-1.5 flex justify-between font-semibold">
                  <span className="text-foreground">Total Received</span>
                  <span className="text-success">{formatCurrency(totalPaid)}</span>
                </div>
              </div>
            </div>

            <FormActions>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleReceive}
                disabled={totalPaid <= 0 || selectedInvoiceIds.length === 0}
                className="bg-success hover:bg-success/90"
              >
                <Check className="h-4 w-4" /> Confirm Payment
              </Button>
            </FormActions>
          </>
        )}

        {selectedCustomerId && outstandingInvoices.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">No outstanding invoices for this customer</p>
        )}
      </div>
    </BaseModal>
  )
}

export function Customers() {
  const { customers, isLoading: _isLoading, loadError: _loadError, isSaving: _isSaving, addCustomer, editCustomer, removeCustomer, refresh: _refreshCustomers } = useCustomers()
  // Server-side pagination for the DataTable
  const {
    data: customerPage,
    totalPages: customerPages,
    page: customerPageNum,
    setPage: setCustomerPage,
    isLoading: customerLoading,
  } = useServerPagination<import('@/lib/db/types').CustomerRow>('customers', { pageSize: 15, orderBy: 'name', orderDir: 'asc' })

  // Map DB rows to Customer type for DataTable display
  const paginatedCustomers: import('@/lib/services/customer-service').Customer[] = customerPage.map(row => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    address: row.address || undefined,
    totalOrders: row.total_orders,
    totalSpent: row.total_spent,
    lastVisit: row.last_visit ?? new Date().toISOString(),
    loyaltyPoints: row.loyalty_points,
    creditBalance: row.credit_balance,
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

  const totalCustomers = customers.length
  const activeCustomers = customers.filter((c) => daysSince(c.lastVisit) <= 7).length
  const creditCustomers = customers.filter((c) => c.creditBalance > 0).length
  const outstandingBalance = customers.reduce((sum, c) => sum + c.creditBalance, 0)

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

  const handleReceivePayment = async (customerId: string, amount: number, method: string, notes: string) => {
    try {
      const current = customers.find((c) => c.id === customerId)
      if (current) {
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

        // Update customer credit balance
        await editCustomer(customerId, {
          creditBalance: Math.max(0, current.creditBalance - amount),
          totalSpent: current.totalSpent + amount,
        })

        // Create payment record in DB so it flows to Finance, Dashboard, Reports
        await insforge.database
          .from('payments')
          .insert([{
            customer_id: customerId,
            amount,
            payment_method: method,
            reference: idempotencyKey,
            notes: notes || `Payment received from ${current.name}`,
          }])

        // Log activity (non-critical)
        logActivitySafe({
          activityType: 'payment_received',
          entityId: customerId,
          entityLabel: `Customer payment from ${current.name}`,
          status: 'completed',
          amount,
          details: `Payment of ${formatCurrency(amount)} received from ${current.name} via ${method}${notes ? ` — ${notes}` : ''}`,
        })
      }
      showSuccess(`Payment of ${formatCurrency(amount)} received${notes ? ` — ${notes}` : ""}`)
    } catch {
      showError("Failed to record payment. Check your connection.")
    }
    setShowPayment(false)
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
          <StatCard label="Credit Customers" value={formatNumber(creditCustomers)} icon="CreditCard" color="text-warning" index={2} />
        </motion.div>
        <motion.div variants={fadeUp} whileHover={{ y: -3, scale: 1.02 }} className="backdrop-blur-sm">
          <StatCard label="Outstanding Balance" value={formatCurrency(outstandingBalance)} icon="AlertCircle" color="text-destructive" index={3} />
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

      <CustomerFormModal
        open={showForm}
        customer={editingCustomer}
        onSave={handleSave}
        onClose={() => { setShowForm(false); setEditingCustomer(null) }}
      />

      <CustomerProfileDrawer
        open={!!viewingCustomer}
        customer={viewingCustomer}
        onClose={() => setViewingCustomer(null)}
        onReceivePayment={handleReceivePayment}
      />

      <ReceivePaymentModal
        open={showPayment}
        customers={customers}
        onClose={() => setShowPayment(false)}
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
