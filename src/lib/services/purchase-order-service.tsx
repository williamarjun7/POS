/**
 * PurchaseOrderService
 * ─────────────────────
 * DB-backed CRUD for purchase orders.
 *
 * Tables: public.purchase_orders, public.purchase_order_items
 * RLS: authenticated users can SELECT, INSERT, UPDATE
 */

import { useState, useEffect, useCallback } from 'react'
import { insforge } from '@/lib/services/auth-service'
import type { PurchaseOrderRow, PurchaseOrderItemRow } from '@/lib/db/types'
import type { PurchaseOrder } from '@/types'

/* ─── Mapper ──────────────────────────────────────────────── */

interface PoWithItems extends PurchaseOrderRow {
  purchase_order_items?: PurchaseOrderItemRow[]
}

function rowToPurchaseOrder(row: PoWithItems): PurchaseOrder {
  const items = (row.purchase_order_items ?? []).map((item) => ({
    name: item.name,
    quantity: item.quantity,
    unitPrice: item.unit_price,
  }))

  return {
    id: row.id,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    items,
    totalAmount: row.total_amount,
    status: row.status as PurchaseOrder['status'],
    orderDate: row.order_date,
    expectedDelivery: row.expected_delivery ?? '',
  }
}

/* ─── DB operations ───────────────────────────────────────── */

async function fetchPOsFromDb(): Promise<PurchaseOrder[]> {
  const { data, error } = await insforge.database
    .from('purchase_orders')
    .select('*, purchase_order_items(*)')
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map((row: unknown) => rowToPurchaseOrder(row as PoWithItems))
}

async function createPoInDb(data: Omit<PurchaseOrder, 'id'>): Promise<PurchaseOrder> {
  // Insert the PO first
  const { data: inserted, error: poError } = await insforge.database
    .from('purchase_orders')
    .insert([{
      supplier_id: data.supplierId,
      supplier_name: data.supplierName,
      total_amount: data.totalAmount,
      status: data.status,
      order_date: data.orderDate,
      expected_delivery: data.expectedDelivery || null,
    }])
    .select()
    .single()

  if (poError) throw poError
  const po = inserted as PurchaseOrderRow

  // Insert line items
  if (data.items.length > 0) {
    const { error: itemsError } = await insforge.database
      .from('purchase_order_items')
      .insert(
        data.items.map((item) => ({
          po_id: po.id,
          name: item.name,
          quantity: item.quantity,
          unit_price: item.unitPrice,
        }))
      )

    if (itemsError) throw itemsError
  }

  return rowToPurchaseOrder({ ...po, purchase_order_items: data.items.map((item) => ({
    id: '',
    po_id: po.id,
    name: item.name,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    created_at: new Date().toISOString(),
  }))})
}

async function updatePoStatusInDb(id: string, status: PurchaseOrder['status']): Promise<void> {
  const { error } = await insforge.database
    .from('purchase_orders')
    .update({ status })
    .eq('id', id)

  if (error) throw error
}

/* ─── React Hook ──────────────────────────────────────────── */

export interface UsePurchaseOrdersReturn {
  purchaseOrders: PurchaseOrder[]
  isLoading: boolean
  loadError: string | null
  isSaving: boolean
  addPurchaseOrder: (data: Omit<PurchaseOrder, 'id'>) => Promise<PurchaseOrder>
  advanceStatus: (id: string, status: PurchaseOrder['status']) => Promise<void>
  refresh: () => Promise<void>
}

export function usePurchaseOrders(): UsePurchaseOrdersReturn {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const refresh = useCallback(async () => {
    setLoadError(null)
    try {
      const data = await fetchPOsFromDb()
      setPurchaseOrders(data)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load purchase orders')
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      setIsLoading(true)
      try {
        const data = await fetchPOsFromDb()
        if (!cancelled) setPurchaseOrders(data)
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load purchase orders')
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [])

  const addPurchaseOrder = useCallback(async (data: Omit<PurchaseOrder, 'id'>) => {
    setIsSaving(true)
    try {
      const created = await createPoInDb(data)
      setPurchaseOrders(prev => [created, ...prev])
      return created
    } finally {
      setIsSaving(false)
    }
  }, [])

  const advanceStatus = useCallback(async (id: string, status: PurchaseOrder['status']) => {
    setIsSaving(true)
    try {
      await updatePoStatusInDb(id, status)
      setPurchaseOrders(prev =>
        prev.map((po) => (po.id === id ? { ...po, status } : po))
      )
    } finally {
      setIsSaving(false)
    }
  }, [])

  return { purchaseOrders, isLoading, loadError, isSaving, addPurchaseOrder, advanceStatus, refresh }
}
