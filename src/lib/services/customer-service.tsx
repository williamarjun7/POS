/**
 * CustomerService
 * ─────────────────
 * DB-backed CRUD for customers.
 *
 * Table: public.customers
 * RLS: authenticated users can SELECT, INSERT, UPDATE, DELETE
 */

import { useState, useEffect, useCallback } from 'react'
import { insforge } from '@/lib/services/auth-service'
import type { CustomerRow } from '@/lib/db/types'

/* ─── Frontend Customer type (camelCase) ─────────────────── */

export interface Customer {
  id: string
  name: string
  phone: string
  email: string
  address?: string
  totalOrders: number
  totalSpent: number
  lastVisit: string
  loyaltyPoints: number
  creditBalance: number
  notes?: string
}

/* ─── Mapper ──────────────────────────────────────────────── */

function rowToCustomer(row: CustomerRow): Customer {
  return {
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
  }
}

function customerToRow(data: Omit<Customer, 'id'>): Record<string, unknown> {
  return {
    name: data.name,
    phone: data.phone,
    email: data.email,
    address: data.address ?? '',
    total_orders: data.totalOrders,
    total_spent: data.totalSpent,
    last_visit: data.lastVisit,
    loyalty_points: data.loyaltyPoints,
    credit_balance: data.creditBalance,
    notes: data.notes ?? null,
  }
}

/* ─── DB operations ───────────────────────────────────────── */

async function fetchCustomersFromDb(): Promise<Customer[]> {
  const { data, error } = await insforge.database
    .from('customers')
    .select('*')
    .order('name', { ascending: true })

  if (error) throw error
  return (data ?? []).map((row: unknown) => rowToCustomer(row as CustomerRow))
}

async function createCustomerInDb(data: Omit<Customer, 'id'>): Promise<Customer> {
  const { data: inserted, error } = await insforge.database
    .from('customers')
    .insert([customerToRow(data)])
    .select()
    .single()

  if (error) throw error
  return rowToCustomer(inserted as CustomerRow)
}

async function updateCustomerInDb(id: string, data: Partial<Omit<Customer, 'id'>>): Promise<Customer> {
  const payload: Record<string, unknown> = {}
  if (data.name !== undefined) payload.name = data.name
  if (data.phone !== undefined) payload.phone = data.phone
  if (data.email !== undefined) payload.email = data.email
  if (data.address !== undefined) payload.address = data.address
  if (data.totalOrders !== undefined) payload.total_orders = data.totalOrders
  if (data.totalSpent !== undefined) payload.total_spent = data.totalSpent
  if (data.lastVisit !== undefined) payload.last_visit = data.lastVisit
  if (data.loyaltyPoints !== undefined) payload.loyalty_points = data.loyaltyPoints
  if (data.creditBalance !== undefined) payload.credit_balance = data.creditBalance
  if (data.notes !== undefined) payload.notes = data.notes ?? null

  const { data: updated, error } = await insforge.database
    .from('customers')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return rowToCustomer(updated as CustomerRow)
}

async function deleteCustomerFromDb(id: string): Promise<void> {
  const { error } = await insforge.database
    .from('customers')
    .delete()
    .eq('id', id)

  if (error) throw error
}

/* ─── React Hook ──────────────────────────────────────────── */

export interface UseCustomersReturn {
  customers: Customer[]
  isLoading: boolean
  loadError: string | null
  isSaving: boolean
  addCustomer: (data: Omit<Customer, 'id'>) => Promise<Customer>
  editCustomer: (id: string, data: Partial<Omit<Customer, 'id'>>) => Promise<Customer>
  removeCustomer: (id: string) => Promise<void>
  refresh: () => Promise<void>
}

export function useCustomers(): UseCustomersReturn {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const refresh = useCallback(async () => {
    setLoadError(null)
    try {
      const data = await fetchCustomersFromDb()
      setCustomers(data)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load customers')
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      setIsLoading(true)
      try {
        const data = await fetchCustomersFromDb()
        if (!cancelled) setCustomers(data)
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load customers')
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [])

  const addCustomer = useCallback(async (data: Omit<Customer, 'id'>) => {
    setIsSaving(true)
    try {
      const created = await createCustomerInDb(data)
      setCustomers(prev => [created, ...prev])
      return created
    } finally {
      setIsSaving(false)
    }
  }, [])

  const editCustomer = useCallback(async (id: string, data: Partial<Omit<Customer, 'id'>>) => {
    setIsSaving(true)
    try {
      const updated = await updateCustomerInDb(id, data)
      setCustomers(prev => prev.map(c => (c.id === id ? updated : c)))
      return updated
    } finally {
      setIsSaving(false)
    }
  }, [])

  const removeCustomer = useCallback(async (id: string) => {
    setIsSaving(true)
    try {
      await deleteCustomerFromDb(id)
      setCustomers(prev => prev.filter(c => c.id !== id))
    } finally {
      setIsSaving(false)
    }
  }, [])

  return { customers, isLoading, loadError, isSaving, addCustomer, editCustomer, removeCustomer, refresh }
}
