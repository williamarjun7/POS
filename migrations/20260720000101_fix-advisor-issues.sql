-- ═══════════════════════════════════════════════════════════════
-- Migration: Fix all 13 InsForge Backend Advisor issues
-- ═══════════════════════════════════════════════════════════════
-- Issues 1-9: SECURITY DEFINER functions callable by public
-- Issue 10:  Missing FK index on table_sessions.closed_by
-- Issue 11:  Overly permissive RLS on notifications.staff_insert
-- Issue 12:  Overly permissive RLS on user_profiles.staff_select
-- Issue 13:  Overly permissive RLS on activity_logs.staff_insert
-- ═══════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- Issues 1-9: Revoke EXECUTE FROM public, grant TO authenticated
-- ═══════════════════════════════════════════════════════════════
-- These functions are SECURITY DEFINER to bypass RLS on user_profiles
-- when checking roles. They must remain SECURITY DEFINER. The fix is to
-- restrict who can CALL them — only authenticated users, not the public
-- (unauthenticated) role.
-- ═══════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.are_all_table_batches_settled(p_table_id uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.are_all_table_batches_settled(p_table_id uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_active_table_sessions() FROM public;
GRANT EXECUTE ON FUNCTION public.get_active_table_sessions() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.close_table_session(p_table_id uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.close_table_session(p_table_id uuid) TO authenticated;

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

-- ═══════════════════════════════════════════════════════════════
-- Issue 10: Missing FK index on table_sessions.closed_by
-- ═══════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_table_sessions_closed_by
  ON public.table_sessions(closed_by);

-- ═══════════════════════════════════════════════════════════════
-- Issue 11: Tighten notifications.staff_insert RLS policy
-- ═══════════════════════════════════════════════════════════════
-- SKIPPED: Notifications table was dropped in migration
-- 20260719000100, so no policies can be created on it.
-- ═══════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- Issue 12: Tighten user_profiles.staff_select RLS policy
-- ═══════════════════════════════════════════════════════════════
-- Kept as USING (true) intentionally — all POS staff need to see
-- each other's names/roles. Functions are SECURITY DEFINER.
-- ═══════════════════════════════════════════════════════════════

-- Policy unchanged — existing policy is correct for this app's
-- security model. Sensitive operations use SECURITY DEFINER functions.

-- ═══════════════════════════════════════════════════════════════
-- Issue 13: Tighten activity_logs.staff_insert RLS policy
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "staff_insert" ON public.activity_logs;

CREATE POLICY "staff_insert" ON public.activity_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (select auth.uid())
  );

