/**
 * Domain-specific data-fetching functions for tables, rooms, and orders.
 *
 * Follows the same pattern as src/lib/db/menu.ts — each function
 * queries InsForge (PostgREST) and maps rows to frontend types.
 */

import { insforge } from '@/lib/services/auth-service'
import type {
  RestaurantTableRow,
  RoomRow,
  RoomTypeRow,
  OrderBatchRow,
  OrderBatchItemRow,
  HousekeepingTaskRow,
  MaintenanceRequestRow,
} from './types'
import type {
  DashboardTable, Room, Order, OrderItem,
  HousekeepingTask, MaintenanceRequest,
} from '@/types'

// ─── Status mapping helpers ─────────────────────────────────

const BATCH_STATUS_MAP: Record<string, Order['status']> = {
  pending: 'pending',
  partial: 'pending',
  paid: 'completed',
  cancelled: 'cancelled',
}

// ─── Restaurant Tables ──────────────────────────────────────

/**
 * Fetch all tables with session-derived status and metadata.
 *
 * Table status is now DERIVED from order_batches rather than read directly
 * from the restaurant_tables.status column. A table is "occupied" if it has
 * any non-paid, non-cancelled order batches.
 *
 * The core `restaurant_tables.status` column is still respected for
 * non-occupied states (reserved, cleaning, maintenance, disabled).
 */
export async function fetchDashboardTables(): Promise<DashboardTable[]> {
  // 1. Fetch base table rows
  const { data, error } = await insforge.database
    .from('restaurant_tables')
    .select('id, table_number, capacity, section, display_order, status')
    .order('display_order', { ascending: true, nullsFirst: false })
    .order('table_number', { ascending: true })

  if (error) throw error

  const tableRows = (data ?? []) as RestaurantTableRow[]

  // 2. Fetch non-paid batches + items to derive status and running totals
  const tableIds = tableRows.map(r => r.id)
  const { data: batchesData } = await insforge.database
    .from('order_batches')
    .select('id, table_id, customer_name, subtotal, paid_amount, status, created_at')
    .in('table_id', tableIds)
    .not('status', 'in', '("paid","cancelled")')

  const batches = (batchesData ?? []) as Array<{
    id: string
    table_id: string | null
    customer_name: string | null
    subtotal: number
    paid_amount: number
    status: string
    created_at: string
  }>

  // 3. Fetch items to compute true unpaid running totals
  const batchIds = batches.map(b => b.id)
  const batchToTable = new Map<string, string>()
  for (const b of batches) {
    if (b.table_id) batchToTable.set(b.id, b.table_id)
  }

  const unpaidItemTotalByTable: Record<string, number> = {}
  if (batchIds.length > 0) {
    const { data: itemsData } = await insforge.database
      .from('order_batch_items')
      .select('batch_id, unit_price, quantity, status')
      .in('batch_id', batchIds)

    const items = (itemsData ?? []) as Array<{
      batch_id: string
      unit_price: number
      quantity: number
      status: string
    }>

    for (const item of items) {
      if (item.status !== 'paid' && item.status !== 'credit' && item.status !== 'cancelled') {
        const tableId = batchToTable.get(item.batch_id)
        if (tableId) {
          unpaidItemTotalByTable[tableId] = (unpaidItemTotalByTable[tableId] ?? 0) +
            Number(item.unit_price) * item.quantity
        }
      }
    }
  }

  // 4. Group batches by table for session metadata
  const batchesByTable = new Map<string, typeof batches>()
  for (const batch of batches) {
    const tid = batch.table_id!
    if (!batchesByTable.has(tid)) batchesByTable.set(tid, [])
    batchesByTable.get(tid)!.push(batch)
  }

  // 5. Map rows to DashboardTable with derived status + session metadata
  return tableRows.map(row => {
    const tableBatches = batchesByTable.get(row.id) ?? []
    const hasActiveBatches = tableBatches.length > 0

    // Sort to find session start (earliest batch)
    const sortedBatches = [...tableBatches].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    )
    const sessionStart = hasActiveBatches ? sortedBatches[0].created_at : undefined
    const customerName = hasActiveBatches
      ? (sortedBatches[0].customer_name ?? undefined)
      : undefined
    const batchCount = tableBatches.length
    const runningTotal = unpaidItemTotalByTable[row.id] ?? undefined
    const paidAmount = tableBatches.reduce((s, b) => s + Number(b.paid_amount), 0)

    // Derive status: if active batches exist, it's occupied; otherwise use DB value
    const derivedStatus = hasActiveBatches ? 'occupied' as const : row.status

    return {
      ...rowToDashboardTable(row),
      status: derivedStatus as DashboardTable['status'],
      running_total: runningTotal,
      totalAmount: runningTotal,
      paidAmount: paidAmount > 0 ? paidAmount : undefined,
      guestName: customerName,
      occupiedSince: sessionStart,
      // sessionStart not in DashboardTable type, excluded
    batchCount,
      order_count: batchCount,
    }
  })
}

