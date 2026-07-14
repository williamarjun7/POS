/**
 * Menu API — endpoint functions for categories & menu items.
 *
 * Now delegates to the InsForge SDK-based db layer.
 * React Query hooks live in `./menu.hooks.ts`.
 *
 * This file re-exports from @/lib/db/menu for backward compatibility.
 * New code should import directly from '@/lib/db'.
 */

export {
  getMenuCategories,
  getMenuItems,
  getMenuItem,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  toggleMenuItemAvailability,
  createMenuCategory,
  deleteMenuCategory,
} from '@/lib/db/menu'

export type {
  CreateMenuItemDto,
  UpdateMenuItemDto,
  CreateMenuCategoryDto,
  MenuItemQueryParams,
  PaginatedResponse,
} from './types'
