/**
 * ExpenseCategoryService
 * ──────────────────────
 * DB-backed CRUD for expense categories.
 *
 * Table: public.expense_categories
 * RLS: all authenticated staff can SELECT, admin/manager can INSERT/UPDATE/DELETE
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { insforge } from '@/lib/db';
import type { ExpenseCategoryRow } from '@/lib/db/types';

/* ─── Frontend type ──────────────────────────────────────── */

export interface ExpenseCategory {
  id: string;
  name: string;
  slug: string;
  description: string;
  isActive: boolean;
  sortOrder: number;
}

function rowToCategory(row: ExpenseCategoryRow): ExpenseCategory {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    isActive: row.is_active,
    sortOrder: row.sort_order,
  };
}

/* ─── Query keys ─────────────────────────────────────────── */

const categoryKeys = {
  all: ['expense-categories'] as const,
};

/* ─── DB operations ──────────────────────────────────────── */

async function fetchCategories(): Promise<ExpenseCategory[]> {
  const { data, error } = await insforge.database
    .from('expense_categories')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row: unknown) => rowToCategory(row as ExpenseCategoryRow));
}

async function createCategory(data: {
  name: string;
  slug: string;
  description?: string;
  sortOrder?: number;
}): Promise<ExpenseCategory> {
  const { data: inserted, error } = await insforge.database
    .from('expense_categories')
    .insert([
      {
        name: data.name,
        slug: data.slug,
        description: data.description ?? '',
        sort_order: data.sortOrder ?? 99,
        is_active: true,
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return rowToCategory(inserted as ExpenseCategoryRow);
}

async function updateCategory(
  id: string,
  data: Partial<{
    name: string;
    slug: string;
    description: string;
    isActive: boolean;
    sortOrder: number;
  }>,
): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (data.name !== undefined) payload.name = data.name;
  if (data.slug !== undefined) payload.slug = data.slug;
  if (data.description !== undefined) payload.description = data.description;
  if (data.isActive !== undefined) payload.is_active = data.isActive;
  if (data.sortOrder !== undefined) payload.sort_order = data.sortOrder;

  const { error } = await insforge.database
    .from('expense_categories')
    .update(payload)
    .eq('id', id);

  if (error) throw error;
}

async function deleteCategory(id: string): Promise<void> {
  const { error } = await insforge.database
    .from('expense_categories')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

/* ─── Slug generation helper ─────────────────────────────── */

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '_')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

/* ─── React hook ─────────────────────────────────────────── */

export interface UseExpenseCategoriesReturn {
  categories: ExpenseCategory[];
  isLoading: boolean;
  loadError: string | null;
  create: (data: { name: string; slug: string; description?: string; sortOrder?: number }) => Promise<void>;
  update: (id: string, data: Partial<{ name: string; slug: string; description: string; isActive: boolean; sortOrder: number }>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  refresh: () => void;
}

export function useExpenseCategories(): UseExpenseCategoriesReturn {
  const queryClient = useQueryClient();

  const {
    data: categories = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: categoryKeys.all,
    queryFn: fetchCategories,
    staleTime: 30_000,
  });

  const loadError = error instanceof Error ? error.message : null;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: categoryKeys.all });
  };

  const createMutation = useMutation({
    mutationFn: createCategory,
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<UseExpenseCategoriesReturn['update']>[1] }) =>
      updateCategory(id, data),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCategory,
    onSuccess: invalidate,
  });

  return {
    categories,
    isLoading,
    loadError,
    create: async (data) => { await createMutation.mutateAsync(data); },
    update: async (id, data) => { await updateMutation.mutateAsync({ id, data }); },
    remove: async (id) => { await deleteMutation.mutateAsync(id); },
    refresh: refetch,
  };
}
