-- ============================================================================
-- MIGRATION: Comprehensive Fix for 403 Forbidden Errors (2026-07-31)
-- ────────────────────────────────────────────────────────────────────────────
-- ROOT CAUSE:
--   get_user_role() defaults to 'viewer' when no user_profiles row exists.
--   The 'viewer' role has zero SELECT permissions on nearly every table.
--   New users sign up → profile INSERT silently fails (chicken-and-egg) →
--   get_user_role() returns 'viewer' → ALL queries return 403 Forbidden.
--
-- FIX:
--   1. Change get_user_role() default from 'viewer' to 'cashier'
--   2. Ensure all critical RLS policies exist (idempotent)
--   3. Ensure authenticated users have GRANT SELECT on all tables
--
-- Safe to run multiple times (fully idempotent).
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Fix get_user_role() default: 'viewer' → 'cashier'
-- ════════════════════════════════════════════════════════════════════════════
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

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Ensure role-helper functions exist (idempotent)
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.get_user_role() = 'admin'; $$;

CREATE OR REPLACE FUNCTION public.is_manager_or_above()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.get_user_role() IN ('admin', 'manager'); $$;

CREATE OR REPLACE FUNCTION public.is_cashier_or_above()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.get_user_role() IN ('admin', 'manager', 'cashier', 'waiter'); $$;

CREATE OR REPLACE FUNCTION public.is_receptionist_or_above()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.get_user_role() IN ('admin', 'manager', 'receptionist'); $$;

CREATE OR REPLACE FUNCTION public.is_housekeeper_or_above()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.get_user_role() IN ('admin', 'manager', 'housekeeper'); $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Ensure GRANTs are correct (authenticated can access all tables)
-- ════════════════════════════════════════════════════════════════════════════
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Ensure critical SELECT policies exist for cashier+ role
-- ════════════════════════════════════════════════════════════════════════════

-- Helper: create a policy only if it doesn't already exist
-- Usage: SELECT create_policy_if_not_exists('table', 'policy', 'cmd', 'role_check')

-- restaurant_tables: cashier+ SELECT
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='restaurant_tables' AND policyname='cashier_select') THEN
    CREATE POLICY "cashier_select" ON public.restaurant_tables
      FOR SELECT TO authenticated USING (public.is_cashier_or_above());
  END IF;
END $$;

-- restaurant_tables: receptionist+ SELECT
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='restaurant_tables' AND policyname='receptionist_select') THEN
    CREATE POLICY "receptionist_select" ON public.restaurant_tables
      FOR SELECT TO authenticated USING (public.is_receptionist_or_above());
  END IF;
END $$;

-- restaurant_tables: housekeeper+ SELECT
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='restaurant_tables' AND policyname='housekeeper_select') THEN
    CREATE POLICY "housekeeper_select" ON public.restaurant_tables
      FOR SELECT TO authenticated USING (public.is_housekeeper_or_above());
  END IF;
END $$;

-- menu_categories: all non-viewer SELECT
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='menu_categories' AND policyname='staff_select') THEN
    CREATE POLICY "staff_select" ON public.menu_categories
      FOR SELECT TO authenticated USING (public.get_user_role() != 'viewer');
  END IF;
END $$;

-- menu_items: all non-viewer SELECT
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='menu_items' AND policyname='staff_select') THEN
    CREATE POLICY "staff_select" ON public.menu_items
      FOR SELECT TO authenticated USING (public.get_user_role() != 'viewer');
  END IF;
END $$;

-- customers: cashier+ SELECT
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='customers' AND policyname='cashier_select') THEN
    CREATE POLICY "cashier_select" ON public.customers
      FOR SELECT TO authenticated USING (public.is_cashier_or_above());
  END IF;
END $$;

-- room_types: all non-viewer SELECT
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='room_types' AND policyname='staff_select') THEN
    CREATE POLICY "staff_select" ON public.room_types
      FOR SELECT TO authenticated USING (public.get_user_role() != 'viewer');
  END IF;
END $$;

