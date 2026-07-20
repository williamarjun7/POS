/**
 * CustomerService
 * ─────────────────
 * DB-backed CRUD for customers with React Query integration.
 *
 * Table: public.customers
 * RLS: authenticated users can SELECT, INSERT, UPDATE, DELETE
 *
 * The useCustomers() hook now uses React Query internally so that
 * cache invalidation (e.g., via customerKeys.all or ['customers'])
 * automatically refreshes the customer list without manual calls.
 */

import { useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { insforge } from '@/lib/services/auth-service'
import type { CustomerRow } from '@/lib/db/types'
import { customerKeys } from '@/lib/services/customer-ledger'

/* ─── Frontend Customer type (camelCase) ─────────────────── */

export interface Customer {
  id: string
  name: string
  phone: string
  email: string
  address?: string
  lastVisit: string
  notes?: string
  /** @deprecated Stored counter — not maintained. Use invoice-based computation. */
  totalOrders: number
  /** @deprecated Stored counter — not maintained. Use invoice-based computation. */
  totalSpent: number
  /** @deprecated Always 0 — loyalty points are not implemented. */
  loyaltyPoints: number
  /** @deprecated Stored counter — not maintained. Use invoice-based computation. */
  creditBalance: number
}

/* ─── React Query Keys ──────────────────────────────────── */

/**
 * Customer query keys for React Query.
 * Uses the same ['customers'] prefix as customerKeys from customer-ledger
 * so that invalidation of one also triggers the other.
 */
export const customerQueryKeys = {
  all: ['customers'] as const,
  list: () => ['customers', 'list'] as const,
  detail: (id: string) => ['customers', 'detail', id] as const,
}

/* ─── Mapper ──────────────────────────────────────────────── */

function rowToCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    address: row.address || undefined,
    lastVisit: row.last_visit ?? new Date().toISOString(),
    notes: row.notes ?? undefined,
    // These fields are no longer stored in DB — default to 0 for backward compat
    totalOrders: 0,
    totalSpent: 0,
    loyaltyPoints: 0,
    creditBalance: 0,
  }
}

function customerToRow(data: Omit<Customer, 'id'>): Record<string, unknown> {
  return {
    name: data.name,
    phone: data.phone,
    email: data.email,
    address: data.address ?? '',
    last_visit: data.lastVisit,
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
  if (data.lastVisit !== undefined) payload.last_visit = data.lastVisit
  if (data.notes !== undefined) payload.notes = data.notes ?? null
  // NOTE: totalOrders, totalSpent, loyaltyPoints, creditBalance are dead columns
  // and are no longer sent to the database.

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

/* ─── React Query Hook ─────────────────────────────────────── */

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
  const queryClient = useQueryClient()

  // ── Query: fetch all customers ─────────────────────────────
  const { data: customers = [], isLoading, error } = useQuery({
    queryKey: customerQueryKeys.list(),
    queryFn: fetchCustomersFromDb,
    staleTime: 10_000,
  })

  // ── Mutation: create customer ──────────────────────────────
  const createMutation = useMutation({
    mutationFn: createCustomerInDb,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customerQueryKeys.all })
      queryClient.invalidateQueries({ queryKey: customerKeys.all })
    },
  })

  // ── Mutation: update customer ──────────────────────────────
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Omit<Customer, 'id'>> }) => {
      return updateCustomerInDb(id, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customerQueryKeys.all })
      queryClient.invalidateQueries({ queryKey: customerKeys.all })
    },
  })

  // ── Mutation: delete customer ──────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: deleteCustomerFromDb,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customerQueryKeys.all })
      queryClient.invalidateQueries({ queryKey: customerKeys.all })
    },
  })

  // ── Wrapped async helpers ──────────────────────────────────

  const addCustomer = useCallback(async (data: Omit<Customer, 'id'>) => {
    return createMutation.mutateAsync(data)
  }, [createMutation])

  const editCustomer = useCallback(async (id: string, data: Partial<Omit<Customer, 'id'>>) => {
    return updateMutation.mutateAsync({ id, data })
  }, [updateMutation])

  const removeCustomer = useCallback(async (id: string) => {
    return deleteMutation.mutateAsync(id)
  }, [deleteMutation])

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: customerQueryKeys.all, refetchType: 'all' })
    await queryClient.invalidateQueries({ queryKey: customerKeys.all, refetchType: 'all' })
  }, [queryClient])

  return {
    customers,
    isLoading,
    loadError: error?.message ?? null,
    isSaving: createMutation.isPending || updateMutation.isPending || deleteMutation.isPending,
    addCustomer,
    editCustomer,
    removeCustomer,
    refresh,
  }
}
