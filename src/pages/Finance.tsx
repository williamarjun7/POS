import { useState, useMemo, useEffect } from "react"
import { motion } from "framer-motion"
import { Plus,
  MoreHorizontal,
  Receipt,
  Trash2,
} from "lucide-react"
import { PageTransition } from "@/components/ui/PageTransition"
import { PageHeader } from "@/components/PageHeader"
import { StatusBadge } from "@/components/StatusBadge"
import { DataTable, type Column } from "@/components/DataTable"
import { StatCard, SectionCard } from "@/components/ui/stat-card"
import { Button } from "@/components/ui/button"
import DateFilterBar, { type DateFilterState, getDateRange } from "@/components/filters/DateFilterBar"
import { Tabs } from "@/components/Tabs"
import { cn, formatCurrency } from "@/lib/utils"
import { exportCsv } from "@/lib/services/csv-export"
import { showSuccess, showError } from "@/components/ui/toast"
import { RequirePermission } from "@/lib/core/PermissionGuards"
import { BaseModal } from "@/components/ui/modal"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { FormInput, FormSelect, FormTextarea, FormActions } from "@/components/ui/form-field"
import { useServerPagination } from "@/lib/hooks/useServerPagination"
import { usePaymentsList } from '@/lib/services/payment-service'
import { logActivitySafe } from '@/lib/services/activity-log-service'
import { insforge } from '@/lib/services/auth-service'
import { pageTransitionFast } from "@/lib/animations/presets"
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
  AreaChart,
  Area,
} from "recharts"
import type {
  Invoice,
  ExpenseCategory,
} from "@/types"
import type { PaymentMethod } from "@/types"
import type { Expense } from "@/lib/services/expense-service"
import { useExpenses } from "@/lib/services/expense-service"
import { useCashReconciliations } from "@/lib/services/cash-reconciliation-service"
import { PaymentMethodBadge } from "@/components/PaymentMethodBadge"
import { PaymentBreakdown } from "@/components/payments/PaymentBreakdown"
import {
  useFinancialSummaryForRange,
  useCashFlow,
} from '@/lib/services/finance-aggregation'

// ─── Status badge variant mapping (raw DB status → color) ──
const statusVariant: Record<string, "default" | "success" | "warning" | "destructive" | "info" | "secondary"> = {
  paid: "success",
  pending: "warning",
  overdue: "destructive",
  partial: "info",
  credit_invoice: "info",
}

// ─── Derived display status from financial state ──────────
// Per the spec:
//   Outstanding = 0 → "Paid" (green)
//   Paid > 0 AND Outstanding > 0 → "Partially Paid" (amber)
//   Paid = 0 → "Credit" (blue)
function getDisplayStatus(paid: number, total: number): { label: string; variant: 'success' | 'warning' | 'info' } {
  const outstanding = total - paid
  if (outstanding <= 0) return { label: 'Paid', variant: 'success' }
  if (paid > 0) return { label: 'Partially Paid', variant: 'warning' }
  return { label: 'Credit', variant: 'info' }
}

const COLORS = {
  primary: "var(--color-primary, #6366f1)",
  success: "#22c55e",
  warning: "#f59e0b",
  destructive: "#ef4444",
  info: "#3b82f6",
  purple: "#a855f7",
}

// Using pageTransitionFast, staggerContainerFast from presets

const statusFilterOptions = ["all", "paid", "pending", "overdue", "partial", "credit_invoice"] as const
const categoryFilterOptions: { id: ExpenseCategory | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "utilities", label: "Utilities" },
  { id: "supplies", label: "Supplies" },
  { id: "maintenance", label: "Maintenance" },
  { id: "staff", label: "Staff" },
  { id: "marketing", label: "Marketing" },
  { id: "other", label: "Other" },
]
const paymentMethodFilterOptions: { id: PaymentMethod | "all"; label: string }[] = [
  { id: "all", label: "All Methods" },
  { id: "cash", label: "Cash with Change" },
  { id: "reception_qr", label: "Reception QR" },
  { id: "fonepay", label: "FonePay QR" },
  { id: "credit", label: "Credit Payment" },
]

