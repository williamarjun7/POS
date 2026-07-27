-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: InsForge Advisor Fixes
-- ────────────────────────────────────────────────────────────────────────────
-- Fixes 14 advisor issues:
--   Issues 1-2: Revoke process_payment from anon (critical security)
--   Issues 3-14: Add missing FK indexes (warning performance)
-- ════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════
-- Fix 1-2: process_payment SECURITY DEFINER — revoke from anon
-- ════════════════════════════════════════════════════════════════════════════
-- The function must remain SECURITY DEFINER because it accesses auth.uid()
-- and manages cross-table payment operations. But unauthenticated users (anon)
-- must never be able to call it.
-- search_path is already set to 'public' in the function definition.

REVOKE EXECUTE ON FUNCTION public.process_payment(
  uuid, text, numeric, numeric, numeric, text, text,
  numeric, text, text, uuid, uuid[], text, uuid[], uuid[], uuid
) FROM anon;

REVOKE EXECUTE ON FUNCTION public.process_payment(
  uuid, text, numeric, numeric, numeric, text, text,
  numeric, text, text, uuid, uuid[], text, uuid[], uuid[], uuid
) FROM PUBLIC;

-- ════════════════════════════════════════════════════════════════════════════
-- Fix 3-14: Missing FK indexes
-- ════════════════════════════════════════════════════════════════════════════

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_user_id ON public.invoices (user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_user_id ON public.payments (user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_expenses_recorded_by ON public.expenses (recorded_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_batch_items_voided_by ON public.order_batch_items (voided_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_user_id ON public.bookings (user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_table_sessions_closed_by ON public.table_sessions (closed_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_restaurant_tables_branch_id ON public.restaurant_tables (branch_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_batches_user_id ON public.order_batches (user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_booking_id ON public.invoices (booking_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_room_id ON public.bookings (room_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rooms_room_type_id ON public.rooms (room_type_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rooms_branch_id ON public.rooms (branch_id);
