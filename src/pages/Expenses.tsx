import { useState, useMemo } from "react"
import { motion } from "framer-motion"
import { Plus, MoreHorizontal, Trash2 } from "lucide-react"
import { PageTransition } from "@/components/ui/PageTransition"
import { PageHeader } from "@/components/PageHeader"
import { DataTable, type Column } from "@/components/DataTable"
import { StatCard } from "@/components/ui/stat-card"
import { StatusBadge } from "@/components/StatusBadge"
import { Button } from "@/components/ui/button"
import { BaseModal } from "@/components/ui/modal"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { FormInput, FormSelect, FormTextarea, FormActions } from "@/components/ui/form-field"
import { EmptyState } from "@/components/EmptyState"
import { cn, formatCurrency } from "@/lib/utils"
import { showSuccess, showError } from "@/components/ui/toast"
import { PaymentMethodBadge } from "@/components/PaymentMethodBadge"
import { logActivitySafe } from "@/lib/services/activity-log-service"
import type { ExpenseCategory, PaymentMethod } from "@/types"
import type { Expense } from "@/lib/services/expense-service"
import { useExpenses } from "@/lib/services/expense-service"
import { pageTransitionFast } from "@/lib/animations/presets"

const categoryOptions: { id: ExpenseCategory | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "utilities", label: "Utilities" },
  { id: "supplies", label: "Supplies" },
  { id: "maintenance", label: "Maintenance" },
  { id: "staff", label: "Staff" },
  { id: "marketing", label: "Marketing" },
  { id: "other", label: "Other" },
]

