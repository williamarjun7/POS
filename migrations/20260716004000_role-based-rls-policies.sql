-- ============================================================================
-- MIGRATION: Role-Based RLS Policies (2026-07-16)
-- ────────────────────────────────────────────────────────────────────────────
-- Replaces blanket 'authenticated' policies with granular role-based access
-- control that mirrors the frontend RBAC system defined in
-- src/lib/core/permissions.ts.
--
-- Before this migration:  ANY authenticated user has FULL CRUD on every table.
-- After this migration:   Each role can only perform actions its permissions
--                         grant — enforced at the database level.
--
-- Roles (stored in user_profiles.role):
--   admin, manager, cashier, waiter, housekeeper, receptionist
--
-- Role hierarchy for RLS:
--   admin         → Full CRUD on all tables
--   manager       → Full CRUD on operational + finance + inventory + settings
--   cashier/waiter→ POS only: create orders, receive payments, view menu/customers
--   receptionist  → Bookings + customers + room view
--   housekeeper   → Housekeeping tasks + room view
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- HELPER FUNCTIONS
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Get the current user's role from user_profiles ───────────────────────
-- Uses SECURITY DEFINER so the function itself bypasses RLS on user_profiles
-- (otherwise we'd have a chicken-and-egg problem reading our own role).
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.user_profiles WHERE id = auth.uid() LIMIT 1),
    'viewer'
  );
$$;

-- ─── Role-check shortcuts ─────────────────────────────────────────────────
-- Each returns TRUE if the current user's role is in the allowed set.
-- Role hierarchy: admin > manager > cashier/waiter > receptionist/housekeeper

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_user_role() = 'admin';
$$;

CREATE OR REPLACE FUNCTION public.is_manager_or_above()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_user_role() IN ('admin', 'manager');
$$;

CREATE OR REPLACE FUNCTION public.is_cashier_or_above()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_user_role() IN ('admin', 'manager', 'cashier', 'waiter');
$$;

CREATE OR REPLACE FUNCTION public.is_receptionist_or_above()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_user_role() IN ('admin', 'manager', 'receptionist');
$$;

CREATE OR REPLACE FUNCTION public.is_housekeeper_or_above()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_user_role() IN ('admin', 'manager', 'housekeeper');
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 1: Drop ALL existing policies (clean slate)
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', rec.policyname, rec.schemaname, rec.tablename);
  END LOOP;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2: Create role-based policies per table
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. branches ── admin/manager: full CRUD ──────────────────────────────
CREATE POLICY "admin_manager_all" ON public.branches
  FOR ALL TO authenticated
  USING (public.is_manager_or_above())
  WITH CHECK (public.is_manager_or_above());

-- ─── 2. restaurant_tables ── admin/manager: CRUD, cashier+: select ─────────
CREATE POLICY "admin_manager_all" ON public.restaurant_tables
  FOR ALL TO authenticated
  USING (public.is_manager_or_above())
  WITH CHECK (public.is_manager_or_above());

CREATE POLICY "staff_select" ON public.restaurant_tables
  FOR SELECT TO authenticated
  USING (public.is_cashier_or_above() OR public.is_receptionist_or_above() OR public.is_housekeeper_or_above());

-- ─── 3. menu_categories ── admin/manager: CRUD, all staff: select ─────────
CREATE POLICY "admin_manager_all" ON public.menu_categories
  FOR ALL TO authenticated
  USING (public.is_manager_or_above())
  WITH CHECK (public.is_manager_or_above());

CREATE POLICY "staff_select" ON public.menu_categories
  FOR SELECT TO authenticated
  USING (public.get_user_role() != 'viewer');

-- ─── 4. menu_items ── admin/manager: CRUD, all staff: select ──────────────
CREATE POLICY "admin_manager_all" ON public.menu_items
  FOR ALL TO authenticated
  USING (public.is_manager_or_above())
  WITH CHECK (public.is_manager_or_above());

CREATE POLICY "staff_select" ON public.menu_items
  FOR SELECT TO authenticated
  USING (public.get_user_role() != 'viewer');

-- ─── 5. customers ── admin/manager/receptionist: CRUD, cashier: select ─────
CREATE POLICY "admin_manager_all" ON public.customers
  FOR ALL TO authenticated
  USING (public.is_manager_or_above() OR public.is_receptionist_or_above())
  WITH CHECK (public.is_manager_or_above() OR public.is_receptionist_or_above());

