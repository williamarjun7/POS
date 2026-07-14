/**
 * InsForge SDK Client — unified data layer
 * ─────────────────────────────────────────
 *
 * Re-exports the `insforge` client initialized in auth-service.ts
 * and provides typed helper utilities for all database CRUD operations.
 *
 * Usage:
 *   import { db, insforge } from '@/lib/db'
 *
 *   // Direct SDK access (for complex queries):
 *   const { data } = await insforge.database.from('menu_items').select('*')
 *
 *   // Typed helpers (for standard CRUD):
 *   const items = await db.findMany<MenuItem>('menu_items', { category_id: catId })
 *   const newItem = await db.insertOne('menu_items', { name: 'Coffee', price: 150 })
 */

import { insforge } from '@/lib/services/auth-service'

export { insforge }

/**
 * Helper type that maps the SDK's `{ data, error }` return.
 */
export type InsForgeResult<T> = Promise<{
  data: T | null
  error: Error | null
}>

/**
 * Typed CRUD helpers wrapping `insforge.database`.
 *
 * All methods return `{ data, error }` consistent with the SDK.
 */
export const db = {
  // ─── Query ───────────────────────────────────────────────

  /**
   * Fetch multiple rows with optional filters.
   *
   * @example
   *   const { data, error } = await db.findMany('menu_items', { available: true })
   *   const { data } = await db.findMany('menu_items', undefined, { limit: 10, offset: 0 })
   */
  async findMany<T>(
    table: string,
    filters?: Record<string, unknown>,
    pagination?: { limit?: number; offset?: number; orderBy?: string; orderDir?: 'asc' | 'desc' },
  ) {
    let query = insforge.database.from(table).select('*')

    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== null) {
          query = query.eq(key, value)
        }
      }
    }

    if (pagination?.orderBy) {
      query = query.order(pagination.orderBy, { ascending: pagination.orderDir !== 'desc' })
    }
    if (pagination?.limit) {
      query = query.limit(pagination.limit)
    }
    if (pagination?.offset) {
      query = query.range(pagination.offset, pagination.offset + (pagination.limit ?? 20) - 1)
    }

    return query as unknown as InsForgeResult<T[]>
  },

  /**
   * Fetch a single row by ID.
   *
   * @example
   *   const { data } = await db.findById('menu_items', 'uuid-here')
   */
  async findById<T>(table: string, id: string) {
    return insforge.database
      .from(table)
      .select('*')
      .eq('id', id)
      .maybeSingle() as unknown as InsForgeResult<T>
  },

  /**
   * Fetch a single row matching a filter.
   */
  async findOne<T>(
    table: string,
    filters: Record<string, unknown>,
  ) {
    let query = insforge.database.from(table).select('*')
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null) {
        query = query.eq(key, value)
      }
    }
    return query.maybeSingle() as unknown as InsForgeResult<T>
  },

  // ─── Insert ──────────────────────────────────────────────

  /**
   * Insert a single row. Returns the created record.
   *
   * @example
   *   const { data, error } = await db.insertOne('menu_items', { name: 'Latte', price: 200, category_id: catId })
   */
  async insertOne<T>(
    table: string,
    values: Record<string, unknown>,
  ) {
    return insforge.database
      .from(table)
      .insert([values])
      .select()
      .single() as unknown as InsForgeResult<T>
  },

  /**
   * Insert multiple rows at once.
   */
  async insertMany<T>(
    table: string,
    values: Record<string, unknown>[],
  ) {
    return insforge.database
      .from(table)
      .insert(values)
      .select() as unknown as InsForgeResult<T[]>
  },

  // ─── Update ───────────────────────────────────────────────

  /**
   * Update rows matching a filter. Returns updated records.
   *
   * @example
   *   const { data, error } = await db.update('menu_items', { available: false }, { id: itemId })
   */
  async update<T>(
    table: string,
    values: Record<string, unknown>,
    filters: Record<string, unknown>,
  ) {
    let query = insforge.database.from(table).update(values)
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null) {
        query = query.eq(key, value)
      }
    }
    return query.select() as unknown as InsForgeResult<T[]>
  },

  // ─── Delete ───────────────────────────────────────────────

  /**
   * Delete rows matching a filter.
   *
   * @example
   *   const { error } = await db.remove('menu_items', { id: itemId })
   */
  async remove(table: string, filters: Record<string, unknown>) {
    let query = insforge.database.from(table).delete()
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null) {
        query = query.eq(key, value)
      }
    }
    return query as unknown as Promise<{ data: null; error: Error | null }>
  },

  // ─── Count ────────────────────────────────────────────────

  /**
   * Count rows matching optional filters.
   */
  async count(table: string, filters?: Record<string, unknown>) {
    let query = insforge.database.from(table).select('*', { count: 'exact', head: true })
    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== null) {
          query = query.eq(key, value)
        }
      }
    }
    return query as unknown as Promise<{ data: null; count: number | null; error: Error | null }>
  },

  // ─── Paginated Query ────────────────────────────────────────

  /**
   * Fetch a paginated set of rows with a total count.
   *
   * Combines `findMany` with `count` in a single parallel-friendly call.
   *
   * @example
   *   const { data, total, totalPages } = await db.paginate('invoices', { page: 0, pageSize: 10, orderBy: 'created_at', orderDir: 'desc' })
   */
  async paginate<T>(
    table: string,
    opts: {
      page: number
      pageSize: number
      filters?: Record<string, unknown>
      orderBy?: string
      orderDir?: 'asc' | 'desc'
    },
  ): Promise<{ data: T[]; total: number; page: number; pageSize: number; totalPages: number }> {
    const { page, pageSize, filters, orderBy, orderDir } = opts
    const offset = page * pageSize

    // Fetch count in parallel
    const [dataResult, countResult] = await Promise.all([
      this.findMany<T>(table, filters, { limit: pageSize, offset, orderBy, orderDir }),
      this.count(table, filters),
    ])

    if (dataResult.error) throw dataResult.error
    if (countResult.error) throw countResult.error

    const total = countResult.count ?? dataResult.data?.length ?? 0

    return {
      data: dataResult.data ?? [],
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    }
  },

  // ─── Raw RPC ──────────────────────────────────────────────

  /**
   * Call a database function/RPC.
   *
   * @example
   *   const { data } = await db.rpc('get_dashboard_report', { start_date: '2026-07-01', end_date: '2026-07-12' })
   */
  async rpc<T>(fn: string, args?: Record<string, unknown>) {
    return insforge.database.rpc(fn, args ?? {}) as unknown as InsForgeResult<T>
  },
}
