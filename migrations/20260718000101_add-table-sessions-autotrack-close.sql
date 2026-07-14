-- ============================================================================
-- MIGRATION: Add Table Sessions — Auto-Track & Close (2026-07-18)
-- ────────────────────────────────────────────────────────────────────────────
-- Adds a `table_sessions` table and companion triggers/functions that:
--   1. Auto-create/update a session record when order batches are placed for a
--      restaurant table (INSERT trigger on order_batches)
--   2. Auto-close the session when ALL batches for that table transition to
--      'paid' or 'cancelled' (UPDATE trigger on order_batches)
--   3. Provide a manual RPC `close_table_session(table_id)` for app-level use
--      after a payment completes
--
-- Why a physical table_sessions table?
--   The codebase currently derives table status entirely from order_batches
--   (non-paid batches = occupied, all paid = available). While the derived
--   status is correct for the UI, it lacks session metadata: when did the
--   table become occupied? How many batches were placed? What was the total
--   amount? Who closed the session? The `table_sessions` table stores this
--   metadata and auto-manages its lifecycle via triggers — no manual
--   app-level INSERT or UPDATE needed.
--
-- How it works (no app changes needed):
--   ▸ First batch INSERTED for a table → trigger creates a session (status=active)
--   ▸ Subsequent batches → trigger updates batch_count, total_amount, customer_name
--   ▸ Batch UPDATED to 'paid'/'cancelled' → trigger checks if all table's batches
--     are now settled; if so, closes the session (status=closed, records end_time)
--   ▸ `close_table_session(table_id)` RPC can be called manually from the
--     application after payment completes, as a safety net
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- 1. CREATE TABLE: table_sessions
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.table_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id        UUID NOT NULL REFERENCES public.restaurant_tables(id) ON DELETE CASCADE,
  start_time      TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_time        TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'closed')),
  batch_count     INTEGER NOT NULL DEFAULT 0,
  total_amount    DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  customer_name   TEXT,
  closed_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────

-- Fast lookup: find the active session for a table
CREATE INDEX IF NOT EXISTS idx_table_sessions_table_status
  ON public.table_sessions (table_id, status);

-- Fast lookup: find all active sessions across tables (dashboard query)
CREATE INDEX IF NOT EXISTS idx_table_sessions_status
  ON public.table_sessions (status);

-- Fast lookup: recent sessions for dashboard display
CREATE INDEX IF NOT EXISTS idx_table_sessions_created
  ON public.table_sessions (created_at DESC);

-- ─── Trigger: updated_at ──────────────────────────────────────────────────

CREATE TRIGGER trg_table_sessions_updated_at
  BEFORE UPDATE ON public.table_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- 2. HELPER FUNCTION: Check if all batches for a table are fully settled
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.are_all_table_batches_settled(p_table_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.order_batches
    WHERE table_id = p_table_id
      AND status NOT IN ('paid', 'cancelled')
  );
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. TRIGGER FUNCTION: Create or update table session on batch INSERT
-- ════════════════════════════════════════════════════════════════════════════
-- Creates a new session when the first batch is placed for a table.
-- Updates batch_count and total_amount when subsequent batches are added.
-- Skips batches for rooms (table_id IS NULL) and pre-settled batches.

CREATE OR REPLACE FUNCTION public.update_table_session_on_batch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active_session_id UUID;
BEGIN
  -- Only act on batches for restaurant tables (not rooms)
  IF NEW.table_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip pre-settled batches (e.g., pre-paid orders)
  IF NEW.status IN ('paid', 'cancelled') THEN
    RETURN NEW;
  END IF;

  -- Look for an existing active session for this table
  SELECT id INTO v_active_session_id
  FROM public.table_sessions
  WHERE table_id = NEW.table_id
    AND status = 'active'
  LIMIT 1;

  IF FOUND THEN
    -- Session exists — update running totals
    UPDATE public.table_sessions
    SET
      batch_count = batch_count + 1,
      total_amount = total_amount + COALESCE(NEW.subtotal, 0),
      customer_name = COALESCE(NEW.customer_name, customer_name)
    WHERE id = v_active_session_id;
  ELSE
    -- No active session — create one
    INSERT INTO public.table_sessions (
      table_id,
      start_time,
      status,
      batch_count,
      total_amount,
      customer_name
    ) VALUES (
      NEW.table_id,
      NEW.created_at,
      'active',
      1,
      COALESCE(NEW.subtotal, 0),
      NEW.customer_name
    );
  END IF;

  RETURN NEW;
END;
$$;

-- ─── Attach trigger to order_batches INSERT ────────────────────────────────

DROP TRIGGER IF EXISTS trg_order_batches_update_session ON public.order_batches;

