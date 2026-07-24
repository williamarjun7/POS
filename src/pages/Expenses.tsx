import { useState, useMemo, useRef, useEffect } from "react"
import { motion } from "framer-motion"
import {
  Plus,
  MoreHorizontal,
  Trash2,
  Receipt,
  Calculator,
  TrendingDown,
  Layers,
  Calendar,
  Search,
  Check,
  AlertCircle,
  Package,
  Scale,
  Hash,
  DollarSign,
  Sparkles,
  X,
} from "lucide-react"
import { PageTransition } from "@/components/ui/PageTransition"
import { PageHeader } from "@/components/PageHeader"
import { DataTable, type Column } from "@/components/DataTable"
import { StatCard } from "@/components/ui/stat-card"
import { Button } from "@/components/ui/button"
import { BaseModal } from "@/components/ui/modal"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { EmptyState } from "@/components/EmptyState"
import { cn, formatCurrency } from "@/lib/utils"
import { showSuccess, showError } from "@/components/ui/toast"
import { logActivitySafe } from "@/lib/services/activity-log-service"
import { useAuth } from "@/lib/core/auth-context"
import type { ExpenseCategory } from "@/types"
import type { Expense, NewExpenseData } from "@/lib/services/expense-service"
import { useExpenses, EXPENSE_CATEGORIES, EXPENSE_UNITS } from "@/lib/services/expense-service"
import { pageTransitionFast } from "@/lib/animations/presets"

/* ─── Category colour mapping ─────────────────────────────── */

const CATEGORY_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  dairy:        { bg: "bg-blue-50 dark:bg-blue-950/30",   text: "text-blue-700 dark:text-blue-300", dot: "bg-blue-500" },
  grocery:      { bg: "bg-amber-50 dark:bg-amber-950/30", text: "text-amber-700 dark:text-amber-300", dot: "bg-amber-500" },
  vegetables:   { bg: "bg-green-50 dark:bg-green-950/30", text: "text-green-700 dark:text-green-300", dot: "bg-green-500" },
  fruits:       { bg: "bg-rose-50 dark:bg-rose-950/30",   text: "text-rose-700 dark:text-rose-300", dot: "bg-rose-500" },
  meat:         { bg: "bg-red-50 dark:bg-red-950/30",     text: "text-red-700 dark:text-red-300", dot: "bg-red-500" },
  bakery:       { bg: "bg-orange-50 dark:bg-orange-950/30",text: "text-orange-700 dark:text-orange-300", dot: "bg-orange-500" },
  snacks:       { bg: "bg-yellow-50 dark:bg-yellow-950/30",text: "text-yellow-700 dark:text-yellow-300", dot: "bg-yellow-500" },
  beverages:    { bg: "bg-cyan-50 dark:bg-cyan-950/30",   text: "text-cyan-700 dark:text-cyan-300", dot: "bg-cyan-500" },
  tea_coffee:   { bg: "bg-amber-50 dark:bg-amber-950/30", text: "text-amber-800 dark:text-amber-200", dot: "bg-amber-700" },
  fuel:         { bg: "bg-gray-50 dark:bg-gray-950/30",   text: "text-gray-700 dark:text-gray-300", dot: "bg-gray-500" },
  transport:    { bg: "bg-sky-50 dark:bg-sky-950/30",     text: "text-sky-700 dark:text-sky-300", dot: "bg-sky-500" },
  cleaning:     { bg: "bg-teal-50 dark:bg-teal-950/30",   text: "text-teal-700 dark:text-teal-300", dot: "bg-teal-500" },
  laundry:      { bg: "bg-indigo-50 dark:bg-indigo-950/30",text: "text-indigo-700 dark:text-indigo-300", dot: "bg-indigo-500" },
  maintenance:  { bg: "bg-orange-50 dark:bg-orange-950/30",text: "text-orange-700 dark:text-orange-300", dot: "bg-orange-500" },
  housekeeping: { bg: "bg-purple-50 dark:bg-purple-950/30",text: "text-purple-700 dark:text-purple-300", dot: "bg-purple-500" },
  utilities:    { bg: "bg-slate-50 dark:bg-slate-950/30", text: "text-slate-700 dark:text-slate-300", dot: "bg-slate-500" },
  internet:     { bg: "bg-blue-50 dark:bg-blue-950/30",   text: "text-blue-600 dark:text-blue-300", dot: "bg-blue-400" },
  electricity:  { bg: "bg-yellow-50 dark:bg-yellow-950/30",text: "text-yellow-600 dark:text-yellow-300", dot: "bg-yellow-400" },
  rent:         { bg: "bg-violet-50 dark:bg-violet-950/30",text: "text-violet-700 dark:text-violet-300", dot: "bg-violet-500" },
  salary:       { bg: "bg-emerald-50 dark:bg-emerald-950/30",text: "text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500" },
  office:       { bg: "bg-stone-50 dark:bg-stone-950/30", text: "text-stone-700 dark:text-stone-300", dot: "bg-stone-500" },
  equipment:    { bg: "bg-neutral-50 dark:bg-neutral-950/30",text: "text-neutral-700 dark:text-neutral-300", dot: "bg-neutral-500" },
  room_supplies:{ bg: "bg-pink-50 dark:bg-pink-950/30",   text: "text-pink-700 dark:text-pink-300", dot: "bg-pink-500" },
  toiletries:   { bg: "bg-fuchsia-50 dark:bg-fuchsia-950/30",text: "text-fuchsia-700 dark:text-fuchsia-300", dot: "bg-fuchsia-500" },
  amenities:    { bg: "bg-lime-50 dark:bg-lime-950/30",   text: "text-lime-700 dark:text-lime-300", dot: "bg-lime-500" },
  marketing:    { bg: "bg-rose-50 dark:bg-rose-950/30",   text: "text-rose-600 dark:text-rose-300", dot: "bg-rose-400" },
  misc:         { bg: "bg-gray-50 dark:bg-gray-950/30",   text: "text-gray-600 dark:text-gray-400", dot: "bg-gray-400" },
}

