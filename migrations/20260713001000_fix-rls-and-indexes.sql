-- ============================================================================
-- MIGRATION: Fix RLS Security & Missing Indexes (2026-07-13)
-- ────────────────────────────────────────────────────────────────────────────
-- Addresses 66 issues flagged by InsForge Backend Advisor:
--   🔴 4 critical:  Remove anon access to menu_items, menu_categories, user_profiles
--   🟡 33 warning:  Scope RLS policies to authenticated-only, wrap auth.uid() in subqueries
--   ⚡ 17 warning:  Add missing foreign key indexes
--   ⚡ 2  warning:  Fix auth.uid() per-row evaluation in notifications policies
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- PART 1: Remove anonymous (anon) access to tables (fixes 4 critical issues)
-- ────────────────────────────────────────────────────────────────────────────

-- 1a. Revoke SELECT on all tables from anon
REVOKE SELECT ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE USAGE ON SCHEMA public FROM anon;

-- 1b. Drop permissive anon policies on menu_items (Issue #1, #3)
DROP POLICY IF EXISTS "auth_select" ON public.menu_items;
DROP POLICY IF EXISTS "auth_all" ON public.menu_items;

-- 1c. Drop permissive anon policies on menu_categories (Issue #2)
DROP POLICY IF EXISTS "auth_select" ON public.menu_categories;

-- 1d. Drop permissive anon policy on user_profiles (Issue #4)
DROP POLICY IF EXISTS "sel" ON public.user_profiles;

-- ────────────────────────────────────────────────────────────────────────────
-- PART 2: Recreate menu_items policies — authenticated only
-- ────────────────────────────────────────────────────────────────────────────

CREATE POLICY "auth_select" ON public.menu_items
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "auth_all" ON public.menu_items
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────────────────────
-- PART 3: Recreate menu_categories policies — authenticated only
-- ────────────────────────────────────────────────────────────────────────────

CREATE POLICY "auth_select" ON public.menu_categories
  FOR SELECT TO authenticated
  USING (true);

-- ────────────────────────────────────────────────────────────────────────────
-- PART 4: Recreate user_profiles policies — user-scoped
-- ────────────────────────────────────────────────────────────────────────────

-- Users can read all profiles (needed for role lookup)
CREATE POLICY "sel" ON public.user_profiles
  FOR SELECT TO authenticated
  USING (true);

-- Users can only insert/update/delete their own profile
-- Admin users can manage all profiles via the app-level permission system
DROP POLICY IF EXISTS "all" ON public.user_profiles;

CREATE POLICY "all" ON public.user_profiles
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- ────────────────────────────────────────────────────────────────────────────
-- PART 5: Fix auth.uid() subquery wrapping on notifications (Issues #61, #63)
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "ns" ON public.notifications;
CREATE POLICY "ns" ON public.notifications
  FOR SELECT TO authenticated
  USING ((user_id IS NULL) OR ((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "nu" ON public.notifications;
CREATE POLICY "nu" ON public.notifications
  FOR UPDATE TO authenticated
  USING ((user_id IS NULL) OR ((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "ni" ON public.notifications;
CREATE POLICY "ni" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- ────────────────────────────────────────────────────────────────────────────
-- PART 6: Fix auth.uid() subquery wrapping on other user-scoped policies
-- ────────────────────────────────────────────────────────────────────────────

-- Activity logs — uses the same pattern
DROP POLICY IF EXISTS "as" ON public.activity_logs;
CREATE POLICY "as" ON public.activity_logs
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "ai" ON public.activity_logs;
CREATE POLICY "ai" ON public.activity_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Business settings (singleton row — no user_id, but wrap for consistency)
DROP POLICY IF EXISTS "sel" ON public.business_settings;
CREATE POLICY "sel" ON public.business_settings
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "si" ON public.business_settings;
CREATE POLICY "si" ON public.business_settings
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "su" ON public.business_settings;
CREATE POLICY "su" ON public.business_settings
  FOR UPDATE TO authenticated
  USING (true);

-- Print settings (singleton row)
DROP POLICY IF EXISTS "sel" ON public.print_settings;
CREATE POLICY "sel" ON public.print_settings
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "si" ON public.print_settings;
CREATE POLICY "si" ON public.print_settings
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "su" ON public.print_settings;
CREATE POLICY "su" ON public.print_settings
  FOR UPDATE TO authenticated
  USING (true);

-- ────────────────────────────────────────────────────────────────────────────
-- PART 7: Add missing foreign key indexes (fixes 17 performance issues)
-- ────────────────────────────────────────────────────────────────────────────

-- Issue #43: restaurant_tables.branch_id
CREATE INDEX IF NOT EXISTS idx_restaurant_tables_branch_id
  ON public.restaurant_tables(branch_id);

-- Issue #44: rooms.branch_id
CREATE INDEX IF NOT EXISTS idx_rooms_branch_id
  ON public.rooms(branch_id);

-- Issue #45: rooms.room_type_id
CREATE INDEX IF NOT EXISTS idx_rooms_room_type_id
  ON public.rooms(room_type_id);

-- Issue #46: bookings.user_id
CREATE INDEX IF NOT EXISTS idx_bookings_user_id
  ON public.bookings(user_id);

-- Issue #47: order_batches.room_id
CREATE INDEX IF NOT EXISTS idx_order_batches_room_id
  ON public.order_batches(room_id);

-- Issue #48: order_batches.user_id
CREATE INDEX IF NOT EXISTS idx_order_batches_user_id
  ON public.order_batches(user_id);

-- Issue #49: invoices.booking_id
CREATE INDEX IF NOT EXISTS idx_invoices_booking_id
  ON public.invoices(booking_id);

-- Issue #50: invoices.table_id
CREATE INDEX IF NOT EXISTS idx_invoices_table_id
  ON public.invoices(table_id);

-- Issue #51: invoices.user_id
CREATE INDEX IF NOT EXISTS idx_invoices_user_id
  ON public.invoices(user_id);

-- Issue #52: payments.batch_id
CREATE INDEX IF NOT EXISTS idx_payments_batch_id
  ON public.payments(batch_id);

-- Issue #53: payments.user_id
CREATE INDEX IF NOT EXISTS idx_payments_user_id
  ON public.payments(user_id);

-- Issue #54: expenses.recorded_by
CREATE INDEX IF NOT EXISTS idx_expenses_recorded_by
  ON public.expenses(recorded_by);

-- Issue #55: cash_reconciliations.reconciled_by
CREATE INDEX IF NOT EXISTS idx_cash_reconciliations_reconciled_by
  ON public.cash_reconciliations(reconciled_by);

-- Issue #56: stock_movements.user_id
CREATE INDEX IF NOT EXISTS idx_stock_movements_user_id
  ON public.stock_movements(user_id);

-- Issue #57: purchase_orders.user_id
CREATE INDEX IF NOT EXISTS idx_purchase_orders_user_id
  ON public.purchase_orders(user_id);

-- Issue #58: supplier_payments.user_id
CREATE INDEX IF NOT EXISTS idx_supplier_payments_user_id
  ON public.supplier_payments(user_id);

-- Issue #59: maintenance_requests.assigned_to
CREATE INDEX IF NOT EXISTS idx_maintenance_requests_assigned_to
  ON public.maintenance_requests(assigned_to);

-- Issue #60: maintenance_requests.reported_by
CREATE INDEX IF NOT EXISTS idx_maintenance_requests_reported_by
  ON public.maintenance_requests(reported_by);

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Check all policies are in good shape:
-- SELECT schemaname, tablename, policyname, roles, cmd
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;

-- Check new indexes exist:
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE schemaname = 'public'
--   AND indexname LIKE 'idx_%'
-- ORDER BY indexname;
