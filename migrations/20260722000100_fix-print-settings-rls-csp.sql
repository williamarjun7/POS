-- ============================================================================
-- MIGRATION: Fix Print Settings RLS + CSP + Catch-block cleanup (2026-07-22)
-- ────────────────────────────────────────────────────────────────────────────
--
-- Fixes:
--   1. print_settings SELECT policy expanded to all authenticated users
--      (not just cashier+).  Users without a user_profiles row default to
--      role='viewer' and were silently denied SELECT on print_settings.
--   2. The default get_user_role() now returns 'cashier' instead of 'viewer'
--      so POS cashiers who haven't created profiles can still work.
--   3. CSP fetch(data:...) violation eliminated in print-service.ts
--      (frontend fix, not a DB migration — see src/ for the code change).
-- ============================================================================

-- ─── 1. Fix get_user_role() default: 'viewer' → 'cashier' ────────────────
-- Users signing up via the auth page don't have a user_profiles row yet,
-- so get_user_role() returned 'viewer' which has zero permissions.
-- Defaulting to 'cashier' means new users can use the POS immediately
-- while admin/manager roles are assigned by an administrator.
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.user_profiles WHERE id = auth.uid() LIMIT 1),
    'cashier'
  );
$$;

-- ─── 2. Fix print_settings: admin/manager CRUD, ALL authenticated SELECT ──
-- Drop the overly-restrictive cashier_select policy and replace it with
-- a policy that allows ANY authenticated user to SELECT print_settings.
-- This prevents "permission denied for table print_settings" on dashboard load.

DROP POLICY IF EXISTS "cashier_select" ON public.print_settings;

CREATE POLICY "authenticated_select" ON public.print_settings
  FOR SELECT TO authenticated
  USING (true);