CREATE POLICY "cashier_select" ON public.customers
  FOR SELECT TO authenticated
  USING (public.is_cashier_or_above());

-- ─── 6. room_types ── admin/manager: CRUD, all staff: select ──────────────
CREATE POLICY "admin_manager_all" ON public.room_types
  FOR ALL TO authenticated
  USING (public.is_manager_or_above())
  WITH CHECK (public.is_manager_or_above());

CREATE POLICY "staff_select" ON public.room_types
  FOR SELECT TO authenticated
  USING (public.get_user_role() != 'viewer');

-- ─── 7. rooms ── admin/manager: CRUD, all staff: select ───────────────────
CREATE POLICY "admin_manager_all" ON public.rooms
  FOR ALL TO authenticated
  USING (public.is_manager_or_above())
  WITH CHECK (public.is_manager_or_above());

CREATE POLICY "staff_select" ON public.rooms
  FOR SELECT TO authenticated
  USING (public.get_user_role() != 'viewer');

-- ─── 8. bookings ── admin/manager/receptionist: CRUD ───────────────────────
CREATE POLICY "admin_manager_receptionist_all" ON public.bookings
  FOR ALL TO authenticated
  USING (public.is_manager_or_above() OR public.is_receptionist_or_above())
  WITH CHECK (public.is_manager_or_above() OR public.is_receptionist_or_above());

-- ─── 9. order_batches ── admin/manager: CRUD, cashier: insert+select ──────
CREATE POLICY "admin_manager_all" ON public.order_batches
  FOR ALL TO authenticated
  USING (public.is_manager_or_above())
  WITH CHECK (public.is_manager_or_above());

CREATE POLICY "cashier_insert_select" ON public.order_batches
  FOR INSERT TO authenticated
  WITH CHECK (public.is_cashier_or_above());

CREATE POLICY "cashier_select" ON public.order_batches
  FOR SELECT TO authenticated
  USING (public.is_cashier_or_above());

CREATE POLICY "cashier_update" ON public.order_batches
  FOR UPDATE TO authenticated
  USING (public.is_cashier_or_above())
  WITH CHECK (public.is_cashier_or_above());

-- ─── 10. order_batch_items ── admin/manager: CRUD, cashier: insert+select ─
CREATE POLICY "admin_manager_all" ON public.order_batch_items
  FOR ALL TO authenticated
  USING (public.is_manager_or_above())
  WITH CHECK (public.is_manager_or_above());

CREATE POLICY "cashier_insert_select" ON public.order_batch_items
  FOR INSERT TO authenticated
  WITH CHECK (public.is_cashier_or_above());

CREATE POLICY "cashier_select" ON public.order_batch_items
  FOR SELECT TO authenticated
  USING (public.is_cashier_or_above());

CREATE POLICY "cashier_update" ON public.order_batch_items
  FOR UPDATE TO authenticated
  USING (public.is_cashier_or_above())
  WITH CHECK (public.is_cashier_or_above());

-- ─── 11. invoices ── admin/manager: CRUD, cashier: insert+select+update ───
CREATE POLICY "admin_manager_all" ON public.invoices
  FOR ALL TO authenticated
  USING (public.is_manager_or_above())
  WITH CHECK (public.is_manager_or_above());

CREATE POLICY "cashier_insert_select" ON public.invoices
  FOR INSERT TO authenticated
  WITH CHECK (public.is_cashier_or_above());

CREATE POLICY "cashier_select" ON public.invoices
  FOR SELECT TO authenticated
  USING (public.is_cashier_or_above());

CREATE POLICY "cashier_update" ON public.invoices
  FOR UPDATE TO authenticated
  USING (public.is_cashier_or_above())
  WITH CHECK (public.is_cashier_or_above());

-- ─── 12. invoice_items ── admin/manager: CRUD, cashier: insert+select ─────
CREATE POLICY "admin_manager_all" ON public.invoice_items
  FOR ALL TO authenticated
  USING (public.is_manager_or_above())
  WITH CHECK (public.is_manager_or_above());

CREATE POLICY "cashier_insert_select" ON public.invoice_items
  FOR INSERT TO authenticated
  WITH CHECK (public.is_cashier_or_above());

CREATE POLICY "cashier_select" ON public.invoice_items
  FOR SELECT TO authenticated
  USING (public.is_cashier_or_above());