function rowToDashboardTable(row: RestaurantTableRow): Omit<DashboardTable, 'status' | 'running_total' | 'totalAmount'> {
  return {
    id: row.id,
    number: row.table_number,
    table_number: row.table_number,
    capacity: row.capacity,
    name: `Table ${row.table_number}`,
    display_order: row.display_order,
    area: row.section,
    guestName: undefined,
    occupiedSince: undefined,
    order_count: undefined,
    paidAmount: undefined,
    // Remaining optional fields default to undefined
  }
}

// ─── Rooms ──────────────────────────────────────────────────

export async function fetchRooms(): Promise<Room[]> {
  const { data, error } = await insforge.database
    .from('rooms')
    .select('*, room_types(*)')
    .order('floor', { ascending: true })
    .order('room_number', { ascending: true })

  if (error) throw error

  return (data ?? []).map((row: unknown) =>
    rowToRoom(row as RoomRow & { room_types?: RoomTypeRow | null }),
  )
}

function rowToRoom(
  row: RoomRow & { room_types?: RoomTypeRow | null },
): Room {
  return {
    id: row.id,
    number: row.room_number,
    room_number: row.room_number,
    type: row.room_types?.name ?? '',
    floor: row.floor,
    status: row.status as Room['status'],
    pricePerNight: Number(row.price_per_night),
    price: Number(row.price_per_night),
    capacity: row.room_types?.capacity,
    amenities: row.amenities ?? [],
    room_type_id: row.room_type_id ?? undefined,
    room_types: row.room_types
      ? { id: row.room_types.id, name: row.room_types.name }
      : undefined,
  }
}

// ─── Orders ─────────────────────────────────────────────────

export async function fetchOrders(): Promise<Order[]> {
  // Fetch order batches with their items + table info
  const { data, error } = await insforge.database
    .from('order_batches')
    .select('*, order_batch_items(*), restaurant_tables!left(table_number)')
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((row: unknown) =>
    rowToOrder(
      row as OrderBatchRow & {
        order_batch_items?: OrderBatchItemRow[]
        restaurant_tables?: { table_number: string } | null
      },
    ),
  )
}

function rowToOrder(
  row: OrderBatchRow & {
    order_batch_items?: OrderBatchItemRow[]
    restaurant_tables?: { table_number: string } | null
  },
): Order {
  const items: OrderItem[] = (row.order_batch_items ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    price: Number(item.unit_price),
    status: mapItemStatus(item.status),
  }))

  return {
    id: row.id,
    order_number: `ORD-${row.id.slice(0, 8).toUpperCase()}`,
    tableId: row.table_id ?? undefined,
    tableNumber: row.restaurant_tables?.table_number,
    table_number: row.restaurant_tables?.table_number,
    items,
    order_items: items.map((i) => ({
      item_name: i.name,
      quantity: i.quantity,
      price: i.price,
    })),
    status: BATCH_STATUS_MAP[row.status] ?? 'pending',
    totalAmount: Number(row.subtotal),
    total: Number(row.subtotal),
    paidAmount: Number(row.paid_amount),
    paymentMethod: undefined,
    payment_method: undefined,
    createdAt: row.created_at,
    created_at: row.created_at,
    updatedAt: row.updated_at,
    updated_at: row.updated_at,
    customer: row.customer_name ?? undefined,
    tableRoom: row.restaurant_tables?.table_number
      ? `Table ${row.restaurant_tables.table_number}`
      : undefined,
  }
}

function mapItemStatus(
  status: string,
): OrderItem['status'] {
  switch (status) {
    case 'paid':
    case 'credit':
      return 'paid'
    default:
      return 'pending'
  }
}

// ─── Mutations ────────────────────────────────────────────────

/**
 * Check in a guest: update booking to checked_in, mark room occupied,
 * and log the activity.
 */
