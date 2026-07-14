import { useState, useMemo, useEffect } from "react"
import { motion } from "framer-motion"
import { PageTransition } from "@/components/ui/PageTransition"
import { PageHeader } from "@/components/PageHeader"
import { StatusBadge } from "@/components/StatusBadge"
import { Tabs } from "@/components/Tabs"
import { DataTable, type Column } from "@/components/DataTable"
import { StatCard } from "@/components/ui/stat-card"
import { BaseModal } from "@/components/ui/modal"
import { FormInput, FormSelect, FormActions } from "@/components/ui/form-field"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/EmptyState"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { Icon } from "@/components/icon-mapper"
import { cn, formatCurrency } from "@/lib/utils"
import { showSuccess, showError } from "@/components/ui/toast"
import { logActivitySafe } from '@/lib/services/activity-log-service'
// StockMovementRow type used via fetchStockHistoryService
import { exportCsv } from "@/lib/services/csv-export"
import {
  fetchInventory as fetchInventoryService,
  fetchStockHistory as fetchStockHistoryService,
  createInventoryItem as createInventoryItemService,
  updateInventoryItem as updateInventoryItemService,
  deleteInventoryItem as deleteInventoryItemService,
  adjustStock as adjustStockService,
  getStockStatus,
  sortItems as sortItemsService,
} from "@/lib/services/inventory-service"
import { Plus, Edit, Trash2, PlusCircle, MinusCircle, Package, Search, ArrowUpDown, AlertTriangle, Clock, Download, History } from "lucide-react"
import type { InventoryItem } from "@/types"
import { pageTransitionFast, staggerContainerFast, pulseIndicator } from "@/lib/animations/presets"

// ── Constants ──────────────────────────────────────────────────────────────

const CATEGORIES = [
  "Coffee & Tea",
  "Dairy",
  "Baking & Staples",
  "Meat & Protein",
  "Vegetables",
  "Hookah Supplies",
  "Cleaning Supplies",
  "Beverages",
  "Desserts",
] as const

const categoryOptions = CATEGORIES.map((c) => ({ value: c, label: c }))

const SORT_OPTIONS = [
  { value: "name-asc", label: "Name (A-Z)" },
  { value: "name-desc", label: "Name (Z-A)" },
  { value: "stock-asc", label: "Stock (Low to High)" },
  { value: "stock-desc", label: "Stock (High to Low)" },
  { value: "cost-asc", label: "Cost (Low to High)" },
  { value: "cost-desc", label: "Cost (High to Low)" },
  { value: "restocked-desc", label: "Recently Restocked" },
  { value: "restocked-asc", label: "Oldest Restocked" },
] as const

interface StockHistoryEntry {
  id: string
  itemId: string
  itemName: string
  type: "add" | "remove" | "create" | "update"
  quantity: number
  previousStock: number
  newStock: number
  timestamp: string
  user: string
  notes?: string
}

// ─── DB helpers (delegated to inventory-service) ──────────

async function fetchStockHistory(itemId?: string): Promise<StockHistoryEntry[]> {
  const rows = await fetchStockHistoryService(itemId)
  return (rows ?? []).map(row => ({
    id: row.id,
    itemId: row.item_id,
    itemName: '',  // Filled in by caller if needed
    type: row.type as StockHistoryEntry['type'],
    quantity: Number(row.quantity),
    previousStock: Number(row.previous_stock),
    newStock: Number(row.new_stock),
    timestamp: row.created_at.split('.')[0].replace('T', ' '),
    user: row.user_id ?? 'System',
    notes: row.notes ?? undefined,
  }))
}

// ── Helpers ────────────────────────────────────────────────────────────────

// Using pageTransitionFast, staggerContainerFast from presets

// ── Stock Level Bar ────────────────────────────────────────────────────────

