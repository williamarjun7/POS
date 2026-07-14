/**
 * React Query hooks for the menu domain.
 *
 * Every hook wraps the corresponding raw API function from
 * `./menu.ts` and handles cache invalidation on mutations.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getMenuCategories,
  getMenuItems,
  getMenuItem,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  toggleMenuItemAvailability,
  createMenuCategory,
  deleteMenuCategory,
} from './menu'
import { menuKeys } from '@/lib/core/query-keys'
import type { MenuItem, MenuCategory } from '@/types'
import type {
  CreateMenuItemDto,
  UpdateMenuItemDto,
  CreateMenuCategoryDto,
  MenuItemQueryParams,
  PaginatedResponse,
} from './types'

// ─── Queries ────────────────────────────────────────────────

export function useMenuCategories() {
  return useQuery<MenuCategory[]>({
    queryKey: menuKeys.categories(),
    queryFn: getMenuCategories,
  })
}

export function useMenuItems(params?: MenuItemQueryParams) {
  return useQuery<PaginatedResponse<MenuItem>>({
    queryKey: menuKeys.list(params),
    queryFn: () => getMenuItems(params),
  })
}

export function useMenuItem(id: string) {
  return useQuery<MenuItem>({
    queryKey: menuKeys.detail(id),
    queryFn: () => getMenuItem(id),
    enabled: !!id,
  })
}

// ─── Mutations ──────────────────────────────────────────────

export function useCreateMenuItem() {
  const queryClient = useQueryClient()

  return useMutation<MenuItem, Error, CreateMenuItemDto>({
    mutationFn: (data) => createMenuItem(data),
    onSuccess: () => {
      // Invalidate all menu item lists so they refetch
      queryClient.invalidateQueries({ queryKey: menuKeys.lists() })
    },
  })
}

export function useUpdateMenuItem() {
  const queryClient = useQueryClient()

  return useMutation<MenuItem, Error, { id: string; data: UpdateMenuItemDto }>({
    mutationFn: ({ id, data }) => updateMenuItem(id, data),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: menuKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: menuKeys.lists() })
    },
  })
}

export function useDeleteMenuItem() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, string>({
    mutationFn: (id) => deleteMenuItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: menuKeys.lists() })
    },
  })
}

export function useToggleMenuItemAvailability() {
  const queryClient = useQueryClient()

  return useMutation<MenuItem, Error, string>({
    mutationFn: (id) => toggleMenuItemAvailability(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: menuKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: menuKeys.lists() })
    },
  })
}

export function useCreateMenuCategory() {
  const queryClient = useQueryClient()

  return useMutation<MenuCategory, Error, CreateMenuCategoryDto>({
    mutationFn: (data) => createMenuCategory(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: menuKeys.categories() })
    },
  })
}

export function useDeleteMenuCategory() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, string>({
    mutationFn: (id) => deleteMenuCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: menuKeys.categories() })
    },
  })
}
