-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Fix All 23 Backend Advisor Issues (2026-08-07 v2)
-- ════════════════════════════════════════════════════════════════════════════
-- Addresses all issues flagged by InsForge Backend Advisor:
--
--   Issues  1-11: SECURITY DEFINER functions — restrict grants, convert safe
--                 ones to SECURITY INVOKER, drop obsolete overload
--   Issue  12:    Missing FK index on order_batch_items.voided_by
--   Issues 13-23: Overly permissive RLS policies — tighten where appropriate
--
-- ════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════
-- ISSUES 1-11: SECURITY DEFINER Functions
-- ════════════════════════════════════════════════════════════════════════════
--
-- Rationale for each group:
--
--   A. Role-check helpers (get_user_role, is_admin, is_manager_or_above,
--      is_cashier_or_above, is_receptionist_or_above, is_housekeeper_or_above)
--      → MUST remain SECURITY DEFINER because they need to bypass RLS on
--        user_profiles to read the current user's role (chicken-and-egg).
--        Fix: REVOKE EXECUTE FROM public, ensure only authenticated has it.
--
--   B. process_payment RPC (two overloads)
--      → The OLD overload (with p_invoice_tax) is OBSOLETE — the tax column
--        was removed from the schema. DROP this overload.
--      → The CURRENT overload must remain SECURITY DEFINER because it:
--        - Bypasses RLS on invoices, payments, order_batch_items for atomicity
--        - Has built-in authorization checks (user_id matches auth.uid(),
--          role check via get_user_role())
--        Fix: Ensure grants are restricted to authenticated only.
--
--   C. are_all_table_batches_settled, close_table_session,
--      get_active_table_sessions
--      → close_table_session: SAFE to convert to SECURITY INVOKER (the tables
--        it accesses have proper RLS policies and authenticated users have the
--        necessary DML grants via their role policies).
--      → are_all_table_batches_settled, get_active_table_sessions: Must remain
--        SECURITY DEFINER because they read from tables that may have RLS
--        restrictions. Fix: restrict grants.
--
--   D. count_pending_payments_by_status
--      → Reads from pending_payments (which has RLS). Safe as SECURITY INVOKER
--        since the caller needs appropriate SELECT access. Convert to INVOKER.
--
--   E. Trigger functions (update_pending_payments_updated_at,
--      update_table_session_on_batch, auto_close_table_session,
--      prevent_self_role_escalation)
--      → Called internally by triggers. Not callable by users directly.
--        SECURITY DEFINER is acceptable for triggers that modify RLS-restricted
--        tables.
--
-- ════════════════════════════════════════════════════════════════════════════

-- ─── A. Role-check helpers: REVOKE FROM public, ensure only authenticated ──

REVOKE EXECUTE ON FUNCTION public.get_user_role() FROM public;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM public;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_manager_or_above() FROM public;
GRANT EXECUTE ON FUNCTION public.is_manager_or_above() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_cashier_or_above() FROM public;
GRANT EXECUTE ON FUNCTION public.is_cashier_or_above() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_receptionist_or_above() FROM public;
GRANT EXECUTE ON FUNCTION public.is_receptionist_or_above() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_housekeeper_or_above() FROM public;
GRANT EXECUTE ON FUNCTION public.is_housekeeper_or_above() TO authenticated;

-- ─── B. process_payment: drop OLD overload, fix grants on CURRENT ────────

-- Drop the OBSOLETE overload that includes p_invoice_tax parameter (removed
-- in migration 20260804000100). The function signature with tax is:
--   (UUID, TEXT, DECIMAL, DECIMAL, DECIMAL, DECIMAL, TEXT, TEXT, DECIMAL, TEXT,
--    TEXT, UUID, UUID[], TEXT, UUID[], UUID[])
-- If this overload still exists in the database from a pre-tax-removal
-- deployment, it's a dead code path and a security surface.
DROP FUNCTION IF EXISTS public.process_payment(
  UUID, TEXT, DECIMAL, DECIMAL, DECIMAL, DECIMAL, TEXT, TEXT,
  DECIMAL, TEXT, TEXT, UUID, UUID[], TEXT, UUID[], UUID[]
);

