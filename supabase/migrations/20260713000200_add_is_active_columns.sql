-- ============================================================================
-- Migration: Add is_active columns for soft-delete support
-- Date: July 13, 2026
-- ============================================================================
--
-- The inventory_items and menu_items tables need is_active columns to properly
-- support soft-delete operations. Previously, the code was filtering by
-- { is_active: true } which was silently ignored by PostgREST since the
-- column didn't exist in the schema.
-- ============================================================================

-- ─── Inventory Items: Add is_active column ────────────────────────────────

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_inventory_items_active
  ON public.inventory_items(is_active);

-- ─── Menu Items: Match MenuItemRow type which already defines is_active ───

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_menu_items_active
  ON public.menu_items(is_active);

-- ─── Customers: Add is_active for consistency (optional but good practice) ─

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_customers_active
  ON public.customers(is_active);

-- ─── Update existing RLS policies to include new columns ──────────────────
-- (No policy changes needed since auth_all policies already grant full access)

-- ─── Update InventoryItemRow type in src/lib/db/types.ts will need ────────
--  is_active: boolean
-- added to the interface. This is handled in the TypeScript layer separately.
