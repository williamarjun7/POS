import { useState, useMemo } from "react"
import { Plus, Edit, Trash2, ChevronRight } from "lucide-react"
import { PageTransition } from "@/components/ui/PageTransition"
import { PageHeader } from "@/components/PageHeader"
import { StatusBadge } from "@/components/StatusBadge"
import { DataTable, type Column } from "@/components/DataTable"
import { StatCard, SectionCard } from "@/components/ui/stat-card"
import { BaseModal } from "@/components/ui/modal"
import { FormInput, FormSelect, FormTextarea, FormActions } from "@/components/ui/form-field"
import { Button } from "@/components/ui/button"
import { Tabs } from "@/components/Tabs"
import { EmptyState } from "@/components/EmptyState"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { Icon } from "@/components/icon-mapper"
import { cn, formatCurrency } from "@/lib/utils"
import { showSuccess, showError } from "@/components/ui/toast"
import { useSuppliers } from "@/lib/services/supplier-service"
import { getPaymentMethodLabel } from '@/lib/payment-methods'
import { usePurchaseOrders } from "@/lib/services/purchase-order-service"
import { useSupplierPayments } from "@/lib/services/supplier-payment-service"
import type { Supplier, PurchaseOrder } from "@/types"
import type { SupplierPayment, NewSupplierPaymentData } from "@/lib/services/supplier-payment-service"

const poStatusVariant: Record<string, "default" | "info" | "success" | "destructive"> = {
  pending: "default", ordered: "info", received: "success", cancelled: "destructive",
}
const poStatusFlow: Record<string, string> = { pending: "ordered", ordered: "received" }
const paymentMethodOptions = [
    { value: 'cash', label: 'Cash with Change' },
    { value: 'reception_qr', label: 'Reception QR' },
    { value: 'fonepay', label: 'FonePay QR' },
    { value: 'credit', label: 'Credit Payment' },
  ]
const paymentMethods = paymentMethodOptions.map(o => o.value)
const statusFilters = ["all", "pending", "ordered", "received"] as const


function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Icon
          key={star}
          name="Star"
          className={cn("h-3.5 w-3.5", star <= Math.round(rating) ? "fill-warning text-warning" : "text-muted-foreground/30")}
        />
      ))}
      <span className="ml-1 text-xs font-medium text-muted-foreground">{rating}</span>
    </div>
  )
}