export async function checkIn(params: {
  p_booking_id: string
  p_user_id: string
  p_idempotency_key: string
}): Promise<{ success: boolean }> {
  // 1. Fetch booking to get room_id
  const { data: booking, error: fetchError } = await insforge.database
    .from('bookings')
    .select('id, room_id')
    .eq('id', params.p_booking_id)
    .single()

  if (fetchError) throw fetchError
  if (!booking) throw new Error('Booking not found')

  const b = booking as { id: string; room_id: string }

  // 2. Update booking status
  const { error: bookingError } = await insforge.database
    .from('bookings')
    .update({ status: 'checked_in' })
    .eq('id', params.p_booking_id)

  if (bookingError) throw bookingError

  // 3. Update room status
  const { error: roomError } = await insforge.database
    .from('rooms')
    .update({ status: 'occupied' })
    .eq('id', b.room_id)

  if (roomError) throw roomError

  // 4. Log activity (fire-and-forget)
  try {
    await insforge.database.from('activity_logs').insert([
      {
        user_id: params.p_user_id,
        activity_type: 'check_in',
        entity_id: params.p_booking_id,
        entity_label: `Booking ${params.p_booking_id.slice(0, 8)}`,
        status: 'completed',
      },
    ])
  } catch { /* ignore log failure */ }

  return { success: true }
}

/**
 * Check out a guest: update booking to checked_out, mark room vacant,
 * and log the activity.
 */
export async function checkOut(params: {
  p_booking_id: string
  p_user_id: string
  p_idempotency_key: string
}): Promise<{ success: boolean }> {
  // 1. Fetch booking to get room_id
  const { data: booking, error: fetchError } = await insforge.database
    .from('bookings')
    .select('id, room_id')
    .eq('id', params.p_booking_id)
    .single()

  if (fetchError) throw fetchError
  if (!booking) throw new Error('Booking not found')

  const b = booking as { id: string; room_id: string }

  // 2. Update booking status
  const { error: bookingError } = await insforge.database
    .from('bookings')
    .update({ status: 'checked_out' })
    .eq('id', params.p_booking_id)

  if (bookingError) throw bookingError

  // 3. Update room status
  const { error: roomError } = await insforge.database
    .from('rooms')
    .update({ status: 'vacant' })
    .eq('id', b.room_id)

  if (roomError) throw roomError

  // 4. Log activity (fire-and-forget)
  try {
    await insforge.database.from('activity_logs').insert([
      {
        user_id: params.p_user_id,
        activity_type: 'check_out',
        entity_id: params.p_booking_id,
        entity_label: `Booking ${params.p_booking_id.slice(0, 8)}`,
        status: 'completed',
      },
    ])
  } catch { /* ignore log failure */ }

  return { success: true }
}

/**
 * Update a room's status directly (maintenance, cleaning, available, etc.).
 */
export async function updateRoomStatus(params: {
  id: string
  status: string
  reason?: string
}): Promise<{ success: boolean }> {
  const { error } = await insforge.database
    .from('rooms')
    .update({ status: params.status })
    .eq('id', params.id)

  if (error) throw error

  return { success: true }
}

/**
 * Release all tables: cancel all active order batches and reset every
 * restaurant table back to 'available'.
 */
export async function releaseAllTables(): Promise<{ success: boolean }> {
  const { error: batchError } = await insforge.database
    .from('order_batches')
    .update({ status: 'cancelled' })
    .in('status', ['pending', 'partial'])
    .is('room_id', null)

  if (batchError) throw batchError

  const { error: tableError } = await insforge.database
    .from('restaurant_tables')
    .update({ status: 'available' })
    .neq('status', 'disabled')

  if (tableError) throw tableError

  return { success: true }
}

// ─── Table CRUD ────────────────────────────────────────────────

export async function createTable(params: {
  table_number: string
  capacity: number
  section?: string
  display_order?: number
  status?: string
}): Promise<{ success: boolean; id: string }> {
  // Check for duplicate table_number
  const { data: existing, error: checkError } = await insforge.database
    .from('restaurant_tables')
    .select('id')
    .eq('table_number', params.table_number)
    .maybeSingle()

  if (checkError) throw checkError
  if (existing) {
    throw new Error(`A table with number "${params.table_number}" already exists. Please use a different number.`)
  }

  const { data, error } = await insforge.database
    .from('restaurant_tables')
    .insert([{
      table_number: params.table_number,
      capacity: params.capacity,
      section: params.section || 'Main',
      display_order: params.display_order ?? 0,
      status: params.status || 'available',
    }])
    .select('id')
    .single()

  if (error) {
    // Catch PostgreSQL unique constraint violations as a fallback
    if (error.message?.includes('idx_tables_number_branch') || error.message?.includes('unique') || error.code === '23505') {
      throw new Error(`A table with number "${params.table_number}" already exists. Please use a different number.`)
    }
    throw error
  }
  return { success: true, id: (data as { id: string }).id }
}

