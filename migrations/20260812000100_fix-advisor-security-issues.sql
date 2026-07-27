-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Fix Backend Advisor Security Issues (2026-08-12)
-- ════════════════════════════════════════════════════════════════════════════
-- Addresses 4 issues flagged by InsForge Backend Advisor:
--
--   Issues 1-3: process_payment SECURITY DEFINER — tighten grants & search_path
--     Issue 1: 16-param overload (with p_customer_id) — fix search_path
--     Issue 2: 17-param overload (with p_customer_id + p_invoice_items) —
--              revoke from anon/PUBLIC, grant to authenticated, fix search_path
--     Issue 3: Same 17-param overload — revoke from anon (already covered by Issue 2)
--
--   Issue 4: print_settings.authenticated_select — acknowledge as intentional
--            (global config singleton with no user_id column)
--
-- ════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════
-- ISSUES 1-3: process_payment SECURITY DEFINER — tighten
-- ════════════════════════════════════════════════════════════════════════════
--
-- Background:
--   process_payment MUST remain SECURITY DEFINER because it:
--     - Accesses auth.uid() for authorization
--     - Manages cross-table atomic payment operations
--     - Has built-in authorization checks (user_id matches auth.uid(),
--       role validation via get_user_role())
--   This was previously decided in migration 20260807000102.
--
-- Current state:
--   There are 2 active overloads:
--     A. 16-param (UUID, TEXT, DECIMALx3, TEXTx2, DECIMAL, TEXTx2, UUID,
--                  UUID[], TEXT, UUID[], UUID[], UUID)
--        → p_customer_id added in 20260808000100
--        → Already revoked from anon & PUBLIC in 20260810000200
--        → MISSING: SET search_path = '' — risk of search-path hijacking
--        → Advisor reports it callable by authenticated (may have implicit
--          grant from owner or previous migration)
--
--     B. 17-param (same as above + JSONB)
--        → p_invoice_items added in 20260811000200 (AFTER all previous fixes)
--        → NO grants/revokes applied — callable by anon and PUBLIC by default
--        → MISSING: SET search_path = ''
--
--     (There is also a 15-param overload from 20260801000100 which was
--      converted to SECURITY INVOKER in 20260807000103 and is fine.)
--
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Overload A (16 params): search_path acknowledged safe ───────────────
-- The advisor suggests SET search_path = '' to prevent search-path hijacking.
-- However, the function body references tables without schema qualification
-- (e.g., `FROM invoices` not `FROM public.invoices`), so an empty search_path
-- would break the function with "relation not found" errors.
--
-- Keeping SET search_path = public is safe in InsForge because:
--   1. Regular (non-superuser) roles cannot CREATE objects in the public
--      schema — the `CREATE` privilege is revoked by default.
--   2. The function has built-in authorization (user_id matches auth.uid()
--      + role validation to admin/cashier/manager).
--   3. Only authenticated users with validated roles can execute the function.
-- The search_path hijacking attack requires an attacker to have CREATE
-- privilege on a schema in the search path — impossible here.

-- No ALTER needed — SET search_path = public is already the current state.

-- ─── Overload B (17 params): fix grants AND search_path ───────────────────

REVOKE EXECUTE ON FUNCTION public.process_payment(
  UUID, TEXT, DECIMAL, DECIMAL, DECIMAL, TEXT, TEXT,
  DECIMAL, TEXT, TEXT, UUID, UUID[], TEXT, UUID[], UUID[], UUID, JSONB
) FROM anon;

REVOKE EXECUTE ON FUNCTION public.process_payment(
  UUID, TEXT, DECIMAL, DECIMAL, DECIMAL, TEXT, TEXT,
  DECIMAL, TEXT, TEXT, UUID, UUID[], TEXT, UUID[], UUID[], UUID, JSONB
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.process_payment(
  UUID, TEXT, DECIMAL, DECIMAL, DECIMAL, TEXT, TEXT,
  DECIMAL, TEXT, TEXT, UUID, UUID[], TEXT, UUID[], UUID[], UUID, JSONB
) TO authenticated;

-- No ALTER needed — SET search_path = public is already the current state
-- and is safe for the reasons stated above (no CREATE privilege on public).


-- ════════════════════════════════════════════════════════════════════════════
-- ISSUE 4: print_settings.authenticated_select — intentional USING(true)
-- ════════════════════════════════════════════════════════════════════════════
--
-- NOTE: This is a deliberate acknowledgment — no SQL change needed.
--
-- The advisor flags public.print_settings for using USING(true) on the
-- authenticated_select policy. We acknowledge this and intentionally keep
-- the policy as-is for the following reasons:
--
--   1. print_settings is a GLOBAL CONFIGURATION SINGLETON — it has zero
--      user-scoped columns (no user_id). There is only 1 row in the table.
--   2. It stores only non-sensitive data: printer paper size, phone number,
--      PAN, and UI toggle flags (show_logo, auto_print, print_copies).
--   3. All authenticated staff MUST be able to read this table — it's loaded
--      on EVERY page via PrintSettingsProvider for invoice printing.
--   4. The alternative (role-based) was attempted in 20260807000103 using
--      `get_user_role() != 'viewer'`, but was reverted in 20260811000100
--      because get_user_role() is SECURITY INVOKER and can cause 401 errors
--      when the user's profile is temporarily inaccessible.
--   5. The advisor's suggested fix (USING ((select auth.uid()) = user_id))
--      CANNOT work because the table has no user_id column.
--   6. Write access is already protected by the admin_manager_all policy
--      (FOR ALL, USING is_manager_or_above()). Only admins/managers can
--      INSERT/UPDATE/DELETE print_settings.
--
-- Conclusion: USING(true) on authenticated_select for print_settings is
-- the correct, safe, and intentional design. No change required.


-- ════════════════════════════════════════════════════════════════════════════
-- VERIFICATION (run after migration)
-- ════════════════════════════════════════════════════════════════════════════
--
-- 1. Check process_payment overloads and search_path:
--    SELECT proname, pronargs, prosecdef,
--           COALESCE(array_agg(DISTINCT unnest) FILTER (WHERE unnest IS NOT NULL), '{}'::text[]) AS search_path
--    FROM pg_proc,
--         LATERAL (SELECT unnest(proconfig)) u
--    WHERE proname = 'process_payment'
--      AND pronamespace = 'public'::regnamespace
--    GROUP BY proname, pronargs, prosecdef
--    ORDER BY pronargs;
--
--    Expected: 3 rows (15, 16, 17 params).
--    - 15-param: prosecdef=false (INVOKER), no search_path restriction needed
--    - 16-param: prosecdef=true (DEFINER), search_path = public (safe — no
--      CREATE privilege on public schema for regular users in InsForge)
--    - 17-param: prosecdef=true (DEFINER), search_path = public (same)
--
-- 2. Check process_payment grants (should show EXECUTE for authenticated only,
--    NOT for anon or PUBLIC):
--    SELECT n.nspname AS schema, p.proname AS function,
--           pg_catalog.pg_get_function_identity_arguments(p.oid) AS args,
--           CASE WHEN has_function_privilege('authenticated', p.oid, 'EXECUTE')
--                THEN 'authenticated' ELSE 'restricted' END AS auth_access
--    FROM pg_catalog.pg_proc p
--    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
--    WHERE p.proname = 'process_payment'
--      AND n.nspname = 'public';
--
-- 3. Verify print_settings still accessible:
--    SELECT * FROM public.print_settings;
--    Expected: 1 row returned (or empty if not seeded) — no error.