function SupplierDetailModal({
  open,
  supplier,
  purchaseOrders,
  payments,
  onClose,
}: {
  open: boolean
  supplier: Supplier | null
  purchaseOrders: PurchaseOrder[]
  payments: SupplierPayment[]
  onClose: () => void
}) {
  if (!supplier) return null
  const supplierPOs = purchaseOrders.filter((po) => po.supplierId === supplier.id)
  const supplierPayments = payments.filter((p) => p.supplierId === supplier.id)

  return (
    <BaseModal open={open} onClose={onClose} title="Supplier Details" className="max-w-3xl">
      <div className="max-h-[70vh] space-y-6 overflow-y-auto pr-1">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xl font-bold text-primary">
            {supplier.name.charAt(0)}
          </div>
          <div className="flex-1 space-y-1">
            <h3 className="text-lg font-semibold text-foreground">{supplier.name}</h3>
            <p className="text-sm text-muted-foreground">{supplier.contact}</p>
            <div className="flex flex-wrap gap-x-5 gap-y-1 pt-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5"><Icon name="Phone" className="h-3.5 w-3.5" /> {supplier.phone}</span>
              <span className="flex items-center gap-1.5"><Icon name="Mail" className="h-3.5 w-3.5" /> {supplier.email}</span>
              <span className="flex items-center gap-1.5"><Icon name="MapPin" className="h-3.5 w-3.5" /> {supplier.address}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl bg-muted/50 p-3 text-center">
            <p className="text-xs text-muted-foreground">Total Orders</p>
            <p className="text-lg font-bold text-foreground">{supplier.totalOrders}</p>
          </div>
          <div className="rounded-xl bg-muted/50 p-3 text-center">
            <p className="text-xs text-muted-foreground">Outstanding</p>
            <p className={cn("text-lg font-bold", supplier.outstandingBalance > 0 ? "text-warning" : "text-success")}>
              {formatCurrency(supplier.outstandingBalance)}
            </p>
          </div>
          <div className="rounded-xl bg-muted/50 p-3 text-center">
            <p className="text-xs text-muted-foreground">Rating</p>
            <div className="flex justify-center pt-0.5"><StarRating rating={supplier.rating} /></div>
          </div>
        </div>

        <div>
          <h4 className="mb-3 text-sm font-semibold text-foreground">Recent Purchase Orders</h4>
          {supplierPOs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No purchase orders found.</p>
          ) : (
            <div className="space-y-2">
              {supplierPOs.slice(0, 5).map((po) => (
                <div key={po.id} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-foreground">{po.id}</p>
                    <p className="text-xs text-muted-foreground">{po.items.length} items · {po.orderDate}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-sm font-medium text-foreground">{formatCurrency(po.totalAmount)}</p>
                    <StatusBadge label={po.status.charAt(0).toUpperCase() + po.status.slice(1)} variant={poStatusVariant[po.status]} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h4 className="mb-3 text-sm font-semibold text-foreground">Payment History</h4>
          {supplierPayments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments recorded.</p>
          ) : (
            <div className="space-y-2">
              {supplierPayments.map((pay) => (
                <div key={pay.id} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-foreground">{getPaymentMethodLabel(pay.paymentMethod)}</p>
                    <p className="text-xs text-muted-foreground">{pay.reference} · {pay.paymentDate}</p>
                  </div>
                  <p className="text-sm font-medium text-success">{formatCurrency(pay.amount)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </BaseModal>
  )
}

function SupplierFormModal({
  open,
  supplier,
  onSave,
  onClose,
}: {
  open: boolean
  supplier?: Supplier | null
  onSave: (data: Supplier) => void
  onClose: () => void
}) {
  const [name, setName] = useState(supplier?.name ?? "")
  const [contact, setContact] = useState(supplier?.contact ?? "")
  const [phone, setPhone] = useState(supplier?.phone ?? "")
  const [email, setEmail] = useState(supplier?.email ?? "")
  const [address, setAddress] = useState(supplier?.address ?? "")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name) { showError("Company name is required"); return }
    onSave({
      id: supplier?.id ?? `s${Date.now()}`,
      name, contact, phone, email, address,
      totalOrders: supplier?.totalOrders ?? 0,
      outstandingBalance: supplier?.outstandingBalance ?? 0,
      rating: supplier?.rating ?? 4.0,
    })
    onClose()
  }

  return (
    <BaseModal open={open} onClose={onClose} title={supplier?.id ? "Edit Supplier" : "Add Supplier"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormInput label="Company Name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Himalayan Coffee Co." />
          <FormInput label="Contact Person" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="John Doe" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormInput label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+977-9841-234567" />
          <FormInput label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contact@company.com" />
        </div>
        <FormInput label="Address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, City" />
        <FormActions>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit">{supplier?.id ? "Save Changes" : "Add Supplier"}</Button>
        </FormActions>
      </form>
    </BaseModal>
  )
}

function PoFormModal({
  open,
  suppliers,
  onSave,
  onClose,
}: {
  open: boolean
  suppliers: Supplier[]
  onSave: (data: PurchaseOrder) => void
  onClose: () => void
}) {
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "")
  const [itemName, setItemName] = useState("")
  const [itemQty, setItemQty] = useState("1")
  const [itemPrice, setItemPrice] = useState("")
  const [items, setItems] = useState<{ name: string; quantity: number; unitPrice: number }[]>([])
  const selectedSupplier = suppliers.find((s) => s.id === supplierId)

  const total = useMemo(() => items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0), [items])

  const addItem = () => {
    if (!itemName || !itemPrice) return
    setItems((prev) => [...prev, { name: itemName, quantity: Number(itemQty) || 1, unitPrice: Number(itemPrice) || 0 }])
    setItemName(""); setItemQty("1"); setItemPrice("")
  }

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!supplierId) { showError("Select a supplier"); return }
    if (items.length === 0) { showError("Add at least one item"); return }
    onSave({
      id: `PO-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 1000)).padStart(3, "0")}`,
      supplierId, supplierName: selectedSupplier?.name ?? "",
      items, totalAmount: total, status: "pending",
      orderDate: new Date().toISOString().split("T")[0],
      expectedDelivery: new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0],
    })
    onClose()
  }

  return (
    <BaseModal open={open} onClose={onClose} title="New Purchase Order" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormSelect label="Supplier" required value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </FormSelect>

        <div className="rounded-xl border border-border p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Order Items</p>
          {items.length === 0 ? (
            <p className="mb-3 text-sm text-muted-foreground">No items added yet</p>
          ) : (
            <div className="mb-3 space-y-2">
              {items.map((item, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
                  <span className="font-medium text-foreground">{item.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground">{item.quantity} × {formatCurrency(item.unitPrice)}</span>
                    <span className="font-medium text-foreground">{formatCurrency(item.quantity * item.unitPrice)}</span>
                    <button type="button" onClick={() => removeItem(i)} className="text-destructive hover:text-destructive/80 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              <div className="border-t border-border pt-2">
                <p className="text-right text-sm font-semibold text-foreground">Total: {formatCurrency(total)}</p>
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <input type="text" placeholder="Item name" value={itemName} onChange={(e) => setItemName(e.target.value)}
              className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
            <input type="number" placeholder="Qty" value={itemQty} onChange={(e) => setItemQty(e.target.value)} min={1}
              onWheel={e => (e.target as HTMLInputElement).blur()}
              className="h-9 w-20 rounded-lg border border-border bg-background px-3 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
            <input type="number" placeholder="Price" value={itemPrice} onChange={(e) => setItemPrice(e.target.value)} min={0}
              onWheel={e => (e.target as HTMLInputElement).blur()}
              className="h-9 w-24 rounded-lg border border-border bg-background px-3 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
            <button type="button" onClick={addItem}
              className="h-9 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
              + Add
            </button>
          </div>
        </div>

        <FormActions>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit">Create PO</Button>
        </FormActions>
      </form>
    </BaseModal>
  )
}

function PaymentFormModal({
  open,
  suppliers,
  onSave,
  onClose,
}: {
  open: boolean
  suppliers: Supplier[]
  onSave: (data: NewSupplierPaymentData) => Promise<void>
  onClose: () => void
}) {
  const [supplierId, setSupplierId] = useState("")
  const [amount, setAmount] = useState("")
  const [paymentMethod, setPaymentMethod] = useState(paymentMethodOptions[0]?.value ?? paymentMethods[0])
  const [reference, setReference] = useState("")
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0])
  const [notes, setNotes] = useState("")

  const outstandingSuppliers = suppliers.filter((s) => s.outstandingBalance > 0)
  const selectedSupplier = suppliers.find((s) => s.id === supplierId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supplierId) { showError("Select a supplier"); return }
    if (!amount || Number(amount) <= 0) { showError("Enter a valid amount"); return }
    if (!reference) { showError("Reference number is required"); return }
    await onSave({
      supplierId,
      supplierName: selectedSupplier?.name ?? "",
      amount: Number(amount),
      paymentMethod,
      reference,
      paymentDate,
      notes: notes.trim() || undefined,
    })
    setSupplierId(""); setAmount(""); setReference(""); setNotes("")
    onClose()
  }

  return (
    <BaseModal open={open} onClose={onClose} title="Make Payment">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormSelect label="Supplier" required value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
          <option value="">Select supplier...</option>
          {outstandingSuppliers.map((s) => (
            <option key={s.id} value={s.id}>{s.name} ({formatCurrency(s.outstandingBalance)} due)</option>
          ))}
        </FormSelect>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormInput label="Amount" type="number" required min={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
          <FormSelect label="Payment Method" required value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
            {paymentMethodOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </FormSelect>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormInput label="Reference Number" required value={reference} onChange={(e) => setReference(e.target.value)} placeholder="TRF-00000" />
          <FormInput label="Payment Date" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
        </div>
        <FormTextarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional payment notes..." rows={2} />
        <FormActions>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit">Confirm Payment</Button>
        </FormActions>
      </form>
    </BaseModal>
  )
}

export function Suppliers() {
  const { suppliers, isLoading: _isLoading, loadError: _loadError, isSaving: _isSaving, addSupplier, editSupplier, removeSupplier, refresh: _refreshSuppliers } = useSuppliers()
  const { purchaseOrders, isLoading: _poLoading, loadError: _poError, addPurchaseOrder, advanceStatus, refresh: _refreshPOs } = usePurchaseOrders()
  const { payments, isLoading: _paymentsLoading, addPayment, refresh: _refreshPayments } = useSupplierPayments()
  const [activeTab, setActiveTab] = useState("directory")
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [showSupplierForm, setShowSupplierForm] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [viewingSupplier, setViewingSupplier] = useState<Supplier | null>(null)
  const [showPoForm, setShowPoForm] = useState(false)
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<Supplier | null>(null)

  const stats = useMemo(() => ({
    totalSuppliers: suppliers.length,
    activeOrders: purchaseOrders.filter((o) => o.status === "ordered" || o.status === "pending").length,
    outstandingBalance: suppliers.reduce((sum, s) => sum + s.outstandingBalance, 0),
    avgRating: suppliers.length ? (suppliers.reduce((sum, s) => sum + s.rating, 0) / suppliers.length).toFixed(1) : "0.0",
  }), [suppliers, purchaseOrders])

  const filteredSuppliers = useMemo(() => {
    if (!search) return suppliers
    const q = search.toLowerCase()
    return suppliers.filter((s) =>
      s.name.toLowerCase().includes(q) || s.contact.toLowerCase().includes(q) || s.email.toLowerCase().includes(q)
    )
  }, [suppliers, search])

  const filteredPOs = useMemo(() => {
    if (statusFilter === "all") return purchaseOrders
    return purchaseOrders.filter((po) => po.status === statusFilter)
  }, [purchaseOrders, statusFilter])

  const paymentStats = useMemo(() => ({
    totalPaid: payments.reduce((sum, p) => sum + p.amount, 0),
    pendingSuppliers: suppliers.filter((s) => s.outstandingBalance > 0).length,
  }), [payments, suppliers])

  const tabs = useMemo(() => [
    { id: "directory", label: "Directory", count: suppliers.length },
    { id: "purchase-orders", label: "Purchase Orders", count: purchaseOrders.length },
    { id: "payments", label: "Payments", count: payments.length },
  ], [suppliers, purchaseOrders, payments])

  const handleSaveSupplier = async (data: Supplier) => {
    try {
      if (suppliers.some((s) => s.id === data.id)) {
        await editSupplier(data.id, {
          name: data.name,
          contact: data.contact,
          phone: data.phone,
          email: data.email,
          address: data.address,
          rating: data.rating,
        })
        showSuccess("Supplier updated")
      } else {
        await addSupplier({
          name: data.name,
          contact: data.contact,
          phone: data.phone,
          email: data.email,
          address: data.address,
          totalOrders: 0,
          outstandingBalance: 0,
          rating: data.rating,
        })
        showSuccess("Supplier added")
      }
    } catch {
      showError("Failed to save supplier. Check your connection.")
    }
  }

  const handleDeleteSupplier = async () => {
    if (!deleteConfirm) return
    if (purchaseOrders.some((po) => po.supplierId === deleteConfirm.id)) {
      showError("Cannot delete supplier with active purchase orders")
      setDeleteConfirm(null)
      return
    }
    try {
      await removeSupplier(deleteConfirm.id)
      showSuccess("Supplier deleted")
    } catch {
      showError("Failed to delete supplier. Check your connection.")
    }
    setDeleteConfirm(null)
  }

  const handleAdvancePo = async (id: string) => {
    const current = purchaseOrders.find((po) => po.id === id)
    if (!current) return
    const next = poStatusFlow[current.status]
    if (!next) return
    try {
      await advanceStatus(id, next as PurchaseOrder['status'])
      showSuccess("PO status updated")
    } catch {
      showError("Failed to update PO status")
    }
  }

  const handleCreatePo = async (data: PurchaseOrder) => {
    try {
      const created = await addPurchaseOrder({
        supplierId: data.supplierId,
        supplierName: data.supplierName,
        items: data.items,
        totalAmount: data.totalAmount,
        status: data.status,
        orderDate: data.orderDate,
        expectedDelivery: data.expectedDelivery,
      })
      const current = suppliers.find((s) => s.id === created.supplierId)
      if (current) {
        await editSupplier(created.supplierId, {
          totalOrders: current.totalOrders + 1,
          outstandingBalance: current.outstandingBalance + created.totalAmount,
        })
      }
      showSuccess("Purchase order created")
    } catch {
      showError("Failed to create purchase order")
    }
  }

  const handlePayment = async (data: NewSupplierPaymentData) => {
    try {
      await addPayment(data)

      // Update supplier outstanding balance
      const current = suppliers.find((s) => s.id === data.supplierId)
      if (current) {
        await editSupplier(data.supplierId, {
          outstandingBalance: Math.max(0, current.outstandingBalance - data.amount),
        })
      }
      showSuccess(`Payment of ${formatCurrency(data.amount)} recorded`)
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to record payment')
      throw err // re-throw so modal stays open on failure
    }
  }

  const supplierColumns: Column<Supplier>[] = [
    { key: "name", header: "Supplier", render: (row) => (
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">{row.name.charAt(0)}</div>
        <div>
          <p className="font-medium text-foreground">{row.name}</p>
          <p className="text-xs text-muted-foreground">{row.contact}</p>
        </div>
      </div>
    )},
    { key: "phone", header: "Phone", render: (row) => <span className="text-sm text-foreground">{row.phone}</span> },
    { key: "email", header: "Email", render: (row) => <span className="text-sm text-muted-foreground">{row.email}</span> },
    { key: "address", header: "Address", render: (row) => <span className="text-sm text-muted-foreground">{row.address}</span> },
    { key: "totalOrders", header: "Orders", render: (row) => <span className="font-medium text-foreground">{row.totalOrders}</span> },
    { key: "outstandingBalance", header: "Outstanding", render: (row) => (
      <span className={cn("text-sm font-medium", row.outstandingBalance > 0 ? "text-warning" : "text-success")}>
        {formatCurrency(row.outstandingBalance)}
      </span>
    )},
    { key: "rating", header: "Rating", render: (row) => <StarRating rating={row.rating} /> },
    { key: "actions", header: "", className: "w-24", render: (row) => (
      <div className="flex items-center gap-1">
        <button onClick={(e) => { e.stopPropagation(); setViewingSupplier(row) }}
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" title="View details">
          <Icon name="Eye" className="h-4 w-4" />
        </button>
        <button onClick={(e) => { e.stopPropagation(); setEditingSupplier(row); setShowSupplierForm(true) }}
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" title="Edit">
          <Edit className="h-4 w-4" />
        </button>
        <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm(row) }}
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive" title="Delete">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    )},
  ]

  const poColumns: Column<PurchaseOrder>[] = [
    { key: "id", header: "PO ID", render: (row) => <span className="font-medium text-foreground">{row.id}</span> },
    { key: "supplierName", header: "Supplier", render: (row) => <span className="text-sm text-foreground">{row.supplierName}</span> },
    { key: "items", header: "Items", render: (row) => <span className="text-sm text-foreground">{row.items.length} items</span> },
    { key: "totalAmount", header: "Total", render: (row) => <span className="font-medium text-foreground">{formatCurrency(row.totalAmount)}</span> },
    { key: "status", header: "Status", render: (row) => (
      <StatusBadge label={row.status.charAt(0).toUpperCase() + row.status.slice(1)} variant={poStatusVariant[row.status]} />
    )},
    { key: "orderDate", header: "Order Date", render: (row) => <span className="text-sm text-muted-foreground">{row.orderDate}</span> },
    { key: "expectedDelivery", header: "Expected", render: (row) => <span className="text-sm text-muted-foreground">{row.expectedDelivery}</span> },
    { key: "actions", header: "", className: "w-24", render: (row) =>
      poStatusFlow[row.status] ? (
        <button onClick={() => handleAdvancePo(row.id)}
          className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
          {row.status === "pending" ? "Mark Ordered" : "Mark Received"}
          <ChevronRight className="h-3 w-3" />
        </button>
      ) : (
        <StatusBadge label="Completed" variant="success" />
      )
    },
  ]

  const paymentColumns: Column<SupplierPayment>[] = [
    { key: "id", header: "ID", render: (row) => <span className="font-medium text-foreground">{row.id}</span> },
    { key: "supplierName", header: "Supplier", render: (row) => <span className="text-sm text-foreground">{row.supplierName}</span> },
    { key: "amount", header: "Amount", render: (row) => <span className="font-medium text-foreground">{formatCurrency(row.amount)}</span> },
    { key: "paymentMethod", header: "Method", render: (row) => <StatusBadge label={getPaymentMethodLabel(row.paymentMethod)} variant="info" /> },
    { key: "reference", header: "Reference", render: (row) => <span className="text-sm text-muted-foreground">{row.reference}</span> },
    { key: "paymentDate", header: "Date", render: (row) => <span className="text-sm text-muted-foreground">{row.paymentDate}</span> },
    { key: "notes", header: "Note", render: (row) => <span className="text-sm text-muted-foreground truncate max-w-[200px] block">{row.notes || '—'}</span> },
  ]

  return (
    <PageTransition className="space-y-6">
      <PageHeader
        title="Suppliers"
        icon="Truck"
        description="Manage supplier directory and purchase orders"
        actions={
          <div className="flex gap-2">
            {activeTab === "directory" && (
              <Button size="sm" onClick={() => { setEditingSupplier(null); setShowSupplierForm(true) }}>
                <Plus className="h-4 w-4" /> Add Supplier
              </Button>
            )}
            {activeTab === "purchase-orders" && (
              <Button size="sm" onClick={() => setShowPoForm(true)}>
                <Plus className="h-4 w-4" /> New PO
              </Button>
            )}
            {activeTab === "payments" && (
              <Button size="sm" onClick={() => setShowPaymentForm(true)}>
                <Plus className="h-4 w-4" /> Make Payment
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Suppliers" value={stats.totalSuppliers} icon="Users" color="text-primary" index={0} />
        <StatCard label="Active Orders" value={stats.activeOrders} icon="ClipboardList" color="text-info" index={1} />
        <StatCard
          label="Outstanding Payable"
          value={formatCurrency(stats.outstandingBalance)}
          icon="HandCoins"
          color={stats.outstandingBalance > 0 ? "text-warning" : "text-success"}
          trend={stats.outstandingBalance > 0 ? "up" : "neutral"}
          trendValue={stats.outstandingBalance > 0 ? `${paymentStats.pendingSuppliers} suppliers pending` : "All cleared"}
          index={2}
        />
        <StatCard label="Avg Rating" value={stats.avgRating} icon="Star" color="text-warning" index={3} />
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === "directory" && (
        <SectionCard title="Supplier Directory" icon="BookOpen" index={4}>
          <div className="relative mb-4 max-w-sm">
            <Icon name="Search" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input type="text" placeholder="Search by name, contact, or email..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20" />
          </div>
          {filteredSuppliers.length === 0 ? (
            <EmptyState icon="Users" title="No suppliers found" description="Try adjusting your search or add a new supplier." action={
              <Button size="sm" onClick={() => { setEditingSupplier(null); setShowSupplierForm(true) }}><Plus className="h-4 w-4" /> Add Supplier</Button>
            } />
          ) : (
            <DataTable columns={supplierColumns} data={filteredSuppliers} pageSize={8} onRowClick={(row) => setViewingSupplier(row)} />
          )}
        </SectionCard>
      )}

      {activeTab === "purchase-orders" && (
        <SectionCard title="Purchase Orders" icon="ClipboardList" index={4}>
          <div className="mb-4 flex items-center gap-3">
            <div className="flex gap-1 rounded-xl border border-border bg-muted p-1">
              {statusFilters.map((filter) => (
                <button key={filter} onClick={() => setStatusFilter(filter)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                    statusFilter === filter ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}>
                  {filter === "all" ? "All" : filter}
                </button>
              ))}
            </div>
          </div>
          {filteredPOs.length === 0 ? (
            <EmptyState icon="ClipboardList" title="No purchase orders" description="No orders match the selected filter." />
          ) : (
            <DataTable columns={poColumns} data={filteredPOs} searchable searchKey="id" pageSize={8} />
          )}
        </SectionCard>
      )}

      {activeTab === "payments" && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Total Outstanding" value={formatCurrency(stats.outstandingBalance)} icon="AlertCircle" color="text-warning" index={0} />
            <StatCard label="Total Paid" value={formatCurrency(paymentStats.totalPaid)} icon="CheckCircle" color="text-success" index={1} />
            <StatCard label="Pending Suppliers" value={paymentStats.pendingSuppliers} icon="Clock" color="text-info" index={2} />
          </div>
          <SectionCard title="Payment History" icon="Receipt" index={3}>
            {payments.length === 0 ? (
              <EmptyState icon="Receipt" title="No payments yet" description="Record your first payment to a supplier." action={
                <Button size="sm" onClick={() => setShowPaymentForm(true)}><Plus className="h-4 w-4" /> Make Payment</Button>
              } />
            ) : (
              <DataTable columns={paymentColumns} data={payments} searchable searchKey="supplierName" pageSize={8} />
            )}
          </SectionCard>
        </>
      )}

      <SupplierDetailModal
        open={!!viewingSupplier}
        supplier={viewingSupplier}
        purchaseOrders={purchaseOrders}
        payments={payments}
        onClose={() => setViewingSupplier(null)}
      />
      <SupplierFormModal
        open={showSupplierForm}
        supplier={editingSupplier}
        onSave={handleSaveSupplier}
        onClose={() => { setShowSupplierForm(false); setEditingSupplier(null) }}
      />
      <PoFormModal open={showPoForm} suppliers={suppliers} onSave={handleCreatePo} onClose={() => setShowPoForm(false)} />
      <PaymentFormModal open={showPaymentForm} suppliers={suppliers} onSave={handlePayment} onClose={() => setShowPaymentForm(false)} />

      <ConfirmDialog
        open={!!deleteConfirm}
        title="Delete Supplier"
        message={`Are you sure you want to delete "${deleteConfirm?.name}"? Suppliers with active POs cannot be deleted.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDeleteSupplier}
        onCancel={() => setDeleteConfirm(null)}
      />
    </PageTransition>
  )
}