-- rooms: all non-viewer SELECT
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='rooms' AND policyname='staff_select') THEN
    CREATE POLICY "staff_select" ON public.rooms
      FOR SELECT TO authenticated USING (public.get_user_role() != 'viewer');
  END IF;
END $$;

-- order_batches: cashier+ SELECT
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='order_batches' AND policyname='cashier_select') THEN
    CREATE POLICY "cashier_select" ON public.order_batches
      FOR SELECT TO authenticated USING (public.is_cashier_or_above());
  END IF;
END $$;

-- order_batch_items: cashier+ SELECT
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='order_batch_items' AND policyname='cashier_select') THEN
    CREATE POLICY "cashier_select" ON public.order_batch_items
      FOR SELECT TO authenticated USING (public.is_cashier_or_above());
  END IF;
END $$;

-- invoices: cashier+ SELECT
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='invoices' AND policyname='cashier_select') THEN
    CREATE POLICY "cashier_select" ON public.invoices
      FOR SELECT TO authenticated USING (public.is_cashier_or_above());
  END IF;
END $$;

-- invoice_items: cashier+ SELECT
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='invoice_items' AND policyname='cashier_select') THEN
    CREATE POLICY "cashier_select" ON public.invoice_items
      FOR SELECT TO authenticated USING (public.is_cashier_or_above());
  END IF;
END $$;

-- payments: cashier+ SELECT
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='payments' AND policyname='cashier_select') THEN
    CREATE POLICY "cashier_select" ON public.payments
      FOR SELECT TO authenticated USING (public.is_cashier_or_above());
  END IF;
END $$;

-- inventory_items: cashier+ SELECT
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='inventory_items' AND policyname='cashier_select') THEN
    CREATE POLICY "cashier_select" ON public.inventory_items
      FOR SELECT TO authenticated USING (public.is_cashier_or_above());
  END IF;
END $$;

-- expenses: manager+ only (no cashier SELECT — intentional)
-- activity_logs: manager+ all, staff INSERT only
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='activity_logs' AND policyname='staff_insert') THEN
    CREATE POLICY "staff_insert" ON public.activity_logs
      FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;

-- print_settings: all authenticated SELECT
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='print_settings' AND policyname='authenticated_select') THEN
    CREATE POLICY "authenticated_select" ON public.print_settings
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- user_profiles: staff can SELECT all
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_profiles' AND policyname='staff_select') THEN
    CREATE POLICY "staff_select" ON public.user_profiles
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- user_profiles: self INSERT (chicken-and-egg fix)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_profiles' AND policyname='self_insert') THEN
    CREATE POLICY "self_insert" ON public.user_profiles
      FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = id);
  END IF;
END $$;

-- user_profiles: self UPDATE
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_profiles' AND policyname='self_update') THEN
    CREATE POLICY "self_update" ON public.user_profiles
      FOR UPDATE TO authenticated
      USING ((SELECT auth.uid()) = id)
      WITH CHECK ((SELECT auth.uid()) = id);
  END IF;
END $$;

-- table_sessions: cashier+ INSERT/SELECT/UPDATE
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='table_sessions' AND policyname='cashier_insert') THEN
    CREATE POLICY "cashier_insert" ON public.table_sessions
      FOR INSERT TO authenticated WITH CHECK (public.is_cashier_or_above());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='table_sessions' AND policyname='cashier_select') THEN
    CREATE POLICY "cashier_select" ON public.table_sessions
      FOR SELECT TO authenticated USING (public.is_cashier_or_above());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='table_sessions' AND policyname='cashier_update') THEN
    CREATE POLICY "cashier_update" ON public.table_sessions
      FOR UPDATE TO authenticated
      USING (public.is_cashier_or_above())
      WITH CHECK (public.is_cashier_or_above());
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFICATION
-- ════════════════════════════════════════════════════════════════════════════
-- Run after applying:
--   SELECT public.get_user_role();          -- should return 'cashier' (or actual role)
--   SELECT public.is_cashier_or_above();     -- should return true
--   SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname='public' ORDER BY tablename;
