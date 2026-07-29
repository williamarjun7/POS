-- Serving Type & Packaging Support
-- ────────────────────────────────────
-- Adds per-item serving type (dine_in / takeaway) and packaging fee
-- columns to support mixed Dine In + Takeaway orders.
--
-- All new columns have defaults to ensure backward compatibility:
--   - Existing records automatically behave as dine_in with 0 packaging
--   - Old invoices, orders, and payments continue working without migration
--
-- ═══ Migration Safety ═══
--   ✓ All columns are ADDITIVE (no existing columns modified or dropped)
--   ✓ IF NOT EXISTS guards allow safe re-runs
--   ✓ DEFAULT values ensure old code continues to work
--   ✓ No existing data is transformed or migrated

-- ═══════════════════════════════════════════════════════════════
-- 1. menu_items — product-level packaging configuration
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS has_packaging   BOOLEAN       DEFAULT false,
  ADD COLUMN IF NOT EXISTS packaging_fee   DECIMAL(10,2) DEFAULT 0;

COMMENT ON COLUMN public.menu_items.has_packaging
  IS 'Whether this item can be packed for takeaway. Only packable items can have serving_type=takeaway.';
COMMENT ON COLUMN public.menu_items.packaging_fee
  IS 'Per-unit packaging fee charged when serving_type is takeaway.';

-- ═══════════════════════════════════════════════════════════════
-- 2. order_batch_items — per-item serving type at order time
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE public.order_batch_items
  ADD COLUMN IF NOT EXISTS serving_type   TEXT          DEFAULT 'dine_in',
  ADD COLUMN IF NOT EXISTS packaging_fee  DECIMAL(10,2) DEFAULT 0;

COMMENT ON COLUMN public.order_batch_items.serving_type
  IS 'Serving type for this item: dine_in or takeaway. Defaults to dine_in for backward compatibility.';
COMMENT ON COLUMN public.order_batch_items.packaging_fee
  IS 'Per-unit packaging fee charged for this item. 0 for dine_in items.';

-- ═══════════════════════════════════════════════════════════════
-- 3. invoice_items — per-line serving type for invoice history
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS serving_type   TEXT          DEFAULT 'dine_in',
  ADD COLUMN IF NOT EXISTS packaging_fee  DECIMAL(10,2) DEFAULT 0;

COMMENT ON COLUMN public.invoice_items.serving_type
  IS 'Serving type preserved from the order batch item for historical accuracy.';
COMMENT ON COLUMN public.invoice_items.packaging_fee
  IS 'Per-unit packaging fee preserved from the order for historical accuracy.';

-- ═══════════════════════════════════════════════════════════════
-- 4. invoices — aggregate packaging total for financial reporting
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS packaging_total DECIMAL(12,2) DEFAULT 0;

COMMENT ON COLUMN public.invoices.packaging_total
  IS 'Sum of all packaging fees on this invoice (derived from invoice_items). 0 for dine-in-only invoices.';
