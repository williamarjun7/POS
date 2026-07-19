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
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'customers' AND policyname = 'cashier_insert'
  ) THEN
    CREATE POLICY "cashier_insert" ON public.customers
      FOR INSERT TO authenticated
      WITH CHECK (public.is_cashier_or_above());
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'customers' AND policyname = 'cashier_update'
  ) THEN
    CREATE POLICY "cashier_update" ON public.customers
      FOR UPDATE TO authenticated
      USING (public.is_cashier_or_above())
      WITH CHECK (public.is_cashier_or_above());
  END IF;
END;
$$;

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
