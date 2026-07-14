/**
 * SupplierPaymentService
 * ──────────────────────
 * DB-backed CRUD for supplier payments.
 *
 * Table: public.supplier_payments
 * RLS: authenticated users can SELECT, INSERT, DELETE
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { insforge } from '@/lib/services/auth-service';
import type { SupplierPaymentRow } from '@/lib/db/types';

/* ─── Frontend SupplierPayment type (camelCase) ────────────── */

export interface SupplierPayment {
  id: string;
  supplierId: string;
  supplierName: string;
  amount: number;
  paymentMethod: string;
  reference: string;
  paymentDate: string;
  notes: string;
  createdAt: string;
}

/* ─── Mapper helper ────────────────────────────────────────── */

function rowToSupplierPayment(row: SupplierPaymentRow): SupplierPayment {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    amount: Number(row.amount),
    paymentMethod: row.payment_method,
    reference: row.reference,
    paymentDate: row.payment_date,
    notes: row.notes ?? '',
    createdAt: row.created_at,
  };
}

export interface NewSupplierPaymentData {
  supplierId: string;
  supplierName: string;
  amount: number;
  paymentMethod: string;
  reference: string;
  paymentDate: string;
  notes?: string;
}

/* ─── DB operations ─────────────────────────────────────────── */

async function fetchSupplierPaymentsFromDb(): Promise<SupplierPayment[]> {
  const { data, error } = await insforge.database
    .from('supplier_payments')
    .select('*')
    .order('payment_date', { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row: unknown) => rowToSupplierPayment(row as SupplierPaymentRow));
}

async function fetchSupplierPaymentsBySupplierFromDb(supplierId: string): Promise<SupplierPayment[]> {
  const { data, error } = await insforge.database
    .from('supplier_payments')
    .select('*')
    .eq('supplier_id', supplierId)
    .order('payment_date', { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row: unknown) => rowToSupplierPayment(row as SupplierPaymentRow));
}

async function createSupplierPaymentInDb(data: NewSupplierPaymentData): Promise<SupplierPayment> {
  const { data: inserted, error } = await insforge.database
    .from('supplier_payments')
    .insert([
      {
        supplier_id: data.supplierId,
        supplier_name: data.supplierName,
        amount: data.amount,
        payment_method: data.paymentMethod,
        reference: data.reference,
        payment_date: data.paymentDate,
        notes: data.notes ?? null,
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return rowToSupplierPayment(inserted as SupplierPaymentRow);
}

async function deleteSupplierPaymentFromDb(id: string): Promise<void> {
  const { error } = await insforge.database
    .from('supplier_payments')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

/* ─── React Query Keys ────────────────────────────────────── */

const supplierPaymentKeys = {
  all: ['supplier_payments'] as const,
  bySupplier: (supplierId: string) => ['supplier_payments', 'by_supplier', supplierId] as const,
}

/* ─── Cached by-supplier query hook ─────────────────────────── */

/**
 * Fetch payments for a specific supplier, cached via React Query.
 * Only enabled when `supplierId` is truthy.
 */
export function useSupplierPaymentsBySupplier(supplierId: string) {
  return useQuery({
    queryKey: supplierPaymentKeys.bySupplier(supplierId),
    queryFn: () => fetchSupplierPaymentsBySupplierFromDb(supplierId),
    enabled: !!supplierId,
    staleTime: 30_000,
  })
}

/* ─── React Hook ────────────────────────────────────────────── */

export interface UseSupplierPaymentsReturn {
  /** All supplier payments (from DB) */
  payments: SupplierPayment[];
  /** True while loading from DB */
  isLoading: boolean;
  /** Error message if load failed */
  loadError: string | null;
  /** Create a new supplier payment */
  addPayment: (data: NewSupplierPaymentData) => Promise<SupplierPayment>;
  /** Delete a supplier payment */
  removePayment: (id: string) => Promise<void>;
  /** Get payments for a specific supplier (non-cached, always fetches fresh) */
  getPaymentsBySupplier: (supplierId: string) => Promise<SupplierPayment[]>;
  /** Refetch from DB */
  refresh: () => void;
}

export function useSupplierPayments(): UseSupplierPaymentsReturn {
  const queryClient = useQueryClient()

  const {
    data: payments = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: supplierPaymentKeys.all,
    queryFn: fetchSupplierPaymentsFromDb,
    staleTime: 30_000,
  })

  const loadError = error instanceof Error ? error.message : null

  const addMutation = useMutation({
    mutationFn: createSupplierPaymentInDb,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: supplierPaymentKeys.all })
      queryClient.invalidateQueries({ queryKey: ['finance'] })
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteSupplierPaymentFromDb,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: supplierPaymentKeys.all })
      queryClient.invalidateQueries({ queryKey: ['finance'] })
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
    },
  })

  const addPayment = async (data: NewSupplierPaymentData): Promise<SupplierPayment> => {
    return addMutation.mutateAsync(data)
  }

  const removePayment = async (id: string): Promise<void> => {
    await deleteMutation.mutateAsync(id)
  }

  const getPaymentsBySupplier = async (supplierId: string): Promise<SupplierPayment[]> => {
    return queryClient.fetchQuery({
      queryKey: supplierPaymentKeys.bySupplier(supplierId),
      queryFn: () => fetchSupplierPaymentsBySupplierFromDb(supplierId),
      staleTime: 30_000,
    })
  }

  return {
    payments,
    isLoading,
    loadError,
    addPayment,
    removePayment,
    getPaymentsBySupplier,
    refresh: refetch,
  }
}
