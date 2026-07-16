-- ═══════════════════════════════════════════════════════════════
-- Migration: Drop notifications table
-- ───────────────────────────────────────────────────────────────
-- Removes the unused `public.notifications` table and all
-- associated database objects (RLS policies, indexes).
--
-- Verified that no foreign keys reference notifications prior
-- to dropping. This is a safe, no-dependency removal.
-- ═══════════════════════════════════════════════════════════════

-- 1. Drop RLS policies for notifications
DROP POLICY IF EXISTS "admin_manager_all" ON public.notifications;
DROP POLICY IF EXISTS "user_select"       ON public.notifications;
DROP POLICY IF EXISTS "staff_insert"      ON public.notifications;
DROP POLICY IF EXISTS "ns"                ON public.notifications;
DROP POLICY IF EXISTS "ni"                ON public.notifications;
DROP POLICY IF EXISTS "nu"                ON public.notifications;
DROP POLICY IF EXISTS "notif_select"      ON public.notifications;
DROP POLICY IF EXISTS "notif_insert"      ON public.notifications;
DROP POLICY IF EXISTS "notif_update"      ON public.notifications;

-- 2. Drop indexes for notifications
DROP INDEX IF EXISTS idx_notifications_user;
DROP INDEX IF EXISTS idx_notifications_read;
DROP INDEX IF EXISTS idx_notifications_created;
DROP INDEX IF EXISTS idx_notifications_type;

-- 3. Drop the table itself
DROP TABLE IF EXISTS public.notifications;
