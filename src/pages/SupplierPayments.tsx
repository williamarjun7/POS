import { useState } from "react"
import { motion } from "framer-motion"
import { PageTransition } from "@/components/ui/PageTransition"
import { PageHeader } from "@/components/PageHeader"
import { DataTable, type Column } from "@/components/DataTable"
import { StatusBadge } from "@/components/StatusBadge"
import { StatCard } from "@/components/ui/stat-card"
import { BaseModal } from "@/components/ui/modal"
import { FormInput, FormSelect, FormTextarea, FormActions } from "@/components/ui/form-field"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { EmptyState } from "@/components/EmptyState"
import { formatCurrency } from "@/lib/utils"
import { showSuccess, showError } from "@/components/ui/toast"
import { useSupplierPayments } from "@/lib/services/supplier-payment-service"
import { useSuppliers } from "@/lib/services/supplier-service"
import { Plus, Trash2, Search } from "lucide-react"
import type { SupplierPayment, NewSupplierPaymentData } from "@/lib/services/supplier-payment-service"
import { pageTransitionFast, staggerContainer } from "@/lib/animations/presets"
import { getPaymentMethodLabel } from '@/lib/payment-methods'

const paymentMethodOptions = [
    { value: 'cash', label: 'Cash with Change' },
    { value: 'reception_qr', label: 'Reception QR' },
    { value: 'fonepay', label: 'FonePay QR' },
    { value: 'credit', label: 'Credit Payment' },
  ]

// Using pageTransitionFast, staggerContainer from presets

function PaymentFormModal({
  open,
  suppliers,
  onSave,
  onClose,
}: {
  open: boolean
  suppliers: { id: string; name: string }[]
  onSave: (data: NewSupplierPaymentData) => void
  onClose: () => void
}) {
  const [supplierId, setSupplierId] = useState("")
  const [amount, setAmount] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("Bank Transfer")
  const [reference, setReference] = useState("")
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState("")

  const selectedSupplier = suppliers.find(s => s.id === supplierId)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!supplierId) return showError("Select a supplier")
    if (!amount || Number(amount) <= 0) return showError("Enter a valid amount")
    if (!reference.trim()) return showError("Reference is required")

    onSave({
      supplierId,
      supplierName: selectedSupplier?.name ?? "",
      amount: Number(amount),
      paymentMethod,
      reference: reference.trim(),
      notes: notes.trim() || undefined,
      paymentDate,
    })
    onClose()
    setSupplierId("")
    setAmount("")
    setReference("")
    setNotes("")
  }

  return (
    <BaseModal open={open} onClose={onClose} title="New Supplier Payment" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormSelect
          label="Supplier"
          required
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
          options={[
            { value: "", label: "Select supplier..." },
            ...suppliers.map(s => ({ value: s.id, label: s.name })),
          ]}
        />
        <div className="grid grid-cols-2 gap-4">
          <FormInput
            label="Amount (Rs.)"
            type="number"
            required
            min={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
          <FormInput
            label="Payment Date"
            type="date"
            required
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormSelect
            label="Payment Method"
            required
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            options={paymentMethodOptions}
          />
          <FormInput
            label="Reference #"
            required
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="e.g. CHQ-001"
          />
        </div>
        <FormTextarea
          label="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes..."
          rows={2}
        />
        <FormActions>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit">Record Payment</Button>
        </FormActions>
      </form>
    </BaseModal>
  )
}

export function SupplierPayments() {
  const { payments, isLoading, loadError, addPayment, removePayment, refresh } = useSupplierPayments()
  const { suppliers } = useSuppliers()
  const [search, setSearch] = useState("")
  const [showForm, setShowForm] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const filteredPayments = payments.filter(p =>
    !search || p.supplierName.toLowerCase().includes(search.toLowerCase()) ||
    p.reference.toLowerCase().includes(search.toLowerCase())
  )

  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0)
  const uniqueSuppliers = new Set(payments.map(p => p.supplierName)).size

  const supplierOptions = suppliers.map(s => ({ id: s.id, name: s.name }))

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await removePayment(deleteId)
      showSuccess("Payment deleted")
    } catch {
      showError("Failed to delete payment")
    } finally {
      setDeleteId(null)
    }
  }

  const columns: Column<SupplierPayment>[] = [
    { key: "supplierName", header: "Supplier", render: (r) => <span className="font-medium text-foreground">{r.supplierName}</span> },
    { key: "amount", header: "Amount", render: (r) => <span className="font-semibold tabular-nums">{formatCurrency(r.amount)}</span> },
    { key: "paymentMethod", header: "Method", render: (r) => <StatusBadge label={getPaymentMethodLabel(r.paymentMethod)} variant="secondary" /> },
    { key: "reference", header: "Reference", render: (r) => <span className="font-mono text-sm">{r.reference}</span> },
    { key: "paymentDate", header: "Date" },
    { key: "notes", header: "Notes", render: (r) => r.notes ? <span className="text-sm text-muted-foreground truncate max-w-[200px]">{r.notes}</span> : <span className="text-muted-foreground/50">—</span> },
    { key: "actions", header: "", render: (r) => (
      <button onClick={() => setDeleteId(r.id)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors" title="Delete">
        <Trash2 className="h-4 w-4" />
      </button>
    )},
  ]

  return (
    <PageTransition>
      <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="space-y-6">
        <PageHeader
          title="Supplier Payments"
          icon="Banknote"
          description="Track payments made to suppliers"
          actions={
            <Button size="sm" onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4 mr-1" /> New Payment
            </Button>
          }
        />

        <motion.div variants={pageTransitionFast} className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Total Payments" value={payments.length} icon="Banknote" color="text-primary" index={0} />
          <StatCard label="Total Amount Paid" value={formatCurrency(totalPaid)} icon="DollarSign" color="text-destructive" index={1} />
          <StatCard label="Suppliers Paid" value={uniqueSuppliers} icon="Truck" color="text-success" index={2} />
        </motion.div>

        <motion.div variants={pageTransitionFast} className="rounded-xl border border-border bg-card/70 backdrop-blur-sm p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search supplier or reference..."
                className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-4 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <p className="text-muted-foreground">{loadError}</p>
              <Button variant="outline" size="sm" onClick={refresh}>Retry</Button>
            </div>
          ) : filteredPayments.length === 0 ? (
            <EmptyState icon="Banknote" title="No payments found" description="Record your first supplier payment to get started." />
          ) : (
            <DataTable columns={columns} data={filteredPayments} pageSize={10} />
          )}
        </motion.div>

        <PaymentFormModal open={showForm} suppliers={supplierOptions} onSave={addPayment} onClose={() => setShowForm(false)} />

        <ConfirmDialog
          open={!!deleteId}
          onConfirm={handleDelete}
          onCancel={() => setDeleteId(null)}
          title="Delete Payment"
          message="Are you sure you want to delete this payment? This action cannot be undone."
          confirmLabel="Delete"
          variant="danger"
        />
      </motion.div>
    </PageTransition>
  )
}
