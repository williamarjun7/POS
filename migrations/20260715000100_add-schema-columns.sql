-- ============================================================================
-- MIGRATION: Add Missing Columns to Match TypeScript Types (2026-07-15)
-- ────────────────────────────────────────────────────────────────────────────
-- The TypeScript interfaces in src/lib/db/types.ts define columns that were
-- added in a schema redesign (slug, display_order, is_active, options JSONB,
-- image_url, is_available) but the initial complete-schema.sql created the
-- old-column versions (icon, sort_order, available, image, prep_time, tags).
--
-- This migration adds all missing columns safely (IF NOT EXISTS), creates
-- indexes, and adds descriptive comments. Only uses idempotent DDL to be
-- compatible with databases that may already have been manually updated.
--
-- Affected tables:
--   menu_categories  → adds slug, display_order, is_active
--   menu_items       → adds options, image_url, display_order, is_available, is_active
--   inventory_items  → adds is_active
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. menu_categories
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.menu_categories
  ADD COLUMN IF NOT EXISTS slug TEXT;

ALTER TABLE public.menu_categories
  ALTER COLUMN slug SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_menu_categories_slug
  ON public.menu_categories (slug);

ALTER TABLE public.menu_categories
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_menu_categories_display_order
  ON public.menu_categories (display_order);

ALTER TABLE public.menu_categories
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_menu_categories_active
  ON public.menu_categories (is_active);

COMMENT ON COLUMN public.menu_categories.slug IS 'URL-friendly unique identifier (used for icon mapping in the POS)';
COMMENT ON COLUMN public.menu_categories.display_order IS 'Sort order in the POS category sidebar';
COMMENT ON COLUMN public.menu_categories.is_active IS 'Soft-delete flag — inactive categories are hidden from the POS';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. menu_items
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS options JSONB;

COMMENT ON COLUMN public.menu_items.options IS 'JSON object for item-level customizations (e.g. flavour options, serving choices)';

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS image_url TEXT;

COMMENT ON COLUMN public.menu_items.image_url IS 'Public URL of the menu item image (stored in menu-images bucket)';

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_menu_items_display_order
  ON public.menu_items (display_order);

COMMENT ON COLUMN public.menu_items.display_order IS 'Sort order within a category';

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS is_available BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_menu_items_is_available
  ON public.menu_items (is_available);

COMMENT ON COLUMN public.menu_items.is_available IS 'Whether the item is currently available for ordering (replaces old available column)';

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_menu_items_active
  ON public.menu_items (is_active);

COMMENT ON COLUMN public.menu_items.is_active IS 'Soft-delete flag — inactive items are hidden from the POS';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. inventory_items
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_inventory_items_active
  ON public.inventory_items (is_active);

COMMENT ON COLUMN public.inventory_items.is_active IS 'Soft-delete flag — inactive items are hidden from inventory views';

-- ────────────────────────────────────────────────────────────────────────────
-- 4. customers
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_customers_active
  ON public.customers (is_active);

-- ============================================================================
-- VERIFICATION QUERIES (run after migration)
-- ============================================================================
--
-- 1. Check all new columns exist:
--    SELECT table_name, column_name, data_type, is_nullable, column_default
--    FROM information_schema.columns
--    WHERE table_schema = 'public'
--      AND table_name IN ('menu_categories', 'menu_items', 'inventory_items', 'customers')
--      AND column_name IN ('slug', 'display_order', 'is_active', 'options', 'image_url', 'is_available')
--    ORDER BY table_name, ordinal_position;