-- ─── 13. payments ── admin/manager: CRUD, cashier: insert+select ──────────
CREATE POLICY "admin_manager_all" ON public.payments
  FOR ALL TO authenticated
  USING (public.is_manager_or_above())
  WITH CHECK (public.is_manager_or_above());

CREATE POLICY "cashier_insert_select" ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (public.is_cashier_or_above());

CREATE POLICY "cashier_select" ON public.payments
  FOR SELECT TO authenticated
  USING (public.is_cashier_or_above());

-- ─── 14. expenses ── admin/manager: CRUD only ─────────────────────────────
CREATE POLICY "admin_manager_all" ON public.expenses
  FOR ALL TO authenticated
  USING (public.is_manager_or_above())
  WITH CHECK (public.is_manager_or_above());

-- ─── 15. cash_reconciliations ── admin/manager: CRUD only ─────────────────
CREATE POLICY "admin_manager_all" ON public.cash_reconciliations
  FOR ALL TO authenticated
  USING (public.is_manager_or_above())
  WITH CHECK (public.is_manager_or_above());

-- ─── 16. suppliers ── admin/manager: CRUD only ────────────────────────────
CREATE POLICY "admin_manager_all" ON public.suppliers
  FOR ALL TO authenticated
  USING (public.is_manager_or_above())
  WITH CHECK (public.is_manager_or_above());

-- ─── 17. inventory_items ── admin/manager: CRUD, cashier: select ──────────
CREATE POLICY "admin_manager_all" ON public.inventory_items
  FOR ALL TO authenticated
  USING (public.is_manager_or_above())
  WITH CHECK (public.is_manager_or_above());

CREATE POLICY "cashier_select" ON public.inventory_items
  FOR SELECT TO authenticated
  USING (public.is_cashier_or_above());

-- ─── 18. stock_movements ── admin/manager: CRUD only ──────────────────────
CREATE POLICY "admin_manager_all" ON public.stock_movements
  FOR ALL TO authenticated
  USING (public.is_manager_or_above())
  WITH CHECK (public.is_manager_or_above());

-- ─── 19. purchase_orders ── admin/manager: CRUD only ──────────────────────
CREATE POLICY "admin_manager_all" ON public.purchase_orders
  FOR ALL TO authenticated
  USING (public.is_manager_or_above())
  WITH CHECK (public.is_manager_or_above());

-- ─── 20. purchase_order_items ── admin/manager: CRUD only ─────────────────
CREATE POLICY "admin_manager_all" ON public.purchase_order_items
  FOR ALL TO authenticated
  USING (public.is_manager_or_above())
  WITH CHECK (public.is_manager_or_above());

-- ─── 21. supplier_payments ── admin/manager: CRUD only ────────────────────
CREATE POLICY "admin_manager_all" ON public.supplier_payments
  FOR ALL TO authenticated
  USING (public.is_manager_or_above())
  WITH CHECK (public.is_manager_or_above());

-- ─── 22. housekeeping_tasks ── admin/manager/housekeeper: CRUD ────────────
CREATE POLICY "admin_manager_housekeeper_all" ON public.housekeeping_tasks
  FOR ALL TO authenticated
  USING (public.is_manager_or_above() OR public.is_housekeeper_or_above())
  WITH CHECK (public.is_manager_or_above() OR public.is_housekeeper_or_above());

-- ─── 23. maintenance_requests ── admin/manager: CRUD, housekeeper: insert+select ─
CREATE POLICY "admin_manager_all" ON public.maintenance_requests
  FOR ALL TO authenticated
  USING (public.is_manager_or_above())
  WITH CHECK (public.is_manager_or_above());

CREATE POLICY "housekeeper_insert_select" ON public.maintenance_requests
  FOR INSERT TO authenticated
  WITH CHECK (public.is_housekeeper_or_above());

CREATE POLICY "housekeeper_select" ON public.maintenance_requests
  FOR SELECT TO authenticated
  USING (public.is_housekeeper_or_above());

-- ─── 24. notifications ── user-scoped + admin/manager: manage ─────────────
-- Users see their own notifications (or null user_id = system-wide).
-- Admin/manager can see all.
CREATE POLICY "admin_manager_all" ON public.notifications
  FOR ALL TO authenticated
  USING (public.is_manager_or_above())
  WITH CHECK (public.is_manager_or_above());

