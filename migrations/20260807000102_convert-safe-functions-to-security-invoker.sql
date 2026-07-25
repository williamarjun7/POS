-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Convert Safe Functions to SECURITY INVOKER (2026-08-07 v3)
-- ════════════════════════════════════════════════════════════════════════════
-- Addresses remaining InsForge Backend Advisor issues after migration
-- 20260807000101:
--
--   Issues 1, 3-9: SECURITY DEFINER functions that are safe to convert to
--                  SECURITY INVOKER because they only SELECT from tables
--                  with proper RLS policies for authenticated users.
--
--   Issue 2 (process_payment): INTENTIONALLY kept as SECURITY DEFINER.
--     The function performs atomic multi-table writes across invoices,
--     payments, and order_batch_items. It has built-in authorization
--     checks (user_id validation and role check) that prevent privilege
--     escalation. Converting to INVOKER would break the atomic multi-table
--     update pattern.
--
-- ════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════
-- Issues 1, 3-7: Role-check helpers → SECURITY INVOKER
-- ════════════════════════════════════════════════════════════════════════════
-- These functions read user_profiles to determine the current user's role.
-- Safe to convert because:
--   - user_profiles.staff_select policy uses USING(true) — all authenticated
--     users can read any profile row.
--   - auth.uid() returns the actual caller regardless of security context.
--   - The COALESCE default ('cashier') handles missing profiles gracefully.
--
-- If user_profiles RLS is tightened in the future, these functions will
-- gracefully fail closed (returning 'cashier'/'viewer' default) rather
-- than exposing sensitive data.

ALTER FUNCTION public.get_user_role() SECURITY INVOKER;

ALTER FUNCTION public.is_admin() SECURITY INVOKER;

ALTER FUNCTION public.is_manager_or_above() SECURITY INVOKER;

ALTER FUNCTION public.is_cashier_or_above() SECURITY INVOKER;

ALTER FUNCTION public.is_receptionist_or_above() SECURITY INVOKER;

ALTER FUNCTION public.is_housekeeper_or_above() SECURITY INVOKER;

-- ════════════════════════════════════════════════════════════════════════════
-- Issue 8: are_all_table_batches_settled → SECURITY INVOKER
-- ════════════════════════════════════════════════════════════════════════════
-- Safe because it only SELECTs from order_batches and order_batch_items,
-- both of which have cashier_select policies granting read access to
-- cashier+ roles. Authenticated users who call this function must already
-- have SELECT access on these tables via their role.

ALTER FUNCTION public.are_all_table_batches_settled(p_table_id UUID) SECURITY INVOKER;

-- ════════════════════════════════════════════════════════════════════════════
-- Issue 9: get_active_table_sessions → SECURITY INVOKER
-- ════════════════════════════════════════════════════════════════════════════
-- Safe because it only SELECTs from table_sessions, which has a
-- cashier_select policy granting read access to cashier+ roles.

ALTER FUNCTION public.get_active_table_sessions() SECURITY INVOKER;


-- ════════════════════════════════════════════════════════════════════════════
-- Issue 2: process_payment — REMAINS SECURITY DEFINER (intentional)
-- ════════════════════════════════════════════════════════════════════════════
-- The following function is NOT altered:
--   public.process_payment(...) — SECURITY DEFINER
--
-- Rationale:
--   - Performs atomic multi-table writes (invoices, payments,
--     order_batch_items) that must bypass RLS for transactional integrity.
--   - Has built-in authorization: verifies user_id matches auth.uid() and
--     checks role is in (admin, cashier, manager).
--   - The SECURITY DEFINER is scoped to the function's internal logic, not
--     the caller's identity — the auth checks run on the calling user.
--   - Only authenticated users can invoke it (granted in migration v2).


-- ════════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES (run after migration)
-- ════════════════════════════════════════════════════════════════════════════
--
-- 1. Verify all converted functions are SECURITY INVOKER (prosecdef = false):
--    SELECT proname, prosecdef
--    FROM pg_proc
--    WHERE proname IN ('get_user_role','is_admin','is_manager_or_above',
--      'is_cashier_or_above','is_receptionist_or_above','is_housekeeper_or_above',
--      'are_all_table_batches_settled','get_active_table_sessions')
--      AND pronamespace = 'public'::regnamespace
--    ORDER BY proname;
--    -- All rows should show prosecdef = false
--
-- 2. Verify process_payment is still SECURITY DEFINER (prosecdef = true):
--    SELECT proname, prosecdef
--    FROM pg_proc
--    WHERE proname = 'process_payment'
--      AND pronamespace = 'public'::regnamespace;
--    -- Should show prosecdef = true
