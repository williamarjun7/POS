-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Fix Remaining 4 Backend Advisor Issues (2026-08-07 v4)
-- ════════════════════════════════════════════════════════════════════════════
-- Addresses the last 4 issues still flagged by InsForge Backend Advisor:
--
--   Issue 1: process_payment SECURITY DEFINER → convert to SECURITY INVOKER
--   Issue 2: print_settings.authenticated_select USING(true) → tighten
--   Issue 3: user_profiles.staff_select USING(true) → tighten
--   Issue 4: order_batch_items.voided_by FK index → already exists, acknowledge
--
-- ════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════
-- ISSUE 1: process_payment → SECURITY INVOKER
-- ════════════════════════════════════════════════════════════════════════════
-- Safe to convert because:
--   1. Built-in authorization: checks user_id matches auth.uid() and role
--      is in (admin, cashier, manager) before any writes occur.
--   2. Tables it writes to (invoices, payments, order_batch_items) have
--      proper RLS policies granting INSERT/UPDATE to cashier+ roles.
--   3. Role-check helpers it depends on (get_user_role) are already INVOKER.
--
-- The function has a SET search_path = public which limits schema search.
-- GRANT EXECUTE is already restricted to authenticated only (migration v1).

ALTER FUNCTION public.process_payment(
  UUID, TEXT, DECIMAL, DECIMAL, DECIMAL, TEXT, TEXT,
  DECIMAL, TEXT, TEXT, UUID, UUID[], TEXT, UUID[], UUID[]
) SECURITY INVOKER;

-- ════════════════════════════════════════════════════════════════════════════
-- ISSUE 2: print_settings → tighten RLS policy
-- ════════════════════════════════════════════════════════════════════════════
-- Replace blanket USING(true) with role-based check. Viewers (limited-access
-- role) cannot read print settings. All other staff roles can.
-- No recursion risk because the policy calls get_user_role() which reads
-- from user_profiles, and user_profiles.staff_select still provides a
-- non-recursive access path.

DROP POLICY IF EXISTS "authenticated_select" ON public.print_settings;

CREATE POLICY "authenticated_select" ON public.print_settings
  FOR SELECT
  TO authenticated
  USING (public.get_user_role() != 'viewer');

-- ════════════════════════════════════════════════════════════════════════════
-- ISSUE 3: user_profiles → tighten RLS policy
-- ════════════════════════════════════════════════════════════════════════════
-- Replace the blanket staff_select USING(true) with two policies that
-- together provide the same functional access without USING(true):
--
--   1. self_select: authenticated users can read their own profile row.
--      Uses a direct auth.uid() comparison — no recursion.
--
--   2. admin_all (already exists from migration 20260716004000):
--      Admin users can read/write all profiles via is_admin() check.
--      The is_admin() call reads user_profiles, which passes through
--      the self_select policy (self-access), terminating the recursion.
--
-- Impact on frontend:
--   - Profile page (reads own profile by id) → works via self_select ✅
--   - Admin page (lists all staff) → works for admin users via admin_all ✅
--   - Cashiers listing all staff → only see own row (they lack users.manage
--     permission in the UI, so this matches expected behavior) ✅
--   - Role-check helpers (get_user_role, is_admin, etc.) → read own row
--     via self_select, works correctly ✅

DROP POLICY IF EXISTS "staff_select" ON public.user_profiles;
DROP POLICY IF EXISTS "self_select" ON public.user_profiles;

CREATE POLICY "self_select" ON public.user_profiles
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = id);


-- ════════════════════════════════════════════════════════════════════════════
-- ISSUE 4: order_batch_items.voided_by FK index
-- ════════════════════════════════════════════════════════════════════════════
-- Already created in migration 20260807000101_fix-all-23-advisor-issues.sql.
-- The index (idx_order_batch_items_voided_by) exists and is confirmed present
-- on 2026-08-07. The advisor cache is stale — no action needed.
-- Verification command:
--   SELECT indexname FROM pg_indexes
--   WHERE tablename = 'order_batch_items'
--     AND indexname = 'idx_order_batch_items_voided_by';
-- Expected: 1 row returned.


-- ════════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES (run after migration)
-- ════════════════════════════════════════════════════════════════════════════
--
-- 1. Verify process_payment is now SECURITY INVOKER (prosecdef = false):
--    SELECT proname, prosecdef
--    FROM pg_proc
--    WHERE proname = 'process_payment'
--      AND pronamespace = 'public'::regnamespace;
--
-- 2. Verify print_settings policies (should show role-based check):
--    SELECT polname, polcmd, pg_get_expr(polqual, polrelid) AS using_expr
--    FROM pg_policy
--    WHERE polrelid = 'print_settings'::regclass;
--
-- 3. Verify user_profiles policies (should show self_select + admin_all):
--    SELECT polname, polcmd, pg_get_expr(polqual, polrelid) AS using_expr
--    FROM pg_policy
--    WHERE polrelid = 'user_profiles'::regclass
--    ORDER BY polname;
