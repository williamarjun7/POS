/**
 * CashReconciliationService
 * ──────────────────────────
 * DB-backed read for cash reconciliations (daily cash-up logs).
 *
 * Table: public.cash_reconciliations
 * RLS: authenticated users can SELECT
 */

import { useState, useEffect, useCallback } from 'react'
import { insforge } from '@/lib/services/auth-service'
import type { CashReconciliationRow } from '@/lib/db/types'
import type { CashReconciliation } from '@/types'

/* ─── Mapper ──────────────────────────────────────────────── */

function rowToReconciliation(row: CashReconciliationRow): CashReconciliation {
  return {
    id: row.id,
    date: row.date,
    openingBalance: row.opening_balance,
    cashReceived: row.cash_received,
    cashPaid: row.cash_paid,
    expectedBalance: row.expected_balance,
    actualBalance: row.actual_balance,
    variance: row.variance,
    reconciledBy: row.reconciled_by ?? '',
    reconciledAt: row.created_at,
  }
}

/* ─── DB operations ───────────────────────────────────────── */

async function fetchReconciliationsFromDb(): Promise<CashReconciliation[]> {
  const { data, error } = await insforge.database
    .from('cash_reconciliations')
    .select('*')
    .order('date', { ascending: false })

  if (error) throw error
  return (data ?? []).map((row: unknown) => rowToReconciliation(row as CashReconciliationRow))
}

/* ─── React Hook ──────────────────────────────────────────── */

export interface UseCashReconciliationsReturn {
  reconciliations: CashReconciliation[]
  isLoading: boolean
  loadError: string | null
  refresh: () => Promise<void>
}

export function useCashReconciliations(): UseCashReconciliationsReturn {
  const [reconciliations, setReconciliations] = useState<CashReconciliation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoadError(null)
    try {
      const data = await fetchReconciliationsFromDb()
      setReconciliations(data)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load cash reconciliations')
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      setIsLoading(true)
      try {
        const data = await fetchReconciliationsFromDb()
        if (!cancelled) setReconciliations(data)
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load cash reconciliations')
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [])

  return { reconciliations, isLoading, loadError, refresh }
}