export function Expenses() {
  const { expenses, isLoading, loadError, addExpense, updateExpense, deleteExpense, refresh } = useExpenses()

  const [categoryFilter, setCategoryFilter] = useState<ExpenseCategory | "all">("all")
  const [modalOpen, setModalOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const [form, setForm] = useState({
    description: "",
    category: "supplies" as ExpenseCategory,
    amount: "",
    paymentMethod: "cash" as PaymentMethod,
    notes: "",
    vendor: "",
    receiptNumber: "",
  })

  // ── KPIs ──
  const today = new Date().toISOString().slice(0, 10)
  const todayExpenses = useMemo(
    () => expenses.filter(e => e.date === today).reduce((s, e) => s + e.amount, 0),
    [expenses, today],
  )
  const totalExpenses = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses])
  const categoryCount = useMemo(() => new Set(expenses.map(e => e.category)).size, [expenses])
  const thisMonth = useMemo(() => {
    const m = today.slice(0, 7)
    return expenses.filter(e => e.date.startsWith(m)).reduce((s, e) => s + e.amount, 0)
  }, [expenses, today])

  // ── Filters ──
  const filtered = useMemo(() => {
    if (categoryFilter !== "all") return expenses.filter(e => e.category === categoryFilter)
    return expenses
  }, [expenses, categoryFilter])

  // ── Modals ──
  const openCreateModal = () => {
    setEditingExpense(null)
    setForm({ description: "", category: "supplies", amount: "", paymentMethod: "cash", notes: "", vendor: "", receiptNumber: "" })
    setModalOpen(true)
  }

  const openEditModal = (expense: Expense) => {
    setEditingExpense(expense)
    setForm({
      description: expense.description,
      category: expense.category,
      amount: String(expense.amount),
      paymentMethod: expense.paymentMethod,
      notes: expense.notes || "",
      vendor: expense.vendor || "",
      receiptNumber: expense.receiptNumber || "",
    })
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.description.trim() || !form.amount) {
      showError("Please fill in description and amount")
      return
    }
    try {
      if (editingExpense) {
        await updateExpense(editingExpense.id, {
          description: form.description,
          category: form.category,
          amount: Number(form.amount),
          paymentMethod: form.paymentMethod,
          notes: form.notes || undefined,
          vendor: form.vendor || undefined,
          receiptNumber: form.receiptNumber || undefined,
        })
        showSuccess("Expense updated")
      } else {
        await addExpense({
          description: form.description,
          category: form.category,
          amount: Number(form.amount),
          paymentMethod: form.paymentMethod,
          notes: form.notes || undefined,
          vendor: form.vendor || undefined,
          receiptNumber: form.receiptNumber || undefined,
        })
        logActivitySafe({
          activityType: 'expense_created',
          entityLabel: `Expense: ${form.description}`,
          status: 'completed',
          amount: Number(form.amount),
          location: form.category,
          details: `Expense of ${formatCurrency(Number(form.amount))} for "${form.description}" (${form.category})`,
        })
        showSuccess(`"${form.description}" added`)
      }
      setModalOpen(false)
      setEditingExpense(null)
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to save expense")
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await deleteExpense(deleteId)
      showSuccess("Expense deleted")
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to delete expense")
    } finally {
      setDeleteId(null)
    }
  }

  // ── Columns ──
  const columns: Column<Expense>[] = [
    { key: "description", header: "Description", render: r => <span className="font-medium">{r.description}</span> },
    { key: "category", header: "Category", render: r => <StatusBadge label={r.category} variant="secondary" /> },
    { key: "vendor", header: "Vendor", render: r => r.vendor ? <span>{r.vendor}</span> : <span className="text-muted-foreground/50">—</span> },
    { key: "amount", header: "Amount", render: r => <span className="font-semibold">{formatCurrency(r.amount)}</span> },
    { key: "date", header: "Date" },
    { key: "paymentMethod", header: "Payment", render: r => <PaymentMethodBadge method={r.paymentMethod} size="sm" /> },
    { key: "recordedBy", header: "Recorded By" },
    { key: "actions", header: "", className: "w-20", render: r => (
      <div className="flex items-center gap-1">
        <button onClick={() => openEditModal(r)} className="rounded-lg p-1.5 hover:bg-muted transition-colors" title="Edit">
          <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
        </button>
        <button onClick={() => setDeleteId(r.id)} className="rounded-lg p-1.5 hover:bg-destructive/10 transition-colors" title="Delete">
          <Trash2 className="h-4 w-4 text-destructive" />
        </button>
      </div>
    )},
  ]

  return (
    <PageTransition>
      <div className="space-y-6">
        <motion.div variants={pageTransitionFast}>
          <PageHeader
            title="Expenses"
            icon="Receipt"
            description="Record and manage business expenses"
            actions={
              <Button size="sm" onClick={openCreateModal}>
                <Plus className="h-4 w-4" /> New Expense
              </Button>
            }
          />
        </motion.div>

        {/* KPI Cards */}
        <motion.div variants={pageTransitionFast} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Today's Expenses" value={formatCurrency(todayExpenses)} icon="TrendingDown" color="text-destructive" index={0} />
          <StatCard label="This Month" value={formatCurrency(thisMonth)} icon="Calendar" color="text-primary" index={1} />
          <StatCard label="Total All Time" value={formatCurrency(totalExpenses)} icon="DollarSign" color="text-warning" index={2} />
          <StatCard label="Categories Used" value={categoryCount} icon="Layers" color="text-info" index={3} />
        </motion.div>

        {/* Category Filters */}
        <motion.div variants={pageTransitionFast} className="flex flex-wrap gap-2">
          {categoryOptions.map(cat => (
            <button
              key={cat.id}
              onClick={() => setCategoryFilter(cat.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                categoryFilter === cat.id
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "border border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {cat.label}
            </button>
          ))}
        </motion.div>

        {/* Table */}
        <motion.div variants={pageTransitionFast}>
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <p className="text-muted-foreground">{loadError}</p>
              <Button variant="outline" size="sm" onClick={refresh}>Retry</Button>
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState icon="Receipt" title="No expenses found" description={categoryFilter !== "all" ? "Try adjusting your filters" : "Record your first expense to get started."} action={
              <Button size="sm" onClick={openCreateModal}><Plus className="h-4 w-4" /> New Expense</Button>
            } />
          ) : (
            <DataTable columns={columns} data={filtered} searchable searchKey="description" pageSize={10} />
          )}
        </motion.div>

        {/* Add / Edit Modal */}
        <BaseModal open={modalOpen} onClose={() => { setModalOpen(false); setEditingExpense(null) }} title={editingExpense ? "Edit Expense" : "New Expense"} size="md">
          <div className="space-y-4">
            <FormInput label="Description" required placeholder="Enter expense description" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
            <div className="grid grid-cols-2 gap-4">
              <FormSelect label="Category" required value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value as ExpenseCategory }))}
                options={categoryOptions.filter(c => c.id !== "all").map(c => ({ value: c.id, label: c.label }))}
              />
              <FormInput label="Amount (Rs.)" type="number" required min={1} value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} placeholder="0.00" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormInput label="Vendor / Payee" placeholder="Optional vendor name" value={form.vendor} onChange={e => setForm(p => ({ ...p, vendor: e.target.value }))} />
              <FormInput label="Receipt #" placeholder="Optional receipt number" value={form.receiptNumber} onChange={e => setForm(p => ({ ...p, receiptNumber: e.target.value }))} />
            </div>
            <FormSelect label="Payment Method" required value={form.paymentMethod} onChange={e => setForm(p => ({ ...p, paymentMethod: e.target.value as PaymentMethod }))}
                options={[
                  { value: "cash", label: "Cash with Change" },
                  { value: "reception_qr", label: "Reception QR" },
                  { value: "fonepay", label: "FonePay QR" },
                  { value: "credit", label: "Credit Payment" },
                ]}
              />
            <FormTextarea label="Notes" placeholder="Optional notes..." rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
            <FormActions>
              <Button variant="outline" onClick={() => { setModalOpen(false); setEditingExpense(null) }}>Cancel</Button>
              <Button onClick={handleSave}>{editingExpense ? "Save Changes" : "Record Expense"}</Button>
            </FormActions>
          </div>
        </BaseModal>

        {/* Delete Confirmation */}
        <ConfirmDialog
          open={!!deleteId}
          onConfirm={handleDelete}
          onCancel={() => setDeleteId(null)}
          title="Delete Expense"
          message="Are you sure you want to delete this expense? This action cannot be undone."
          confirmLabel="Delete"
          variant="danger"
        />
      </div>
    </PageTransition>
  )
}