CREATE TRIGGER trg_order_batches_update_session
  AFTER INSERT ON public.order_batches
  FOR EACH ROW
  EXECUTE FUNCTION public.update_table_session_on_batch();

-- ════════════════════════════════════════════════════════════════════════════
-- 4. TRIGGER FUNCTION: Auto-close session when all batches are settled
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.auto_close_table_session()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active_session_id UUID;
  v_batch_count INTEGER;
  v_total_amount DECIMAL(14,2);
  v_customer_name TEXT;
BEGIN
  -- Only act on batches that belong to a restaurant table
  IF NEW.table_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only act if the batch transitioned TO a settled state
  IF OLD.status NOT IN ('paid', 'cancelled')
     AND NEW.status IN ('paid', 'cancelled')
  THEN
    -- Find the active session for this table
    SELECT id INTO v_active_session_id
    FROM public.table_sessions
    WHERE table_id = NEW.table_id
      AND status = 'active'
    LIMIT 1;

    -- If there's an active session and ALL batches are now settled
    IF FOUND AND public.are_all_table_batches_settled(NEW.table_id) THEN
      -- Compute aggregate session data from all (now settled) batches
      SELECT
        COUNT(*),
        COALESCE(SUM(subtotal), 0),
        -- Take the most recent customer_name (handles updates)
        COALESCE(
          (SELECT customer_name FROM public.order_batches
           WHERE table_id = NEW.table_id
             AND customer_name IS NOT NULL
           ORDER BY created_at DESC LIMIT 1),
          (SELECT customer_name FROM public.table_sessions WHERE id = v_active_session_id)
        )
      INTO v_batch_count, v_total_amount, v_customer_name
      FROM public.order_batches
      WHERE table_id = NEW.table_id
        AND status IN ('paid', 'cancelled');

      -- Close the session
      UPDATE public.table_sessions
      SET
        status = 'closed',
        end_time = now(),
        batch_count = v_batch_count,
        total_amount = v_total_amount,
        customer_name = COALESCE(v_customer_name, customer_name),
        closed_by = auth.uid()
      WHERE id = v_active_session_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ─── Attach trigger to order_batches UPDATE ────────────────────────────────

DROP TRIGGER IF EXISTS trg_order_batches_auto_close_session ON public.order_batches;

CREATE TRIGGER trg_order_batches_auto_close_session
  AFTER UPDATE ON public.order_batches
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.auto_close_table_session();

-- ════════════════════════════════════════════════════════════════════════════
-- 5. RPC: Close table session manually (for app-level use after payment)
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.close_table_session(p_table_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active_session_id UUID;
  v_batch_count INTEGER;
  v_total_amount DECIMAL(14,2);
  v_customer_name TEXT;
  v_all_settled BOOLEAN;
BEGIN
  -- Validate: must have a table_id
  IF p_table_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'table_id is required'
    );
  END IF;

  -- Check if all batches are settled
  v_all_settled := public.are_all_table_batches_settled(p_table_id);

  IF NOT v_all_settled THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cannot close session: not all batches are paid or cancelled',
      'table_id', p_table_id
    );
  END IF;

  -- Find the active session and check existence in one query
  SELECT id INTO v_active_session_id
  FROM public.table_sessions
  WHERE table_id = p_table_id
    AND status = 'active'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No active session found for this table',
      'table_id', p_table_id
    );
  END IF;

  -- Compute aggregate data
  SELECT
    COUNT(*),
    COALESCE(SUM(subtotal), 0),
    (SELECT customer_name FROM public.order_batches
     WHERE table_id = p_table_id
       AND customer_name IS NOT NULL
     ORDER BY created_at DESC LIMIT 1)
  INTO v_batch_count, v_total_amount, v_customer_name
  FROM public.order_batches
  WHERE table_id = p_table_id
    AND status IN ('paid', 'cancelled');

  -- Close the session
  UPDATE public.table_sessions
  SET
    status = 'closed',
    end_time = now(),
    batch_count = COALESCE(v_batch_count, batch_count),
    total_amount = COALESCE(v_total_amount, total_amount),
    customer_name = COALESCE(v_customer_name, customer_name),
    closed_by = auth.uid()
  WHERE id = v_active_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', v_active_session_id,
    'table_id', p_table_id,
    'batch_count', v_batch_count,
    'total_amount', v_total_amount,
    'customer_name', v_customer_name
  );
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. RPC: Get currently active table sessions (for dashboard/service use)
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_active_table_sessions()
RETURNS TABLE (
  session_id      UUID,
  table_id        UUID,
  table_number    TEXT,
  start_time      TIMESTAMPTZ,
  duration_minutes INTEGER,
  batch_count     INTEGER,
  total_amount    DECIMAL(14,2),
  customer_name   TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ts.id AS session_id,
    ts.table_id,
    rt.table_number,
    ts.start_time,
    EXTRACT(EPOCH FROM (now() - ts.start_time)) / 60 AS duration_minutes,
    ts.batch_count,
    ts.total_amount,
    ts.customer_name
  FROM public.table_sessions ts
  JOIN public.restaurant_tables rt ON rt.id = ts.table_id
  WHERE ts.status = 'active'
  ORDER BY ts.start_time ASC;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 7. RLS POLICIES
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.table_sessions ENABLE ROW LEVEL SECURITY;

-- Admin/manager: full CRUD
CREATE POLICY "admin_manager_all" ON public.table_sessions
  FOR ALL TO authenticated
  USING (public.is_manager_or_above())
  WITH CHECK (public.is_manager_or_above());

-- Cashier/waiter: can INSERT and SELECT (triggers may create sessions)
CREATE POLICY "cashier_insert" ON public.table_sessions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_cashier_or_above());

