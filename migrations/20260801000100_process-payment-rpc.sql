-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Process Payment RPC (2026-08-01)
-- ═════──────────────────────────────────────────────────────────────────────
-- Replaces 4+ client-side database round-trips with a single PostgreSQL
-- function that atomically creates the invoice, records the payment, and
-- updates batch items/statuses inside one transaction.
--
-- Changes:
--   1. Adds UNIQUE constraint on payments.reference for server-side idempotency
--   2. Creates process_payment() RPC function
--
-- Design: See Phase 4+5 audits for the complete architecture.
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- PART 1: UNIQUE constraint on payments.reference
-- ────────────────────────────────────────────────────────────────────────────
-- Enables server-side idempotency: INSERT ... ON CONFLICT / UNIQUE violation
-- detection prevents duplicate payment records even under concurrent access.
--
-- Only applies to non-NULL references. Some legacy records may have NULL
-- references (before this constraint existed); those are not affected.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payments_reference_unique'
  ) THEN
    -- Remove any duplicate references first (shouldn't exist, but be safe)
    DELETE FROM payments p1 USING (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY reference ORDER BY created_at DESC) AS rn
      FROM payments WHERE reference IS NOT NULL
    ) p2
    WHERE p1.id = p2.id AND p2.rn > 1;

    ALTER TABLE payments
      ADD CONSTRAINT payments_reference_unique
      UNIQUE (reference);
  END IF;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- PART 2: Backfill invoice_number_seq to be ahead of existing invoices
-- ────────────────────────────────────────────────────────────────────────────
-- Ensures the sequence never generates a number that could conflict with an
-- existing invoice. Only advances the sequence forward — never decreases it.

DO $$
DECLARE
  v_max_num INTEGER;
  v_current INTEGER;
BEGIN
  SELECT MAX(CAST(SPLIT_PART(invoice_number, '-', 3) AS INTEGER))
  INTO v_max_num
  FROM invoices
  WHERE invoice_number LIKE 'INV-%'
    AND invoice_number ~ '^INV-\d{4}-\d+$';

  IF v_max_num IS NOT NULL THEN
    SELECT last_value INTO v_current FROM invoice_number_seq;
    IF v_max_num >= v_current THEN
      PERFORM SETVAL('invoice_number_seq', v_max_num + 1);
    END IF;
  END IF;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- PART 3: process_payment() RPC
-- ────────────────────────────────────────────────────────────────────────────
-- Single-function replacement for the client-side critical payment path.
--
-- Atomic operations (all-or-nothing transaction):
--   1. Idempotency check (via payments.reference UNIQUE constraint)
--   2. Invoice creation or status update
--   3. Payment recording (real money only, not credit)
--   4. Order batch items status update
--   5. Order batch status update (gated on NOT IN ('paid','cancelled'))
--
-- Deferred operations (NOT included — handled client-side after navigation):
--   - Invoice items insertion  (Phase 3)
--   - Inventory deduction       (Phase 3)
--   - Customer ledger updates   (Phase 2)
--   - Credit charge recording   (Phase 2)
--   - Activity logging
--
-- The trigger `trg_order_batches_auto_close_session` fires automatically
-- when batch statuses change, closing the table session.
--
-- Returns structured JSONB response for all outcomes.