function StockBar({ current, min }: { current: number; min: number }) {
  const ratio = min > 0 ? Math.min(current / (min * 2), 1) : current > 0 ? 1 : 0
  const color = current === 0 ? "bg-destructive" : current <= min ? "bg-warning" : "bg-success"
  const glowColor = current === 0 ? "shadow-red-500/30" : current <= min ? "shadow-amber-500/30" : "shadow-green-500/30"
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 text-right text-sm font-medium tabular-nums">{current}</span>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <motion.div 
          className={cn("h-full rounded-full shadow-sm", color, glowColor)} 
          initial={{ width: 0 }}
          animate={{ width: `${ratio * 100}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>
    </div>
  )
}

// ── Category Badge ─────────────────────────────────────────────────────────

function CategoryBadge({ category }: { category: string }) {
  const colors: Record<string, string> = {
    "Coffee & Tea": "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    "Dairy": "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400",
    "Baking & Staples": "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
    "Meat & Protein": "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    "Vegetables": "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    "Hookah Supplies": "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
    "Cleaning Supplies": "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400",
    "Beverages": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    "Desserts": "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400",
  }
  return (
    <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium", colors[category] ?? "bg-muted text-muted-foreground")}>
      {category}
    </span>
  )
}

// ── Low Stock Alert Panel ──────────────────────────────────────────────────

function LowStockAlert({ items }: { items: InventoryItem[] }) {
  const lowStockItems = items.filter((i) => i.currentStock > 0 && i.currentStock <= i.minStock)
  const outOfStockItems = items.filter((i) => i.currentStock === 0)

  if (lowStockItems.length === 0 && outOfStockItems.length === 0) return null

  return (
    <motion.div variants={pageTransitionFast}>
      <motion.div 
        className="rounded-xl border border-amber-200 dark:border-amber-900/30 bg-amber-50/50 dark:bg-amber-950/10 p-4 backdrop-blur-sm"
        animate={{ borderColor: ['rgba(245,158,11,0.3)', 'rgba(245,158,11,0.7)', 'rgba(245,158,11,0.3)'] }}
        transition={{ duration: 3, repeat: Infinity }}
      >
        <div className="flex items-center gap-2 mb-3">
          <motion.div
            animate={{ rotate: [0, -10, 10, 0] }}
            transition={{ duration: 1, repeat: Infinity }}
          >
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </motion.div>
          <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-400">Stock Alerts</h3>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {outOfStockItems.map((item) => (
            <motion.div 
              key={item.id} 
              className="flex items-center justify-between rounded-lg bg-white/80 dark:bg-background/80 px-3 py-2 border border-red-200 dark:border-red-900/30"
              whileHover={{ scale: 1.02 }}
            >
              <div className="flex items-center gap-2">
                <motion.span 
                  className="h-2 w-2 rounded-full bg-red-500"
                  animate={{ scale: [1, 1.3, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                />
                <span className="text-sm font-medium text-foreground">{item.name}</span>
              </div>
              <span className="text-xs font-medium text-red-600">Out of Stock</span>
            </motion.div>
          ))}
          {lowStockItems.map((item) => (
            <motion.div 
              key={item.id} 
              className="flex items-center justify-between rounded-lg bg-white/80 dark:bg-background/80 px-3 py-2 border border-amber-200 dark:border-amber-900/30"
              whileHover={{ scale: 1.02 }}
            >
              <div className="flex items-center gap-2">
                <motion.span 
                  className="h-2 w-2 rounded-full bg-amber-500"
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
                <span className="text-sm font-medium text-foreground">{item.name}</span>
              </div>
              <span className="text-xs font-medium text-amber-600">{item.currentStock} {item.unit} left</span>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Stock History Panel ────────────────────────────────────────────────────

function StockHistoryPanel({ history }: { history: StockHistoryEntry[] }) {
  return (
    <div className="space-y-3">
      {history.length === 0 ? (
        <EmptyState icon="History" title="No history yet" description="Stock changes will appear here" />
      ) : (
        history.map((entry) => (
          <div key={entry.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
            <div className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
              entry.type === "add" ? "bg-success/10 text-success" : entry.type === "remove" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
            )}>
              {entry.type === "add" ? <PlusCircle className="h-4 w-4" /> : entry.type === "remove" ? <MinusCircle className="h-4 w-4" /> : <Package className="h-4 w-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground truncate">{entry.itemName}</p>
                <span className={cn("text-xs font-medium", entry.type === "add" ? "text-success" : "text-destructive")}>
                  {entry.type === "add" ? "+" : "-"}{entry.quantity}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {entry.previousStock} → {entry.newStock} · {entry.user} · {entry.timestamp}
              </p>
              {entry.notes && <p className="text-xs text-muted-foreground italic mt-0.5">{entry.notes}</p>}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

// ── Item Form Modal ────────────────────────────────────────────────────────

function ItemFormModal({
  open,
  item,
  onSave,
  onClose,
}: {
  open: boolean
  item?: Partial<InventoryItem> | null
  onSave: (data: InventoryItem) => void
  onClose: () => void
}) {
  const [name, setName] = useState(item?.name ?? "")
  const [category, setCategory] = useState(item?.category ?? CATEGORIES[0])
  const [currentStock, setCurrentStock] = useState(String(item?.currentStock ?? ""))
  const [minStock, setMinStock] = useState(String(item?.minStock ?? ""))
  const [unit, setUnit] = useState(item?.unit ?? "kg")
  const [costPerUnit, setCostPerUnit] = useState(String(item?.costPerUnit ?? ""))
  const [supplier, setSupplier] = useState(item?.supplier ?? "")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { showError("Item name is required"); return }
    onSave({
      id: item?.id ?? `i${Date.now()}`,
      name: name.trim(),
      category,
      currentStock: Number(currentStock) || 0,
      minStock: Number(minStock) || 0,
      unit: unit.trim() || "kg",
      costPerUnit: Number(costPerUnit) || 0,
      lastRestocked: item?.lastRestocked ?? new Date().toISOString().split("T")[0],
      supplier: supplier.trim(),
    })
    onClose()
  }

  return (
    <BaseModal open={open} onClose={onClose} title={item?.id ? "Edit Item" : "Add New Item"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormInput label="Item Name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Coffee Beans" />
        <FormSelect label="Category" value={category} onChange={(e) => setCategory(e.target.value)} options={categoryOptions} />
        <div className="grid grid-cols-2 gap-4">
          <FormInput label="Current Stock" type="number" min={0} value={currentStock} onChange={(e) => setCurrentStock(e.target.value)} placeholder="0" />
          <FormInput label="Min Stock" type="number" min={0} value={minStock} onChange={(e) => setMinStock(e.target.value)} placeholder="0" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormInput label="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="kg, liters, pieces" />
          <FormInput label="Cost per Unit (Rs.)" type="number" min={0} value={costPerUnit} onChange={(e) => setCostPerUnit(e.target.value)} placeholder="0" />
        </div>
        <FormInput label="Supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="e.g. Himalayan Coffee Co." />
        <FormActions>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit">{item?.id ? "Update Item" : "Add Item"}</Button>
        </FormActions>
      </form>
    </BaseModal>
  )
}

// ── Adjust Stock Modal ─────────────────────────────────────────────────────

function AdjustStockModal({
  open,
  item,
  onSave,
  onClose,
}: {
  open: boolean
  item: InventoryItem | null
  onSave: (id: string, qty: number, notes: string) => void
  onClose: () => void
}) {
  const [qty, setQty] = useState("1")
  const [mode, setMode] = useState<"add" | "remove">("add")
  const [notes, setNotes] = useState("")

  if (!item) return null

  const predictedStock = mode === "add" ? item.currentStock + Number(qty || 0) : Math.max(0, item.currentStock - Number(qty || 0))

  const handleSubmit = () => {
    const quantity = Number(qty)
    if (!quantity || quantity <= 0) { showError("Enter a valid quantity"); return }
    onSave(item.id, mode === "add" ? quantity : -quantity, notes)
    onClose()
  }

  return (
    <BaseModal open={open} onClose={onClose} title={`Adjust Stock: ${item.name}`} size="sm">
      <div className="space-y-4">
        <div className="rounded-lg bg-muted/50 p-3">
          <p className="text-sm text-muted-foreground">Current Stock</p>
          <p className="text-xl font-bold text-foreground">
            {item.currentStock} <span className="text-sm font-normal text-muted-foreground">{item.unit}</span>
          </p>
        </div>

        <div className="flex gap-2">
          <button type="button" onClick={() => setMode("add")}
            className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-medium transition-all", mode === "add" ? "bg-success text-white shadow-sm" : "bg-muted text-muted-foreground hover:bg-muted/80")}>
            <PlusCircle className="h-4 w-4" /> Add Stock
          </button>
          <button type="button" onClick={() => setMode("remove")}
            className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-medium transition-all", mode === "remove" ? "bg-destructive text-white shadow-sm" : "bg-muted text-muted-foreground hover:bg-muted/80")}>
            <MinusCircle className="h-4 w-4" /> Remove Stock
          </button>
        </div>

        <FormInput label="Quantity" type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Enter quantity" />

        <div className="rounded-lg bg-muted/50 p-3">
          <p className="text-xs text-muted-foreground">After adjustment</p>
          <p className={cn("text-lg font-bold", predictedStock === 0 ? "text-destructive" : predictedStock <= item.minStock ? "text-warning" : "text-success")}>
            {predictedStock} {item.unit}
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Notes (optional)</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Reason for adjustment..."
            className="h-16 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary" />
        </div>

        <div className="flex gap-3 pt-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" onClick={handleSubmit}>Update Stock</Button>
        </div>
      </div>
    </BaseModal>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────

export function Inventory() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [history, setHistory] = useState<StockHistoryEntry[]>([])
  const [_loading, setLoading] = useState(true)
  const [_loadError, setLoadError] = useState<string | null>(null)

  // Load from DB on mount
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    Promise.all([
      fetchInventoryService().catch(e => { if (!cancelled) setLoadError(e.message); return [] }),
      fetchStockHistory().catch(() => []),
    ]).then(([inv, hist]) => {
      if (!cancelled) {
        setItems(inv)
        setHistory(hist)
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [])
  const [activeTab, setActiveTab] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [sortKey, setSortKey] = useState("restocked-desc")
  const [showForm, setShowForm] = useState(false)
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)
  const [adjustingItem, setAdjustingItem] = useState<InventoryItem | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<InventoryItem | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  const stats = useMemo(() => {
    const totalItems = items.length
    const lowStock = items.filter((i) => i.currentStock > 0 && i.currentStock <= i.minStock).length
    const outOfStock = items.filter((i) => i.currentStock === 0).length
    const totalValue = items.reduce((sum, i) => sum + i.currentStock * i.costPerUnit, 0)
    return { totalItems, lowStock, outOfStock, totalValue }
  }, [items])

  const tabs = [
    { id: "all", label: "All Items", count: items.length },
    { id: "low", label: "Low Stock", count: stats.lowStock },
    { id: "out", label: "Out of Stock", count: stats.outOfStock },
    { id: "recent", label: "Recently Updated" },
  ]

  const filteredItems = useMemo(() => {
    let result = [...items]
    switch (activeTab) {
      case "low": result = result.filter((i) => i.currentStock > 0 && i.currentStock <= i.minStock); break
      case "out": result = result.filter((i) => i.currentStock === 0); break
      case "recent": result = [...result].sort((a, b) => new Date(b.lastRestocked).getTime() - new Date(a.lastRestocked).getTime()); break
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((i) => i.name.toLowerCase().includes(q) || i.supplier.toLowerCase().includes(q))
    }
    if (categoryFilter !== "all") result = result.filter((i) => i.category === categoryFilter)
    if (activeTab !== "recent") result = sortItemsService(result, sortKey)
    return result
  }, [activeTab, items, searchQuery, categoryFilter, sortKey])

  const handleSave = async (data: InventoryItem) => {
    try {
      if (items.some((i) => i.id === data.id)) {
        const updated = await updateInventoryItemService(data.id, {
          name: data.name,
          category: data.category,
          currentStock: data.currentStock,
          minStock: data.minStock,
          unit: data.unit,
          costPerUnit: data.costPerUnit,
        })
        setItems((prev) => prev.map((i) => (i.id === data.id ? updated : i)))
        showSuccess("Item updated successfully")
      } else {
        const created = await createInventoryItemService({
          name: data.name,
          category: data.category,
          currentStock: data.currentStock,
          minStock: data.minStock,
          unit: data.unit,
          costPerUnit: data.costPerUnit,
          lastRestocked: null as any,
          supplier: '',
        })
        setItems((prev) => [created, ...prev])
        // Add initial stock to history
        setHistory(prev => [{
          id: `h${Date.now()}`,
          itemId: created.id,
          itemName: created.name,
          type: "create",
          quantity: created.currentStock,
          previousStock: 0,
          newStock: created.currentStock,
          timestamp: new Date().toISOString().slice(0, 16).replace("T", " "),
          user: "Admin",
        }, ...prev])
        showSuccess("Item added successfully")
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save item')
    }
  }

  const handleAdjustStock = async (id: string, qty: number, notes: string) => {
    try {
      const item = items.find((i) => i.id === id)
      if (!item) return

      const prevStock = item.currentStock
      const newStock = Math.max(0, prevStock + qty)

      await adjustStockService(id, qty, notes)

      setItems((prev) =>
        prev.map((i) =>
          i.id === id ? {
            ...i,
            currentStock: newStock,
            lastRestocked: qty > 0 ? new Date().toISOString().split("T")[0] : i.lastRestocked,
          } : i
        )
      )

      setHistory((prev) => [{
        id: `h${Date.now()}`,
        itemId: id,
        itemName: item.name,
        type: qty > 0 ? "add" : "remove",
        quantity: Math.abs(qty),
        previousStock: prevStock,
        newStock,
        timestamp: new Date().toISOString().slice(0, 16).replace("T", " "),
        user: "Admin",
        notes,
      }, ...prev])

      // Log stock adjustment activity (non-critical)
      logActivitySafe({
        activityType: 'stock_adjustment',
        entityId: id,
        entityLabel: `Inventory: ${item.name}`,
        status: qty > 0 ? 'added' : 'removed',
        amount: Math.abs(qty),
        details: `${qty > 0 ? 'Added' : 'Removed'} ${Math.abs(qty)} ${item.unit} of ${item.name}. Previous: ${prevStock}, New: ${newStock}${notes ? ` — ${notes}` : ''}`,
      })

      showSuccess(`Stock ${qty > 0 ? "increased" : "decreased"} by ${Math.abs(qty)}`)
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to adjust stock')
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    try {
      await deleteInventoryItemService(deleteConfirm.id)
      setItems((prev) => prev.filter((i) => i.id !== deleteConfirm.id))
      showSuccess("Item deleted successfully")
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to delete item')
    }
    setDeleteConfirm(null)
  }

  const openEditModal = (item: InventoryItem) => { setEditingItem(item); setShowForm(true) }
  const openAddModal = () => { setEditingItem(null); setShowForm(true) }
  const closeFormModal = () => { setShowForm(false); setEditingItem(null) }

  const exportInventory = () => {
    const rows = items.map((i) => ({
      name: i.name,
      category: i.category,
      stock: i.currentStock,
      minStock: i.minStock,
      unit: i.unit,
      costPerUnit: i.costPerUnit,
      totalValue: i.currentStock * i.costPerUnit,
      supplier: i.supplier,
      lastRestocked: i.lastRestocked,
      status: getStockStatus(i).label,
    }))
    exportCsv(
      rows,
      [
        { label: 'Name', value: (r: any) => r.name },
        { label: 'Category', value: (r: any) => r.category },
        { label: 'Stock', value: (r: any) => r.stock },
        { label: 'Min Stock', value: (r: any) => r.minStock },
        { label: 'Unit', value: (r: any) => r.unit },
        { label: 'Cost/Unit', value: (r: any) => r.costPerUnit },
        { label: 'Total Value', value: (r: any) => r.totalValue },
        { label: 'Supplier', value: (r: any) => r.supplier },
        { label: 'Last Restocked', value: (r: any) => r.lastRestocked },
        { label: 'Status', value: (r: any) => r.status },
      ],
      `inventory-${new Date().toISOString().split("T")[0]}`
    )
    showSuccess("Inventory exported successfully")
  }

  const columns: Column<InventoryItem>[] = [
    { key: "name", header: "Item Name", render: (row) => (
      <div className="flex items-center gap-2">
        <Icon name="Package" className="h-4 w-4 text-muted-foreground" />
        <span className="font-semibold text-foreground">{row.name}</span>
      </div>
    )},
    { key: "category", header: "Category", render: (row) => <CategoryBadge category={row.category} /> },
    { key: "currentStock", header: "Stock", render: (row) => <StockBar current={row.currentStock} min={row.minStock} /> },
    { key: "minStock", header: "Min", render: (row) => <span className="text-sm text-muted-foreground">{row.minStock} {row.unit}</span> },
    { key: "unit", header: "Unit", render: (row) => <span className="text-sm text-muted-foreground capitalize">{row.unit}</span> },
    { key: "costPerUnit", header: "Cost/Unit", render: (row) => <span className="font-medium tabular-nums">{formatCurrency(row.costPerUnit)}</span> },
    { key: "totalValue", header: "Total Value", render: (row) => <span className="font-semibold tabular-nums">{formatCurrency(row.currentStock * row.costPerUnit)}</span> },
    { key: "lastRestocked", header: "Restocked", render: (row) => (
      <span className="text-sm text-muted-foreground">{new Date(row.lastRestocked).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
    )},
    { key: "status", header: "Status", render: (row) => { const s = getStockStatus(row); return <StatusBadge label={s.label} variant={s.variant} /> } },
    { key: "actions", header: "", className: "w-28", render: (row) => (
      <div className="flex gap-1">
        <button onClick={() => setAdjustingItem(row)} className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" title="Adjust Stock">
          {row.currentStock > 0 ? <MinusCircle className="h-4 w-4" /> : <PlusCircle className="h-4 w-4" />}
        </button>
        <button onClick={() => openEditModal(row)} className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" title="Edit Item">
          <Edit className="h-4 w-4" />
        </button>
        <button onClick={() => setDeleteConfirm(row)} className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive" title="Delete Item">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    )},
  ]

  return (
    <PageTransition className="space-y-6">
      <PageHeader
        title="Inventory"
        icon="Package"
        description="Track stock levels, manage supplies, and monitor inventory value"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportInventory}>
              <Download className="h-4 w-4 mr-1.5" /> Export
            </Button>
            <Button size="sm" onClick={openAddModal}>
              <Plus className="h-4 w-4" /> Add Item
            </Button>
          </div>
        }
      />

      <LowStockAlert items={items} />

      <motion.div 
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        initial="hidden"
        animate="visible"
        variants={staggerContainerFast}
      >
        <motion.div variants={pageTransitionFast} whileHover={{ y: -3, scale: 1.02 }} className="backdrop-blur-sm">
          <StatCard label="Total Items" value={stats.totalItems} icon="Package" color="text-primary" index={0} />
        </motion.div>
        <motion.div variants={pageTransitionFast} whileHover={{ y: -3, scale: 1.02 }} className="backdrop-blur-sm">
          <StatCard label="Low Stock" value={stats.lowStock} icon="AlertTriangle" color="text-warning" index={1} />
        </motion.div>
        <motion.div variants={pageTransitionFast} whileHover={{ y: -3, scale: 1.02 }} className="backdrop-blur-sm">
          <StatCard label="Out of Stock" value={stats.outOfStock} icon="PackageX" color="text-destructive" index={2} />
        </motion.div>
        <motion.div variants={pageTransitionFast} whileHover={{ y: -3, scale: 1.02 }} className="backdrop-blur-sm">
          <StatCard label="Total Value" value={formatCurrency(stats.totalValue)} icon="CircleDollarSign" color="text-success" index={3} />
        </motion.div>
      </motion.div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      <motion.div 
        className="rounded-xl border border-border bg-card/70 backdrop-blur-sm p-5 shadow-sm"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search items or suppliers..."
              className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-4 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary" />
          </div>
          <div className="flex gap-2">
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary">
              <option value="all">All Categories</option>
              {categoryOptions.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <div className="relative">
              <ArrowUpDown className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <select value={sortKey} onChange={(e) => setSortKey(e.target.value)}
                className="h-10 rounded-lg border border-border bg-background pl-9 pr-8 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary">
                {SORT_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <button onClick={() => setShowHistory(!showHistory)}
              className={cn("h-10 rounded-lg px-3 text-sm font-medium transition-colors flex items-center gap-1.5", showHistory ? "bg-primary text-primary-foreground" : "border border-border bg-background text-muted-foreground hover:text-foreground")}>
              <History className="h-4 w-4" />
              History
            </button>
          </div>
        </div>

        <div className="mt-4">
          {filteredItems.length === 0 ? (
            <EmptyState icon="Package" title="No items found" description="Try adjusting your search or filters, or add a new inventory item." />
          ) : (
            <DataTable columns={columns} data={filteredItems} pageSize={12} />
          )}
        </div>
      </motion.div>

      {showHistory && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
          <div className="rounded-xl border border-border bg-card/70 backdrop-blur-sm p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
              >
                <Clock className="h-4 w-4 text-muted-foreground" />
              </motion.div>
              <h3 className="text-sm font-semibold text-foreground">Stock History</h3>
              <span className="text-xs text-muted-foreground">({history.length} entries)</span>
            </div>
            <StockHistoryPanel history={history} />
          </div>
        </motion.div>
      )}

      <ItemFormModal open={showForm} item={editingItem} onSave={handleSave} onClose={closeFormModal} />
      <AdjustStockModal open={!!adjustingItem} item={adjustingItem} onSave={handleAdjustStock} onClose={() => setAdjustingItem(null)} />
      <ConfirmDialog open={!!deleteConfirm} title="Delete Inventory Item" message={`Are you sure you want to delete "${deleteConfirm?.name}"? This action cannot be undone.`} confirmLabel="Delete" variant="danger" onConfirm={handleDelete} onCancel={() => setDeleteConfirm(null)} />
    </PageTransition>
  )
}
