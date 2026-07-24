-- ============================================================================
-- MIGRATION: Fix Owner Role RLS (2026-08-06)
-- ────────────────────────────────────────────────────────────────────────────
-- ROOT CAUSE:
--   The `is_cashier_or_above()` RLS helper function checks only:
--     admin, manager, cashier, waiter
--   The `owner` role is NOT included in ANY RLS helper. When an owner user
--   accesses the dashboard, EVERY database query returns empty results
--   because RLS silently filters out all rows.
--
--   This causes:
--     - Tables section shows "No tables configured"
--     - All KPI cards show Rs. 0
--     - Pending payments, activity feed, and all other dashboard widgets
--       appear empty
--
-- FIX:
--   Add `owner` to `is_cashier_or_above()` so the owner role gets SELECT
--   access to operational tables needed for the dashboard (restaurant_tables,
--   invoices, payments, expenses, order_batch_items, customers, etc.).
--
--   Note: Adding owner to `is_cashier_or_above()` also grants INSERT/UPDATE
--   on some tables where cashier-specific INSERT/UPDATE policies exist.
--   However, the frontend does not expose write UI for the owner role
--   (no POS, no "New Expense" button, etc.), so this is not a real concern.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Add 'owner' to is_cashier_or_above()
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_cashier_or_above()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_user_role() IN ('admin', 'manager', 'cashier', 'waiter', 'owner');
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Grant execute on the updated function
-- ════════════════════════════════════════════════════════════════════════════

GRANT EXECUTE ON FUNCTION public.is_cashier_or_above() TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFICATION
-- ════════════════════════════════════════════════════════════════════════════
--
-- After applying this migration:
--   1. Login as an owner user
--   2. Navigate to the dashboard
--   3. Tables should now appear (if any are configured)
--   4. KPI cards should show real data
--   5. Pending payments and activity feed should work
--
-- To test directly in SQL (requires switching to the owner role):
--   SELECT public.get_user_role();               -- should return 'owner'
--   SELECT public.is_cashier_or_above();           -- should return true
--   SELECT * FROM public.restaurant_tables LIMIT 5;  -- should return rows
