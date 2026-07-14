/**
 * useOperationsData — Single unified hook for the Operations page.
 *
 * Batches all data fetches (rooms, tables, housekeeping, maintenance, room types)
 * into one React Query with a single loading/error state, reducing the page's
 * waterfall of 5 separate hooks to a single call.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { insforge } from '@/lib/services/auth-service'
import {
  fetchRooms,
  fetchDashboardTables,
  fetchHousekeepingTasks,
  fetchMaintenanceRequests,
} from '@/lib/db/operations'
import type { DashboardTable, Room, RoomType, HousekeepingTask, MaintenanceRequest } from '@/types'
import type { RoomTypeRow } from '@/lib/db/types'

// ── Query key ────────────────────────────────────────────────

const OPERATIONS_KEY = ['operations', 'all'] as const

// ── Data shape ───────────────────────────────────────────────

export interface OperationsData {
  rooms: Room[]
  tables: DashboardTable[]
  hkTasks: HousekeepingTask[]
  mtRequests: MaintenanceRequest[]
  roomTypes: RoomType[]
  roomTypeOptions: { value: string; label: string }[]
}

// ── Combined fetch ───────────────────────────────────────────

async function fetchAllOperationsData(): Promise<OperationsData> {
  const [
    rooms,
    tables,
    hkTasks,
    mtRequests,
    roomTypesResult,
  ] = await Promise.all([
    fetchRooms(),
    fetchDashboardTables(),
    fetchHousekeepingTasks(),
    fetchMaintenanceRequests(),
    insforge.database
      .from('room_types')
      .select('*')
      .order('name', { ascending: true }),
  ])

  const roomTypes: RoomType[] = (roomTypesResult.data ?? []).map((row: unknown) => {
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

  return {
    rooms,
    tables,
    hkTasks,
    mtRequests,
    roomTypes,
    roomTypeOptions: roomTypes.map(rt => ({ value: rt.name, label: rt.name })),
  }
}

// ── Hook ─────────────────────────────────────────────────────

export function useOperationsData() {
  return useQuery<OperationsData>({
    queryKey: OPERATIONS_KEY,
    queryFn: fetchAllOperationsData,
    staleTime: 15_000,
    refetchInterval: 30_000,
  })
}

// ── Invalidation helper (used by mutation hooks) ─────────────

export function invalidateOperationsData(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: OPERATIONS_KEY })
  queryClient.invalidateQueries({ queryKey: ['dashboard', 'report'] })
  queryClient.invalidateQueries({ queryKey: ['analytics'] })
}

// ── Room type query (kept separate for re-use elsewhere) ─────

const ROOM_TYPES_KEY = ['roomTypes'] as const

export function useRoomTypesQuery() {
  return useQuery<RoomType[]>({
    queryKey: ROOM_TYPES_KEY,
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from('room_types')
        .select('*')
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