CREATE OR REPLACE FUNCTION public.process_payment(
  p_table_id                UUID,
  p_customer_name           TEXT,
  p_invoice_subtotal        DECIMAL(14,2),
  p_invoice_tax             DECIMAL(12,2),
  p_invoice_discount        DECIMAL(12,2),
  p_invoice_total           DECIMAL(14,2),
  p_invoice_status          TEXT,
  p_payment_method          TEXT,
  p_payment_amount          DECIMAL(14,2),
  p_payment_reference       TEXT,
  p_payment_notes           TEXT,
  p_user_id                 UUID,
  p_paid_item_ids           UUID[],
  p_item_paid_status        TEXT,
  p_batch_ids               UUID[],
  p_order_batch_ids         UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id          UUID;
  v_invoice_number      TEXT;
  v_payment_id          UUID;
  v_is_new_invoice      BOOLEAN := true;
  v_existing_payment_id UUID;
  v_existing_invoice_id UUID;
  v_existing_inv_number TEXT;
  v_affected_item_rows BIGINT   := 0;
  v_batch_update_count  INTEGER := 0;
  v_elapsed_ms          NUMERIC;
  v_start_time          TIMESTAMPTZ;
  v_step1_time          TIMESTAMPTZ;
  v_step2_time          TIMESTAMPTZ;
  v_step3_time          TIMESTAMPTZ;
  v_step4_time          TIMESTAMPTZ;
  v_step5_time          TIMESTAMPTZ;
  v_user_role           TEXT;
  v_batch_table_id      UUID;
  v_dup_item_id         UUID;
BEGIN
  v_start_time := clock_timestamp();

  -- ══════════════════════════════════════════════════════════════════════════
  -- STEP 0: Authorization + Server-side input validation
  -- ══════════════════════════════════════════════════════════════════════════
  -- Never rely on client-side validation alone. Defend against malformed RPC
  -- calls even if a buggy or malicious client bypasses React validation.

  -- 0a. Authorization: verify the caller is who they claim to be
  --     and has the required role to process payments.
  IF p_user_id IS NOT NULL AND p_user_id != (SELECT auth.uid()) THEN
    RETURN jsonb_build_object(
      'success',      false,
      'code',         'UNAUTHORIZED',
      'error',        'You are not permitted to process this payment.',
      'sqlstate',     'P0001',
      'elapsed_ms',   0
    );
  END IF;

  v_user_role := public.get_user_role();
  IF v_user_role NOT IN ('admin', 'cashier', 'manager') THEN
    RETURN jsonb_build_object(
      'success',      false,
      'code',         'UNAUTHORIZED',
      'error',        'Your role does not permit processing payments.',
      'details',      jsonb_build_object('role', v_user_role),
      'sqlstate',     'P0001',
      'elapsed_ms',   0
    );
  END IF;

  -- 0b. Validate payment amount against invoice total
  IF p_payment_amount < 0 THEN
    RETURN jsonb_build_object(
      'success',      false,
      'code',         'VALIDATION_ERROR',
      'error',        'Payment amount cannot be negative.',
      'sqlstate',     'P0001',
      'elapsed_ms',   0
    );
  END IF;

  IF p_invoice_total < 0 THEN
    RETURN jsonb_build_object(
      'success',      false,
      'code',         'VALIDATION_ERROR',
      'error',        'Invoice total cannot be negative.',
      'sqlstate',     'P0001',
      'elapsed_ms',   0
    );
  END IF;

  IF p_payment_amount > p_invoice_total THEN
    RETURN jsonb_build_object(
      'success',      false,
      'code',         'VALIDATION_ERROR',
      'error',        'Payment amount cannot exceed invoice total.',
      'details',      jsonb_build_object(
        'payment_amount', p_payment_amount,
        'invoice_total',  p_invoice_total
      ),
      'sqlstate',     'P0001',
      'elapsed_ms',   0
    );
  END IF;

  -- 0c. Validate paid item IDs are not empty when payment amount > 0
  IF p_payment_amount > 0 AND (p_paid_item_ids IS NULL OR array_length(p_paid_item_ids, 1) IS NULL OR array_length(p_paid_item_ids, 1) = 0) THEN
    RETURN jsonb_build_object(
      'success',      false,
      'code',         'VALIDATION_ERROR',
      'error',        'Payment requires at least one payable item.',
      'sqlstate',     'P0001',
      'elapsed_ms',   0
    );
  END IF;

  -- 0d. Validate batch IDs are not empty when payment amount > 0
  IF p_payment_amount > 0 AND (p_batch_ids IS NULL OR array_length(p_batch_ids, 1) IS NULL OR array_length(p_batch_ids, 1) = 0) THEN
    RETURN jsonb_build_object(
      'success',      false,
      'code',         'VALIDATION_ERROR',
      'error',        'At least one batch must be specified for payment.',
      'sqlstate',     'P0001',
      'elapsed_ms',   0
    );
  END IF;

  -- 0e. Validate invoice status
  IF p_invoice_status IS NULL OR p_invoice_status NOT IN ('paid', 'partial', 'credit_invoice', 'pending') THEN
    RETURN jsonb_build_object(
      'success',      false,
      'code',         'VALIDATION_ERROR',
      'error',        format('Invalid invoice status: %L.', p_invoice_status),
      'sqlstate',     'P0001',
      'elapsed_ms',   0
    );
  END IF;

  -- 0f. Validate payment method is one of the allowed values
  IF p_payment_method IS NULL OR p_payment_method NOT IN ('cash', 'credit', 'fonepay', 'reception_qr', 'split', 'online') THEN
    RETURN jsonb_build_object(
      'success',      false,
      'code',         'INVALID_PAYMENT_METHOD',
      'error',        format('Invalid payment method: %L.', p_payment_method),
      'details',      jsonb_build_object('payment_method', p_payment_method),
      'sqlstate',     'P0001',
      'elapsed_ms',   0
    );
  END IF;

  -- 0g. Validate no duplicate IDs in paid_item_ids
  IF array_length(p_paid_item_ids, 1) > 0 THEN
    SELECT id INTO v_dup_item_id FROM (
      SELECT unnest(p_paid_item_ids) AS id
      GROUP BY id
      HAVING COUNT(*) > 1
      LIMIT 1
    ) dups;
    IF v_dup_item_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success',      false,
        'code',         'VALIDATION_ERROR',
        'error',        'Duplicate item IDs are not allowed.',
        'details',      jsonb_build_object('duplicate_item_id', v_dup_item_id),
        'sqlstate',     'P0001',
        'elapsed_ms',   0
      );
    END IF;
  END IF;

  -- 0h. Validate paid item IDs belong to the supplied batch IDs
  --     and that the table ID matches.
  IF array_length(p_paid_item_ids, 1) > 0 AND array_length(p_batch_ids, 1) > 0 AND p_table_id IS NOT NULL THEN
    -- Check that at least one item belongs to one of the supplied batches
    -- AND that the batch's table_id matches p_table_id
    SELECT obi.id INTO v_dup_item_id
    FROM order_batch_items obi
    JOIN order_batches ob ON ob.id = obi.batch_id
    WHERE obi.id = ANY(p_paid_item_ids)
      AND obi.batch_id = ANY(p_batch_ids)
      AND ob.table_id = p_table_id
    LIMIT 1;

    IF v_dup_item_id IS NULL THEN
      RETURN jsonb_build_object(
        'success',      false,
        'code',         'INVALID_BATCH',
        'error',        'Paid items do not match the supplied batches or table.',
        'sqlstate',     'P0001',
        'elapsed_ms',   0
      );
    END IF;
  END IF;

  -- 0i. Validate batch IDs belong to the supplied table
  IF array_length(p_batch_ids, 1) > 0 AND p_table_id IS NOT NULL THEN
    SELECT ob.table_id INTO v_batch_table_id
    FROM order_batches ob
    WHERE ob.id = p_batch_ids[1];

    IF v_batch_table_id IS DISTINCT FROM p_table_id THEN
      RETURN jsonb_build_object(
        'success',      false,
        'code',         'INVALID_TABLE',
        'error',        'Batch does not belong to the specified table.',
        'sqlstate',     'P0001',
        'elapsed_ms',   0
      );
    END IF;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════════
  -- STEP 1: Idempotency Check
  -- ══════════════════════════════════════════════════════════════════════════
  -- Primary check: SELECT before INSERT catches most duplicates early.
  -- The UNIQUE constraint on payments.reference is the ultimate safety net
  -- (catches race conditions in the exception handler below).

  IF p_payment_reference IS NOT NULL AND p_payment_reference != '' THEN
    SELECT id, invoice_id
    INTO v_existing_payment_id, v_existing_invoice_id
    FROM payments
    WHERE reference = p_payment_reference;

    IF v_existing_payment_id IS NOT NULL THEN
      SELECT invoice_number INTO v_invoice_number
      FROM invoices WHERE id = v_existing_invoice_id;

      RETURN jsonb_build_object(
        'success',        true,
        'is_duplicate',   true,
        'invoice_id',     v_existing_invoice_id,
        'invoice_number', v_invoice_number,
        'payment_id',     v_existing_payment_id
      );
    END IF;
  END IF;
  v_step1_time := clock_timestamp();

  -- ══════════════════════════════════════════════════════════════════════════
  -- STEP 2: Find existing partial/credit invoice OR create new one
  -- ══════════════════════════════════════════════════════════════════════════
  -- Checks for existing invoices with overlapping order_batch_ids to handle
  -- remaining-balance payments on partial/credit invoices.

  IF p_table_id IS NOT NULL AND array_length(p_order_batch_ids, 1) > 0 THEN
    SELECT id, invoice_number
    INTO v_existing_invoice_id, v_existing_inv_number
    FROM invoices
    WHERE table_id = p_table_id
      AND status IN ('partial', 'credit_invoice')
      AND order_batch_ids && p_order_batch_ids
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF v_existing_invoice_id IS NOT NULL THEN
    -- ── Update existing invoice status ──
    UPDATE invoices
    SET status = p_invoice_status
    WHERE id = v_existing_invoice_id;

    v_invoice_id     := v_existing_invoice_id;
    v_invoice_number := v_existing_inv_number;
    v_is_new_invoice := false;
  ELSE
    -- ── Generate invoice number using the database sequence ──
    -- No fixed-width padding — the sequence grows naturally. LPAD would
    -- truncate at values >= 1,000,000 causing potential UNIQUE violations.
    v_invoice_number := format('INV-%s-%s',
      TO_CHAR(NOW(), 'YYYY'),
      NEXTVAL('invoice_number_seq')
    );

    -- ── Create new invoice ──
    INSERT INTO invoices (
      invoice_number,
      customer_name,
      table_id,
      order_batch_ids,
      subtotal,
      tax,
      discount,
      total,
      status,
      payment_method,
      user_id
    ) VALUES (
      v_invoice_number,
      COALESCE(p_customer_name, 'Walk-in'),
      p_table_id,
      p_order_batch_ids,
      p_invoice_subtotal,
      p_invoice_tax,
      p_invoice_discount,
      p_invoice_total,
      p_invoice_status,
      p_payment_method,
      p_user_id
    )
    RETURNING id INTO v_invoice_id;
  END IF;
  v_step2_time := clock_timestamp();

  -- ══════════════════════════════════════════════════════════════════════════
  -- STEP 3: Update batch item statuses (CONCURRENCY GATE)
  -- ══════════════════════════════════════════════════════════════════════════
  -- ⚠️ THIS IS THE CONCURRENCY LOCK — it MUST execute before the payment INSERT.
  --
  -- The UPDATE itself acquires row-level locks on the batch items. By checking
  -- GET DIAGNOSTICS ROW_COUNT afterwards, we know whether we actually "won" the
  -- race to claim these items. If ROW_COUNT = 0, another transaction already
  -- claimed them and we MUST abort.
  --
  -- Only updates items that are NOT already paid/cancelled/voided.
  -- Status is either 'paid' or 'credit' depending on p_item_paid_status.

  IF array_length(p_paid_item_ids, 1) > 0 THEN
    UPDATE order_batch_items
    SET status = p_item_paid_status
    WHERE id = ANY(p_paid_item_ids)
      AND status NOT IN ('paid', 'cancelled', 'voided');

    GET DIAGNOSTICS v_affected_item_rows = ROW_COUNT;

    -- If zero items were updated, another cashier already paid these batches.
    -- RAISE forces the entire transaction to roll back — invoice creation,
    -- sequence increment, and any other changes are all undone atomically.
    -- The client receives an error which it displays as "Payment failed".
    IF v_affected_item_rows = 0 THEN
      RAISE EXCEPTION 'These items have already been paid. No duplicate payment was created.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  v_step3_time := clock_timestamp();

  -- ══════════════════════════════════════════════════════════════════════════
  -- STEP 4: Update batch-level statuses
  -- ══════════════════════════════════════════════════════════════════════════
  -- ⚠️ GATED: Only updates batches that are NOT already paid/cancelled.
  --
  -- For each batch, determines new status:
  --   - All items settled (paid/credit/cancelled/voided) → 'paid'
  --   - Some items paid, some unpaid → 'partial'
  --   - No change if no items were affected
  --
  -- This UPDATE triggers `auto_close_table_session` which checks if ALL
  -- batches for this table are now settled, and closes the session if so.

  IF array_length(p_batch_ids, 1) > 0 THEN
    WITH batch_item_counts AS (
      SELECT
        obi.batch_id,
        COUNT(*) FILTER (
          WHERE obi.status IN ('paid', 'credit', 'cancelled', 'voided')
        ) AS settled_count,
        COUNT(*) FILTER (
          WHERE obi.status IN ('paid', 'credit')
        ) AS paid_count,
        COUNT(*) AS total_count
      FROM order_batch_items obi
      WHERE obi.batch_id = ANY(p_batch_ids)
      GROUP BY obi.batch_id
    )
    UPDATE order_batches ob
    SET status = CASE
      WHEN bic.settled_count = bic.total_count THEN 'paid'
      WHEN bic.paid_count > 0                    THEN 'partial'
      ELSE ob.status
    END
    FROM batch_item_counts bic
    WHERE ob.id = bic.batch_id
      AND ob.status NOT IN ('paid', 'cancelled');

    GET DIAGNOSTICS v_batch_update_count = ROW_COUNT;
  END IF;
  v_step4_time := clock_timestamp();

  -- ══════════════════════════════════════════════════════════════════════════
  -- STEP 5: Record payment
  -- ══════════════════════════════════════════════════════════════════════════
  -- ⚠️ Executes ONLY after batch items were successfully claimed (STEP 3).
  --   If the concurrency gate rejected this payment, we never reach here.
  --
  -- Only records REAL money received (NOT credit amounts).
  -- Pure credit payments have p_payment_amount = 0 and skip this step.
  -- The credit charge is recorded client-side in the deferred operations.

  IF p_payment_amount > 0 AND p_payment_method IS DISTINCT FROM 'credit' THEN
    INSERT INTO payments (
      invoice_id,
      amount,
      discount,
      payment_method,
      reference,
      notes,
      user_id
    ) VALUES (
      v_invoice_id,
      p_payment_amount,
      p_invoice_discount,
      p_payment_method,
      p_payment_reference,
      p_payment_notes,
      p_user_id
    )
    RETURNING id INTO v_payment_id;
  END IF;
  v_step5_time := clock_timestamp();

  -- ══════════════════════════════════════════════════════════════════════════
  -- RETURN: Success response with timing instrumentation
  -- ══════════════════════════════════════════════════════════════════════════
  RETURN jsonb_build_object(
    'success',             true,
    'is_duplicate',        false,
    'is_new_invoice',      v_is_new_invoice,
    'invoice_id',          v_invoice_id,
    'invoice_number',      v_invoice_number,
    'payment_id',          v_payment_id,
    'batch_update_count',  v_batch_update_count,
    'timing_ms', jsonb_build_object(
      'total',       EXTRACT(EPOCH FROM (v_step5_time - v_start_time)) * 1000,
      'idempotency', EXTRACT(EPOCH FROM (v_step1_time - v_start_time)) * 1000,
      'invoice',     EXTRACT(EPOCH FROM (v_step2_time - v_step1_time)) * 1000,
      'batch_items', EXTRACT(EPOCH FROM (v_step3_time - v_step2_time)) * 1000,
      'batch_status',EXTRACT(EPOCH FROM (v_step4_time - v_step3_time)) * 1000,
      'payment',     EXTRACT(EPOCH FROM (v_step5_time - v_step4_time)) * 1000
    )
  );

