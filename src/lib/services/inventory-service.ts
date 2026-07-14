/**
 * Inventory Service
 * ─────────────────
 * Dedicated service for inventory CRUD and stock management.
 * Extracted from Inventory.tsx inline helpers for reusability.
 */
import { db } from '@/lib/db/insforge'
import type { InventoryItemRow, StockMovementRow } from '@/lib/db/types'
import type { InventoryItem } from '@/types'

// ─── Mapping ──────────────────────────────────────────────

function rowToInventoryItem(row: InventoryItemRow): InventoryItem {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    currentStock: Number(row.current_stock),
    minStock: Number(row.min_stock),
    unit: row.unit,
    costPerUnit: Number(row.cost_per_unit),
    lastRestocked: row.last_restocked ?? new Date().toISOString().split('T')[0],
    supplier: '',
  }
}

function itemToRow(data: Partial<InventoryItem | Record<string, unknown>>): Record<string, unknown> {
  const r: Record<string, unknown> = {}
  if ('name' in data && data.name !== undefined) r.name = data.name
  if ('category' in data && data.category !== undefined) r.category = data.category
  if ('currentStock' in data && data.currentStock !== undefined) r.current_stock = data.currentStock
  if ('minStock' in data && data.minStock !== undefined) r.min_stock = data.minStock
  if ('unit' in data && data.unit !== undefined) r.unit = data.unit
  if ('costPerUnit' in data && data.costPerUnit !== undefined) r.cost_per_unit = data.costPerUnit
  if ('current_stock' in data && data.current_stock !== undefined) r.current_stock = data.current_stock
  if ('min_stock' in data && data.min_stock !== undefined) r.min_stock = data.min_stock
  if ('cost_per_unit' in data && data.cost_per_unit !== undefined) r.cost_per_unit = data.cost_per_unit
  return r
}

// ─── CRUD ─────────────────────────────────────────────────

export async function fetchInventory(): Promise<InventoryItem[]> {
  const { data, error } = await db.findMany<InventoryItemRow>('inventory_items', { is_active: true } as any)
  if (error) throw error
  return (data ?? []).map(rowToInventoryItem)
}

export async function fetchStockHistory(itemId?: string): Promise<StockMovementRow[]> {
  const filter = itemId ? { item_id: itemId } as any : undefined
  const { data, error } = await db.findMany<StockMovementRow>('stock_movements', filter, { orderBy: 'created_at', orderDir: 'desc' })
  if (error) throw error
  return data ?? []
}

export async function createInventoryItem(data: Omit<InventoryItem, 'id'>): Promise<InventoryItem> {
  const { data: created, error } = await db.insertOne<InventoryItemRow>('inventory_items', {
    name: data.name,
    category: data.category,
    current_stock: data.currentStock,
    min_stock: data.minStock,
    unit: data.unit,
    cost_per_unit: data.costPerUnit,
    is_active: true,
    last_restocked: new Date().toISOString(),
  })
  if (error) throw error
  if (!created) throw new Error('Failed to create inventory item')

  // Log initial stock movement
  await db.insertOne('stock_movements', {
    item_id: created.id,
    type: 'create',
    quantity: data.currentStock,
    previous_stock: 0,
    new_stock: data.currentStock,
    notes: `Initial stock: ${data.currentStock} ${data.unit}`,
  })

  return rowToInventoryItem(created)
}

export async function updateInventoryItem(id: string, data: Partial<Omit<InventoryItem, 'id'>>): Promise<InventoryItem> {
  const { data: updated, error } = await db.update<InventoryItemRow>('inventory_items', itemToRow(data), { id })
  if (error) throw error
  if (!updated || updated.length === 0) throw new Error('Failed to update inventory item')
  return rowToInventoryItem(updated[0])
}

export async function deleteInventoryItem(id: string): Promise<void> {
  const { error } = await db.update('inventory_items', { is_active: false }, { id })
  if (error) throw error
}

// ─── Stock Adjustment ─────────────────────────────────────

export async function adjustStock(itemId: string, qty: number, notes: string): Promise<void> {
  const { data: current } = await db.findById<InventoryItemRow>('inventory_items', itemId)
  if (!current) throw new Error('Item not found')

  const prevStock = Number(current.current_stock)
  const newStock = Math.max(0, prevStock + qty)

  await db.update('inventory_items', {
    current_stock: newStock,
    last_restocked: qty > 0 ? new Date().toISOString() : current.last_restocked,
  }, { id: itemId })

  await db.insertOne('stock_movements', {
    item_id: itemId,
    type: qty > 0 ? 'add' : 'remove',
    quantity: Math.abs(qty),
    previous_stock: prevStock,
    new_stock: newStock,
    notes: notes || (qty > 0 ? 'Stock added' : 'Stock removed'),
  })
}

/**
 * Deduct stock for sold items by matching menu item names to inventory item names.
 * Non-critical — failures are logged but not thrown so they never block the sale.
 */
export async function deductStockForSoldItems(
  soldItems: Array<{ name: string; quantity: number }>
): Promise<void> {
  try {
    // Fetch all inventory items (cache-friendly for repeated calls)
    const { data: inventory } = await db.findMany<InventoryItemRow>('inventory_items', { is_active: true } as any)
    if (!inventory || inventory.length === 0) return

    for (const sold of soldItems) {
      // Find matching inventory item by name (case-insensitive partial match)
      const match = inventory.find(
        (inv) => inv.name.toLowerCase() === sold.name.toLowerCase()
          || inv.name.toLowerCase().includes(sold.name.toLowerCase())
          || sold.name.toLowerCase().includes(inv.name.toLowerCase())
      )

      if (!match) {
        console.warn(`No inventory match found for: ${sold.name}`)
        continue
      }

      const prevStock = Number(match.current_stock)
      const deduction = Math.min(Math.abs(sold.quantity), prevStock)
      const newStock = Math.max(0, prevStock - deduction)

      await db.update('inventory_items', { current_stock: newStock }, { id: match.id })

      await db.insertOne('stock_movements', {
        item_id: match.id,
        type: 'remove',
        quantity: deduction,
        previous_stock: prevStock,
        new_stock: newStock,
        notes: `Auto-deducted from POS sale: ${sold.quantity}× ${sold.name}`,
      })
    }
  } catch (err) {
    // Non-critical — never block the sale
    console.error('Stock deduction failed (non-critical):', err)
  }
}

// ─── Stock Status Helpers ─────────────────────────────────

export function getStockStatus(item: InventoryItem): { label: string; variant: 'success' | 'warning' | 'destructive' } {
  if (item.currentStock === 0) return { label: 'Out of Stock', variant: 'destructive' }
  if (item.currentStock <= item.minStock) return { label: 'Low Stock', variant: 'warning' }
  return { label: 'In Stock', variant: 'success' }
}

export function sortItems(items: InventoryItem[], sortKey: string): InventoryItem[] {
  const [field, direction] = sortKey.split('-') as [string, 'asc' | 'desc']
  const sorted = [...items]
  sorted.sort((a, b) => {
    let cmp = 0
    switch (field) {
      case 'name': cmp = a.name.localeCompare(b.name); break
      case 'stock': cmp = a.currentStock - b.currentStock; break
      case 'cost': cmp = a.costPerUnit - b.costPerUnit; break
      case 'restocked': cmp = new Date(a.lastRestocked).getTime() - new Date(b.lastRestocked).getTime(); break
      default: cmp = 0
    }
    return direction === 'desc' ? -cmp : cmp
  })
  return sorted
}
