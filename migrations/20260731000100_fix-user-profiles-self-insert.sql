-- =============================================================================
-- Fix: Allow new users to CREATE their own user_profiles record
-- =============================================================================
-- PROBLEM:
--   The `admin_all` policy on user_profiles requires is_admin() for INSERT.
--   But new users don't have a profile yet, so get_user_role() returns 'viewer'
--   and is_admin() returns false → INSERT is blocked.
--
--   This causes a chicken-and-egg problem for new user signups:
--   - auth-context.tsx calls db.insertOne('user_profiles', { id: auth.uid(), ... })
--   - INSERT fails silently (caught in try-catch)
--   - get_user_role() keeps returning 'viewer'
--   - ALL subsequent queries return 403 because 'viewer' has no SELECT permissions
-- =============================================================================

-- ─── Allow any authenticated user to INSERT their own profile ────────────────
-- The id column must match their auth.uid() — no user can create a profile for
-- someone else. This is safe because:
-- 1. WITH CHECK ensures id = auth.uid()
-- 2. The trigger trg_user_profiles_prevent_escalation still prevents non-admin
--    users from changing their role/active status later
-- 3. Admin users still have full CRUD via the existing admin_all policy

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_profiles'
      AND policyname = 'self_insert'
  ) THEN
    CREATE POLICY "self_insert" ON public.user_profiles
      FOR INSERT TO authenticated
      WITH CHECK ((SELECT auth.uid()) = id);
  END IF;
END;
$$;

-- =============================================================================
-- VERIFICATION
-- =============================================================================
--
-- 1. Check the new policy exists:
--    SELECT schemaname, tablename, policyname, cmd, qual
--    FROM pg_policies
--    WHERE tablename = 'user_profiles'
--    ORDER BY policyname;
--
-- 2. The expected policies on user_profiles should now be:
--    - admin_all     (ALL)       → is_admin()
--    - staff_select  (SELECT)    → true
--    - self_update   (UPDATE)    → auth.uid() = id
--    - self_insert   (INSERT)    → auth.uid() = id    ← NEW
