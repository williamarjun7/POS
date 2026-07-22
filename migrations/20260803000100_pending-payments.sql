-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Pending Payments Table (2026-08-03)
-- ════════════════════════════════════════════════════════════════════════════
-- Stores payment context BEFORE invoice creation completes, enabling automatic
-- recovery after browser crash, network timeout, or temporary backend failure.
--
-- The table serves as the durable source of truth for pending payments.
-- localStorage mirrors this for fast client-side access, but the DB table
-- survives browser data clearing and cross-device scenarios.
--
-- Recovery flow:
--   1. Gateway confirms (FonePay WS/polling success)
--   2. Persist full payment context to pending_payments (INSERT)
--   3. Call process_payment RPC (may fail — network, timeout, crash)
--   4a. On success: delete from pending_payments
--   4b. On failure: pending_payments row remains for recovery
--   5. Recovery (on startup or manually): verify gateway, check for existing
--      invoice/payment, resume processing, delete on completion
--
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.pending_payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The unique payment reference (used as idempotency key and for UNIQUE constraint)
  payment_reference TEXT NOT NULL UNIQUE,
  -- FonePay PRN or other gateway transaction reference
  gateway_reference TEXT,
  -- Invoice amount in paisa / minor units (stored as decimal)
  invoice_amount    DECIMAL(14,2) NOT NULL,
  -- Payment method key (cash, fonepay, reception_qr, credit, split, partial)
  payment_method    TEXT NOT NULL,
  -- Serialized JSON payload that can recreate the process_payment RPC call
  invoice_payload   JSONB NOT NULL,
  -- Idempotency key for duplicate-safe RPC invocation
  idempotency_key   TEXT,
  -- Table or room where the payment originated
  table_id          UUID,
  room_id           UUID,
  -- Customer name captured at payment time
  customer_name     TEXT,
  -- Source page: 'pos', 'billing', 'room_checkout', 'dashboard'
  source_page       TEXT NOT NULL DEFAULT 'pos',
  -- Current processing status
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'expired')),
  -- Number of retry attempts so far
  retry_count       INTEGER NOT NULL DEFAULT 0,
  -- Maximum retries allowed before the row requires admin intervention
  max_retries       INTEGER NOT NULL DEFAULT 3,
  -- Error message from last failed attempt
  last_error        TEXT,
  -- Timestamps
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ
);

-- ─── Indexes ───────────────────────────────────────────────────────────────
-- Fast lookup by status for recovery scan
CREATE INDEX IF NOT EXISTS idx_pending_payments_status
  ON public.pending_payments (status)
  WHERE status IN ('pending', 'processing');

-- Fast lookup by gateway reference for reconciliation
CREATE INDEX IF NOT EXISTS idx_pending_payments_gateway_ref
  ON public.pending_payments (gateway_reference)
  WHERE gateway_reference IS NOT NULL;

-- Lookup by payment reference for idempotent recovery
CREATE INDEX IF NOT EXISTS idx_pending_payments_payment_ref
  ON public.pending_payments (payment_reference);

-- ─── Updated_at trigger ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_pending_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pending_payments_updated_at
  ON public.pending_payments;

CREATE TRIGGER trg_pending_payments_updated_at
  BEFORE UPDATE ON public.pending_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_pending_payments_updated_at();

-- ─── RLS: Only authenticated users can read/write ──────────────────────────

ALTER TABLE public.pending_payments ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read pending payments (needed for recovery scan)
DROP POLICY IF EXISTS "Authenticated users can read pending_payments"
  ON public.pending_payments;
CREATE POLICY "Authenticated users can read pending_payments"
  ON public.pending_payments
  FOR SELECT
  TO authenticated
  USING (true);

-- All authenticated users can insert pending payments
DROP POLICY IF EXISTS "Authenticated users can insert pending_payments"
  ON public.pending_payments;
CREATE POLICY "Authenticated users can insert pending_payments"
  ON public.pending_payments
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Users can update pending payments (for status transitions)
DROP POLICY IF EXISTS "Authenticated users can update pending_payments"
  ON public.pending_payments;
CREATE POLICY "Authenticated users can update pending_payments"
  ON public.pending_payments
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Users can delete completed/failed pending payments
DROP POLICY IF EXISTS "Authenticated users can delete pending_payments"
  ON public.pending_payments;
CREATE POLICY "Authenticated users can delete pending_payments"
  ON public.pending_payments
  FOR DELETE
  TO authenticated
  USING (true);

-- ─── Grant permissions ────────────────────────────────────────────────────
-- ─── Count by status RPC ────────────────────────────────────────────────
-- Efficient count query for the admin recovery dashboard.

CREATE OR REPLACE FUNCTION public.count_pending_payments_by_status()
RETURNS TABLE(status TEXT, count BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT status::TEXT, COUNT(*)::BIGINT
  FROM public.pending_payments
  GROUP BY status
  ORDER BY status;
$$;

GRANT EXECUTE ON FUNCTION public.count_pending_payments_by_status() TO authenticated;

GRANT ALL ON public.pending_payments TO authenticated;

COMMENT ON TABLE public.pending_payments IS
  'Stores payment context before invoice creation completes. Used for automatic recovery after browser crash, network timeout, or backend failure.';

COMMENT ON COLUMN public.pending_payments.payment_reference IS
  'Unique payment reference used as idempotency key. UNIQUE constraint prevents duplicate recovery entries.';
COMMENT ON COLUMN public.pending_payments.gateway_reference IS
  'FonePay PRN or other gateway transaction reference for status verification during recovery.';
COMMENT ON COLUMN public.pending_payments.invoice_payload IS
  'Complete JSON payload needed to recreate the process_payment RPC call during recovery.';
COMMENT ON COLUMN public.pending_payments.source_page IS
  'The page/flow that created this pending payment: pos, billing, room_checkout, dashboard.';
COMMENT ON COLUMN public.pending_payments.retry_count IS
  'Number of automatic retry attempts so far. Resets to 0 on successful completion.';
COMMENT ON COLUMN public.pending_payments.max_retries IS
  'Maximum automatic retries (default 3). After this, admin intervention is required.';
COMMENT ON COLUMN public.pending_payments.last_error IS
  'Error message from the last failed processing attempt. Helps admin diagnose issues.';
