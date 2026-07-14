-- ============================================================================
-- MIGRATION: Fix customers RLS — allow cashiers to INSERT/UPDATE (2026-07-17)
-- ────────────────────────────────────────────────────────────────────────────
-- Background:
--   The role-based RLS migration (20260716004000) restricted customers INSERT
--   to admin/manager/receptionist only. Cashiers process credit payments that
--   require auto-creating customer records via ensureCustomer(), but the INSERT
--   was silently blocked by RLS, causing the Customers page to remain empty.
--
-- Changes:
--   1. Add cashier INSERT policy on public.customers
--   2. Add cashier UPDATE policy on public.customers
--      (needed for credit_balance, total_orders, total_spent updates)
-- ============================================================================

-- ─── Cashiers can INSERT new customers ─────────────────────────────────────
-- Needed for: ensureCustomer() in customer-ledger.ts creates new customer
-- records when a credit payment references a name not yet in the DB.
CREATE POLICY IF NOT EXISTS "cashier_insert" ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (public.is_cashier_or_above());

-- ─── Cashiers can UPDATE existing customers ────────────────────────────────
-- Needed for: recordCreditCharge() in customer-ledger.ts updates
-- credit_balance, total_orders, total_spent, and last_visit after a charge.
CREATE POLICY IF NOT EXISTS "cashier_update" ON public.customers
  FOR UPDATE TO authenticated
  USING (public.is_cashier_or_above())
  WITH CHECK (public.is_cashier_or_above());

-- ============================================================================
-- VERIFICATION
-- ============================================================================
--
-- 1. Confirm the new policies exist:
--    SELECT schemaname, tablename, policyname, cmd
--    FROM pg_policies
--    WHERE tablename = 'customers'
--    ORDER BY policyname;
--
-- 2. Test as a cashier user (should succeed):
--    INSERT INTO public.customers (name) VALUES ('Test Cashier Customer');
--    DELETE FROM public.customers WHERE name = 'Test Cashier Customer';
--
-- 3. Insert should also work via the application flow:
--    - Process a credit payment with a new customer name in POS
--    - Navigate to Customers page — new customer should appear
--    - Customer search should work
--    - Customer ledger entry should exist
