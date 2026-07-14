/**
 * Menu Database Operations
 * ─────────────────────────
 *
 * Domain-specific CRUD for menu categories and items using the
 * new schema (slug, display_order, is_active, options JSONB, etc.).
 *
 * React Query hooks are in src/lib/api/menu.hooks.ts (unchanged).
 */

import { insforge } from '@/lib/services/auth-service'
import type { MenuItemRow, MenuCategoryRow } from './types'
import type {
  CreateMenuItemDto,
  UpdateMenuItemDto,
  CreateMenuCategoryDto,
  MenuItemQueryParams,
  PaginatedResponse,
} from '@/lib/api/types'
import type { MenuCategory, MenuItem } from '@/types'

// ─── Bucket name used for all menu item images ──────────────

const MENU_IMAGE_BUCKET = 'menu-images'

// ─── Icon mapping (slug → lucide icon name) ────────────────
//
// Each slug maps to a semantically appropriate icon. Add new lucide
// icons to src/components/icon-mapper.tsx when needed.

const CATEGORY_ICONS: Record<string, string> = {
  'bakery-desserts': 'ChefHat',          // 🧑‍🍳 baking, pastries
  'beverages': 'GlassWater',           // 🥛 general beverages in a glass
  'cigarettes': 'Cigarette',            // 🚬 tobacco products
  'espresso-based-coffee': 'Coffee',    // ☕ hot coffee drinks
  'hookah': 'Flame',                    // 🔥 hookah coal / heat
  'iced-speciality-coffee': 'CupSoda',  // 🧋 iced coffee with straw/ice
  'refreshers': 'Citrus',               // 🍋 fresh, zesty drinks (mojitos, lemonade, iced tea)              // 🥤 mojitos, iced tea, lemonade
  'shakes-lassi': 'Milk',               // 🥛 milk-based shakes & lassi
  'soft-drinks-water-energy': 'Droplets', // 💧 water, soda, energy drinks
  'tea-coffee-alternatives': 'Leaf',    // 🍵 tea, herbal infusions
}

function slugToIcon(slug: string): string {
  return CATEGORY_ICONS[slug] ?? 'UtensilsCrossed'
}

// ─── Row → Frontend type helpers ───────────────────────────

function rowToCategory(row: MenuCategoryRow): MenuCategory {
  return {
    id: row.id,
    name: row.name,
    itemCount: 0, // computed client-side
    icon: slugToIcon(row.slug),
  }
}

function rowToMenuItem(
  row: MenuItemRow,
  categoriesMap?: Map<string, string>,
): MenuItem {
  const categoryName = categoriesMap?.get(row.category_id) ?? row.category_id
  return {
    id: row.id,
    name: row.name,
    category: categoryName,
    price: Number(row.price),
    description: row.description ?? '',
    available: row.is_available,
    image: row.image_url ?? undefined,
    prepTime: undefined, // prep_time removed from new schema
    tags: [],
  }
}

// ─── Categories ────────────────────────────────────────────

export async function getMenuCategories(): Promise<MenuCategory[]> {
  const { data, error } = await insforge.database
    .from('menu_categories')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true })

  if (error) throw error
  return (data ?? []).map(rowToCategory)
}

export async function createMenuCategory(
  dto: CreateMenuCategoryDto,
): Promise<MenuCategory> {
  const slug = dto.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

  const { data, error } = await insforge.database
    .from('menu_categories')
    .insert([{ name: dto.name, slug, display_order: 99 }])
    .select()
    .single()

  if (error) throw error
  return rowToCategory(data as unknown as MenuCategoryRow)
}

export async function deleteMenuCategory(id: string): Promise<void> {
  // Soft-delete: set is_active = false instead of hard delete
  const { error } = await insforge.database
    .from('menu_categories')
    .update({ is_active: false })
    .eq('id', id)

  if (error) throw error
}

// ─── Menu Items ────────────────────────────────────────────

