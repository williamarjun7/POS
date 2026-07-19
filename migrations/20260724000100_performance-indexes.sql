-- ============================================================================
-- MIGRATION: Performance Covering Indexes (2026-07-24)
-- ────────────────────────────────────────────────────────────────────────────
-- Adds covering indexes for tables identified with high sequential scan counts
-- in the performance audit:
--   order_batches:      13,574 seq scans  (filtered WHERE status = 'pending')
--   restaurant_tables:  11,637 seq scans  (filtered WHERE status = 'occupied')
--   order_batch_items:   9,280 seq scans  (filtered WHERE batch_id + status)
--   rooms:               6,963 seq scans  (filtered WHERE status = 'occupied')
--   invoices:            6,756 seq scans  (filtered WHERE status IN (...))
--
-- Each index targets the actual WHERE clauses used by the application,
-- verified against the codebase query patterns.
-- ============================================================================

-- ─── 1. restaurant_tables: status → dashboard filters by occupied/reserved ──
CREATE INDEX IF NOT EXISTS idx_restaurant_tables_display_status
  ON public.restaurant_tables (display_order, status);

-- ─── 2. order_batches: table_id + active status (non-settled) ──────────────
-- Used by: useTableBatches hook, Dashboard table status view
CREATE INDEX IF NOT EXISTS idx_order_batches_table_active
  ON public.order_batches (table_id)
  WHERE status NOT IN ('paid', 'cancelled');

-- ─── 3. order_batch_items: batch_id + status (payment processing) ──────────
-- Used by: payment flow to check item statuses per batch
CREATE INDEX IF NOT EXISTS idx_order_batch_items_batch_payment
  ON public.order_batch_items (batch_id)
  WHERE status IN ('pending', 'paid');

-- ─── 4. rooms: status → dashboard and operations filters ──────────────────
CREATE INDEX IF NOT EXISTS idx_rooms_status_payment
  ON public.rooms (status)
  WHERE status IN ('occupied', 'available', 'vacant', 'reserved');

-- ─── 5. invoices: table_id + status (pending payments query) ───────────────
-- Used by: Dashboard pending payments list
CREATE INDEX IF NOT EXISTS idx_invoices_table_pending
  ON public.invoices (table_id)
  WHERE status NOT IN ('paid', 'refunded', 'cancelled');

-- ─── 6. Drop unused indexes from the dropped notifications table ───────────
DROP INDEX IF EXISTS idx_notifications_user;
DROP INDEX IF EXISTS idx_notifications_read;
DROP INDEX IF EXISTS idx_notifications_created;
DROP INDEX IF EXISTS idx_notifications_type;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- Run after migration:
-- SELECT schemaname, tablename, indexname, indexdef
-- FROM pg_indexes
-- WHERE indexname IN (
--   'idx_restaurant_tables_display_status',
--   'idx_order_batches_table_active',
--   'idx_order_batch_items_batch_payment',
--   'idx_rooms_status_payment',
--   'idx_invoices_table_pending'
-- ) ORDER BY tablename;