function getCategoryColor(category: string) {
  return CATEGORY_COLORS[category] ?? { bg: "bg-gray-50 dark:bg-gray-950/30", text: "text-gray-600 dark:text-gray-400", dot: "bg-gray-400" }
}

function getCategoryLabel(category: string): string {
  return EXPENSE_CATEGORIES.find(c => c.id === category)?.label ?? category
}

/* ─── Quick-fill suggestions for common expenses ──────────── */

interface QuickFill {
  label: string
  category: ExpenseCategory
  unitPrice: number
  unit: string
  quantity: number
}

const QUICK_FILLS: QuickFill[] = [
  { label: "Milk 1L",     category: "dairy",       unitPrice: 120,  unit: "L",    quantity: 1 },
  { label: "Sugar 1kg",   category: "grocery",     unitPrice: 100,  unit: "kg",   quantity: 1 },
  { label: "Cooking Oil", category: "grocery",     unitPrice: 380,  unit: "L",    quantity: 1 },
  { label: "Petrol",      category: "fuel",        unitPrice: 180,  unit: "L",    quantity: 1 },
  { label: "Tea Leaves",  category: "tea_coffee",  unitPrice: 450,  unit: "kg",   quantity: 1 },
  { label: "Rice 25kg",   category: "grocery",     unitPrice: 55,   unit: "kg",   quantity: 25 },
  { label: "Chicken 1kg", category: "meat",        unitPrice: 380,  unit: "kg",   quantity: 1 },
  { label: "Water 12pcs", category: "beverages",   unitPrice: 20,   unit: "Bottle", quantity: 12 },
]