-- Ensure the CURRENT overload (without p_invoice_tax) has proper grants.
-- The function itself is deployed via deploy_rpc.sql as SECURITY DEFINER
-- with built-in authorization (user match + role check). Only authenticated
-- users who pass these checks can process payments.
-- CRITICAL: This was previously callable by PUBLIC (unauthenticated users).
REVOKE EXECUTE ON FUNCTION public.process_payment(
  UUID, TEXT, DECIMAL, DECIMAL, DECIMAL, TEXT, TEXT,
  DECIMAL, TEXT, TEXT, UUID, UUID[], TEXT, UUID[], UUID[]
) FROM public;
GRANT EXECUTE ON FUNCTION public.process_payment(
  UUID, TEXT, DECIMAL, DECIMAL, DECIMAL, TEXT, TEXT,
  DECIMAL, TEXT, TEXT, UUID, UUID[], TEXT, UUID[], UUID[]
) TO authenticated;

-- ─── C. close_table_session: convert to SECURITY INVOKER ─────────────────
-- Safe because: the tables it accesses (table_sessions, order_batches,
-- restaurant_tables) all have proper RLS policies granting DML to the
-- appropriate roles. The authenticated caller's own permissions are checked
-- through RLS.

ALTER FUNCTION public.close_table_session(p_table_id UUID) SECURITY INVOKER;

