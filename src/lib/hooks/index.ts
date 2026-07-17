import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { db } from '@/lib/db/insforge'
import type { OrderBatchRow, OrderBatchItemRow } from '@/lib/db/types'
import type { OrderBatch as FrontendOrderBatch, CartItemStatus } from '@/types'
import { insforge } from '@/lib/services/auth-service'
import { dashboardKeys } from '@/lib/core/query-keys'
import {
  fetchDashboardTables,
  fetchRooms,
  fetchOrders,
  checkIn as checkInOp,
  checkOut as checkOutOp,
  updateRoomStatus as updateRoomStatusOp,
  releaseAllTables as releaseAllTablesOp,
  createTable as createTableOp,
  updateTable as updateTableOp,
  deleteTable as deleteTableOp,
  createRoom as createRoomOp,
  updateRoom as updateRoomOp,
  deleteRoom as deleteRoomOp,
  fetchHousekeepingTasks,
  updateHousekeepingTask as updateHousekeepingTaskOp,
  fetchMaintenanceRequests,
  createMaintenanceRequest as createMaintenanceRequestOp,
  updateMaintenanceRequest as updateMaintenanceRequestOp,
  deleteMaintenanceRequest as deleteMaintenanceRequestOp,
} from '@/lib/db/operations'
import {
  fetchRevenueByPeriod,
  fetchAverageOrderValue,
  fetchQueueAnalytics,
  fetchStaffOrderCounts,
  fetchLowStockProducts,
  fetchStockMovementTrends,
  fetchRevenueForecast,
  fetchOccupancyForecast,
} from '@/lib/db/analytics'
import type { DashboardTable, Order, Room, RoomType, HousekeepingTask, MaintenanceRequest } from '../../types'
import type { RoomTypeRow } from '@/lib/db/types'
export type { ActiveTableSession } from './useActiveTableSessions'
export { useActiveTableSessions } from './useActiveTableSessions'
import type {
  RevenueByPeriodData,
  AovEntry,
  QueueAnalyticsData,
  LowStockProduct,
  RevenueForecastData,
  OccupancyForecastData,
} from '@/lib/db/analytics'

// ────────────────────────────────────────────────────────────────
// 🚀  Real React Query Hooks
// ────────────────────────────────────────────────────────────────

// ===== Table Batches Hook ────────────────────────────────

function rowToFrontendBatch(
  row: OrderBatchRow,
  items: OrderBatchItemRow[],
): FrontendOrderBatch {
  return {
    id: row.id,
    table_id: row.table_id ?? '',
    customer_name: row.customer_name ?? undefined,
    items: items.map(i => ({
      id: i.id,
      menu_item_id: i.menu_item_id ?? '',
      name: i.name,
      quantity: i.quantity,
      unit_price: i.unit_price,
      notes: i.notes,
      status: i.status as CartItemStatus,
      batch_id: i.batch_id,
    })),
    status: row.status as FrontendOrderBatch['status'],
    created_at: row.created_at,
    is_locked: row.is_locked,
    subtotal: Number(row.subtotal),
    discount: Number(row.discount),
    paid_amount: Number(row.paid_amount),
  }
}

const batchKeys = {
  all: ['batches'] as const,
  byTable: (tableId: string) => ['batches', 'table', tableId] as const,
}

/**
 * Fetch all order batches and their items for a specific table.
 * Used to restore previous orders when selecting an occupied table.
 *
 * NOTE: This now filters out cancelled batches on the server side to match
 * the behavior of fetchDashboardTables() — cancelled batches must not
 * contribute to running totals or be displayed as active Previous Batches.
 */
export function useTableBatches(tableId: string | null) {
  return useQuery<FrontendOrderBatch[]>({
    queryKey: batchKeys.byTable(tableId ?? '__none__'),
    queryFn: async () => {
      if (!tableId) return []

      // Only fetch non-paid, non-cancelled batches — matches Dashboard logic
      const { data: batchRows, error: batchError } = await db.findMany<OrderBatchRow>(
        'order_batches',
        { table_id: tableId },
        { orderBy: 'created_at', orderDir: 'asc' },
      )

      if (batchError) throw batchError
      if (!batchRows || batchRows.length === 0) return []

      // Filter out cancelled batches server-side to match Dashboard behavior
      const activeBatches = batchRows.filter(b => b.status !== 'cancelled' && b.status !== 'paid')
      if (activeBatches.length === 0) return []

      // Fetch all items for these batches, filtered server-side via .in()
      const batchIds = activeBatches.map(b => b.id)

      const { data: allItems, error: itemsError } = await insforge.database
        .from('order_batch_items')
        .select('*')
        .in('batch_id', batchIds)

      if (itemsError) throw itemsError

      // Group items by batch_id
      const itemsByBatch = new Map<string, OrderBatchItemRow[]>()
      for (const item of (allItems ?? []) as OrderBatchItemRow[]) {
        const existing = itemsByBatch.get(item.batch_id) ?? []
        existing.push(item)
        itemsByBatch.set(item.batch_id, existing)
      }

      return activeBatches.map(batch =>
        rowToFrontendBatch(batch, itemsByBatch.get(batch.id) ?? []),
      )
    },
    enabled: !!tableId,
    staleTime: 60_000,
  })
}