export function Expenses() {
  const { expenses, isLoading, loadError, addExpense, updateExpense, deleteExpense, refresh } = useExpenses()
  const { user } = useAuth()

  const [categoryFilter, setCategoryFilter] = useState<ExpenseCategory | "all">("all")
  const [modalOpen, setModalOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [categorySearch, setCategorySearch] = useState("")
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false)
  const [showQuickFill, setShowQuickFill] = useState(false)

  const categoryRef = useRef<HTMLDivElement>(null)
  const descriptionRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    description: "",
    category: "" as ExpenseCategory | "",
    unitPrice: "",
    quantity: "1",
    unit: "Unit" as string,
    notes: "",
  })

  // ── Computed total ──
  const computedTotal = useMemo(() => {
    const price = Number.parseFloat(form.unitPrice) || 0
    const qty = Number.parseFloat(form.quantity) || 0
    return price * qty
  }, [form.unitPrice, form.quantity])

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

  // ── Filtered categories ──
  const filteredCategories = useMemo(() => {
    if (!categorySearch) return EXPENSE_CATEGORIES
    const q = categorySearch.toLowerCase()
    return EXPENSE_CATEGORIES.filter(c => c.label.toLowerCase().includes(q) || c.id.includes(q))
  }, [categorySearch])

  // ── Filtered expenses ──
  const filtered = useMemo(() => {
    if (categoryFilter !== "all") return expenses.filter(e => e.category === categoryFilter)
    return expenses
  }, [expenses, categoryFilter])

  // ── Click outside category dropdown ──
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (categoryRef.current && !categoryRef.current.contains(e.target as Node)) {
        setShowCategoryDropdown(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  // ── Modals ──
  const openCreateModal = () => {
    setEditingExpense(null)
    setForm({ description: "", category: "", unitPrice: "", quantity: "1", unit: "Unit", notes: "" })
    setCategorySearch("")
    setShowQuickFill(false)
    setModalOpen(true)
    setTimeout(() => descriptionRef.current?.focus(), 100)
  }

  const openEditModal = (expense: Expense) => {
    setEditingExpense(expense)
    const unitPrice = expense.quantity > 0 ? expense.amount / expense.quantity : expense.amount
    setForm({
      description: expense.description,
      category: expense.category,
      unitPrice: String(unitPrice),
      quantity: String(expense.quantity),
      unit: expense.unit || "Unit",
      notes: expense.notes || "",
    })
    setCategorySearch(getCategoryLabel(expense.category))
    setModalOpen(true)
  }

  const applyQuickFill = (qf: QuickFill) => {
    setForm({
      description: qf.label,
      category: qf.category,
      unitPrice: String(qf.unitPrice),
      quantity: String(qf.quantity),
      unit: qf.unit,
      notes: "",
    })
    setCategorySearch(getCategoryLabel(qf.category))
    setShowQuickFill(false)
  }

  const handleSave = async () => {
    if (!form.description.trim()) {
      showError("Please enter an expense description")
      descriptionRef.current?.focus()
      return
    }
    if (!form.category) {
      showError("Please select a category")
      return
    }
    if (!form.unitPrice || Number.parseFloat(form.unitPrice) <= 0) {
      showError("Please enter a valid unit price")
      return
    }

    try {
      if (editingExpense) {
        const payload: Partial<NewExpenseData> = {
          description: form.description,
          category: form.category as ExpenseCategory,
          unitPrice: Number.parseFloat(form.unitPrice),
          quantity: Number.parseFloat(form.quantity) || 1,
          unit: form.unit,
          notes: form.notes || undefined,
        }
        await updateExpense(editingExpense.id, payload)
        showSuccess("Expense updated")
      } else {
        await addExpense({
          description: form.description,
          category: form.category as ExpenseCategory,
          unitPrice: Number.parseFloat(form.unitPrice),
          quantity: Number.parseFloat(form.quantity) || 1,
          unit: form.unit,
          notes: form.notes || undefined,
          recordedBy: user?.id,
        })
        logActivitySafe({
          activityType: 'expense_created',
          entityLabel: `Expense: ${form.description}`,
          status: 'completed',
          amount: computedTotal,
          location: form.category,
          details: `${form.description} — ${form.quantity} × ${formatCurrency(Number.parseFloat(form.unitPrice))} = ${formatCurrency(computedTotal)} (${getCategoryLabel(form.category)})`,
        })
        showSuccess(`"${form.description}" added — ${formatCurrency(computedTotal)}`)
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

  // ── Keyboard shortcut ──
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "n" && !modalOpen) {
        e.preventDefault()
        openCreateModal()
      }
      if (e.key === "Escape" && modalOpen) {
        setModalOpen(false)
        setEditingExpense(null)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [modalOpen])

  // ── Columns ──
  const columns: Column<Expense>[] = [
    {
      key: "description",
      header: "Item",
      render: r => (
        <div className="flex items-center gap-3">
          <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", getCategoryColor(r.category).bg)}>
            <Package className={cn("h-4 w-4", getCategoryColor(r.category).text)} />
          </div>
          <div>
            <span className="font-medium">{r.description}</span>
            {r.quantity > 1 && (
              <span className="ml-2 text-xs text-muted-foreground">
                {r.quantity} × {r.unit}
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "category",
      header: "Category",
      render: r => {
        const color = getCategoryColor(r.category)
        return (
          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", color.bg, color.text)}>
            <span className={cn("h-1.5 w-1.5 rounded-full", color.dot)} />
            {getCategoryLabel(r.category)}
          </span>
        )
      },
    },
    {
      key: "amount",
      header: "Amount",
      render: r => <span className="font-semibold tabular-nums">{formatCurrency(r.amount)}</span>,
    },
    {
      key: "date",
      header: "Date",
      render: r => {
        const d = new Date(r.date + "T00:00:00")
        return (
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
        )
      },
    },
    {
      key: "recordedBy",
      header: "By",
      render: r => {
        const name = r.recordedByName;
        return name ? (
          <span className="text-sm text-muted-foreground">{name}</span>
        ) : (
          <span className="text-muted-foreground/40">—</span>
        );
      },
    },
    {
      key: "actions",
      header: "",
      className: "w-20",
      render: r => (
        <div className="flex items-center gap-1">
          <button onClick={() => openEditModal(r)} className="rounded-lg p-1.5 hover:bg-muted transition-colors" title="Edit">
            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
          </button>
          <button onClick={() => setDeleteId(r.id)} className="rounded-lg p-1.5 hover:bg-destructive/10 transition-colors" title="Delete">
            <Trash2 className="h-4 w-4 text-destructive" />
          </button>
        </div>
      ),
    },
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
              <div className="flex items-center gap-2">
                <span className="hidden md:inline text-xs text-muted-foreground">
                  <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono">Ctrl+N</kbd>
                </span>
                <Button size="sm" onClick={openCreateModal}>
                  <Plus className="h-4 w-4" /> New Expense
                </Button>
              </div>
            }
          />
        </motion.div>

        {/* KPI Cards */}
        <motion.div variants={pageTransitionFast} className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Today's Expenses"
            value={formatCurrency(todayExpenses)}
            icon="TrendingDown"
            color="text-destructive"
            iconBg="bg-red-100 dark:bg-red-900/30"
            sublabel="Total expenses today"
            className="border-l-4 border-l-red-500"
            index={0}
          />
          <StatCard
            label="This Month"
            value={formatCurrency(thisMonth)}
            icon="Calendar"
            color="text-primary"
            iconBg="bg-primary/10"
            sublabel={`${today.slice(0, 7)} expenses`}
            className="border-l-4 border-l-primary"
            index={1}
          />
          <StatCard
            label="Total All Time"
            value={formatCurrency(totalExpenses)}
            icon="DollarSign"
            color="text-warning"
            iconBg="bg-amber-100 dark:bg-amber-900/30"
            sublabel={`${expenses.length} entries`}
            className="border-l-4 border-l-amber-500"
            index={2}
          />
          <StatCard
            label="Categories Used"
            value={categoryCount}
            icon="Layers"
            color="text-info"
            iconBg="bg-blue-100 dark:bg-blue-900/30"
            sublabel="Active categories"
            className="border-l-4 border-l-blue-500"
            index={3}
          />
        </motion.div>

        {/* Category Filters */}
        <motion.div variants={pageTransitionFast}>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setCategoryFilter("all")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                categoryFilter === "all"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/30",
              )}
            >
              All
            </button>
            {EXPENSE_CATEGORIES.slice(0, 12).map(cat => (
              <button
                key={cat.id}
                onClick={() => setCategoryFilter(cat.id)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                  categoryFilter === cat.id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/30",
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Table */}
        <motion.div variants={pageTransitionFast}>
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <AlertCircle className="h-10 w-10 text-destructive/60" />
              <p className="text-muted-foreground">{loadError}</p>
              <Button variant="outline" size="sm" onClick={refresh}>Retry</Button>
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon="Receipt"
              title="No expenses found"
              description={categoryFilter !== "all" ? "Try adjusting your filters" : "Record your first expense to get started."}
              action={
                <Button size="sm" onClick={openCreateModal}>
                  <Plus className="h-4 w-4" /> New Expense
                </Button>
              }
            />
          ) : (
            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
              <DataTable columns={columns} data={filtered} searchable searchKey="description" pageSize={10} />
            </div>
          )}
        </motion.div>

        {/* ── Add / Edit Modal ── */}
        <BaseModal
          open={modalOpen}
          onClose={() => { setModalOpen(false); setEditingExpense(null) }}
          title={editingExpense ? "Edit Expense" : "Record Expense"}
          size="md"
        >
          <div className="space-y-5">

            {/* Quick Fill Suggestions (only for new expenses) */}
            {!editingExpense && (
              <>
                <button
                  type="button"
                  onClick={() => setShowQuickFill(!showQuickFill)}
                  className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Sparkles className="h-3 w-3" />
                  Quick fill common expenses
                  <svg
                    className={cn("h-3 w-3 transition-transform", showQuickFill && "rotate-180")}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                {showQuickFill && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {QUICK_FILLS.map(qf => (
                      <button
                        key={qf.label}
                        type="button"
                        onClick={() => applyQuickFill(qf)}
                        className="flex flex-col items-start gap-0.5 rounded-lg border border-border bg-muted/30 p-2.5 text-left hover:bg-muted hover:border-primary/30 transition-all text-xs"
                      >
                        <span className="font-medium text-foreground">{qf.label}</span>
                        <span className="text-muted-foreground">{formatCurrency(qf.unitPrice * qf.quantity)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Description */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground/80">Expense Name *</label>
              <input
                ref={descriptionRef}
                type="text"
                required
                placeholder="e.g. Milk, Tomato, Sugar..."
                value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
            </div>

            {/* Category (searchable) */}
            <div className="space-y-1.5" ref={categoryRef}>
              <label className="text-xs font-medium text-foreground/80">Category *</label>
              <div className="relative">
                <div
                  onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                  className={cn(
                    "flex items-center gap-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm cursor-pointer transition-all",
                    showCategoryDropdown && "ring-2 ring-primary/30 border-primary",
                  )}
                >
                  {form.category ? (
                    <>
                      <span className={cn("h-2 w-2 rounded-full", getCategoryColor(form.category).dot)} />
                      <span>{getCategoryLabel(form.category)}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground/50">Select category...</span>
                  )}
                  <Search className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                </div>
                {showCategoryDropdown && (
                  <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-card shadow-lg overflow-hidden">
                    <div className="p-2">
                      <input
                        type="text"
                        placeholder="Search categories..."
                        value={categorySearch}
                        onChange={e => setCategorySearch(e.target.value)}
                        className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
                        autoFocus
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      {filteredCategories.map(cat => (
                        <button
                          key={cat.id}
                          onClick={() => {
                            setForm(p => ({ ...p, category: cat.id }))
                            setCategorySearch(cat.label)
                            setShowCategoryDropdown(false)
                          }}
                          className={cn(
                            "flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-muted",
                            form.category === cat.id && "bg-primary/5 font-medium",
                          )}
                        >
                          <span className={cn("h-2 w-2 shrink-0 rounded-full", getCategoryColor(cat.id).dot)} />
                          <span>{cat.label}</span>
                          {form.category === cat.id && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
                        </button>
                      ))}
                      {filteredCategories.length === 0 && (
                        <p className="px-3 py-4 text-xs text-muted-foreground text-center">No categories found</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Unit Price, Quantity, Unit row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground/80">Unit Price (Rs.) *</label>
                <div className="relative">
                  <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
                  <input
                    type="number"
                    min={0.01}
                    step={0.01}
                    required
                    placeholder="0.00"
                    value={form.unitPrice}
                    onChange={e => setForm(p => ({ ...p, unitPrice: e.target.value }))}
                    className="w-full rounded-lg border border-border bg-background pl-8 pr-3 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground/80">Quantity</label>
                <div className="relative">
                  <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
                  <input
                    type="number"
                    min={0.01}
                    step={0.01}
                    placeholder="1"
                    value={form.quantity}
                    onChange={e => setForm(p => ({ ...p, quantity: e.target.value }))}
                    className="w-full rounded-lg border border-border bg-background pl-8 pr-3 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground/80">Unit</label>
                <div className="relative">
                  <Scale className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60 pointer-events-none" />
                  <select
                    value={form.unit}
                    onChange={e => setForm(p => ({ ...p, unit: e.target.value }))}
                    className="w-full rounded-lg border border-border bg-background pl-8 pr-3 py-2.5 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all cursor-pointer"
                  >
                    {EXPENSE_UNITS.map(u => (
                      <option key={u.value} value={u.value}>{u.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Auto-calculated Total */}
            {Number.parseFloat(form.unitPrice) > 0 && Number.parseFloat(form.quantity) > 0 && (
              <div className="rounded-xl bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calculator className="h-4 w-4" />
                    <span>
                      {form.quantity} × {formatCurrency(Number.parseFloat(form.unitPrice) || 0)}
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Total Amount</p>
                    <p className="text-xl font-bold tabular-nums text-foreground">{formatCurrency(computedTotal)}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Notes (optional) */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground/80">Notes <span className="text-muted-foreground/50">(optional)</span></label>
              <input
                type="text"
                placeholder="Add a short note..."
                value={form.notes}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
            </div>

            {/* Auto-recorded info */}
            <div className="rounded-lg bg-muted/50 border border-border p-3 space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Auto-recorded</p>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> Today
                </span>
                <span className="flex items-center gap-1">
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  Now
                </span>
                <span className="flex items-center gap-1">
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  You
                </span>
                <span className="flex items-center gap-1">
                  <DollarSign className="h-3 w-3" /> Cash
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => { setModalOpen(false); setEditingExpense(null) }}>
                Cancel
              </Button>
              <Button onClick={handleSave}>
                {editingExpense ? "Save Changes" : "Record Expense"}
              </Button>
            </div>
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
