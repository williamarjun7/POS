/**
 * PaymentService
 * ──────────────
 * DB-backed CRUD for payments.
 *
 * Table: public.payments
 * RLS: authenticated users can SELECT, INSERT
 */

import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { insforge } from '@/lib/services/auth-service';
import { invoiceKeys } from '@/lib/core/query-keys';
import type { PaymentRow } from '@/lib/db/types';
import type { PaymentMethod } from '@/types';
import { paymentSchemas, validateOrThrow } from '@/lib/validation';

/* ─── Frontend Payment type (camelCase) ────────────────────── */

export interface Payment {
  id: string;
  invoiceId: string;
  batchId: string;
  amount: number;
  discount: number;
  paymentMethod: PaymentMethod;
  reference: string;
  customerId: string;
  notes: string;
  userId: string;
  createdAt: string;
}

/* ─── Mapper helper ────────────────────────────────────────── */

function rowToPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    invoiceId: row.invoice_id ?? '',
    batchId: row.batch_id ?? '',
    amount: Number(row.amount),
    discount: Number(row.discount ?? 0),
    paymentMethod: row.payment_method as PaymentMethod,
    reference: row.reference ?? '',
    customerId: row.customer_id ?? '',
    notes: row.notes ?? '',
    userId: row.user_id ?? '',
    createdAt: row.created_at,
  };
}

export interface NewPaymentData {
  invoiceId: string;
  amount: number;
  discount?: number;
  paymentMethod: PaymentMethod;
  reference?: string;
  notes?: string;
  userId?: string;
  customerId?: string;
  batchId?: string;
}

/* ─── DB operations ─────────────────────────────────────────── */

async function fetchPaymentsFromDb(limit?: number): Promise<Payment[]> {
  const query = insforge.database
    .from('payments')
    .select('*')
    .order('created_at', { ascending: false });

  if (limit) query.limit(limit);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row: unknown) => rowToPayment(row as PaymentRow));
}

export async function fetchPaymentsByInvoiceFromDb(invoiceId: string): Promise<Payment[]> {
  const { data, error } = await insforge.database
    .from('payments')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row: unknown) => rowToPayment(row as PaymentRow));
}

