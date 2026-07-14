/**
 * SupplierService
 * ────────────────
 * DB-backed CRUD for suppliers.
 *
 * Table: public.suppliers
 * RLS: authenticated users can SELECT, INSERT, UPDATE, DELETE
 */

import { useState, useEffect, useCallback } from 'react'
import { insforge } from '@/lib/services/auth-service'
import type { SupplierRow } from '@/lib/db/types'
import type { Supplier } from '@/types'

/* ─── Mapper ──────────────────────────────────────────────── */

function rowToSupplier(row: SupplierRow): Supplier {
  return {
    id: row.id,
    name: row.name,
    contact: row.contact,
    phone: row.phone,
    email: row.email,
    address: row.address,
    totalOrders: row.total_orders,
    outstandingBalance: row.outstanding_balance,
    rating: row.rating,
  }
}

function supplierToRow(data: Omit<Supplier, 'id'>): Record<string, unknown> {
  return {
    name: data.name,
    contact: data.contact,
    phone: data.phone,
    email: data.email,
    address: data.address,
    total_orders: data.totalOrders,
    outstanding_balance: data.outstandingBalance,
    rating: data.rating,
  }
}

/* ─── DB operations ───────────────────────────────────────── */

async function fetchSuppliersFromDb(): Promise<Supplier[]> {
  const { data, error } = await insforge.database
    .from('suppliers')
    .select('*')
    .order('name', { ascending: true })

  if (error) throw error
  return (data ?? []).map((row: unknown) => rowToSupplier(row as SupplierRow))
}

async function createSupplierInDb(data: Omit<Supplier, 'id'>): Promise<Supplier> {
  const { data: inserted, error } = await insforge.database
    .from('suppliers')
    .insert([supplierToRow(data)])
    .select()
    .single()

  if (error) throw error
  return rowToSupplier(inserted as SupplierRow)
}

async function updateSupplierInDb(id: string, data: Partial<Omit<Supplier, 'id'>>): Promise<Supplier> {
  const payload: Record<string, unknown> = {}
  if (data.name !== undefined) payload.name = data.name
  if (data.contact !== undefined) payload.contact = data.contact
  if (data.phone !== undefined) payload.phone = data.phone
  if (data.email !== undefined) payload.email = data.email
  if (data.address !== undefined) payload.address = data.address
  if (data.totalOrders !== undefined) payload.total_orders = data.totalOrders
  if (data.outstandingBalance !== undefined) payload.outstanding_balance = data.outstandingBalance
  if (data.rating !== undefined) payload.rating = data.rating

  const { data: updated, error } = await insforge.database
    .from('suppliers')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return rowToSupplier(updated as SupplierRow)
}

async function deleteSupplierFromDb(id: string): Promise<void> {
  const { error } = await insforge.database
    .from('suppliers')
    .delete()
    .eq('id', id)

  if (error) throw error
}

/* ─── React Hook ──────────────────────────────────────────── */

export interface UseSuppliersReturn {
  suppliers: Supplier[]
  isLoading: boolean
  loadError: string | null
  isSaving: boolean
  addSupplier: (data: Omit<Supplier, 'id'>) => Promise<Supplier>
  editSupplier: (id: string, data: Partial<Omit<Supplier, 'id'>>) => Promise<Supplier>
  removeSupplier: (id: string) => Promise<void>
  refresh: () => Promise<void>
}

export function useSuppliers(): UseSuppliersReturn {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const refresh = useCallback(async () => {
    setLoadError(null)
    try {
      const data = await fetchSuppliersFromDb()
      setSuppliers(data)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load suppliers')
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      setIsLoading(true)
      try {
        const data = await fetchSuppliersFromDb()
        if (!cancelled) setSuppliers(data)
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load suppliers')
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [])

  const addSupplier = useCallback(async (data: Omit<Supplier, 'id'>) => {
    setIsSaving(true)
    try {
      const created = await createSupplierInDb(data)
      setSuppliers(prev => [created, ...prev])
      return created
    } finally {
      setIsSaving(false)
    }
  }, [])

  const editSupplier = useCallback(async (id: string, data: Partial<Omit<Supplier, 'id'>>) => {
    setIsSaving(true)
    try {
      const updated = await updateSupplierInDb(id, data)
      setSuppliers(prev => prev.map(s => (s.id === id ? updated : s)))
      return updated
    } finally {
      setIsSaving(false)
    }
  }, [])

  const removeSupplier = useCallback(async (id: string) => {
    setIsSaving(true)
    try {
      await deleteSupplierFromDb(id)
      setSuppliers(prev => prev.filter(s => s.id !== id))
    } finally {
      setIsSaving(false)
    }
  }, [])

  return { suppliers, isLoading, loadError, isSaving, addSupplier, editSupplier, removeSupplier, refresh }
}
