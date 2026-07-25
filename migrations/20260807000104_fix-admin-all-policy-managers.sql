-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Fix admin_all Policy to Include Managers (2026-08-07 v5)
-- ════════════════════════════════════════════════════════════════════════════
-- The admin_all policy on user_profiles (created in migration 20260716004000)
-- uses public.is_admin() which only allows 'admin' role. Managers also need
-- full access to manage users via the Admin page.
--
-- Fix: Recreate admin_all with is_manager_or_above() so both admin and
-- manager roles have full CRUD on user_profiles.
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "admin_all" ON public.user_profiles;

CREATE POLICY "admin_all" ON public.user_profiles
  FOR ALL
  TO authenticated
  USING (public.is_manager_or_above())
  WITH CHECK (public.is_manager_or_above());