export async function createPaymentInDb(data: NewPaymentData): Promise<Payment> {
  // Validate: amount, method, and all required fields via Zod
  const safe = validateOrThrow(paymentSchemas.createPayment, {
    invoiceId: data.invoiceId,
    amount: data.amount,
    discount: data.discount ?? 0,
    paymentMethod: data.paymentMethod,
    reference: data.reference,
    notes: data.notes,
    userId: data.userId,
    customerId: data.customerId,
    batchId: data.batchId,
  })

  const { data: inserted, error } = await insforge.database
    .from('payments')
    .insert([
      {
        invoice_id: safe.invoiceId,
        amount: safe.amount,
        discount: safe.discount,
        payment_method: safe.paymentMethod,
        reference: safe.reference ?? null,
        notes: safe.notes ?? null,
        user_id: safe.userId ?? null,
        customer_id: safe.customerId ?? null,
        batch_id: safe.batchId ?? null,
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return rowToPayment(inserted as PaymentRow);
}

async function removePaymentFromDb(id: string): Promise<void> {
  const safe = validateOrThrow(paymentSchemas.deletePayment, { id })
  const { error } = await insforge.database
    .from('payments')
    .delete()
    .eq('id', safe.id);

  if (error) throw error;
}

/* ─── React Hook ────────────────────────────────────────────── */

export interface UsePaymentsReturn {
  /** All payments (from DB), most recent first */
  payments: Payment[];
  /** True while loading from DB */
  isLoading: boolean;
  /** Error message if load failed */
  loadError: string | null;
  /** Get payments for a specific invoice */
  getPaymentsByInvoice: (invoiceId: string) => Promise<Payment[]>;
  /** Record a new payment (saves to DB, updates local list) */
  recordPayment: (data: NewPaymentData) => Promise<Payment>;
  /** Delete a payment */
  removePayment: (id: string) => Promise<void>;
  /** Refetch from DB */
  refresh: () => Promise<void>;
}

export function usePayments(limit?: number): UsePaymentsReturn {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await fetchPaymentsFromDb(limit);
      setPayments(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load payments';
      setLoadError(msg);
    }
  }, [limit]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setIsLoading(true);
      try {
        const data = await fetchPaymentsFromDb(limit);
        if (!cancelled) setPayments(data);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load payments');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [limit]);

  const getPaymentsByInvoice = useCallback(async (invoiceId: string): Promise<Payment[]> => {
    return fetchPaymentsByInvoiceFromDb(invoiceId);
  }, []);

  const recordPayment = useCallback(async (data: NewPaymentData): Promise<Payment> => {
    const created = await createPaymentInDb(data);
    setPayments(prev => [created, ...prev]);
    return created;
  }, []);

  const removePayment = useCallback(async (id: string) => {
    await removePaymentFromDb(id);
    setPayments(prev => prev.filter(p => p.id !== id));
  }, []);

  return { payments, isLoading, loadError, getPaymentsByInvoice, recordPayment, removePayment, refresh };
}

/* ─── React Query Hooks ───────────────────────────────────── */

import { useMutation, useQueryClient } from '@tanstack/react-query'

/**
 * Fetch the most recent payments using React Query.
 * Key starts with ['finance'] so that `invalidateQueries(['finance'])`
 * triggers a refetch — used by Finance.tsx to stay fresh after POS payments.
 */
export function usePaymentsList(limit?: number) {
  return useQuery<Payment[]>({
    queryKey: ['finance', 'payments', limit ?? 50],
    queryFn: () => fetchPaymentsFromDb(limit),
    staleTime: 10_000,
  })
}

/**
 * Fetch payments for a specific invoice using React Query.
 */
export function useInvoicePayments(invoiceId: string | undefined) {
  return useQuery<Payment[]>({
    queryKey: invoiceKeys.payments(invoiceId ?? '__missing__'),
    queryFn: () => fetchPaymentsByInvoiceFromDb(invoiceId!),
    enabled: !!invoiceId,
    staleTime: 10_000,
  })
}

/**
 * Mutation that records a payment and invalidates all affected caches.
 */
export function useRecordPayment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      invoiceId: string
      amount: number
      paymentMethod: string
      reference?: string
      notes?: string
      userId?: string
    }) => {
      const payment = await createPaymentInDb({
        invoiceId: params.invoiceId,
        amount: params.amount,
        paymentMethod: params.paymentMethod as PaymentMethod,
        reference: params.reference,
        notes: params.notes,
        userId: params.userId,
      })
      return payment
    },
    onSuccess: (_data, variables) => {
      // Invalidate all related caches so Dashboard, Billing, and POS update instantly
      queryClient.invalidateQueries({ queryKey: invoiceKeys.detail(variables.invoiceId) })
      queryClient.invalidateQueries({ queryKey: invoiceKeys.payments(variables.invoiceId) })
      queryClient.invalidateQueries({ queryKey: invoiceKeys.items(variables.invoiceId) })
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'tables'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'report'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'pendingInvoices'] })
      queryClient.invalidateQueries({ queryKey: ['batches'] })
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
      queryClient.invalidateQueries({ queryKey: ['finance'] })
    },
  })
}

/* ─── Standalone helpers ────────────────────────────────────── */

export { fetchPaymentsFromDb };

export async function fetchPaymentsByInvoice(invoiceId: string): Promise<Payment[]> {
  return fetchPaymentsByInvoiceFromDb(invoiceId);
}

export async function recordPaymentSafe(data: NewPaymentData): Promise<Payment | null> {
  try {
    return await createPaymentInDb(data);
  } catch (err) {
    // Log the actual DB error so it's not silently lost
    // DEV-only: log error for debugging without exposing sensitive payment data
    if (import.meta.env.DEV) {
      console.error('[PAYMENT:recordPaymentSafe] Insert failed:', err instanceof Error ? err.message : String(err));
    }
    return null;
  }
}
