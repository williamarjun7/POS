-- ═══════════════════════════════════════════════════════════════
-- Migration: Add void columns to order_batch_items
-- ─────────────────────────────────────────────────────────────
-- Adds support for the Void Item feature:
--   - voided_at: timestamp when the item was voided
--   - voided_by: user ID of the staff who voided the item
--
-- Also adds 'voided' to the status check constraint so the
-- database enforces valid status values.
-- ═══════════════════════════════════════════════════════════════

-- Step 1: Add new columns (nullable — only set for voided items)
ALTER TABLE public.order_batch_items
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Step 2: Update the status check constraint to include 'voided'
-- PostgreSQL doesn't support ALTER CHECK, so we need to drop and recreate.
ALTER TABLE public.order_batch_items
  DROP CONSTRAINT IF EXISTS order_batch_items_status_check;

ALTER TABLE public.order_batch_items
  ADD CONSTRAINT order_batch_items_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'paid'::text, 'credit'::text, 'cancelled'::text, 'voided'::text]));

-- Step 3: Index on voided_by for policy queries and void reports
CREATE INDEX IF NOT EXISTS idx_order_batch_items_voided_by
  ON public.order_batch_items(voided_by)
  WHERE voided_by IS NOT NULL;

-- Step 4: Comment on columns for documentation
COMMENT ON COLUMN public.order_batch_items.voided_at IS 'Timestamp when the item was voided (NULL if not voided)';
COMMENT ON COLUMN public.order_batch_items.voided_by IS 'User ID of the staff who voided this item (NULL if not voided)';