export function Finance() {
  const [activeTab, setActiveTab] = useState("overview")
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<"all" | "paid" | "pending" | "overdue" | "partial" | "credit_invoice">("all")
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState<ExpenseCategory | "all">("all")
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<PaymentMethod | "all">("all")
  const { expenses, isLoading: expensesLoading, loadError: expensesError, addExpense, updateExpense, deleteExpense, refresh: refreshExpenses } = useExpenses()
  const { reconciliations, isLoading: recLoading, loadError: recError, refresh: refreshRec } = useCashReconciliations()

  // ── Date filter state (default: Today) ──
  const [dateFilter, setDateFilter] = useState<DateFilterState>({ preset: 'today' })
  const dateRange = getDateRange(dateFilter)
  const [isAllTimeMode, setIsAllTimeMode] = useState(false)

  const rangeStart = isAllTimeMode ? undefined : dateRange.startDate
  const rangeEnd = isAllTimeMode ? undefined : dateRange.endDate

  // ── React Query hooks (shared, accurate, auto-refreshing) ──
  // useFinancialSummaryForRange handles both range-filtered and all-time queries
  // (when dates are undefined, it falls back to all-time in the queryFn)
  const { data: financialSummary } = useFinancialSummaryForRange(rangeStart, rangeEnd)
  const { data: cashFlowData } = useCashFlow()

  // Use server-side pagination for invoices (display only — KPI values come from useFinancialSummary)
  const {
    data: invoicesPage,
    totalPages: invoicesPages,
    page: invoicesPageNum,
    setPage: setInvoicesPage,
    isLoading: invLoading,
    error: invError,
    refresh: refreshInvoices,
  } = useServerPagination<import('@/lib/db/types').InvoiceRow>('invoices', { pageSize: 15, orderBy: 'created_at', orderDir: 'desc' })

  // Fetch item counts for invoices in the current page
  const [invoiceItemCounts, setInvoiceItemCounts] = useState<Record<string, number>>({})
  // Fetch payment methods + amounts per invoice for multi-method breakdown display
  const [invoicePaymentMethods, setInvoicePaymentMethods] = useState<Record<string, string[]>>({})
  // Fetch payment breakdown (method + amount + discount) per invoice for amount-per-method display
  const [invoicePaymentBreakdowns, setInvoicePaymentBreakdowns] = useState<Record<string, Array<{ method: string; amount: number; discount?: number }>>>({})
  // Fetch total paid (non-credit) per invoice for Paid & Outstanding columns
  const [invoicePaidAmounts, setInvoicePaidAmounts] = useState<Record<string, number>>({})
  useEffect(() => {
    const invoiceIds = invoicesPage.map(inv => inv.id)
    if (invoiceIds.length === 0) {
      setInvoiceItemCounts({})
      setInvoicePaymentMethods({})
      setInvoicePaidAmounts({})
      return
    }
    let cancelled = false
    Promise.all([
      insforge.database
        .from('invoice_items')
        .select('invoice_id')
        .in('invoice_id', invoiceIds),
      insforge.database
        .from('payments')
        .select('invoice_id, payment_method, amount, discount')
        .in('invoice_id', invoiceIds)
        .not('payment_method', 'is', null),
    ]).then(([itemsResult, paymentsResult]) => {
      if (cancelled) return
      // Item counts
      const counts: Record<string, number> = {}
      for (const row of (itemsResult.data ?? []) as Array<{ invoice_id: string }>) {
        counts[row.invoice_id] = (counts[row.invoice_id] ?? 0) + 1
      }
      setInvoiceItemCounts(counts)

      // Payment methods, breakdowns & totals per invoice
      const methods: Record<string, Set<string>> = {}
      const breakdowns: Record<string, Array<{ method: string; amount: number; discount?: number }>> = {}
      const paidAmounts: Record<string, number> = {}
      for (const row of (paymentsResult.data ?? []) as Array<{ invoice_id: string; payment_method: string; amount: number; discount?: number }>) {
        if (!methods[row.invoice_id]) methods[row.invoice_id] = new Set()
        methods[row.invoice_id].add(row.payment_method)

        // Store each payment with its amount and discount for breakdown display
        if (!breakdowns[row.invoice_id]) breakdowns[row.invoice_id] = []
        breakdowns[row.invoice_id].push({ method: row.payment_method, amount: Number(row.amount), discount: row.discount ? Number(row.discount) : undefined })

        // Aggregate REAL MONEY only — credit is NOT payment
        if (row.payment_method !== 'credit') {
          paidAmounts[row.invoice_id] = (paidAmounts[row.invoice_id] ?? 0) + Number(row.amount)
        }
      }
      const methodList: Record<string, string[]> = {}
      for (const [invId, methodSet] of Object.entries(methods)) {
        methodList[invId] = Array.from(methodSet)
      }
      setInvoicePaymentMethods(methodList)
      setInvoicePaymentBreakdowns(breakdowns)
      setInvoicePaidAmounts(paidAmounts)
    }).catch((err) => { console.warn('[Finance] Failed to fetch invoice metadata:', err) })
    return () => { cancelled = true }
  }, [invoicesPage])

  // Map DB rows to frontend Invoice type
  const invoices: Invoice[] = invoicesPage.map(row => ({
    id: row.id,
    invoiceNumber: row.invoice_number,
    customer: row.customer_name,
    items: [],
    subtotal: row.subtotal,
    tax: row.tax,
    discount: row.discount,
    total: row.total,
    status: row.status as Invoice['status'],
    paymentMethod: (row.payment_method as Invoice['paymentMethod']) ?? 'cash',
    createdAt: row.created_at,
    dueDate: row.due_date ?? undefined,
  }))
  // Load payment history from DB via React Query (auto-refreshes after POS payments)
  const { data: paymentRecords = [] } = usePaymentsList(50)
  const paymentHistory = useMemo(() =>
    paymentRecords.map(p => ({
      id: p.id,
      invoice: p.reference || `PAY-${p.id.slice(0, 8)}`,
      customer: '',
      amount: p.amount,
      method: p.paymentMethod,
      status: 'paid',
      date: p.createdAt.split('T')[0],
      time: p.createdAt.split('T')[1]?.slice(0, 5) ?? '',
    })),
    [paymentRecords]
  )
  const [expenseModalOpen, setExpenseModalOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [deleteExpenseId, setDeleteExpenseId] = useState<string | null>(null)
  const [newExpense, setNewExpense] = useState({ description: "", category: "supplies" as ExpenseCategory, amount: "", paymentMethod: "cash" as PaymentMethod, notes: "", vendor: "", receiptNumber: "" })

  const handleEditExpense = (expense: Expense) => {
    setEditingExpense(expense)
    setExpenseModalOpen(true)
    setNewExpense({
      description: expense.description,
      category: expense.category,
      amount: String(expense.amount),
      paymentMethod: expense.paymentMethod,
      notes: expense.notes || '',
      vendor: expense.vendor || '',
      receiptNumber: expense.receiptNumber || '',
    })
  }
  const [reconModalOpen, setReconModalOpen] = useState(false)
  const [newRecon, setNewRecon] = useState({ date: new Date().toISOString().slice(0, 10), openingBalance: "", cashReceived: "0", cashPaid: "0", actualBalance: "", notes: "" })

  // ── KPIs from shared financial summary (ALL records, not paginated) ──
  const totalRevenue = financialSummary?.totalRevenue ?? 0
  const totalExpenses = financialSummary?.totalExpenses ?? 0
  const netProfit = financialSummary?.netProfit ?? 0
  const outstandingReceivables = financialSummary?.outstandingReceivables ?? 0
  const creditInvoiceTotal = financialSummary?.creditInvoiceTotal ?? 0
  const creditInvoiceCount = financialSummary?.creditInvoiceCount ?? 0
  const paidCount = financialSummary?.paidCount ?? 0
  const pendingCount = financialSummary?.pendingCount ?? 0
  const overdueCount = financialSummary?.overdueCount ?? 0

  const cashFlow = useMemo(() => cashFlowData ?? [], [cashFlowData])

  const filteredInvoices = invoiceStatusFilter === "all" ? invoices : invoices.filter((inv) => inv.status === invoiceStatusFilter)
  const filteredExpenses = expenseCategoryFilter === "all" ? expenses : expenses.filter((e) => e.category === expenseCategoryFilter)
  const filteredPayments = paymentMethodFilter === "all" ? paymentHistory : paymentHistory.filter((p) => p.method === paymentMethodFilter)

  const totalPaid = useMemo(() => paymentHistory.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0), [paymentHistory])
  const totalPendingPayments = useMemo(() => paymentHistory.filter((p) => p.status === "pending" || p.status === "overdue").reduce((s, p) => s + p.amount, 0), [paymentHistory])

  const expenseCategoriesCount = new Set(expenses.map((e) => e.category)).size
  const avgPerExpense = expenses.length > 0 ? Math.round(totalExpenses / expenses.length) : 0

  const todayRec = reconciliations[0] ?? { id: '', date: '', openingBalance: 0, cashReceived: 0, cashPaid: 0, expectedBalance: 0, actualBalance: 0, variance: 0, reconciledBy: '', reconciledAt: '' }

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "invoices", label: "Invoices", count: financialSummary?.totalInvoices ?? invoices.length },
    { id: "expenses", label: "Expenses", count: expenses.length },
    { id: "cashflow", label: "Cash Flow" },
    { id: "payments", label: "Payments", count: paymentHistory.length },
  ]

  const invoiceColumns: Column<Invoice>[] = [
    { key: "invoiceNumber", header: "Invoice #", render: (r) => <span className="font-medium text-primary">{r.invoiceNumber}</span> },
    { key: "customer", header: "Customer" },
    { key: "items", header: "Items", render: (r) => <span>{invoiceItemCounts[r.id] ?? 0} items</span> },
    { key: "discount", header: "Discount", render: (r) => r.discount > 0 ? <span className="text-destructive">-{formatCurrency(r.discount)}</span> : <span className="text-muted-foreground">-</span> },
    { key: "total", header: "Invoice Total", render: (r) => <span className="font-semibold">{formatCurrency(r.total)}</span> },
    { key: "paid", header: "Paid", render: (r) => {
      const paid = invoicePaidAmounts[r.id] ?? 0
      return <span className="font-semibold text-success">{formatCurrency(paid)}</span>
    } },
    { key: "outstanding", header: "Outstanding", render: (r) => {
      const paid = invoicePaidAmounts[r.id] ?? 0
      const outstanding = Math.max(0, r.total - paid)
      const isZero = outstanding === 0
      return (
        <span className={cn('font-semibold tabular-nums', isZero ? 'text-success' : 'text-orange-500 dark:text-orange-400')}>
          {formatCurrency(outstanding)}
        </span>
      )
    } },
    { key: "status", header: "Status", render: (r) => {
      const paid = invoicePaidAmounts[r.id] ?? 0
      const { label, variant } = getDisplayStatus(paid, r.total)
      return <StatusBadge label={label} variant={variant} />
    } },
    { key: "paymentMethod", header: "Payment", render: (r) => {
      const methods = invoicePaymentMethods[r.id]
      const breakdown = invoicePaymentBreakdowns[r.id]
      if (methods && methods.length > 0 && breakdown && breakdown.length > 0) {
        return (
          <PaymentBreakdown
            payments={breakdown}
            variant="inline"
            showTotal={false}
          />
        )
      }
      return <PaymentMethodBadge method={r.paymentMethod} size="sm" />
    } },
    { key: "createdAt", header: "Date", render: (r) => {
      const d = new Date(r.createdAt)
      return <span className="text-sm text-muted-foreground whitespace-nowrap">{d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
    } },
    { key: "actions", header: "", render: () => <button className="rounded-lg p-1.5 hover:bg-muted"><MoreHorizontal className="h-4 w-4 text-muted-foreground" /></button> },
  ]

  const expenseColumns: Column<Expense>[] = [
    { key: "description", header: "Description", render: (r) => <span className="font-medium">{r.description}</span> },
    { key: "category", header: "Category", render: (r) => <StatusBadge label={r.category} variant="secondary" /> },
    { key: "amount", header: "Amount", render: (r) => <span className="font-semibold">{formatCurrency(r.amount)}</span> },
    { key: "vendor", header: "Vendor", render: (r) => r.vendor ? <span className="text-sm text-foreground">{r.vendor}</span> : <span className="text-muted-foreground/50">—</span> },
    { key: "date", header: "Date" },
    { key: "paymentMethod", header: "Payment Method", render: (r) => <PaymentMethodBadge method={r.paymentMethod} size="sm" /> },
    { key: "recordedBy", header: "Recorded By" },
    { key: "actions", header: "", render: (r) => <div className="flex items-center gap-1">
      <RequirePermission permission="expenses.manage">
        <button onClick={() => handleEditExpense(r)} className="rounded-lg p-1.5 hover:bg-muted transition-colors" title="Edit Expense"><MoreHorizontal className="h-4 w-4 text-muted-foreground" /></button>
      </RequirePermission>
      <RequirePermission permission="expenses.manage">
        <button onClick={() => setDeleteExpenseId(r.id)} className="rounded-lg p-1.5 hover:bg-destructive/10 transition-colors" title="Delete Expense"><Trash2 className="h-4 w-4 text-destructive" /></button>
      </RequirePermission>
    </div> },
  ]

  const paymentColumns: Column<Record<string, unknown>>[] = [
    { key: "invoice", header: "Invoice", render: (r) => <span className="font-medium text-primary">{r.invoice as string}</span> },
    { key: "customer", header: "Customer" },
    { key: "amount", header: "Amount", render: (r) => <span className="font-semibold">{formatCurrency(r.amount as number)}</span> },
    { key: "method", header: "Method", render: (r) => <PaymentMethodBadge method={r.method as string} size="sm" /> },
    { key: "status", header: "Status", render: (r) => <StatusBadge label={r.status as string} variant={statusVariant[r.status as string]} /> },
    { key: "date", header: "Date" },
    { key: "time", header: "Time" },
  ]

  const handleSaveExpense = async () => {
    if (!newExpense.description.trim() || !newExpense.amount) {
      showError("Please fill in description and amount")
      return
    }
    try {
      if (editingExpense) {
        await updateExpense(editingExpense.id, {
          description: newExpense.description,
          category: newExpense.category,
          amount: Number(newExpense.amount),
          paymentMethod: newExpense.paymentMethod,
          notes: newExpense.notes || undefined,
          vendor: newExpense.vendor || undefined,
          receiptNumber: newExpense.receiptNumber || undefined,
        })
        showSuccess("Expense updated successfully")
      } else {
        await addExpense({
          description: newExpense.description,
          category: newExpense.category,
          amount: Number(newExpense.amount),
          paymentMethod: newExpense.paymentMethod,
          notes: newExpense.notes || undefined,
          vendor: newExpense.vendor || undefined,
          receiptNumber: newExpense.receiptNumber || undefined,
        })

        logActivitySafe({
          activityType: 'expense_created',
          entityLabel: `Expense: ${newExpense.description}`,
          status: 'completed',
          amount: Number(newExpense.amount),
          location: newExpense.category,
          details: `Expense of ${formatCurrency(Number(newExpense.amount))} for "${newExpense.description}" (${newExpense.category}) paid via ${newExpense.paymentMethod}${newExpense.notes ? ` — ${newExpense.notes}` : ''}`,
        })

        showSuccess(`Expense "${newExpense.description}" added successfully`)
      }
      setExpenseModalOpen(false)
      setEditingExpense(null)
      setNewExpense({ description: "", category: "supplies", amount: "", paymentMethod: "cash", notes: "", vendor: "", receiptNumber: "" })
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to save expense")
    }
  }

  const handleDeleteExpense = async () => {
    if (!deleteExpenseId) return
    try {
      await deleteExpense(deleteExpenseId)
      showSuccess("Expense deleted")
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to delete expense")
    } finally {
      setDeleteExpenseId(null)
    }
  }

  const handleAddReconciliation = async () => {
    if (!newRecon.openingBalance || !newRecon.actualBalance) {
      showError("Opening balance and actual balance are required")
      return
    }
    try {
      const opening = Number(newRecon.openingBalance)
      const received = Number(newRecon.cashReceived) || 0
      const paid = Number(newRecon.cashPaid) || 0
      const actual = Number(newRecon.actualBalance)
      const expected = opening + received - paid
      const variance = actual - expected

      await insforge.database
        .from('cash_reconciliations')
        .insert([{
          date: newRecon.date,
          opening_balance: opening,
          cash_received: received,
          cash_paid: paid,
          expected_balance: expected,
          actual_balance: actual,
          variance,
          notes: newRecon.notes || null,
        }])

      showSuccess("Reconciliation saved successfully")
      setReconModalOpen(false)
      setNewRecon({ date: new Date().toISOString().slice(0, 10), openingBalance: "", cashReceived: "0", cashPaid: "0", actualBalance: "", notes: "" })
      refreshRec()
    } catch {
      showError("Failed to save reconciliation. Check your connection.")
    }
  }

  function handleExportFinance() {
    const date = new Date().toISOString().split('T')[0]

    // Build CSV with rows for summary KPIs, revenue by day, and payment methods
    const rows: Array<{ section: string; metric: string; value: string }> = []

    // Section 1: Summary
    rows.push({ section: 'FINANCIAL SUMMARY', metric: '', value: '' })
    rows.push({ section: '', metric: 'Total Revenue', value: formatCurrency(totalRevenue) })
    rows.push({ section: '', metric: 'Total Expenses', value: formatCurrency(totalExpenses) })
    rows.push({ section: '', metric: 'Net Profit', value: formatCurrency(netProfit) })
    rows.push({ section: '', metric: 'Credit Invoices', value: formatCurrency(creditInvoiceTotal) })
    rows.push({ section: '', metric: 'Outstanding Receivables', value: formatCurrency(outstandingReceivables) })
    rows.push({ section: '', metric: 'Paid Invoices', value: String(paidCount) })
    rows.push({ section: '', metric: 'Pending Invoices', value: String(pendingCount) })
    rows.push({ section: '', metric: 'Overdue Invoices', value: String(overdueCount) })
    rows.push({ section: '', metric: 'Total Invoice Count', value: String(financialSummary?.totalInvoices ?? 0) })
    rows.push({ section: '', metric: '', value: '' })



    exportCsv(
      rows,
      [
        { label: 'Section', value: (r: typeof rows[0]) => r.section },
        { label: 'Metric', value: (r: typeof rows[0]) => r.metric },
        { label: 'Value', value: (r: typeof rows[0]) => r.value },
      ],
      `finance-${date}`
    )
    showSuccess(`Finance data exported as CSV`)
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        <motion.div variants={pageTransitionFast}>
          <PageHeader
            title="Finance"
            icon="DollarSign"
            description="Complete financial overview and management"
            actions={
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleExportFinance}>
                  <Receipt className="h-4 w-4" /> Export
                </Button>
                <RequirePermission permission="expenses.manage">
                  <Button size="sm" onClick={() => setExpenseModalOpen(true)}>
                    <Plus className="h-4 w-4" /> New Expense
                  </Button>
                </RequirePermission>
              </div>
            }
          />
        </motion.div>

        {/* ── Date Filter Bar ── */}
        <motion.div variants={pageTransitionFast} className="flex flex-wrap items-center gap-2">
          <DateFilterBar filter={dateFilter} dateRange={dateRange} onChange={setDateFilter} />
          <button
            onClick={() => setIsAllTimeMode(prev => !prev)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
              isAllTimeMode
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
            }`}
          >
            All Time
          </button>
        </motion.div>

        <motion.div variants={pageTransitionFast}>
          <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
        </motion.div>

        {activeTab === "overview" && (
          <motion.div initial="hidden" animate="visible" variants={{ show: { transition: { staggerChildren: 0.06 } } }} className="space-y-6">
            <motion.div variants={pageTransitionFast} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <motion.div whileHover={{ y: -3, scale: 1.02 }} className="backdrop-blur-sm">
                <StatCard label="Total Revenue" value={formatCurrency(totalRevenue)} icon="TrendingUp" color="text-success" trend="up" trendValue={`From all ${financialSummary?.totalInvoices ?? 0} invoices`} index={0} />
              </motion.div>
              <motion.div whileHover={{ y: -3, scale: 1.02 }} className="backdrop-blur-sm">
                <StatCard label="Total Expenses" value={formatCurrency(totalExpenses)} icon="TrendingDown" color="text-destructive" trend="down" trendValue={`${expenses.length} expense entries`} index={1} />
              </motion.div>
              <motion.div whileHover={{ y: -3, scale: 1.02 }} className="backdrop-blur-sm">
                <StatCard label="Net Profit" value={formatCurrency(netProfit)} icon="DollarSign" color={netProfit >= 0 ? "text-success" : "text-destructive"} trend={netProfit >= 0 ? "up" : "down"} trendValue={netProfit >= 0 ? "Positive cash flow" : "Negative cash flow"} index={2} />
              </motion.div>
              <motion.div whileHover={{ y: -3, scale: 1.02 }} className="backdrop-blur-sm">
                <StatCard label="Credit Invoices" value={formatCurrency(creditInvoiceTotal)} icon="CreditCard" color="text-purple-600 dark:text-purple-400" trend="neutral" trendValue={`${creditInvoiceCount} invoices`} index={3} />
              </motion.div>
              <motion.div whileHover={{ y: -3, scale: 1.02 }} className="backdrop-blur-sm">
                <StatCard label="Outstanding Receivables" value={formatCurrency(outstandingReceivables)} icon="Wallet" color="text-warning" trend="down" trendValue={`Across all unpaid invoices`} index={4} />
              </motion.div>
            </motion.div>



            <motion.div variants={pageTransitionFast}>
              <SectionCard title="Recent Transactions" icon="Receipt" iconColor="text-info" index={3}>
                <DataTable columns={invoiceColumns.slice(0, 10)} data={invoices.slice(0, 10)} searchable searchKey="customer" />
              </SectionCard>
            </motion.div>
          </motion.div>
        )}

        {activeTab === "invoices" && (
          <motion.div initial="hidden" animate="visible" variants={{ show: { transition: { staggerChildren: 0.06 } } }} className="space-y-6">
            {invLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            ) : invError ? (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <p className="text-muted-foreground">{invError}</p>
                <Button variant="outline" size="sm" onClick={refreshInvoices}>Retry</Button>
              </div>
            ) : (
              <>
            <motion.div variants={pageTransitionFast} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <StatCard label="Total Invoices" value={financialSummary?.totalInvoices ?? 0} icon="Receipt" color="text-primary" index={0} />
              <StatCard label="Paid" value={paidCount} icon="CheckCircle2" color="text-success" index={1} />
              <StatCard label="Unpaid" value={pendingCount} icon="Clock" color="text-warning" index={2} />
              <StatCard label="Credit" value={creditInvoiceCount} icon="CreditCard" color="text-purple-600 dark:text-purple-400" index={3} />
              <StatCard label="Overdue" value={overdueCount} icon="AlertCircle" color="text-destructive" index={4} />
            </motion.div>

            <motion.div variants={pageTransitionFast}>
              <div className="flex flex-wrap gap-2">
                {statusFilterOptions.map((status) => (
                  <button
                    key={status}
                    onClick={() => setInvoiceStatusFilter(status)}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                      invoiceStatusFilter === status
                        ? "bg-primary text-primary-foreground"
                        : "border border-border bg-card text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {status === "all" ? "All" : status === "credit_invoice" ? "Credit" : status.charAt(0).toUpperCase() + status.slice(1)}
                  </button>
                ))}
              </div>
            </motion.div>

            <motion.div variants={pageTransitionFast}>
              <DataTable<Invoice>
                columns={invoiceColumns}
                data={filteredInvoices}
                searchable searchKey="customer"
                loading={invLoading}
                totalPages={invoicesPages}
                currentPage={invoicesPageNum}
                onPageChange={setInvoicesPage}
              />
            </motion.div>
              </>
            )}
          </motion.div>
        )}

        {activeTab === "expenses" && (
          <motion.div initial="hidden" animate="visible" variants={{ show: { transition: { staggerChildren: 0.06 } } }} className="space-y-6">
            {expensesLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            ) : expensesError ? (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <p className="text-muted-foreground">{expensesError}</p>
                <Button variant="outline" size="sm" onClick={refreshExpenses}>Retry</Button>
              </div>
            ) : (
              <>
                <motion.div variants={pageTransitionFast} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <StatCard label="Total Expenses" value={formatCurrency(totalExpenses)} icon="DollarSign" color="text-destructive" index={0} />
                  <StatCard label="Categories" value={expenseCategoriesCount} icon="Layers" color="text-primary" index={1} />
                  <StatCard label="Avg per Expense" value={formatCurrency(avgPerExpense)} icon="Calculator" color="text-info" index={2} />
                </motion.div>

                <motion.div variants={pageTransitionFast}>
                  <div className="flex flex-wrap gap-2">
                    {categoryFilterOptions.map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => setExpenseCategoryFilter(cat.id)}
                        className={cn(
                          "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                          expenseCategoryFilter === cat.id
                            ? "bg-primary text-primary-foreground"
                            : "border border-border bg-card text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </motion.div>

                <motion.div variants={pageTransitionFast}>
                  <DataTable columns={expenseColumns} data={filteredExpenses} searchable searchKey="description" />
                </motion.div>
              </>
            )}
          </motion.div>
        )}

        {activeTab === "cashflow" && (
          <motion.div initial="hidden" animate="visible" variants={{ show: { transition: { staggerChildren: 0.06 } } }} className="space-y-6">
            {recLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            ) : recError ? (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <p className="text-muted-foreground">{recError}</p>
                <Button variant="outline" size="sm" onClick={refreshRec}>Retry</Button>
              </div>
            ) : (
              <>
              <div className="flex items-center justify-between">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6 flex-1">
                  <StatCard label="Opening Balance" value={formatCurrency(todayRec.openingBalance)} icon="Wallet" color="text-primary" index={0} />
                  <StatCard label="Cash In" value={formatCurrency(todayRec.cashReceived)} icon="TrendingUp" color="text-success" index={1} />
                  <StatCard label="Cash Out" value={formatCurrency(todayRec.cashPaid)} icon="TrendingDown" color="text-destructive" index={2} />
                  <StatCard label="Expected" value={formatCurrency(todayRec.expectedBalance)} icon="Calculator" color="text-primary" index={3} />
                  <StatCard label="Actual" value={formatCurrency(todayRec.actualBalance)} icon="Banknote" color="text-success" index={4} />
                  <StatCard
                    label="Variance"
                    value={todayRec.variance === 0 ? "Balanced" : formatCurrency(todayRec.variance)}
                    icon={todayRec.variance === 0 ? "CheckCircle2" : "AlertCircle"}
                    color={todayRec.variance === 0 ? "text-success" : "text-destructive"}
                    index={5}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <RequirePermission permission="reconciliation.create">
                  <Button size="sm" onClick={() => setReconModalOpen(true)}>
                    <Plus className="h-4 w-4" /> New Reconciliation
                  </Button>
                </RequirePermission>
              </div>

            <motion.div variants={pageTransitionFast}>
              <SectionCard title="Cash Flow Trend" icon="TrendingUp" iconColor="text-success" index={1}>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={cashFlow}>
                      <defs>
                        <linearGradient id="gradientInflow" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={COLORS.success} stopOpacity={0.3} />
                          <stop offset="100%" stopColor={COLORS.success} stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gradientOutflow" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={COLORS.destructive} stopOpacity={0.3} />
                          <stop offset="100%" stopColor={COLORS.destructive} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <RechartsTooltip formatter={(value: any) => formatCurrency(value as number)} contentStyle={{ borderRadius: 12, border: "1px solid var(--color-border)", background: "var(--color-card)" }} />
                      <Area type="monotone" dataKey="inflow" stroke={COLORS.success} fill="url(#gradientInflow)" strokeWidth={2} name="Cash In" />
                      <Area type="monotone" dataKey="outflow" stroke={COLORS.destructive} fill="url(#gradientOutflow)" strokeWidth={2} name="Cash Out" />
                      <Legend iconType="circle" iconSize={8} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </SectionCard>
            </motion.div>

            <motion.div variants={pageTransitionFast}>
              <SectionCard title="Reconciliation History" icon="History" iconColor="text-primary" index={2}>
                <div className="rounded-xl border border-border bg-card/70 backdrop-blur-sm p-5 shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/50">
                          <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                          <th className="px-4 py-3 text-left font-medium text-muted-foreground">Opening</th>
                          <th className="px-4 py-3 text-left font-medium text-muted-foreground">Cash In</th>
                          <th className="px-4 py-3 text-left font-medium text-muted-foreground">Cash Out</th>
                          <th className="px-4 py-3 text-left font-medium text-muted-foreground">Expected</th>
                          <th className="px-4 py-3 text-left font-medium text-muted-foreground">Actual</th>
                          <th className="px-4 py-3 text-left font-medium text-muted-foreground">Variance</th>
                          <th className="px-4 py-3 text-left font-medium text-muted-foreground">Reconciled By</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reconciliations.map((rec, idx) => (
                          <motion.tr
                            key={rec.id}
                            className="border-b border-border last:border-0"
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.05 }}
                            whileHover={{ backgroundColor: 'rgba(var(--color-muted), 0.5)' }}
                          >
                            <td className="px-4 py-3 font-medium">{rec.date}</td>
                            <td className="px-4 py-3">{formatCurrency(rec.openingBalance)}</td>
                            <td className="px-4 py-3 text-success">{formatCurrency(rec.cashReceived)}</td>
                            <td className="px-4 py-3 text-destructive">{formatCurrency(rec.cashPaid)}</td>
                            <td className="px-4 py-3">{formatCurrency(rec.expectedBalance)}</td>
                            <td className="px-4 py-3">{formatCurrency(rec.actualBalance)}</td>
                            <td className="px-4 py-3">
                              <span className={rec.variance === 0 ? "text-success" : "text-destructive"}>
                                {rec.variance === 0 ? "Balanced" : formatCurrency(rec.variance)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">{rec.reconciledBy}</td>
                          </motion.tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </SectionCard>
            </motion.div>
              </>
            )}
          </motion.div>
        )}

        {activeTab === "payments" && (
          <motion.div initial="hidden" animate="visible" variants={{ show: { transition: { staggerChildren: 0.06 } } }} className="space-y-6">
            <motion.div variants={pageTransitionFast} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Total Received" value={formatCurrency(totalPaid)} icon="CheckCircle2" color="text-success" index={0} />
              <StatCard label="Total Pending" value={formatCurrency(totalPendingPayments)} icon="Clock" color="text-warning" index={1} />
              <StatCard label="Total Transactions" value={paymentHistory.length} icon="Receipt" color="text-primary" index={2} />
              <StatCard label="Overdue Amount" value={formatCurrency(paymentHistory.filter((p) => p.status === "overdue").reduce((s, p) => s + p.amount, 0))} icon="AlertCircle" color="text-destructive" index={3} />
            </motion.div>

            <motion.div variants={pageTransitionFast}>
              <div className="flex flex-wrap gap-2">
                {paymentMethodFilterOptions.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setPaymentMethodFilter(m.id)}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                      paymentMethodFilter === m.id
                        ? "bg-primary text-primary-foreground"
                        : "border border-border bg-card text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </motion.div>

            <motion.div variants={pageTransitionFast}>
              <DataTable columns={paymentColumns} data={filteredPayments} searchable searchKey="customer" />
            </motion.div>
          </motion.div>
        )}

        {/* Reconciliation Modal */}
        <BaseModal open={reconModalOpen} onClose={() => setReconModalOpen(false)} title="New Cash Reconciliation" size="md">
          <div className="space-y-4">
            <FormInput label="Date" type="date" required value={newRecon.date} onChange={(e) => setNewRecon((prev) => ({ ...prev, date: e.target.value }))} />
            <FormInput label="Opening Balance" type="number" required value={newRecon.openingBalance} onChange={(e) => setNewRecon((prev) => ({ ...prev, openingBalance: e.target.value }))} placeholder="0.00" />
            <FormInput label="Cash Received" type="number" value={newRecon.cashReceived} onChange={(e) => setNewRecon((prev) => ({ ...prev, cashReceived: e.target.value }))} placeholder="0.00" />
            <FormInput label="Cash Paid Out" type="number" value={newRecon.cashPaid} onChange={(e) => setNewRecon((prev) => ({ ...prev, cashPaid: e.target.value }))} placeholder="0.00" />
            <FormInput label="Actual Balance (Counted)" type="number" required value={newRecon.actualBalance} onChange={(e) => setNewRecon((prev) => ({ ...prev, actualBalance: e.target.value }))} placeholder="0.00" />
            {newRecon.openingBalance && newRecon.cashReceived && newRecon.cashPaid && newRecon.actualBalance && (
              <div className="rounded-xl border border-border bg-muted/50 p-4 space-y-1.5 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Summary</p>
                <div className="flex justify-between"><span className="text-muted-foreground">Expected Balance</span><span className="font-medium">{formatCurrency(Number(newRecon.openingBalance) + Number(newRecon.cashReceived) - Number(newRecon.cashPaid))}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Actual Balance</span><span className="font-medium">{formatCurrency(Number(newRecon.actualBalance))}</span></div>
                <hr className="border-border" />
                <div className="flex justify-between text-base font-bold">
                  <span>Variance</span>
                  <span className={Number(newRecon.actualBalance) === Number(newRecon.openingBalance) + Number(newRecon.cashReceived) - Number(newRecon.cashPaid) ? "text-success" : "text-destructive"}>
                    {formatCurrency(Math.abs(Number(newRecon.actualBalance) - (Number(newRecon.openingBalance) + Number(newRecon.cashReceived) - Number(newRecon.cashPaid))))}
                  </span>
                </div>
              </div>
            )}
            <FormTextarea label="Notes" placeholder="Optional notes..." rows={2} value={newRecon.notes} onChange={(e) => setNewRecon((prev) => ({ ...prev, notes: e.target.value }))} />
            <FormActions>
              <Button variant="outline" onClick={() => setReconModalOpen(false)}>Cancel</Button>
              <Button onClick={handleAddReconciliation}>Save Reconciliation</Button>
            </FormActions>
          </div>
        </BaseModal>

        <ConfirmDialog
          open={!!deleteExpenseId}
          onConfirm={handleDeleteExpense}
          onCancel={() => setDeleteExpenseId(null)}
          title="Delete Expense"
          message="Are you sure you want to delete this expense? This action cannot be undone."
          confirmLabel="Delete"
          variant="danger"
        />

        <BaseModal open={expenseModalOpen} onClose={() => { setExpenseModalOpen(false); setEditingExpense(null) }} title={editingExpense ? "Edit Expense" : "Add New Expense"} size="md">
          <div className="space-y-4">
            <FormInput
              label="Description"
              placeholder="Enter expense description"
              required
              value={newExpense.description}
              onChange={(e) => setNewExpense((prev) => ({ ...prev, description: e.target.value }))}
            />
            <FormSelect
              label="Category"
              required
              value={newExpense.category}
              onChange={(e) => setNewExpense((prev) => ({ ...prev, category: e.target.value as ExpenseCategory }))}
              options={[
                { value: "utilities", label: "Utilities" },
                { value: "supplies", label: "Supplies" },
                { value: "maintenance", label: "Maintenance" },
                { value: "staff", label: "Staff" },
                { value: "marketing", label: "Marketing" },
                { value: "other", label: "Other" },
              ]}
            />
            <FormInput
              label="Amount"
              type="number"
              placeholder="0.00"
              required
              value={newExpense.amount}
              onChange={(e) => setNewExpense((prev) => ({ ...prev, amount: e.target.value }))}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormInput
                label="Vendor / Payee"
                placeholder="Optional vendor name"
                value={newExpense.vendor}
                onChange={(e) => setNewExpense((prev) => ({ ...prev, vendor: e.target.value }))}
              />
              <FormInput
                label="Receipt #"
                placeholder="Optional receipt number"
                value={newExpense.receiptNumber}
                onChange={(e) => setNewExpense((prev) => ({ ...prev, receiptNumber: e.target.value }))}
              />
            </div>
            <FormSelect
              label="Payment Method"
              required
              value={newExpense.paymentMethod}
              onChange={(e) => setNewExpense((prev) => ({ ...prev, paymentMethod: e.target.value as PaymentMethod }))}
              options={[
                { value: "cash", label: "Cash with Change" },
                { value: "reception_qr", label: "Reception QR" },
                { value: "fonepay", label: "FonePay QR" },
                { value: "credit", label: "Credit Payment" },
              ]}
            />
            <FormTextarea
              label="Notes"
              placeholder="Optional notes..."
              rows={2}
              value={newExpense.notes}
              onChange={(e) => setNewExpense((prev) => ({ ...prev, notes: e.target.value }))}
            />              <FormActions>
                <Button variant="outline" onClick={() => { setExpenseModalOpen(false); setEditingExpense(null) }}>Cancel</Button>
                <Button onClick={handleSaveExpense}>{editingExpense ? "Save Changes" : "Add Expense"}</Button>
              </FormActions>
          </div>
        </BaseModal>
      </div>
    </PageTransition>
  )
}
