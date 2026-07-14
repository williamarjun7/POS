/**
 * BranchService
 * ──────────────
 * DB-backed CRUD for business branches / locations.
 *
 * Table: public.branches
 * RLS: authenticated users can SELECT, INSERT, UPDATE, DELETE
 */

import { useState, useEffect, useCallback } from 'react'
import { insforge } from '@/lib/services/auth-service'
import type { BranchRow } from '@/lib/db/types'

/* ─── Frontend Branch type (camelCase) ───────────────────── */

export interface Branch {
  id: string
  name: string
  address: string
  phone: string
  manager: string
  active: boolean
}

/* ─── Mapper ──────────────────────────────────────────────── */

function rowToBranch(row: BranchRow): Branch {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    phone: row.phone,
    manager: row.manager,
    active: row.active,
  }
}

function branchToRow(data: Omit<Branch, 'id'>): Record<string, unknown> {
  return {
    name: data.name,
    address: data.address,
    phone: data.phone,
    manager: data.manager,
    active: data.active,
  }
}

/* ─── DB operations ───────────────────────────────────────── */

async function fetchBranchesFromDb(): Promise<Branch[]> {
  const { data, error } = await insforge.database
    .from('branches')
    .select('*')
    .order('name', { ascending: true })

  if (error) throw error
  return (data ?? []).map((row: unknown) => rowToBranch(row as BranchRow))
}

async function createBranchInDb(data: Omit<Branch, 'id'>): Promise<Branch> {
  const { data: inserted, error } = await insforge.database
    .from('branches')
    .insert([branchToRow(data)])
    .select()
    .single()

  if (error) throw error
  return rowToBranch(inserted as BranchRow)
}

async function updateBranchInDb(id: string, data: Partial<Omit<Branch, 'id'>>): Promise<Branch> {
  const { data: updated, error } = await insforge.database
    .from('branches')
    .update(branchToRow(data as Omit<Branch, 'id'>))
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return rowToBranch(updated as BranchRow)
}

async function deleteBranchFromDb(id: string): Promise<void> {
  const { error } = await insforge.database
    .from('branches')
    .delete()
    .eq('id', id)

  if (error) throw error
}

/* ─── React Hook ──────────────────────────────────────────── */

export interface UseBranchesReturn {
  branches: Branch[]
  isLoading: boolean
  loadError: string | null
  isSaving: boolean
  addBranch: (data: Omit<Branch, 'id'>) => Promise<void>
  editBranch: (id: string, data: Partial<Omit<Branch, 'id'>>) => Promise<void>
  removeBranch: (id: string) => Promise<void>
  refresh: () => Promise<void>
}

export function useBranches(): UseBranchesReturn {
  const [branches, setBranches] = useState<Branch[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const refresh = useCallback(async () => {
    setLoadError(null)
    try {
      const data = await fetchBranchesFromDb()
      setBranches(data)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load branches')
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      setIsLoading(true)
      try {
        const data = await fetchBranchesFromDb()
        if (!cancelled) setBranches(data)
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load branches')
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [])

  const addBranch = useCallback(async (data: Omit<Branch, 'id'>) => {
    setIsSaving(true)
    try {
      const created = await createBranchInDb(data)
      setBranches(prev => [...prev, created])
    } finally {
      setIsSaving(false)
    }
  }, [])

  const editBranch = useCallback(async (id: string, data: Partial<Omit<Branch, 'id'>>) => {
    setIsSaving(true)
    try {
      const updated = await updateBranchInDb(id, data)
      setBranches(prev => prev.map(b => (b.id === id ? updated : b)))
    } finally {
      setIsSaving(false)
    }
  }, [])

  const removeBranch = useCallback(async (id: string) => {
    setIsSaving(true)
    try {
      await deleteBranchFromDb(id)
      setBranches(prev => prev.filter(b => b.id !== id))
    } finally {
      setIsSaving(false)
    }
  }, [])

  return { branches, isLoading, loadError, isSaving, addBranch, editBranch, removeBranch, refresh }
}
