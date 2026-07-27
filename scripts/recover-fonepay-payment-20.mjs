#!/usr/bin/env node
/**
 * FonePay Payment Recovery Script
 * ─────────────────────────────────
 * Recovers an orphaned FonePay QR payment where the gateway confirmed
 * the transaction (PRN: b949c1a3-687f-4d50-95fd-f5a43c1db6a7) but the POS
 * never completed the order lifecycle due to the deferred-persistence bug.
 *
 * Table: Table 20 (find by table_number '20')
 * Amount: Rs. 4.00
 * Gateway: FonePay QR
 * PRN: b949c1a3-687f-4d50-95fd-f5a43c1db6a7
 *
 * ═══ SAFETY ═══
 * This script uses a TRANSACTION with ROLLBACK on error.
 * It checks for existing records before creating new ones (idempotent).
 * It will NOT create duplicate payments if the payment already exists.
 *
 * ═══ USAGE ═══
 * Run this via the InsForge CLI:
 *   npx @insforge/cli db query "$(cat scripts/recover-fonepay-payment-20.sql)"
 *
 * Or pipe directly:
 *   psql "$DATABASE_URL" -f scripts/recover-fonepay-payment-20.sql
 *
 * ============================================================================
 */

// Generate the SQL
const sql = `
-- ════════════════════════════════════════════════════════════════════════════
-- FonePay Payment Recovery Script
-- Orphaned Payment: PRN = b949c1a3-687f-4d50-95fd-f5a43c1db6a7
-- Table: Table 20
-- Amount: Rs. 4.00
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 1: Identify the table and its state
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_table_id          UUID;
  v_table_status      TEXT;
  v_active_session_id UUID;
  v_batch_ids         UUID[] := '{}';
  v_paid_item_ids     UUID[] := '{}';
  v_customer_name     TEXT := 'Walk-in';
  v_batch_count       INTEGER := 0;
  v_invoice_id        UUID;
  v_invoice_number    TEXT;
  v_payment_id        UUID;
  v_payment_ref       TEXT := 'RECOVER-FP-b949c1a3-687f-4d50-95fd-f5a43c1db6a7';
  v_user_id           UUID;
  v_item_count        INTEGER;
  v_now               TIMESTAMPTZ := now();
BEGIN
  -- ─── 1a. Find the table ────────────────────────────────────────────────
  SELECT id, status INTO v_table_id, v_table_status
  FROM public.restaurant_tables
  WHERE table_number = '20'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Table 20 not found. Verify the table number.';
  END IF;

  RAISE NOTICE 'Table 20 found: ID=%, Status=%', v_table_id, v_table_status;

  -- ─── 1b. Find unpaid batches for this table ────────────────────────────
  SELECT ARRAY_AGG(ob.id ORDER BY ob.created_at)
  INTO v_batch_ids
  FROM public.order_batches ob
  WHERE ob.table_id = v_table_id
    AND ob.status NOT IN ('paid', 'cancelled');

  -- If no batches found, check the active session
  IF v_batch_ids IS NULL OR array_length(v_batch_ids, 1) IS NULL OR array_length(v_batch_ids, 1) = 0 THEN
    RAISE NOTICE 'No unpaid batches found for Table 20.';
  ELSE
    v_batch_count := array_length(v_batch_ids, 1);
    RAISE NOTICE 'Found % unpaid batch(es): %', v_batch_count, v_batch_ids;

    -- ─── 1c. Get customer name from the first batch ──────────────────────
    SELECT COALESCE(customer_name, 'Walk-in') INTO v_customer_name
    FROM public.order_batches
    WHERE id = v_batch_ids[1];

    -- ─── 1d. Get user_id from the first batch (if available) ─────────────
    SELECT user_id INTO v_user_id
    FROM public.order_batches
    WHERE id = v_batch_ids[1] AND user_id IS NOT NULL
    LIMIT 1;

    -- ─── 1e. Collect unpaid item IDs from all batches ────────────────────
    SELECT ARRAY_AGG(obi.id ORDER BY obi.created_at)
    INTO v_paid_item_ids
    FROM public.order_batch_items obi
    WHERE obi.batch_id = ANY(v_batch_ids)
      AND obi.status NOT IN ('paid', 'cancelled', 'voided');

    v_item_count := COALESCE(array_length(v_paid_item_ids, 1), 0);
    RAISE NOTICE 'Found % unpaid item(s) to mark as paid.', v_item_count;
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- STEP 2: Check if payment already exists (idempotency)
  -- ════════════════════════════════════════════════════════════════════════
  SELECT id, invoice_id INTO v_payment_id, v_invoice_id
  FROM public.payments
  WHERE reference = v_payment_ref;

  IF FOUND THEN
    RAISE NOTICE 'Payment already exists (ID=%). Skipping invoice/payment creation.', v_payment_id;
    RAISE NOTICE 'Associated invoice ID=%', v_invoice_id;
  ELSE
    -- ══════════════════════════════════════════════════════════════════════
    -- STEP 3: Create invoice
    -- ══════════════════════════════════════════════════════════════════════
    v_invoice_number := format('INV-%s-%s', TO_CHAR(v_now, 'YYYY'), NEXTVAL('invoice_number_seq'));

    INSERT INTO public.invoices (
      invoice_number, customer_name, table_id, order_batch_ids,
      subtotal, discount, total, status, payment_method, user_id, created_at
    ) VALUES (
      v_invoice_number, v_customer_name, v_table_id,
      COALESCE(v_batch_ids, '{}'),
      4.00, 0, 4.00, 'paid', 'fonepay', v_user_id, v_now
    )
    RETURNING id INTO v_invoice_id;

    RAISE NOTICE 'Invoice created: % (ID=%)', v_invoice_number, v_invoice_id;

    -- ══════════════════════════════════════════════════════════════════════
    -- STEP 4: Create payment record
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO public.payments (
      invoice_id, amount, payment_method, reference,
      notes, user_id, created_at
    ) VALUES (
      v_invoice_id, 4.00, 'fonepay', v_payment_ref,
      'Manual recovery: FonePay QR confirmed but POS did not complete lifecycle. PRN: b949c1a3-687f-4d50-95fd-f5a43c1db6a7',
      v_user_id, v_now
    )
    RETURNING id INTO v_payment_id;

    RAISE NOTICE 'Payment recorded: ID=%', v_payment_id;
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- STEP 5: Update batch items to 'paid' (if any unpaid items exist)
  -- ════════════════════════════════════════════════════════════════════════
  IF v_item_count > 0 THEN
    UPDATE public.order_batch_items obi
    SET status = 'paid'
    WHERE obi.id = ANY(v_paid_item_ids)
      AND obi.status NOT IN ('paid', 'cancelled', 'voided');

    GET DIAGNOSTICS v_item_count = ROW_COUNT;
    RAISE NOTICE 'Updated % batch item(s) to paid status.', v_item_count;
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- STEP 6: Update batch statuses (triggers auto_close_table_session)
  -- ════════════════════════════════════════════════════════════════════════
  IF v_batch_count > 0 THEN
    WITH batch_item_counts AS (
      SELECT obi.batch_id,
        COUNT(*) FILTER (WHERE obi.status IN ('paid', 'credit', 'cancelled', 'voided')) AS settled_count,
        COUNT(*) AS total_count
      FROM public.order_batch_items obi
      WHERE obi.batch_id = ANY(v_batch_ids)
      GROUP BY obi.batch_id
    )
    UPDATE public.order_batches ob
    SET status = CASE
      WHEN bic.settled_count = bic.total_count THEN 'paid'
      WHEN bic.settled_count > 0 THEN 'partial'
      ELSE ob.status
    END
    FROM batch_item_counts bic
    WHERE ob.id = bic.batch_id
      AND ob.status NOT IN ('paid', 'cancelled');

    RAISE NOTICE 'Batch statuses updated. The auto_close_table_session trigger should fire.';
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- STEP 7: Force-close table session (safety net — may already be closed)
  -- ════════════════════════════════════════════════════════════════════════
  SELECT id INTO v_active_session_id
  FROM public.table_sessions
  WHERE table_id = v_table_id
    AND status = 'active'
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.table_sessions
    SET
      status = 'closed',
      end_time = v_now,
      closed_by = v_user_id
    WHERE id = v_active_session_id;

    RAISE NOTICE 'Table session closed: ID=%', v_active_session_id;
  ELSE
    RAISE NOTICE 'No active session to close (already closed by trigger or never created).';
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- STEP 8: Update restaurant_tables status to 'available'
  -- ════════════════════════════════════════════════════════════════════════
  UPDATE public.restaurant_tables
  SET status = 'available',
      updated_at = v_now
  WHERE id = v_table_id
    AND status = 'occupied';

  RAISE NOTICE 'Table 20 set to available.';

  -- ════════════════════════════════════════════════════════════════════════
  -- SUMMARY
  -- ════════════════════════════════════════════════════════════════════════
  RAISE NOTICE '════════════════════════════════════════════════════';
  RAISE NOTICE ' RECOVERY COMPLETE';
  RAISE NOTICE ' Table:    Table 20 (%)', v_table_id;
  RAISE NOTICE ' Invoice:  % (%)', v_invoice_number, v_invoice_id;
  RAISE NOTICE ' Payment:  % (%)', v_payment_ref, v_payment_id;
  RAISE NOTICE ' Amount:   Rs. 4.00';
  RAISE NOTICE ' PRN:      b949c1a3-687f-4d50-95fd-f5a43c1db6a7';
  RAISE NOTICE '════════════════════════════════════════════════════';
END;
$$;

COMMIT;
`;

// Write the SQL to a file
const fs = await import('fs');
const sqlPath = new URL('./recover-fonepay-payment-20.sql', import.meta.url).pathname;
fs.writeFileSync(sqlPath, sql, 'utf-8');
console.log(`SQL recovery script written to: ${sqlPath}`);
console.log('');
console.log('To apply this script, run:');
console.log('');
console.log('  npx @insforge/cli db query "$(cat scripts/recover-fonepay-payment-20.sql)"');
console.log('');
console.log('Or using psql directly:');
console.log('  psql "$DATABASE_URL" -f scripts/recover-fonepay-payment-20.sql');