CREATE POLICY "user_select" ON public.notifications
  FOR SELECT TO authenticated
  USING (
    (user_id IS NULL) OR
    ((SELECT auth.uid()) = user_id)
  );

-- Any authenticated staff can create notifications (activity-driven)
CREATE POLICY "staff_insert" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- ─── 25. activity_logs ── append-only for staff, full access for admin/manager ─
-- All authenticated staff can insert (append-only audit trail).
-- Only admin/manager can select/view all logs.
CREATE POLICY "admin_manager_all" ON public.activity_logs
  FOR ALL TO authenticated
  USING (public.is_manager_or_above())
  WITH CHECK (public.is_manager_or_above());

CREATE POLICY "staff_insert" ON public.activity_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- ─── 26. print_settings ── admin/manager: CRUD, cashier: select only ──────
CREATE POLICY "admin_manager_all" ON public.print_settings
  FOR ALL TO authenticated
  USING (public.is_manager_or_above())
  WITH CHECK (public.is_manager_or_above());

CREATE POLICY "cashier_select" ON public.print_settings
  FOR SELECT TO authenticated
  USING (public.is_cashier_or_above());

-- ─── 27. business_settings ── admin/manager: CRUD only ────────────────────
CREATE POLICY "admin_manager_all" ON public.business_settings
  FOR ALL TO authenticated
  USING (public.is_manager_or_above())
  WITH CHECK (public.is_manager_or_above());

-- ─── 28. feature_flags ── admin/manager: CRUD only ────────────────────────
CREATE POLICY "admin_manager_all" ON public.feature_flags
  FOR ALL TO authenticated
  USING (public.is_manager_or_above())
  WITH CHECK (public.is_manager_or_above());

-- ─── 29. user_profiles ── admin: CRUD, all staff: select, self: update own ──
-- Admin can manage all profiles.
-- All authenticated staff can read profiles (needed for role-aware UI).
-- Staff can update their own profile (name, phone) but NOT role or active status.

-- Trigger to prevent non-admin users from changing their own role/active status
-- (RLS WITH CHECK cannot reference OLD row, so a trigger is needed here)
CREATE OR REPLACE FUNCTION public.prevent_self_role_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow admins to change anything
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- Non-admin users cannot change their own role or active status
  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.active IS DISTINCT FROM OLD.active THEN
    RAISE EXCEPTION 'Staff cannot change their own role or active status';
  END IF;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if re-running migration
DROP TRIGGER IF EXISTS trg_user_profiles_prevent_escalation ON public.user_profiles;

CREATE TRIGGER trg_user_profiles_prevent_escalation
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_self_role_escalation();

-- RLS policies for user_profiles
CREATE POLICY "admin_all" ON public.user_profiles
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- All authenticated staff can read profiles
CREATE POLICY "staff_select" ON public.user_profiles
  FOR SELECT TO authenticated
  USING (true);

-- Staff can update their own profile (trigger prevents role/active changes)
CREATE POLICY "self_update" ON public.user_profiles
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

-- ════════════════════════════════════════════════════════════════════════════
-- GRANTS (ensure roles can access what they need)
-- ════════════════════════════════════════════════════════════════════════════

-- Revoke the blanket grant and re-apply per-table
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;

-- Re-grant USAGE on schema (needed for any query)
GRANT USAGE ON SCHEMA public TO authenticated;

-- Grant SELECT, INSERT, UPDATE, DELETE per-table
-- The RLS policies will enforce the actual role checks at row level.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES
-- ════════════════════════════════════════════════════════════════════════════
--
-- 1. See all new policies:
--    SELECT schemaname, tablename, policyname, cmd, roles
--    FROM pg_policies
--    WHERE schemaname = 'public'
--    ORDER BY tablename, policyname;
--
-- 2. Test as admin user (should succeed):
--    INSERT INTO public.expenses (description, category, amount, date, payment_method)
--    VALUES ('Test', 'utilities', 100, CURRENT_DATE, 'cash');
--    DELETE FROM public.expenses WHERE description = 'Test';
--
-- 3. Test as cashier user (should FAIL on expenses):
--    INSERT INTO public.expenses (description, category, amount, date, payment_method)
--    VALUES ('Test', 'utilities', 100, CURRENT_DATE, 'cash');
--    -- Expected: ERROR: new row violates row-level security policy
--
-- 4. Verify helper functions work:
--    SELECT public.get_user_role();
--    SELECT public.is_admin();
--    SELECT public.is_cashier_or_above();
