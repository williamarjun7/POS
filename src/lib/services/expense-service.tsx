/**
 * ExpenseService
 * ──────────────
 * DB-backed CRUD for business expenses (utilities, supplies, etc.).
 *
 * Table: public.expenses
 * RLS: authenticated users can SELECT, INSERT
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { insforge } from '@/lib/services/auth-service';
import type { ExpenseCategory, PaymentMethod } from '@/types';
import type { ExpenseRow } from '@/lib/db/types';

/* ─── Frontend Expense type (camelCase) ────────────────────── */

export interface Expense {
  id: string;
  description: string;
  category: ExpenseCategory;
  amount: number;
  date: string;
  paymentMethod: PaymentMethod;
  recordedBy: string;
  notes?: string;
  vendor?: string;
  receiptNumber?: string;
}

/* ─── Mapper helpers ────────────────────────────────────────── */

function rowToExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    description: row.description,
    category: row.category,
    amount: Number(row.amount),
    date: row.date,
    paymentMethod: row.payment_method as PaymentMethod,
    recordedBy: row.recorded_by ?? '',
    notes: row.notes ?? undefined,
    vendor: row.vendor ?? undefined,
    receiptNumber: row.receipt_number ?? undefined,
  };
}

export interface NewExpenseData {
  description: string;
  category: ExpenseCategory;
  amount: number;
  paymentMethod: PaymentMethod;
  notes?: string;
  recordedBy?: string;
  vendor?: string;
  receiptNumber?: string;
}

/* ─── DB operations ─────────────────────────────────────────── */

async function fetchExpensesFromDb(): Promise<Expense[]> {
  const { data, error } = await insforge.database
    .from('expenses')
    .select('*')
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row: unknown) => rowToExpense(row as ExpenseRow));
}

async function createExpenseInDb(data: NewExpenseData): Promise<Expense> {
  const { data: inserted, error } = await insforge.database
    .from('expenses')
    .insert([
      {
        description: data.description,
        category: data.category,
        amount: data.amount,
        // date is NOT sent — database uses DEFAULT CURRENT_DATE
        payment_method: data.paymentMethod,
        notes: data.notes ?? null,
        recorded_by: data.recordedBy ?? null,
        vendor: data.vendor ?? null,
        receipt_number: data.receiptNumber ?? null,
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return rowToExpense(inserted as ExpenseRow);
}

/* ─── React Query Keys ────────────────────────────────────── */

const expenseKeys = {
  all: ['expenses'] as const,
}

/* ─── React Hook ────────────────────────────────────────────── */

export interface UseExpensesReturn {
  /** All expenses (from DB), sorted by date desc */
  expenses: Expense[];
  /** True while loading from DB */
  isLoading: boolean;
  /** Error message if load failed */
  loadError: string | null;
  /** Add a new expense (saves to DB, invalidates caches) */
  addExpense: (data: NewExpenseData) => Promise<void>;
  /** Update an existing expense */
  updateExpense: (id: string, data: Partial<NewExpenseData>) => Promise<void>;
  /** Delete an expense */
  deleteExpense: (id: string) => Promise<void>;
  /** Refetch from DB */
  refresh: () => Promise<void>;
}

export function useExpenses(): UseExpensesReturn {
  const queryClient = useQueryClient()

  const {
    data: expenses = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: expenseKeys.all,
    queryFn: fetchExpensesFromDb,
    staleTime: 30_000,
  })

  const loadError = error instanceof Error ? error.message : null

  const addMutation = useMutation({
    mutationFn: createExpenseInDb,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expenseKeys.all })
      queryClient.invalidateQueries({ queryKey: ['finance'] })
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'report'] })
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<NewExpenseData> }) => {
      const payload: Record<string, unknown> = {};
      if (data.description !== undefined) payload.description = data.description;
      if (data.category !== undefined) payload.category = data.category;
      if (data.amount !== undefined) payload.amount = data.amount;
      // date is intentionally excluded — DB uses DEFAULT CURRENT_DATE
      if (data.paymentMethod !== undefined) payload.payment_method = data.paymentMethod;
      if (data.notes !== undefined) payload.notes = data.notes;
      if (data.vendor !== undefined) payload.vendor = data.vendor;
      if (data.receiptNumber !== undefined) payload.receipt_number = data.receiptNumber;

      const { error } = await insforge.database
        .from('expenses')
        .update(payload)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expenseKeys.all })
      queryClient.invalidateQueries({ queryKey: ['finance'] })
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'report'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await insforge.database
        .from('expenses')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expenseKeys.all })
      queryClient.invalidateQueries({ queryKey: ['finance'] })
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'report'] })
    },
  })

  const addExpense = async (data: NewExpenseData) => {
    await addMutation.mutateAsync(data)
  }

  const updateExpense = async (id: string, data: Partial<NewExpenseData>) => {
    await updateMutation.mutateAsync({ id, data })
  }

  const deleteExpense = async (id: string) => {
    await deleteMutation.mutateAsync(id)
  }

  return {
    expenses,
    isLoading,
    loadError,
    addExpense,
    updateExpense,
    deleteExpense,
    refresh: refetch,
  }
}