// ===== Dashboard Hooks =====

export function useDashboardTables() {
  return useQuery<DashboardTable[]>({
    queryKey: dashboardKeys.tables(),
    queryFn: fetchDashboardTables,
    staleTime: 15_000,
    refetchInterval: 30_000,
  })
}

export function useRooms() {
  return useQuery<Room[]>({
    queryKey: dashboardKeys.rooms(),
    queryFn: fetchRooms,
    staleTime: 15_000,
    refetchInterval: 30_000,
  })
}

export function useRoomTypes() {
  return useQuery<RoomType[]>({
    queryKey: [...dashboardKeys.all, 'roomTypes'] as const,
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from('room_types')
        .select('id, name, description, price_per_night, capacity, amenities')
        .order('name', { ascending: true })

      if (error) throw error

      return (data ?? []).map((row: unknown) => {
        const r = row as RoomTypeRow
        return {
          id: r.id,
          name: r.name,
          description: r.description,
          pricePerNight: Number(r.price_per_night),
          capacity: r.capacity,
          amenities: r.amenities,
        } satisfies RoomType
      })
    },
    staleTime: 60_000,
  })
}

// ===== Orders =====

export function useOrders() {
  return useQuery<Order[]>({
    queryKey: dashboardKeys.orders(),
    queryFn: fetchOrders,
    staleTime: 10_000,
    refetchInterval: 15_000,
  })
}

// ────────────────────────────────────────────────────────────────
// 📊  Analytics Hooks — Real React Query
// ────────────────────────────────────────────────────────────────

const analyticsKeys = {
  all: ['analytics'] as const,
  revenueByPeriod: (days: number) => ['analytics', 'revenue', days] as const,
  aov: (days: number) => ['analytics', 'aov', days] as const,
  queue: () => ['analytics', 'queue'] as const,
  staffOrderCounts: () => ['analytics', 'staffOrderCounts'] as const,
  lowStock: () => ['analytics', 'lowStock'] as const,
  stockMovements: (days: number) => ['analytics', 'stockMovements', days] as const,
  revenueForecast: (days: number) => ['analytics', 'revenueForecast', days] as const,
  occupancyForecast: (days: number) => ['analytics', 'occupancyForecast', days] as const,
}

export function useRevenueByPeriod(days = 7) {
  return useQuery<RevenueByPeriodData>({
    queryKey: analyticsKeys.revenueByPeriod(days),
    queryFn: () => fetchRevenueByPeriod(days),
    staleTime: 60_000,
  })
}

export function useAverageOrderValue(days = 30) {
  return useQuery<AovEntry[]>({
    queryKey: analyticsKeys.aov(days),
    queryFn: () => fetchAverageOrderValue(days),
    staleTime: 120_000,
  })
}

export function useQueueAnalytics() {
  return useQuery<QueueAnalyticsData>({
    queryKey: analyticsKeys.queue(),
    queryFn: fetchQueueAnalytics,
    staleTime: 30_000,
    refetchInterval: 30_000,
  })
}

export function useStaffOrderCounts() {
  return useQuery<Record<string, { total: number; revenue: number }>>({
    queryKey: analyticsKeys.staffOrderCounts(),
    queryFn: fetchStaffOrderCounts,
    staleTime: 120_000,
  })
}

export function useLowStockProducts() {
  return useQuery<LowStockProduct[]>({
    queryKey: analyticsKeys.lowStock(),
    queryFn: fetchLowStockProducts,
    staleTime: 60_000,
    refetchInterval: 120_000,
  })
}

export function useStockMovementTrends(days = 14) {
  return useQuery<Record<string, Record<string, number>>>({
    queryKey: analyticsKeys.stockMovements(days),
    queryFn: () => fetchStockMovementTrends(days),
    staleTime: 120_000,
  })
}

export function useRevenueForecast(days = 7) {
  return useQuery<RevenueForecastData>({
    queryKey: analyticsKeys.revenueForecast(days),
    queryFn: () => fetchRevenueForecast(days),
    staleTime: 300_000,
  })
}

export function useOccupancyForecast(days = 7) {
  return useQuery<OccupancyForecastData>({
    queryKey: analyticsKeys.occupancyForecast(days),
    queryFn: () => fetchOccupancyForecast(days),
    staleTime: 300_000,
  })
}

// ────────────────────────────────────────────────────────────────
// 🚀  Mutation Hooks — Real React Query
// ────────────────────────────────────────────────────────────────

const mutationKeys = {
  checkIn: ['mutation', 'checkIn'] as const,
  checkOut: ['mutation', 'checkOut'] as const,
  updateRoomStatus: ['mutation', 'updateRoomStatus'] as const,
}

function invalidateRoomQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: dashboardKeys.rooms() })
  queryClient.invalidateQueries({ queryKey: dashboardKeys.tables() })
  queryClient.invalidateQueries({ queryKey: ['dashboard', 'report'] })
  queryClient.invalidateQueries({ queryKey: ['operations', 'all'] })
  queryClient.invalidateQueries({ queryKey: ['analytics'] })
  queryClient.invalidateQueries({ queryKey: ['finance'] })
}

export function useCheckIn() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: mutationKeys.checkIn,
    mutationFn: checkInOp,
    onSuccess: () => invalidateRoomQueries(queryClient),
  })
}

export function useCheckOut() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: mutationKeys.checkOut,
    mutationFn: checkOutOp,
    onSuccess: () => invalidateRoomQueries(queryClient),
  })
}

export function useUpdateRoomStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: mutationKeys.updateRoomStatus,
    mutationFn: updateRoomStatusOp,
    onSuccess: () => invalidateRoomQueries(queryClient),
  })
}

export function useReleaseAllTables() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ['mutation', 'releaseAllTables'] as const,
    mutationFn: releaseAllTablesOp,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dashboardKeys.tables() })
      queryClient.invalidateQueries({ queryKey: dashboardKeys.orders() })
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'report'] })
    },
  })
}

// ─── Table CRUD Hooks ──────────────────────────────────────────

const housekeepingKeys = {
  all: ['operations', 'housekeeping'] as const,
}

const maintenanceKeys = {
  all: ['operations', 'maintenance'] as const,
}

function invalidateAfterRoomMutation(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: dashboardKeys.rooms() })
  queryClient.invalidateQueries({ queryKey: dashboardKeys.tables() })
  queryClient.invalidateQueries({ queryKey: ['dashboard', 'report'] })
  queryClient.invalidateQueries({ queryKey: ['operations', 'all'] })
  queryClient.invalidateQueries({ queryKey: ['analytics'] })
  queryClient.invalidateQueries({ queryKey: ['finance'] })
}

function invalidateAfterTableMutation(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: dashboardKeys.tables() })
  queryClient.invalidateQueries({ queryKey: ['dashboard', 'report'] })
  queryClient.invalidateQueries({ queryKey: ['operations', 'all'] })
  queryClient.invalidateQueries({ queryKey: ['analytics'] })
  queryClient.invalidateQueries({ queryKey: ['finance'] })
}

function invalidateAfterHousekeepingMutation(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: housekeepingKeys.all })
  queryClient.invalidateQueries({ queryKey: dashboardKeys.rooms() })
}

function invalidateAfterMaintenanceMutation(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: maintenanceKeys.all })
}

export function useHousekeepingTasks() {
  return useQuery<HousekeepingTask[]>({
    queryKey: housekeepingKeys.all,
    queryFn: fetchHousekeepingTasks,
    staleTime: 15_000,
    refetchInterval: 30_000,
  })
}

export function useMaintenanceRequests() {
  return useQuery<MaintenanceRequest[]>({
    queryKey: maintenanceKeys.all,
    queryFn: fetchMaintenanceRequests,
    staleTime: 15_000,
    refetchInterval: 30_000,
  })
}

export function useCreateTable() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createTableOp,
    onSuccess: () => invalidateAfterTableMutation(queryClient),
  })
}

export function useUpdateTable() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: updateTableOp,
    onSuccess: () => invalidateAfterTableMutation(queryClient),
  })
}

export function useDeleteTable() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteTableOp,
    onSuccess: () => invalidateAfterTableMutation(queryClient),
  })
}

export function useCreateRoom() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createRoomOp,
    onSuccess: () => invalidateAfterRoomMutation(queryClient),
  })
}

export function useUpdateRoom() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: updateRoomOp,
    onSuccess: () => invalidateAfterRoomMutation(queryClient),
  })
}

export function useDeleteRoom() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteRoomOp,
    onSuccess: () => invalidateAfterRoomMutation(queryClient),
  })
}

export function useUpdateHousekeepingTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: updateHousekeepingTaskOp,
    onSuccess: () => invalidateAfterHousekeepingMutation(queryClient),
  })
}

export function useCreateMaintenanceRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createMaintenanceRequestOp,
    onSuccess: () => invalidateAfterMaintenanceMutation(queryClient),
  })
}

export function useUpdateMaintenanceRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: updateMaintenanceRequestOp,
    onSuccess: () => invalidateAfterMaintenanceMutation(queryClient),
  })
}

export function useDeleteMaintenanceRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteMaintenanceRequestOp,
    onSuccess: () => invalidateAfterMaintenanceMutation(queryClient),
  })
}

export function useCompleteHousekeeping() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: { p_task_id: string; p_completed_by: string }) => {
      const { error } = await insforge.database
        .from('housekeeping_tasks')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', params.p_task_id)

      if (error) throw error
      return { success: true }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'hk'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'rooms'] })
    },
  })
}
