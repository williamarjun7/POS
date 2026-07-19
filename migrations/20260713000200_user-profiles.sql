-- ============================================================================
-- MIGRATION: User Profiles (2026-07-13)
-- ────────────────────────────────────────────────────────────────────────────
-- Adds the `user_profiles` table for Admin users management with roles,
-- phone, active status, and login tracking.
-- ============================================================================

-- ─── 29. User Profiles ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL,
  name        TEXT NOT NULL DEFAULT '',
  phone       TEXT NOT NULL DEFAULT '',
  role        TEXT NOT NULL DEFAULT 'waiter'
                CHECK (role IN ('admin','manager','cashier','waiter','housekeeper','receptionist')),
  active      BOOLEAN NOT NULL DEFAULT true,
  last_login  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_email ON public.user_profiles(email);

DROP TRIGGER IF EXISTS trg_user_profiles_updated_at ON public.user_profiles;

CREATE TRIGGER trg_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── RLS ──────────────────────────────────────────────────────────────────

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "all" ON public.user_profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "sel" ON public.user_profiles FOR SELECT TO anon USING (true);

-- ─── Grants ───────────────────────────────────────────────────────────────

GRANT ALL ON public.user_profiles TO authenticated;
GRANT SELECT ON public.user_profiles TO anon;
