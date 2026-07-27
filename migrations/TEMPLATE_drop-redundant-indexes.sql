-- ============================================================================
-- MIGRATION: Remove Unused Inventory Indexes (EVIDENCE-BACKED)
-- ════════════════════════════════════════════════════════════════════════════
-- Evidence source: pg_stat_user_indexes from scripts/run-diagnostics.mjs
--   Run on: 2026-08-10 against production
--   Section 8a: 6 candidate indexes
--   Section 10: All zero-scan non-constraint indexes
--
-- Only 2 indexes are being dropped — both have confirmed zero scans
-- and NO queries in the application codebase reference them.
--
-- ⚠️  Requires PostgreSQL 14+ for rollback (uses IF NOT EXISTS).
--     On PG ≤13, strip IF NOT EXISTS from rollback before running.
--
-- Each DROP uses CONCURRENTLY to avoid locking writes.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- SAFE LIST — NEVER DROP THESE INDEXES
-- ════════════════════════════════════════════════════════════════════════════

-- ALL PRIMARY KEY indexes (auto-created) — every WHERE id = ? depends on them
-- ALL UNIQUE constraint indexes — schema integrity (14 total)
-- payments_reference_unique — table constraint, never drop via DROP INDEX

-- ALL FK-supporting indexes (12 recreated + original FK indexes):
--   Zero idx_scan is EXPECTED for FK maintenance indexes.
--   They are used by PostgreSQL internally for referential integrity checks,
--   not by user queries. Dropping them would cause table scans on every
--   parent-table DELETE/UPDATE.

-- ALL performance composite indexes — verified by live production scans

-- SINGLE-COLUMN indexes confirmed ACTIVE by production evidence:
--   idx_invoices_created (1,366 scans) —        KEEP
--   idx_order_batch_items_batch (459,764 scans) — KEEP
--   idx_order_batch_items_status (352 scans) —   KEEP
--   idx_order_batches_table (108,271 scans) —    KEEP
--   These were initially flagged as "redundant left-prefix" in the
--   codebase-only audit. Production evidence proves PostgreSQL's
--   planner chooses them independently of composite indexes.

-- Zero-scan indexes that are KEPT (explanation for each):
--   All FK-supporting indexes (e.g. idx_inventory_supplier, idx_hk_room,
--     idx_stock_movements_item, idx_purchase_orders_supplier,
--     idx_po_items_po, idx_supplier_payments_supplier, etc.):
--     Required for referential integrity — zero user-scans is expected.
--   idx_suppliers_name — on small reference table (< 100 rows expected)
--   idx_purchase_orders_status — low cardinality, rarely scanned
--   idx_hk_status — low cardinality, small table
--   idx_maint_room, idx_maint_status — small maintenance table
--   idx_pending_payments_gateway_ref — partial, for gateway reconciliation
--   idx_cash_reconciliations_reconciled_by — small reconciliation table
--   idx_stock_movements_user_id — small stock tracking table
--   All are on small tables or serve specific low-frequency purposes
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- DROP: idx_inventory_stock
-- ════════════════════════════════════════════════════════════════════════════
-- Evidence: idx_scan = 0 (zero scans since last stats reset)
--           No query in codebase filters WHERE current_stock <= ?
--           Low-stock warning is client-side (fetch ALL rows, filter in JS)
-- Risk:   LOW — inventory_items table is small (< 200 rows)
DROP INDEX CONCURRENTLY IF EXISTS public.idx_inventory_stock;

-- ════════════════════════════════════════════════════════════════════════════
-- DROP: idx_inventory_category
-- ════════════════════════════════════════════════════════════════════════════
-- Evidence: idx_scan = 0 (zero scans since last stats reset)
--           Low cardinality column (~10-20 values)
--           Seq Scan is always preferred over Index Scan for tiny tables
-- Risk:   LOW — inventory_items table is small
DROP INDEX CONCURRENTLY IF EXISTS public.idx_inventory_category;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ════════════════════════════════════════════════════════════════════════════

-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inventory_stock
--   ON public.inventory_items (current_stock);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inventory_category
--   ON public.inventory_items (category);

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFICATION AFTER APPLYING
-- ════════════════════════════════════════════════════════════════════════════

-- SELECT indexname FROM pg_indexes WHERE indexname IN (
--   'idx_inventory_stock', 'idx_inventory_category'
-- );
-- Expected: 0 rows

-- SELECT count(*) FROM pg_stat_user_indexes WHERE schemaname = 'public';
-- Expected: 102 (was 104)

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
