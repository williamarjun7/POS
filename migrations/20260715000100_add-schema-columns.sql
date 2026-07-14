-- ============================================================================
-- MIGRATION: Add Missing Columns to Match TypeScript Types (2026-07-15)
-- ────────────────────────────────────────────────────────────────────────────
-- The TypeScript interfaces in src/lib/db/types.ts define columns that were
-- added in a schema redesign (slug, display_order, is_active, options JSONB,
-- image_url, is_available) but the initial complete-schema.sql created the
-- old-column versions (icon, sort_order, available, image, prep_time, tags).
--
-- This migration adds all missing columns safely (IF NOT EXISTS), migrates
-- existing data, creates indexes, and preserves the old columns for
-- backward compatibility.
--
-- Affected tables:
--   menu_categories  → adds slug, display_order, is_active
--   menu_items       → adds options, image_url, display_order, is_available, is_active
--   inventory_items  → adds is_active
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. menu_categories
-- ────────────────────────────────────────────────────────────────────────────
-- SQL schema has:   id, name, icon, sort_order, created_at, updated_at
-- TypeScript needs: id, name, slug, display_order, is_active, created_at, updated_at

ALTER TABLE public.menu_categories
  ADD COLUMN IF NOT EXISTS slug TEXT;

-- Populate slug from the icon column (existing icon values are readable names
-- like 'Coffee', 'Droplets', 'Sparkles') or fall back to a slugified name.
UPDATE public.menu_categories
SET slug = lower(regexp_replace(icon, '[^a-zA-Z0-9]+', '-', 'g'))
WHERE slug IS NULL AND icon IS NOT NULL AND icon != '';

UPDATE public.menu_categories
SET slug = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))
WHERE slug IS NULL;

-- Make slug NOT NULL and unique after populating
ALTER TABLE public.menu_categories
  ALTER COLUMN slug SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_menu_categories_slug
  ON public.menu_categories (slug);

-- Add display_order, populated from the existing sort_order column
ALTER TABLE public.menu_categories
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;

UPDATE public.menu_categories
SET display_order = sort_order
WHERE sort_order IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_menu_categories_display_order
  ON public.menu_categories (display_order);

-- Add is_active (soft-delete support)
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
-- SQL schema has:   id, name, description, price, category_id, prep_time,
--                   available, image, tags[], created_at, updated_at
-- TypeScript needs: id, category_id, name, description, price, options,
--                   image_url, display_order, is_available, is_active,
--                   created_at, updated_at

-- Add options JSONB for item customizations (e.g., flavour choices)
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS options JSONB;

COMMENT ON COLUMN public.menu_items.options IS 'JSON object for item-level customizations (e.g. flavour options, serving choices)';

-- Add image_url, populated from the existing image column
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS image_url TEXT;

UPDATE public.menu_items
SET image_url = image
WHERE image IS NOT NULL AND image != ''
  AND (image_url IS NULL OR image_url = '');

COMMENT ON COLUMN public.menu_items.image_url IS 'Public URL of the menu item image (stored in menu-images bucket)';

-- Add display_order for sorting items within a category
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_menu_items_display_order
  ON public.menu_items (display_order);

COMMENT ON COLUMN public.menu_items.display_order IS 'Sort order within a category';

-- Add is_available, populated from the existing available column
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS is_available BOOLEAN NOT NULL DEFAULT true;

UPDATE public.menu_items
SET is_available = available
WHERE available IS NOT NULL
  AND is_available IS DISTINCT FROM available;

CREATE INDEX IF NOT EXISTS idx_menu_items_is_available
  ON public.menu_items (is_available);

COMMENT ON COLUMN public.menu_items.is_available IS 'Whether the item is currently available for ordering (replaces old available column)';

-- Add is_active (soft-delete support)
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_menu_items_active
  ON public.menu_items (is_active);

COMMENT ON COLUMN public.menu_items.is_active IS 'Soft-delete flag — inactive items are hidden from the POS';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. inventory_items
-- ────────────────────────────────────────────────────────────────────────────
-- SQL schema has:   id, name, category, current_stock, min_stock, unit,
--                   cost_per_unit, supplier_id, last_restocked, created_at,
--                   updated_at
-- TypeScript needs: all of the above PLUS is_active

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_inventory_items_active
  ON public.inventory_items (is_active);

COMMENT ON COLUMN public.inventory_items.is_active IS 'Soft-delete flag — inactive items are hidden from inventory views';

-- ────────────────────────────────────────────────────────────────────────────
-- 4. customers (optional — good practice for consistency)
-- ────────────────────────────────────────────────────────────────────────────
-- The CustomerRow type does NOT yet include is_active, but adding it here
-- enables future soft-delete support for customers without a schema change.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_customers_active
  ON public.customers (is_active);

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
--
-- Run these after migration to verify:
--
-- 1. Check all new columns exist:
--    SELECT table_name, column_name, data_type, is_nullable, column_default
--    FROM information_schema.columns
--    WHERE table_schema = 'public'
--      AND table_name IN ('menu_categories', 'menu_items', 'inventory_items', 'customers')
--      AND column_name IN ('slug', 'display_order', 'is_active', 'options', 'image_url', 'is_available')
--    ORDER BY table_name, ordinal_position;
--
-- 2. Verify slug was populated correctly:
--    SELECT id, name, icon, slug FROM public.menu_categories ORDER BY display_order;
--
-- 3. Verify is_available was populated from available:
--    SELECT COUNT(*) AS mismatched FROM public.menu_items
--    WHERE is_available IS DISTINCT FROM available;
--
-- 4. Check is_active defaults are applied:
--    SELECT table_name, COUNT(*) AS total, COUNT(*) FILTER (WHERE is_active) AS active
--    FROM (
--      SELECT 'menu_categories' AS table_name, is_active FROM public.menu_categories
--      UNION ALL
--      SELECT 'menu_items', is_active FROM public.menu_items
--      UNION ALL
--      SELECT 'inventory_items', is_active FROM public.inventory_items
--      UNION ALL
--      SELECT 'customers', is_active FROM public.customers
--    ) sub
--    GROUP BY table_name;
