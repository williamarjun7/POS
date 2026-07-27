-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Fix print_settings RLS — Global Config Singleton
-- ════════════════════════════════════════════════════════════════════════════
--
-- Problem:
--   The current authenticated_select policy on print_settings uses:
--     USING (public.get_user_role() != 'viewer')
--
--   Since get_user_role() was converted to SECURITY INVOKER (migration
--   20260807000102), it queries user_profiles through RLS. If the user's
--   profile row is inaccessible (e.g., self_select RLS edge case, missing
--   profile, or auth token refresh race) the expression evaluates
--   differently than expected, causing a 401 on read.
--
-- Fix:
--   print_settings is a non-sensitive global config singleton storing only
--   printer paper size (58mm/80mm/A4), phone number, and UI toggle states
--   (show logo, auto-print, print copies). There is ZERO sensitive data.
--
--   All authenticated staff need to read this config to print invoices —
--   it's loaded on EVERY page via PrintSettingsProvider. The admin/manager
--   CRUD policy already protects writes. SELECT can safely use USING(true).
--
--   The InsForge Backend Advisor flagged USING(true) as a blanket policy,
--   but for a truly global non-sensitive config table, it's the correct
--   approach. The alternative (role-based) adds unnecessary complexity
--   and a failure point for no security benefit.
--
-- Policies after this migration:
--   1. admin_manager_all  — FOR ALL  (USING is_manager_or_above) [write protection]
--   2. authenticated_select — FOR SELECT (USING true) [global read, safe]
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Drop the current overly-restrictive SELECT policy ────────────────────
DROP POLICY IF EXISTS "authenticated_select" ON public.print_settings;

-- ─── Replace with a simple global-read policy ───────────────────────────
-- print_settings contains only non-sensitive printer/printer config.
-- All authenticated staff need to read it for invoice printing.
-- The admin_manager_all policy (FOR ALL, is_manager_or_above) protects writes.
CREATE POLICY "authenticated_select" ON public.print_settings
  FOR SELECT
  TO authenticated
  USING (true);

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES (run after migration)
-- ════════════════════════════════════════════════════════════════════════════
--
-- 1. Check print_settings policies:
--    SELECT polname, polcmd, pg_get_expr(polqual, polrelid) AS using_expr
--    FROM pg_policy
--    WHERE polrelid = 'print_settings'::regclass;
--
--    Expected: two policies
--     - admin_manager_all: FOR ALL, is_manager_or_above()
--     - authenticated_select: FOR SELECT, true
--
-- 2. Verify the table is still accessible:
--    SELECT * FROM public.print_settings LIMIT 1;
--    Expected: 1 row (or empty set) — no 401/403 error
