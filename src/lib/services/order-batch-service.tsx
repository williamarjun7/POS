/**
 * OrderBatchService
 * ─────────────────
 * DB-backed CRUD for order batches.
 *
 * Table: public.order_batches
 * RLS: authenticated users can SELECT, UPDATE
 */

import { useState, useEffect, useCallback } from 'react';
import { insforge } from '@/lib/services/auth-service';
import type { OrderBatchRow } from '@/lib/db/types';
import { orderBatchSchemas, validateOrThrow } from '@/lib/validation';

/* ─── Frontend OrderBatch type (camelCase) ─────────────────── */

export type OrderBatchStatus = 'pending' | 'partial' | 'paid' | 'cancelled';

export interface OrderBatch {
  id: string;
  tableId: string;
  roomId: string;
  customerName: string;
  customerId: string;
  status: OrderBatchStatus;
  isLocked: boolean;
  subtotal: number;
  discount: number;
  paidAmount: number;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

/* ─── Mapper helper ────────────────────────────────────────── */

function rowToOrderBatch(row: OrderBatchRow): OrderBatch {
  return {
    id: row.id,
    tableId: row.table_id ?? '',
    roomId: row.room_id ?? '',
    customerName: row.customer_name ?? '',
    customerId: row.customer_id ?? '',
    status: row.status as OrderBatchStatus,
    isLocked: row.is_locked,
    subtotal: Number(row.subtotal),
    discount: Number(row.discount),
    paidAmount: Number(row.paid_amount),
    userId: row.user_id ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
  };
}

export interface NewOrderBatchData {
  tableId: string;
  roomId?: string;
  customerName?: string;
  customerId?: string;
  status?: OrderBatchStatus;
  subtotal?: number;
  discount?: number;
}

/* ─── DB operations ─────────────────────────────────────────── */

async function fetchOrderBatchesFromDb(): Promise<OrderBatch[]> {
  const { data, error } = await insforge.database
    .from('order_batches')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row: unknown) => rowToOrderBatch(row as OrderBatchRow));
}

async function createOrderBatchInDb(data: NewOrderBatchData): Promise<OrderBatch> {
  const safe = validateOrThrow(orderBatchSchemas.createBatch, {
    tableId: data.tableId,
    roomId: data.roomId,
    customerName: data.customerName,
    customerId: data.customerId,
    status: data.status,
    subtotal: data.subtotal,
    discount: data.discount,
  })

  const { data: inserted, error } = await insforge.database
    .from('order_batches')
    .insert([
      {
        table_id: safe.tableId || null,
        room_id: safe.roomId || null,
        customer_name: safe.customerName || null,
        customer_id: safe.customerId || null,
        status: safe.status,
        subtotal: safe.subtotal,
        discount: safe.discount,
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return rowToOrderBatch(inserted as OrderBatchRow);
}

async function updateOrderBatchStatusInDb(id: string, status: OrderBatchStatus): Promise<void> {
  const safe = validateOrThrow(orderBatchSchemas.updateStatus, { id, status })
  const { error } = await insforge.database
    .from('order_batches')
    .update({ status: safe.status })
    .eq('id', safe.id);

  if (error) throw error;

  // When cancelling a batch, also mark all its items as 'cancelled' for data integrity.
  // This ensures that even if cached data still references the cancelled batch,
  // item-level calculations won't include these items.
  if (safe.status === 'cancelled') {
    const { error: itemError } = await insforge.database
      .from('order_batch_items')
      .update({ status: 'cancelled' })
      .eq('batch_id', safe.id)
      .in('status', ['pending']);  // Only update items that haven't been paid yet

    if (itemError) throw itemError;
  }
}

/* ─── React Hook ────────────────────────────────────────────── */

export interface UseOrderBatchesReturn {
  /** All order batches (from DB), most recent first */
  batches: OrderBatch[];
  /** True while loading from DB */
  isLoading: boolean;
  /** Error message if load failed */
  loadError: string | null;
  /** Create a new order batch */
  createBatch: (data: NewOrderBatchData) => Promise<OrderBatch>;
  /** Advance status: pending → paid, paid → none */
  advanceStatus: (id: string) => Promise<void>;
  /** Cancel/delete an order batch (sets status to cancelled) */
  cancelBatch: (id: string) => Promise<void>;
  /** Set a specific status */
  setStatus: (id: string, status: OrderBatchStatus) => Promise<void>;
  /** Refetch from DB */
  refresh: () => Promise<void>;
}

export function useOrderBatches(): UseOrderBatchesReturn {
  const [batches, setBatches] = useState<OrderBatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await fetchOrderBatchesFromDb();
      setBatches(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load order batches';
      setLoadError(msg);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setIsLoading(true);
      try {
        const data = await fetchOrderBatchesFromDb();
        if (!cancelled) setBatches(data);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load order batches');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const createBatch = useCallback(async (data: NewOrderBatchData): Promise<OrderBatch> => {
    const created = await createOrderBatchInDb(data);
    setBatches(prev => [created, ...prev]);
    return created;
  }, []);

  const advanceStatus = useCallback(async (id: string) => {
    const batch = batches.find(b => b.id === id);
    if (!batch) return;

    const flow: Record<OrderBatchStatus, OrderBatchStatus | null> = {
      pending: 'paid',
      partial: 'paid',
      paid: null,
      cancelled: null,
    };

    const nextStatus = flow[batch.status];
    if (!nextStatus) throw new Error('No further status to advance to');

    await updateOrderBatchStatusInDb(id, nextStatus);
    setBatches(prev => prev.map(b => b.id === id ? { ...b, status: nextStatus! } : b));
  }, [batches]);

  const cancelBatch = useCallback(async (id: string) => {
    await updateOrderBatchStatusInDb(id, 'cancelled');
    setBatches(prev => prev.map(b => b.id === id ? { ...b, status: 'cancelled' } : b));
  }, []);

  const setStatus = useCallback(async (id: string, status: OrderBatchStatus) => {
    await updateOrderBatchStatusInDb(id, status);
    setBatches(prev => prev.map(b => b.id === id ? { ...b, status } : b));
  }, []);

  return { batches, isLoading, loadError, createBatch, advanceStatus, cancelBatch, setStatus, refresh };
}