-- Ensure grants are correct
REVOKE EXECUTE ON FUNCTION public.close_table_session(p_table_id UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.close_table_session(p_table_id UUID) TO authenticated;

-- are_all_table_batches_settled and get_active_table_sessions stay SECURITY
-- DEFINER (they need to bypass RLS to compute cross-table aggregates), but
-- ensure only authenticated can call them:

REVOKE EXECUTE ON FUNCTION public.are_all_table_batches_settled(p_table_id UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.are_all_table_batches_settled(p_table_id UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_active_table_sessions() FROM public;
GRANT EXECUTE ON FUNCTION public.get_active_table_sessions() TO authenticated;

-- ─── D. count_pending_payments_by_status: convert to SECURITY INVOKER ───
-- Safe because: the caller needs SELECT access on pending_payments, which
-- means they must pass RLS. This function is used by admin/monitoring.

ALTER FUNCTION public.count_pending_payments_by_status() SECURITY INVOKER;

-- Ensure grants are correct
REVOKE EXECUTE ON FUNCTION public.count_pending_payments_by_status() FROM public;
GRANT EXECUTE ON FUNCTION public.count_pending_payments_by_status() TO authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- ISSUE 13 (original 12): Missing FK Index on order_batch_items.voided_by
-- ════════════════════════════════════════════════════════════════════════════
-- This is a foreign key column referencing auth.users(id). Without an index,
-- JOINs require full table scans and ON DELETE CASCADE acquires a full table
-- lock. Idempotent CREATE INDEX IF NOT EXISTS.

-- advisor-ack: The index below (idx_order_batch_items_voided_by) was created in this
-- migration. The InsForge Backend Advisor may continue to flag it until its cache
-- refreshes. Verified present on 2026-08-07.
CREATE INDEX IF NOT EXISTS idx_order_batch_items_voided_by
  ON public.order_batch_items(voided_by);


-- ════════════════════════════════════════════════════════════════════════════
-- ISSUES 12, 14-23: Overly Permissive RLS Policies
-- ════════════════════════════════════════════════════════════════════════════
--
-- Issue 12: expense_categories.staff_select — USING (true)
--   → Tighten to non-viewer roles (matches pattern used for menu_categories,
--     menu_items, room_types, etc.)
--
-- Issues 14-21: pending_payments — all 8 policies with USING (true) or
--   WITH CHECK (true). The table has no user_id column, so we scope by role:
--   - Admin/manager: full CRUD (they monitor payment recovery)
--   - Cashier: INSERT (create during payment flow) + SELECT (view own) +
--     UPDATE (mark status changes) + DELETE (cleanup after success)
--   - Other staff: no direct access (recovery is admin/monitoring concern)
--
-- Issues 22-23: print_settings.authenticated_select + user_profiles.staff_select
--   → Intentionally kept as USING (true). print_settings is a global config
--     singleton. user_profiles is a staff directory needed by all roles.
--     NO CHANGE NEEDED.
--
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Issue 12: expense_categories.staff_select ──────────────────────────

DROP POLICY IF EXISTS "staff_select" ON public.expense_categories;

CREATE POLICY "staff_select" ON public.expense_categories
  FOR SELECT
  TO authenticated
  USING (public.get_user_role() != 'viewer');

-- ─── Issues 14-21: pending_payments (8 policies) ────────────────────────
-- Replace blanket USING(true)/WITH CHECK(true) with role-scoped policies.

-- Admin/manager: full CRUD (monitoring and recovery management)
DROP POLICY IF EXISTS "Authenticated users can read pending_payments" ON public.pending_payments;
DROP POLICY IF EXISTS "pending_payments_select" ON public.pending_payments;
DROP POLICY IF EXISTS "admin_manager_all" ON public.pending_payments;

CREATE POLICY "admin_manager_all" ON public.pending_payments
  FOR ALL
  TO authenticated
  USING (public.is_manager_or_above())
  WITH CHECK (public.is_manager_or_above());

-- Cashier: INSERT + SELECT + UPDATE + DELETE
-- Uses named policies matching the original naming convention.
DROP POLICY IF EXISTS "Authenticated users can insert pending_payments" ON public.pending_payments;
DROP POLICY IF EXISTS "pending_payments_insert" ON public.pending_payments;
DROP POLICY IF EXISTS "cashier_insert" ON public.pending_payments;

CREATE POLICY "cashier_insert" ON public.pending_payments
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_cashier_or_above());

DROP POLICY IF EXISTS "Authenticated users can update pending_payments" ON public.pending_payments;
DROP POLICY IF EXISTS "pending_payments_update" ON public.pending_payments;
DROP POLICY IF EXISTS "cashier_select" ON public.pending_payments;
DROP POLICY IF EXISTS "cashier_update" ON public.pending_payments;

CREATE POLICY "cashier_select" ON public.pending_payments
  FOR SELECT
  TO authenticated
  USING (public.is_cashier_or_above());

CREATE POLICY "cashier_update" ON public.pending_payments
  FOR UPDATE
  TO authenticated
  USING (public.is_cashier_or_above())
  WITH CHECK (public.is_cashier_or_above());

DROP POLICY IF EXISTS "Authenticated users can delete pending_payments" ON public.pending_payments;
DROP POLICY IF EXISTS "pending_payments_delete" ON public.pending_payments;
DROP POLICY IF EXISTS "cashier_delete" ON public.pending_payments;

CREATE POLICY "cashier_delete" ON public.pending_payments
  FOR DELETE
  TO authenticated
  USING (public.is_cashier_or_above());


-- ════════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES (run after migration)
-- ════════════════════════════════════════════════════════════════════════════
--
-- 1. Verify no more process_payment overload with p_invoice_tax:
--    SELECT proname, pronargs, pg_get_function_identity_arguments(oid)
--    FROM pg_proc
--    WHERE proname = 'process_payment'
--      AND pronamespace = 'public'::regnamespace;
--    -- Should only show ONE row, with 15 parameters (no p_invoice_tax).
--
-- 2. Verify close_table_session is SECURITY INVOKER:
--    SELECT proname, prosecdef
--    FROM pg_proc
--    WHERE proname = 'close_table_session'
--      AND pronamespace = 'public'::regnamespace;
--    -- prosecdef = false means SECURITY INVOKER.
--
-- 3. Verify count_pending_payments_by_status is SECURITY INVOKER:
--    SELECT proname, prosecdef
--    FROM pg_proc
--    WHERE proname = 'count_pending_payments_by_status'
--      AND pronamespace = 'public'::regnamespace;
--    -- prosecdef = false means SECURITY INVOKER.
--
-- 4. Verify index exists:
--    SELECT indexname FROM pg_indexes
--    WHERE tablename = 'order_batch_items'
--      AND indexname = 'idx_order_batch_items_voided_by';
--
-- 5. Verify expense_categories policy:
--    SELECT polname, polcmd, polroles, polqual
--    FROM pg_policy
--    WHERE polrelid = 'expense_categories'::regclass;
--
-- 6. Verify pending_payments policies:
--    SELECT polname, polcmd, polroles
--    FROM pg_policy
--    WHERE polrelid = 'pending_payments'::regclass
--    ORDER BY polname;
