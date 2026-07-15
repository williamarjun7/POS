/**
 * React Query hooks for the menu domain.
 *
 * Multi-layer cache strategy:
 *   1. React Query in-memory cache (instant, per-session)
 *   2. IndexedDB persistent cache (survives page reload, 5 min TTL)
 *   3. Network fetch (source of truth)
 *
 * POS reads from layers 1→2→3 automatically.
 * Dashboard prefetches both queries on mount.
 */

import { useEffect } from 'react'
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query'
import {
  getMenuCategories as fetchMenuCategories,
  getMenuItems as fetchMenuItems,
  getMenuItem,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  toggleMenuItemAvailability,
  createMenuCategory,
  deleteMenuCategory,
} from './menu'
import { menuKeys } from '@/lib/core/query-keys'
import { menuCache } from '@/lib/services/menu-cache'
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
    queryFn: async () => {
      // Try IndexedDB first
      const cached = await menuCache.getCategories()
      if (cached) {
        // Return cached, refresh in background
        fetchMenuCategories().then((fresh) => menuCache.setCategories(fresh))
        return cached
      }
      // Fetch from network
      const fresh = await fetchMenuCategories()
      menuCache.setCategories(fresh)
      return fresh
    },
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  })
}

export function useMenuItems(params?: MenuItemQueryParams) {
  // Only use cache for the default "all available" query
  const isDefaultQuery =
    !params || (params.available === true && !params.category && !params.search)

  return useQuery<PaginatedResponse<MenuItem>>({
    queryKey: menuKeys.list(params),
    queryFn: async () => {
      if (isDefaultQuery) {
        const cached = await menuCache.getItems()
        if (cached) {
          // Return cached, refresh in background
          fetchMenuItems(params).then((fresh) => menuCache.setItems(fresh.data))
          // Cache stores raw T[] but query type expects PaginatedResponse<T>
          return { data: cached, total: cached.length, page: 1, pageSize: cached.length, totalPages: 1 }
        }
      }
      const fresh = await fetchMenuItems(params)
      if (isDefaultQuery) {
        menuCache.setItems(fresh.data)
      }
      return fresh
    },
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  })
}

export function useMenuItem(id: string) {
  return useQuery<MenuItem>({
    queryKey: menuKeys.detail(id),
    queryFn: () => getMenuItem(id),
    enabled: !!id,
  })
}

// ─── Prefetch helper (call from Dashboard) ──────────────────

export function usePrefetchMenu() {
  const queryClient = useQueryClient()

  useEffect(() => {
    queryClient.prefetchQuery({
      queryKey: menuKeys.categories(),
      queryFn: async () => {
        const cached = await menuCache.getCategories()
        if (cached) {
          fetchMenuCategories().then((fresh) => menuCache.setCategories(fresh))
          return cached
        }
        const fresh = await fetchMenuCategories()
        menuCache.setCategories(fresh)
        return fresh
      },
      staleTime: 5 * 60 * 1000,
    })

    queryClient.prefetchQuery({
      queryKey: menuKeys.list({ available: true }),
      queryFn: async () => {
        const cached = await menuCache.getItems()
        if (cached) {
          fetchMenuItems({ available: true }).then((fresh) =>
            menuCache.setItems(fresh.data),
          )
          // Cache stores raw T[] but query type expects PaginatedResponse<T>
          return { data: cached, total: cached.length, page: 1, pageSize: cached.length, totalPages: 1 }
        }
        const fresh = await fetchMenuItems({ available: true })
        menuCache.setItems(fresh.data)
        return fresh
      },
      staleTime: 5 * 60 * 1000,
    })
  }, [queryClient])
}

// ─── Mutations ──────────────────────────────────────────────

export function useCreateMenuItem() {
  const queryClient = useQueryClient()

  return useMutation<MenuItem, Error, CreateMenuItemDto>({
    mutationFn: (data) => createMenuItem(data),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: menuKeys.lists() })
      await menuCache.clear()
    },
  })
}

export function useUpdateMenuItem() {
  const queryClient = useQueryClient()

  return useMutation<MenuItem, Error, { id: string; data: UpdateMenuItemDto }>({
    mutationFn: ({ id, data }) => updateMenuItem(id, data),
    onSuccess: async (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: menuKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: menuKeys.lists() })
      await menuCache.clear()
    },
  })
}

export function useDeleteMenuItem() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, string>({
    mutationFn: (id) => deleteMenuItem(id),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: menuKeys.lists() })
      await menuCache.clear()
    },
  })
}

export function useToggleMenuItemAvailability() {
  const queryClient = useQueryClient()

  return useMutation<MenuItem, Error, string>({
    mutationFn: (id) => toggleMenuItemAvailability(id),
    onSuccess: async (_data, id) => {
      queryClient.invalidateQueries({ queryKey: menuKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: menuKeys.lists() })
      await menuCache.clear()
    },
  })
}

export function useCreateMenuCategory() {
  const queryClient = useQueryClient()

  return useMutation<MenuCategory, Error, CreateMenuCategoryDto>({
    mutationFn: (data) => createMenuCategory(data),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: menuKeys.categories() })
      await menuCache.clear()
    },
  })
}

export function useDeleteMenuCategory() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, string>({
    mutationFn: (id) => deleteMenuCategory(id),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: menuKeys.categories() })
      await menuCache.clear()
    },
  })
}