CREATE POLICY "cashier_select" ON public.table_sessions
  FOR SELECT TO authenticated
  USING (public.is_cashier_or_above());

CREATE POLICY "cashier_update" ON public.table_sessions
  FOR UPDATE TO authenticated
  USING (public.is_cashier_or_above())
  WITH CHECK (public.is_cashier_or_above());

-- Cashier/waiter: DELETE for cleanup operations (e.g., voiding a batch with accidental session creation)
CREATE POLICY "cashier_delete" ON public.table_sessions
  FOR DELETE TO authenticated
  USING (public.is_cashier_or_above());

-- Receptionist/housekeeper: SELECT only (needed for dashboard display)
CREATE POLICY "receptionist_select" ON public.table_sessions
  FOR SELECT TO authenticated
  USING (public.is_receptionist_or_above() OR public.is_housekeeper_or_above());

-- ════════════════════════════════════════════════════════════════════════════
-- 8. GRANTS
-- ════════════════════════════════════════════════════════════════════════════

GRANT SELECT, INSERT, UPDATE ON public.table_sessions TO authenticated;

-- ─── RPC grants (allow authenticated callers) ──────────────────────────────
-- The SECURITY DEFINER on the functions handles internal access; we just need
-- to grant EXECUTE to the role that calls them from the app layer.

GRANT EXECUTE ON FUNCTION public.are_all_table_batches_settled TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_table_session TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_table_sessions TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 9. BACKFILL: Create sessions for tables with existing active batches
-- ════════════════════════════════════════════════════════════════════════════
-- If this migration is applied to a database that already has active
-- (non-paid, non-cancelled) order batches, we need to create sessions
-- for those tables retroactively so the system is in sync.

INSERT INTO public.table_sessions (table_id, start_time, status, batch_count, total_amount, customer_name)
SELECT
  ob.table_id,
  MIN(ob.created_at) AS start_time,
  'active',
  COUNT(*) AS batch_count,
  COALESCE(SUM(ob.subtotal), 0) AS total_amount,
  (SELECT ob2.customer_name FROM public.order_batches ob2
   WHERE ob2.table_id = ob.table_id
     AND ob2.customer_name IS NOT NULL
   ORDER BY ob2.created_at DESC LIMIT 1) AS customer_name
FROM public.order_batches ob
WHERE ob.table_id IS NOT NULL
  AND ob.status NOT IN ('paid', 'cancelled')
GROUP BY ob.table_id;

-- ============================================================================
-- VERIFICATION QUERIES (run after migration)
-- ============================================================================
--
-- 1. Verify the table exists:
--    SELECT column_name, data_type, is_nullable
--    FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'table_sessions'
--    ORDER BY ordinal_position;
--
-- 2. Verify triggers exist:
--    SELECT trigger_name, event_manipulation, action_timing
--    FROM information_schema.triggers
--    WHERE event_object_schema = 'public'
--      AND event_object_table = 'order_batches'
--      AND trigger_name IN ('trg_order_batches_update_session', 'trg_order_batches_auto_close_session')
--    ORDER BY trigger_name;
--
-- 3. Test: create a batch for a table → session should auto-create:
--    INSERT INTO public.order_batches (id, table_id, status, subtotal)
--    VALUES ('00000000-0000-0000-0000-000000000001', <some_table_id>, 'pending', 1000);
--    SELECT * FROM public.table_sessions ORDER BY created_at DESC LIMIT 1;
--    -- Expected: status = 'active', batch_count = 1
--
-- 4. Test: update batch to 'paid' → session should auto-close:
--    UPDATE public.order_batches
--    SET status = 'paid'
--    WHERE id = '00000000-0000-0000-0000-000000000001';
--    SELECT * FROM public.table_sessions ORDER BY created_at DESC LIMIT 1;
--    -- Expected: status = 'closed', end_time is set
--
-- 5. Test manual RPC:
--    SELECT public.close_table_session('some_table_id'::uuid);