export async function getMenuItems(
  params?: MenuItemQueryParams,
): Promise<PaginatedResponse<MenuItem>> {
  // Fetch categories for name mapping
  const { data: cats } = await insforge.database
    .from('menu_categories')
    .select('id, name')

  const catMap = new Map<string, string>(
    (cats ?? []).map((c: { id: string; name: string }) => [c.id, c.name]),
  )

  // Build query
  let query = insforge.database
    .from('menu_items')
    .select('*', { count: 'exact' })
    .eq('is_active', true)

  if (params?.category) {
    query = query.eq('category_id', params.category)
  }
  if (params?.available !== undefined) {
    query = query.eq('is_available', params.available)
  }
  if (params?.search) {
    query = query.ilike('name', `%${params.search}%`)
  }

  // Ordering
  const sortBy = params?.sortBy ?? 'display_order'
  const sortOrder = params?.sortOrder ?? 'asc'
  query = query.order(sortBy, { ascending: sortOrder === 'asc' })

  // Pagination
  const page = params?.page ?? 1
  const pageSize = params?.pageSize ?? 999
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  query = query.range(from, to)

  const { data, error, count } = await query

  if (error) throw error

  const items = (data ?? []).map((row: unknown) =>
    rowToMenuItem(row as MenuItemRow, catMap),
  )

  return {
    data: items,
    total: count ?? items.length,
    page,
    pageSize,
    totalPages: count ? Math.ceil(count / pageSize) : 1,
  }
}

export async function getMenuItem(id: string): Promise<MenuItem> {
  const { data, error } = await insforge.database
    .from('menu_items')
    .select('*, menu_categories!inner(name)')
    .eq('id', id)
    .single()

  if (error) throw error

  const row = data as unknown as MenuItemRow & {
    menu_categories?: { name: string }
  }
  return {
    id: row.id,
    name: row.name,
    category: (row as any).menu_categories?.name ?? row.category_id,
    price: Number(row.price),
    description: row.description ?? '',
    available: row.is_available,
    image: row.image_url ?? undefined,
    prepTime: undefined,
    tags: [],
  }
}

export async function createMenuItem(
  dto: CreateMenuItemDto,
): Promise<MenuItem> {
  const { data, error } = await insforge.database
    .from('menu_items')
    .insert([
      {
        name: dto.name,
        description: dto.description ?? '',
        price: dto.price,
        category_id: dto.category,
        is_available: dto.available ?? true,
        image_url: dto.image ?? null,
      },
    ])
    .select()
    .single()

  if (error) throw error
  return rowToMenuItem(data as unknown as MenuItemRow)
}

export async function updateMenuItem(
  id: string,
  dto: UpdateMenuItemDto,
): Promise<MenuItem> {
  const updates: Record<string, unknown> = {}

  if (dto.name !== undefined) updates.name = dto.name
  if (dto.description !== undefined) updates.description = dto.description
  if (dto.price !== undefined) updates.price = dto.price
  if (dto.category !== undefined) updates.category_id = dto.category
  if (dto.available !== undefined) updates.is_available = dto.available
  if (dto.image !== undefined) updates.image_url = dto.image

  const { data, error } = await insforge.database
    .from('menu_items')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return rowToMenuItem(data as unknown as MenuItemRow)
}

export async function deleteMenuItem(id: string): Promise<void> {
  // Soft-delete: set is_active = false
  const { error } = await insforge.database
    .from('menu_items')
    .update({ is_active: false })
    .eq('id', id)

  if (error) throw error
}

export async function toggleMenuItemAvailability(
  id: string,
): Promise<MenuItem> {
  // Fetch current state
  const { data: current, error: fetchError } = await insforge.database
    .from('menu_items')
    .select('is_available')
    .eq('id', id)
    .single()

  if (fetchError) throw fetchError

  const { data, error } = await insforge.database
    .from('menu_items')
    .update({
      is_available: !(current as { is_available: boolean }).is_available,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return rowToMenuItem(data as unknown as MenuItemRow)
}

// ─── Image Upload / Delete ──────────────────────────────────

/**
 * Upload an image file to the menu-images bucket.
 * Returns the public URL to store in menu_items.image_url.
 */
export async function uploadItemImage(file: File): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'jpg'
  const path = `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

  const { data, error } = await insforge.storage
    .from(MENU_IMAGE_BUCKET)
    .upload(path, file)

  if (error) throw error
  return (data as { url: string }).url
}

/**
 * Extract the storage key from a full public URL and delete
 * the file from the menu-images bucket. Safe to call even if
 * the URL is empty or malformed.
 */
export async function deleteItemImage(imageUrl: string): Promise<void> {
  if (!imageUrl) return

  // The URL format is: {baseUrl}/storage/v1/object/public/menu-images/{key}
  // We extract the key portion after the bucket name.
  const key = imageUrl.split(`/${MENU_IMAGE_BUCKET}/`)[1]
  if (!key) return

  const { error } = await insforge.storage
    .from(MENU_IMAGE_BUCKET)
    .remove(key)

  if (error) throw error
}