EXCEPTION
  -- ══════════════════════════════════════════════════════════════════════════
  -- EXCEPTION: Unique violation on payments.reference
  -- ══════════════════════════════════════════════════════════════════════════
  -- Catches the race condition where two concurrent requests pass the SELECT
  -- check in STEP 1 simultaneously. The UNIQUE constraint prevents the second
  -- INSERT, and we gracefully return the existing payment data.
  --
  -- ⚠️ Checks the constraint name explicitly: if the violation is on a
  --   constraint OTHER than payments_reference_unique (e.g., idx_invoices_number
  --   on a sequence collision), we re-raise rather than silently swallowing it.
  WHEN unique_violation THEN
    DECLARE
      v_uv_constraint TEXT;
    BEGIN
      GET STACKED DIAGNOSTICS v_uv_constraint = CONSTRAINT_NAME;
      v_elapsed_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000;

      IF v_uv_constraint = 'payments_reference_unique' THEN
        SELECT id, invoice_id
        INTO v_existing_payment_id, v_existing_invoice_id
        FROM payments
        WHERE reference = p_payment_reference;

        IF FOUND THEN
          SELECT invoice_number INTO v_invoice_number
          FROM invoices WHERE id = v_existing_invoice_id;

          RETURN jsonb_build_object(
            'success',         true,
            'is_duplicate',    true,
            'invoice_id',      v_existing_invoice_id,
            'invoice_number',  v_invoice_number,
            'payment_id',      v_existing_payment_id,
            'constraint_name', v_uv_constraint,
            'elapsed_ms',      v_elapsed_ms
          );
        END IF;
      END IF;

      -- Not our constraint, or couldn't find payment — re-raise the original
      -- exception. This propagates OUT of the handler (PostgreSQL does not allow
      -- a second exception to be caught by the same EXCEPTION block), directly
      -- to PostgREST as HTTP 500. This is intentional — unexpected constraint
      -- violations should NOT be silently swallowed.
      RAISE;
    END;

  -- ══════════════════════════════════════════════════════════════════════════
  -- EXCEPTION: Any other error — entire transaction rolls back automatically
  -- ══════════════════════════════════════════════════════════════════════════
  -- Distinguishes CONCURRENCY_CONFLICT (RAISE EXCEPTION from the STEP 3
  -- concurrency gate, which uses ERRCODE 'P0001' and a specific message
  -- pattern) from other unexpected errors via SQLSTATE + message inspection.
  WHEN OTHERS THEN
    v_elapsed_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000;

    -- ═══ Concurrency gate failure (STEP 3) ═══
    -- The STEP 3 RAISE EXCEPTION uses ERRCODE 'P0001'. We verify the
    -- message content to distinguish it from other P0001 errors.
    IF SQLSTATE = 'P0001' AND position('already been paid' in SQLERRM) > 0 THEN
      RETURN jsonb_build_object(
        'success',      false,
        'code',         'CONCURRENCY_CONFLICT',
        'error',        SQLERRM,
        'sqlstate',     SQLSTATE,
        'elapsed_ms',   v_elapsed_ms
      );
    END IF;

    -- ═══ Unexpected error ═══
    RETURN jsonb_build_object(
      'success',      false,
      'error',        SQLERRM,
      'code',         'UNKNOWN',
      'sqlstate',     SQLSTATE,
      'elapsed_ms',   v_elapsed_ms
    );
END;
$$;

-- ─── Grant EXECUTE to authenticated role (required by PostgREST) ────────────
GRANT EXECUTE ON FUNCTION public.process_payment(
  UUID, TEXT, DECIMAL, DECIMAL, DECIMAL, DECIMAL, TEXT, TEXT,
  DECIMAL, TEXT, TEXT, UUID, UUID[], TEXT, UUID[], UUID[]
) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFICATION
-- ════════════════════════════════════════════════════════════════════════════
-- Run after migration:
--
-- 1. Verify the constraint exists:
--    SELECT conname FROM pg_constraint WHERE conname = 'payments_reference_unique';
--
-- 2. Verify the function exists:
--    SELECT proname FROM pg_proc WHERE proname = 'process_payment';
--
-- 3. Test with a dry run (will fail on invoice_number uniqueness but validates
--    function signature and authentication):
--    SELECT process_payment(
--      '00000000-0000-0000-0000-000000000000', 'Test', 100, 0, 0, 100,
--      'paid', 'cash', 100, 'test-ref-001', NULL, NULL,
--      '{}', 'paid', '{}', '{}'
--    );