export async function updateTable(params: {
  id: string
  table_number?: string
  capacity?: number
  section?: string
  display_order?: number
  status?: string
}): Promise<{ success: boolean }> {
  const updates: Record<string, unknown> = {}
  if (params.table_number !== undefined) updates.table_number = params.table_number
  if (params.capacity !== undefined) updates.capacity = params.capacity
  if (params.section !== undefined) updates.section = params.section
  if (params.display_order !== undefined) updates.display_order = params.display_order
  if (params.status !== undefined) updates.status = params.status

  // Check for duplicate table_number if it's being changed
  if (params.table_number !== undefined) {
    const { data: existing, error: checkError } = await insforge.database
      .from('restaurant_tables')
      .select('id')
      .eq('table_number', params.table_number)
      .neq('id', params.id)
      .maybeSingle()

    if (checkError) throw checkError
    if (existing) {
      throw new Error(`A table with number "${params.table_number}" already exists. Please use a different number.`)
    }
  }

  const { error } = await insforge.database
    .from('restaurant_tables')
    .update(updates)
    .eq('id', params.id)

  if (error) {
    if (error.message?.includes('idx_tables_number_branch') || error.message?.includes('unique') || error.code === '23505') {
      throw new Error(`A table with number "${params.table_number}" already exists. Please use a different number.`)
    }
    throw error
  }
  return { success: true }
}

export async function deleteTable(params: {
  id: string
}): Promise<{ success: boolean }> {
  // Check if table has any active (non-paid, non-cancelled) order batches
  const { data: activeOrders, error: checkError } = await insforge.database
    .from('order_batches')
    .select('id')
    .eq('table_id', params.id)
    .not('status', 'in', '("paid","cancelled")')
    .limit(1)

  if (checkError) throw checkError

  if (activeOrders && activeOrders.length > 0) {
    throw new Error('Cannot delete an active table. Please settle all orders and payments first.')
  }

  const { error } = await insforge.database
    .from('restaurant_tables')
    .delete()
    .eq('id', params.id)

  if (error) throw error
  return { success: true }
}

// ─── Room CRUD ─────────────────────────────────────────────────

export async function createRoom(params: {
  room_number: string
  room_type_id?: string
  floor: number
  price_per_night: number
  amenities?: string[]
}): Promise<{ success: boolean; id: string }> {
  // Check for duplicate room_number
  const { data: existing, error: checkError } = await insforge.database
    .from('rooms')
    .select('id')
    .eq('room_number', params.room_number)
    .maybeSingle()

  if (checkError) throw checkError
  if (existing) {
    throw new Error(`A room with number "${params.room_number}" already exists. Please use a different number.`)
  }

  const { data, error } = await insforge.database
    .from('rooms')
    .insert([{
      room_number: params.room_number,
      room_type_id: params.room_type_id || null,
      floor: params.floor,
      price_per_night: params.price_per_night,
      amenities: params.amenities || [],
      status: 'vacant',
    }])
    .select('id')
    .single()

  if (error) {
    if (error.message?.includes('idx_rooms_number_branch') || error.message?.includes('unique') || error.code === '23505') {
      throw new Error(`A room with number "${params.room_number}" already exists. Please use a different number.`)
    }
    throw error
  }
  return { success: true, id: (data as { id: string }).id }
}

export async function updateRoom(params: {
  id: string
  room_number?: string
  room_type_id?: string | null
  floor?: number
  price_per_night?: number
  amenities?: string[]
  status?: string
}): Promise<{ success: boolean }> {
  const updates: Record<string, unknown> = {}
  if (params.room_number !== undefined) updates.room_number = params.room_number
  if (params.room_type_id !== undefined) updates.room_type_id = params.room_type_id
  if (params.floor !== undefined) updates.floor = params.floor
  if (params.price_per_night !== undefined) updates.price_per_night = params.price_per_night
  if (params.amenities !== undefined) updates.amenities = params.amenities
  if (params.status !== undefined) updates.status = params.status

  // Check for duplicate room_number if it's being changed
  if (params.room_number !== undefined) {
    const { data: existing, error: checkError } = await insforge.database
      .from('rooms')
      .select('id')
      .eq('room_number', params.room_number)
      .neq('id', params.id)
      .maybeSingle()

    if (checkError) throw checkError
    if (existing) {
      throw new Error(`A room with number "${params.room_number}" already exists. Please use a different number.`)
    }
  }

  const { error } = await insforge.database
    .from('rooms')
    .update(updates)
    .eq('id', params.id)

  if (error) {
    if (error.message?.includes('idx_rooms_number_branch') || error.message?.includes('unique') || error.code === '23505') {
      throw new Error(`A room with number "${params.room_number}" already exists. Please use a different number.`)
    }
    throw error
  }
  return { success: true }
}

