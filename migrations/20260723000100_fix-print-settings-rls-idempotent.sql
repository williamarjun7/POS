-- ============================================================================
-- MIGRATION: Fix Print Settings RLS — Idempotent (2026-07-23)
-- ────────────────────────────────────────────────────────────────────────────
-- Safely applies the fix for "permission denied for table print_settings"
-- on existing installations where intermediate migrations may conflict.
--
-- Safe to run multiple times (idempotent via IF EXISTS / IF NOT EXISTS).
-- ============================================================================

-- ─── 1. Drop the overly-restrictive cashier_select policy ─────────────────
-- This policy uses is_cashier_or_above() which returns false for users
-- whose role defaults to 'viewer' (no user_profiles row yet).
DROP POLICY IF EXISTS "cashier_select" ON public.print_settings;

-- ─── 2. Create an authenticated_select policy allowing ALL auth users ─────
-- print_settings contains non-sensitive printer/paper configuration.
-- This policy replaces cashier_select so every authenticated user can read it.
-- admin/manager CRUD is still handled by admin_manager_all policy.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'print_settings'
    AND policyname = 'authenticated_select'
  ) THEN
    CREATE POLICY "authenticated_select" ON public.print_settings
      FOR SELECT TO authenticated
      USING (true);
  END IF;
END
$$;

-- ─── 3. Fix get_user_role() default: 'viewer' → 'cashier' ────────────────
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
