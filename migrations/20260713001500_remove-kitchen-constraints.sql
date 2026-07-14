-- ============================================================================
-- MIGRATION: Remove Kitchen Module Constraints (2026-07-13)
-- ────────────────────────────────────────────────────────────────────────────
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

-- ────────────────────────────────────────────────────────────────────────────
-- PART 1: Remove auto_kitchen_print feature flag
-- ────────────────────────────────────────────────────────────────────────────

DELETE FROM public.feature_flags
WHERE name = 'auto_kitchen_print';

-- ────────────────────────────────────────────────────────────────────────────
-- PART 2: Migrate any existing rows with 'sent_to_kitchen' status
-- ────────────────────────────────────────────────────────────────────────────
-- These rows were created by the old kitchen workflow. The new business flow
-- uses only: pending → partial → paid → cancelled for batches, and
-- pending → paid → credit → cancelled for batch items.
-- 'sent_to_kitchen' maps to 'pending' — the order exists but hasn't been
-- processed further in the new workflow.

UPDATE public.order_batches
SET status = 'pending'
WHERE status = 'sent_to_kitchen';

UPDATE public.order_batch_items
SET status = 'pending'
WHERE status = 'sent_to_kitchen';

-- ────────────────────────────────────────────────────────────────────────────
-- PART 3: Update CHECK constraint on order_batches.status
-- ────────────────────────────────────────────────────────────────────────────
-- Old: ('pending','sent_to_kitchen','partial','paid','cancelled')
-- New: ('pending','partial','paid','cancelled')

ALTER TABLE public.order_batches
  DROP CONSTRAINT IF EXISTS order_batches_status_check;

ALTER TABLE public.order_batches
  ADD CONSTRAINT order_batches_status_check
  CHECK (status IN ('pending','partial','paid','cancelled'));

-- ────────────────────────────────────────────────────────────────────────────
-- PART 4: Update CHECK constraint on order_batch_items.status
-- ────────────────────────────────────────────────────────────────────────────
-- Old: ('pending','sent_to_kitchen','paid','credit','cancelled')
-- New: ('pending','paid','credit','cancelled')

ALTER TABLE public.order_batch_items
  DROP CONSTRAINT IF EXISTS order_batch_items_status_check;

ALTER TABLE public.order_batch_items
  ADD CONSTRAINT order_batch_items_status_check
  CHECK (status IN ('pending','paid','credit','cancelled'));

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Run these after migration to verify:
--
-- 1. Check no rows with old status remain:
--    SELECT COUNT(*) FROM public.order_batches WHERE status = 'sent_to_kitchen';
--    SELECT COUNT(*) FROM public.order_batch_items WHERE status = 'sent_to_kitchen';
--
-- 2. Check feature flag is removed:
--    SELECT * FROM public.feature_flags WHERE name = 'auto_kitchen_print';
--
-- 3. Check new constraints are in place:
--    SELECT constraint_name, check_clause
--    FROM information_schema.check_constraints
--    WHERE constraint_name IN ('order_batches_status_check', 'order_batch_items_status_check');
