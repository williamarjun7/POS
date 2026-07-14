/**
 * useServerPagination
 * ───────────────────
 * Reusable hook for server-side pagination of any database table.
 *
 * Features:
 * - Fetches a page of data + total count from the server
 * - Supports sorting, filtering, and custom page sizes
 * - Returns loading/error states
 * - Integrates with DataTable's server-side pagination props
 *
 * Usage:
 *   const { data, total, totalPages, page, setPage, isLoading, refresh } =
 *     useServerPagination<InvoiceRow>('invoices', { pageSize: 10, orderBy: 'created_at', orderDir: 'desc' })
 *
 *   // Then in the JSX:
 *   <DataTable<Invoice>
 *     columns={columns}
 *     data={data.map(rowToInvoice)}
 *     loading={isLoading}
 *     totalPages={totalPages}
 *     currentPage={page}
 *     onPageChange={setPage}
 *   />
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { db } from '@/lib/db/insforge'

export interface PaginationOptions {
  pageSize?: number
  orderBy?: string
  orderDir?: 'asc' | 'desc'
  filters?: Record<string, unknown>
}

export interface UseServerPaginationReturn<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  isLoading: boolean
  error: string | null
  setPage: (page: number) => void
  setPageSize: (size: number) => void
  setFilters: (filters: Record<string, unknown> | undefined) => void
  refresh: () => Promise<void>
}

export function useServerPagination<T>(
  table: string,
  options: PaginationOptions = {},
): UseServerPaginationReturn<T> {
  const { pageSize: initialPageSize = 10, orderBy, orderDir = 'desc', filters: initialFilters } = options
  const [data, setData] = useState<T[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(initialPageSize)
  const [filters, setFilters] = useState<Record<string, unknown> | undefined>(initialFilters)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const cancelledRef = useRef(false)

  const fetchPage = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const result = await db.paginate<T>(table, {
        page,
        pageSize,
        filters,
        orderBy,
        orderDir,
      })

      if (!cancelledRef.current) {
        setData(result.data)
        setTotal(result.total)
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : `Failed to load ${table}`)
        setData([])
      }
    } finally {
      if (!cancelledRef.current) {
        setIsLoading(false)
      }
    }
  }, [table, page, pageSize, filters, orderBy, orderDir])

  useEffect(() => {
    cancelledRef.current = false
    fetchPage()
    return () => { cancelledRef.current = true }
  }, [fetchPage])

  const refresh = useCallback(async () => {
    await fetchPage()
  }, [fetchPage])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return {
    data,
    total,
    page,
    pageSize,
    totalPages,
    isLoading,
    error,
    setPage,
    setPageSize,
    setFilters,
    refresh,
  }
}