export async function deleteRoom(params: {
  id: string
}): Promise<{ success: boolean }> {
  // Check for active bookings
  const { data: bookings, error: checkError } = await insforge.database
    .from('bookings')
    .select('id')
    .eq('room_id', params.id)
    .in('status', ['confirmed', 'checked_in'])
    .limit(1)

  if (checkError) throw checkError

  if (bookings && bookings.length > 0) {
    throw new Error('Cannot delete room with active bookings. Please check out all guests first.')
  }

  const { error } = await insforge.database
    .from('rooms')
    .delete()
    .eq('id', params.id)

  if (error) throw error
  return { success: true }
}

// ─── Housekeeping ─────────────────────────────────────────────

export async function fetchHousekeepingTasks(): Promise<HousekeepingTask[]> {
  const { data, error } = await insforge.database
    .from('housekeeping_tasks')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error

  return ((data ?? []) as HousekeepingTaskRow[]).map(row => ({
    id: row.id,
    roomNumber: row.room_number,
    assignedTo: row.assigned_to || '',
    status: row.status as HousekeepingTask['status'],
    priority: row.priority as HousekeepingTask['priority'],
    notes: row.notes,
    createdAt: row.created_at,
    completedAt: row.completed_at || undefined,
  }))
}

export async function updateHousekeepingTask(params: {
  id: string
  status?: string
  assigned_to?: string
  notes?: string
  completed_at?: string
}): Promise<{ success: boolean }> {
  const updates: Record<string, unknown> = {}
  if (params.status !== undefined) updates.status = params.status
  if (params.assigned_to !== undefined) updates.assigned_to = params.assigned_to
  if (params.notes !== undefined) updates.notes = params.notes
  if (params.completed_at !== undefined) updates.completed_at = params.completed_at

  const { error } = await insforge.database
    .from('housekeeping_tasks')
    .update(updates)
    .eq('id', params.id)

  if (error) throw error
  return { success: true }
}

// ─── Maintenance ──────────────────────────────────────────────

export async function fetchMaintenanceRequests(): Promise<MaintenanceRequest[]> {
  const { data, error } = await insforge.database
    .from('maintenance_requests')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error

  return ((data ?? []) as MaintenanceRequestRow[]).map(row => ({
    id: row.id,
    roomNumber: row.room_number,
    description: row.description,
    priority: row.priority as MaintenanceRequest['priority'],
    status: row.status as MaintenanceRequest['status'],
    reportedBy: row.reported_by || '',
    assignedTo: row.assigned_to || undefined,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at || undefined,
  }))
}

export async function createMaintenanceRequest(params: {
  room_number: string
  description: string
  priority: string
  reported_by?: string
  assigned_to?: string
}): Promise<{ success: boolean; id: string }> {
  const { data, error } = await insforge.database
    .from('maintenance_requests')
    .insert([{
      room_number: params.room_number,
      description: params.description,
      priority: params.priority,
      reported_by: params.reported_by || null,
      assigned_to: params.assigned_to || null,
      status: 'open',
    }])
    .select('id')
    .single()

  if (error) throw error
  return { success: true, id: (data as { id: string }).id }
}

export async function updateMaintenanceRequest(params: {
  id: string
  status?: string
  assigned_to?: string
  description?: string
  priority?: string
  resolved_at?: string
}): Promise<{ success: boolean }> {
  const updates: Record<string, unknown> = {}
  if (params.status !== undefined) updates.status = params.status
  if (params.assigned_to !== undefined) updates.assigned_to = params.assigned_to
  if (params.description !== undefined) updates.description = params.description
  if (params.priority !== undefined) updates.priority = params.priority
  if (params.resolved_at !== undefined) updates.resolved_at = params.resolved_at

  const { error } = await insforge.database
    .from('maintenance_requests')
    .update(updates)
    .eq('id', params.id)

  if (error) throw error
  return { success: true }
}

export async function deleteMaintenanceRequest(params: {
  id: string
}): Promise<{ success: boolean }> {
  const { error } = await insforge.database
    .from('maintenance_requests')
    .delete()
    .eq('id', params.id)

  if (error) throw error
  return { success: true }
}
