-- ============================================================================
-- Migration: Remove Kitchen Module Constraints
-- Date: July 13, 2026
-- ============================================================================
--
-- Removes all database artifacts related to the kitchen workflow that was
-- eliminated in the Direct Order & Billing POS refactor.
--
-- Changes:
--   1. Delete the auto_kitchen_print feature flag
--   2. Update any existing rows with 'sent_to_kitchen' status to 'pending'
--   3. Drop & recreate CHECK constraint on order_batches.status
--      (removes 'sent_to_kitchen')
--   4. Drop & recreate CHECK constraint on order_batch_items.status
--      (removes 'sent_to_kitchen')
-- ============================================================================

-- ─── 1. Remove auto_kitchen_print feature flag ────────────────────────────

DELETE FROM public.feature_flags
WHERE name = 'auto_kitchen_print';

-- ─── 2. Migrate existing rows with old kitchen status ─────────────────────
-- Rows created by the old kitchen workflow are safely mapped to 'pending'.
-- The new business flow uses only: pending → partial → paid → cancelled
-- for batches, and pending → paid → credit → cancelled for batch items.

UPDATE public.order_batches
SET status = 'pending'
WHERE status = 'sent_to_kitchen';

UPDATE public.order_batch_items
SET status = 'pending'
WHERE status = 'sent_to_kitchen';

-- ─── 3. Update CHECK constraint on order_batches.status ───────────────────
-- Old: ('pending','sent_to_kitchen','partial','paid','cancelled')
-- New: ('pending','partial','paid','cancelled')

ALTER TABLE public.order_batches
  DROP CONSTRAINT IF EXISTS order_batches_status_check;

ALTER TABLE public.order_batches
  ADD CONSTRAINT order_batches_status_check
  CHECK (status IN ('pending','partial','paid','cancelled'));

-- ─── 4. Update CHECK constraint on order_batch_items.status ───────────────
-- Old: ('pending','sent_to_kitchen','paid','credit','cancelled')
-- New: ('pending','paid','credit','cancelled')

ALTER TABLE public.order_batch_items
  DROP CONSTRAINT IF EXISTS order_batch_items_status_check;

ALTER TABLE public.order_batch_items
  ADD CONSTRAINT order_batch_items_status_check
  CHECK (status IN ('pending','paid','credit','cancelled'));
