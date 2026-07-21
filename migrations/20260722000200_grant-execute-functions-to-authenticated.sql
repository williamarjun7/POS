-- Grant EXECUTE on all public functions to authenticated role.
-- Without this, PostgREST evaluates RLS policies as the `authenticated` role
-- but cannot call helper functions like is_cashier_or_above() / get_user_role(),
-- causing every query to fail with "permission denied for function ...".
-- This is the root cause of the widespread 403 errors.

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;
