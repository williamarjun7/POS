/**
 * Shared API types for the backend service layer.
 *
 * These types are used across all API endpoint modules for
 * request/response typing, pagination, and DTOs.
 */

// ─── Standard Response Wrappers ────────────────────────────

export interface ApiResponse<T> {
  data: T
  message?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// ─── Error Types ──────────────────────────────────────────

export interface ApiErrorData {
  message: string
  code?: string
  details?: Record<string, string[]>
}

// ─── Query / Pagination Params ────────────────────────────

export interface PaginationParams {
  page?: number
  pageSize?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

// ─── Menu DTOs ────────────────────────────────────────────

export interface CreateMenuItemDto {
  name: string
  category: string
  price: number
  description?: string
  available?: boolean
  image?: string
  prepTime?: number
  tags?: string[]
}

export interface UpdateMenuItemDto {
  name?: string
  category?: string
  price?: number
  description?: string
  available?: boolean
  image?: string
  prepTime?: number
  tags?: string[]
}

export interface CreateMenuCategoryDto {
  name: string
  icon: string
}

export interface MenuItemQueryParams extends PaginationParams {
  category?: string
  search?: string
  available?: boolean
  tags?: string[]
}
