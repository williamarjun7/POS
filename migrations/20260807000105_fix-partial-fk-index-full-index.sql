-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Fix Partial FK Index — Create Full Index (2026-08-07 v5)
-- ════════════════════════════════════════════════════════════════════════════
-- The existing index idx_order_batch_items_voided_by was created as a partial
-- index with WHERE (voided_by IS NOT NULL). Partial indexes cannot be used
-- by foreign key constraint lookups when the column value is NULL, which is
-- the common case for voided_by (most items are not voided).
--
-- Fix: Drop the partial index and create a full, non-partial index on
-- voided_by so the FK constraint can use it for all lookups.
-- ════════════════════════════════════════════════════════════════════════════

DROP INDEX IF EXISTS idx_order_batch_items_voided_by;

CREATE INDEX IF NOT EXISTS idx_order_batch_items_voided_by
  ON public.order_batch_items(voided_by);
