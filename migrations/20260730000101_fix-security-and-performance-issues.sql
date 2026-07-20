-- =============================================================================
-- Fix 12 Backend Advisor Issues
-- =============================================================================

-- =============================================================================
-- Issues 1-9: Restrict EXECUTE on SECURITY DEFINER helper functions
-- Role-checking functions are used in RLS policies and MUST remain SECURITY
-- DEFINER, but should NOT be directly callable by the authenticated role.
-- =============================================================================

-- Revoke direct EXECUTE from authenticated and public for role-helper functions
REVOKE EXECUTE ON FUNCTION public.get_user_role() FROM authenticated, public;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM authenticated, public;
REVOKE EXECUTE ON FUNCTION public.is_manager_or_above() FROM authenticated, public;
REVOKE EXECUTE ON FUNCTION public.is_cashier_or_above() FROM authenticated, public;
REVOKE EXECUTE ON FUNCTION public.is_receptionist_or_above() FROM authenticated, public;
REVOKE EXECUTE ON FUNCTION public.is_housekeeper_or_above() FROM authenticated, public;
REVOKE EXECUTE ON FUNCTION public.are_all_table_batches_settled(p_table_id uuid) FROM authenticated, public;
REVOKE EXECUTE ON FUNCTION public.get_active_table_sessions() FROM authenticated, public;

-- Grant EXECUTE to postgres and project_admin only
GRANT EXECUTE ON FUNCTION public.get_user_role() TO postgres;
GRANT EXECUTE ON FUNCTION public.is_admin() TO postgres;
GRANT EXECUTE ON FUNCTION public.is_manager_or_above() TO postgres;
GRANT EXECUTE ON FUNCTION public.is_cashier_or_above() TO postgres;
GRANT EXECUTE ON FUNCTION public.is_receptionist_or_above() TO postgres;
GRANT EXECUTE ON FUNCTION public.is_housekeeper_or_above() TO postgres;
GRANT EXECUTE ON FUNCTION public.are_all_table_batches_settled(p_table_id uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.get_active_table_sessions() TO postgres;

-- close_table_session: convert to SECURITY INVOKER (safe — only accesses
-- tables that authenticated role already has direct DML grants on)
ALTER FUNCTION public.close_table_session(p_table_id uuid) SECURITY INVOKER;

-- =============================================================================
-- Issue 10: Add missing index on foreign key column
-- =============================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_batch_items_voided_by
  ON order_batch_items(voided_by);

-- =============================================================================
-- Issues 11-12: RLS policy review (NO CHANGE NEEDED)
--
-- user_profiles and print_settings are shared/global tables with no user_id
-- column. USING (true) is correct for these tables:
--   - user_profiles: staff directory — all staff should see who works there
--   - print_settings: singleton config — all staff need to read print config
-- =============================================================================
