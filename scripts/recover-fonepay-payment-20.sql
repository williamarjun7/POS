-- ════════════════════════════════════════════════════════════════════════════
-- FonePay Payment Recovery Script
-- ════════════════════════════════════════════════════════════════════════════
--
-- Recovers an orphaned FonePay QR payment where the gateway confirmed the
-- transaction but the POS never completed the order lifecycle.
--
-- Transaction Details:
--   Gateway:   FonePay QR
--   PRN:       b949c1a3-687f-4d50-95fd-f5a43c1db6a7
--   Amount:    Rs. 4.00
--   Table:     Table 20
--
-- ═══ IDEMPOTENCY ═══
-- This script is safe to run multiple times. It checks for existing records
-- and skips creation if the payment already exists.
--
-- ═══ USAGE ═══
--   npx @insforge/cli db query "$(cat scripts/recover-fonepay-payment-20.sql)"
--
-- Or run from SQL client:
--   \i scripts/recover-fonepay-payment-20.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 1: Diagnose current state (before making changes)
-- ════════════════════════════════════════════════════════════════════════════
SELECT '═══ DIAGNOSTIC: Current table state ═══' AS step;

SELECT rt.id AS table_id, rt.table_number, rt.status AS table_status,
       ts.id AS session_id, ts.status AS session_status,
       (SELECT COUNT(*) FROM public.order_batches ob WHERE ob.table_id = rt.id AND ob.status NOT IN ('paid', 'cancelled')) AS unpaid_batches
FROM public.restaurant_tables rt
LEFT JOIN public.table_sessions ts ON ts.table_id = rt.id AND ts.status = 'active'
WHERE rt.table_number = '20';

SELECT '═══ DIAGNOSTIC: Pending payments for this PRN ═══' AS step;
SELECT * FROM public.pending_payments
WHERE gateway_reference = 'b949c1a3-687f-4d50-95fd-f5a43c1db6a7'
   OR payment_reference LIKE '%b949c1a3%';

SELECT '═══ DIAGNOSTIC: Existing payments for this PRN ═══' AS step;
SELECT p.*, i.invoice_number, i.status AS invoice_status
FROM public.payments p
JOIN public.invoices i ON i.id = p.invoice_id
WHERE p.reference LIKE '%b949c1a3%' OR p.reference LIKE '%RECOVER-FP%';

SELECT '═══ DIAGNOSTIC: Unpaid batches for Table 20 ═══' AS step;
SELECT ob.id AS batch_id, ob.status AS batch_status, ob.subtotal, ob.customer_name,
       (SELECT COUNT(*) FROM public.order_batch_items obi WHERE obi.batch_id = ob.id AND obi.status NOT IN ('paid', 'cancelled', 'voided')) AS unpaid_items,
       (SELECT JSONB_AGG(jsonb_build_object('id', obi.id, 'name', obi.name, 'qty', obi.quantity, 'price', obi.unit_price, 'status', obi.status))
        FROM public.order_batch_items obi WHERE obi.batch_id = ob.id) AS items
FROM public.order_batches ob
JOIN public.restaurant_tables rt ON rt.id = ob.table_id
WHERE rt.table_number = '20' AND ob.status NOT IN ('paid', 'cancelled');

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2: Perform the recovery (inside a DO block for procedural logic)
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
  v_item_count        INTEGER := 0;
  v_now               TIMESTAMPTZ := now();
  v_existing_payment  UUID;
  v_existing_invoice  UUID;
BEGIN
  -- ════════════════════════════════════════════════════════════════════════
  -- 1a. Find the table
  -- ════════════════════════════════════════════════════════════════════════
  SELECT id, status INTO v_table_id, v_table_status
  FROM public.restaurant_tables
  WHERE table_number = '20'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Table 20 not found. Verify the table number in restaurant_tables.';
  END IF;
  RAISE NOTICE '[1a] Table 20 found: ID=%, Status=%', v_table_id, v_table_status;

  -- ════════════════════════════════════════════════════════════════════════
  -- 1b. Find unpaid batches for this table
  -- ════════════════════════════════════════════════════════════════════════
  SELECT ARRAY_AGG(ob.id ORDER BY ob.created_at)
  INTO v_batch_ids
  FROM public.order_batches ob
  WHERE ob.table_id = v_table_id
    AND ob.status NOT IN ('paid', 'cancelled');

  IF v_batch_ids IS NOT NULL THEN
    v_batch_count := array_length(v_batch_ids, 1);
    RAISE NOTICE '[1b] Found % unpaid batch(es)', v_batch_count;

    -- Get customer name
    SELECT COALESCE(customer_name, 'Walk-in') INTO v_customer_name
    FROM public.order_batches WHERE id = v_batch_ids[1];

    -- Get user_id
    SELECT user_id INTO v_user_id
    FROM public.order_batches
    WHERE id = v_batch_ids[1] AND user_id IS NOT NULL
    LIMIT 1;

    -- Collect unpaid item IDs
    SELECT ARRAY_AGG(obi.id ORDER BY obi.created_at)
    INTO v_paid_item_ids
    FROM public.order_batch_items obi
    WHERE obi.batch_id = ANY(v_batch_ids)
      AND obi.status NOT IN ('paid', 'cancelled', 'voided');

    v_item_count := COALESCE(array_length(v_paid_item_ids, 1), 0);
    RAISE NOTICE '[1c] Customer: %, Items to pay: %', v_customer_name, v_item_count;
  ELSE
    RAISE NOTICE '[1b] No unpaid batches found for Table 20. Table may already be free.';
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- 2. Check if payment already exists (idempotency)
  -- ════════════════════════════════════════════════════════════════════════
  SELECT p.id, p.invoice_id INTO v_existing_payment, v_existing_invoice
  FROM public.payments p
  WHERE p.reference = v_payment_ref;

  IF FOUND THEN
    RAISE NOTICE '[2] Payment already exists. Skipping invoice/payment creation. Invoice ID: %', v_existing_invoice;
    v_invoice_id := v_existing_invoice;
  ELSE
    -- ══════════════════════════════════════════════════════════════════════
    -- 3. Create invoice & payment atomically using process_payment RPC
    -- ══════════════════════════════════════════════════════════════════════
    -- This ensures all the same steps as a normal POS payment.
    -- We use the "flexible" RPC overload that accepts p_customer_id and p_invoice_items.
    RAISE NOTICE '[3] Calling process_payment RPC...';

    -- Build invoice items from the unpaid batch items
    -- If no batches exist, create a generic item for Rs. 4.00
    DECLARE
      v_items_json JSONB;
    BEGIN
      IF v_item_count > 0 THEN
        SELECT JSONB_AGG(
          jsonb_build_object(
            'name', obi.name,
            'quantity', obi.quantity,
            'unit_price', obi.unit_price
          )
        ) INTO v_items_json
        FROM public.order_batch_items obi
        WHERE obi.id = ANY(v_paid_item_ids);
      ELSE
        v_items_json := '[{"name": "FonePay Payment (Recovery)", "quantity": 1, "unit_price": 4.00}]'::jsonb;
      END IF;

      -- Execute the RPC with all required parameters
      -- Note: p_paid_item_ids requires at least one item, so pass a placeholder
      -- if there are no real items (for direct invoice creation case)
      DECLARE
        v_rpc_result JSONB;
        v_item_ids_for_rpc UUID[];
      BEGIN
        -- If no items, use a dummy UUID that won't match anything
        -- (the RPC validates that items match batches, but for recovery
        --  with no batches we need to bypass this. Create the invoice directly.)
        IF v_batch_count = 0 OR v_item_count = 0 THEN
          -- No batches or items — create invoice directly
          v_invoice_number := format('INV-%s-%s', TO_CHAR(v_now, 'YYYY'), NEXTVAL('invoice_number_seq'));
          INSERT INTO public.invoices (
            invoice_number, customer_name, table_id, order_batch_ids,
            subtotal, discount, total, status, payment_method, user_id, created_at
          ) VALUES (
            v_invoice_number, v_customer_name, v_table_id,
            '{}', 4.00, 0, 4.00, 'paid', 'fonepay', v_user_id, v_now
          )
          RETURNING id INTO v_invoice_id;

          -- Insert invoice items
          INSERT INTO public.invoice_items (invoice_id, name, quantity, unit_price, total_price)
          SELECT v_invoice_id, item->>'name', (item->>'quantity')::numeric,
                 (item->>'unit_price')::numeric,
                 (item->>'quantity')::numeric * (item->>'unit_price')::numeric
          FROM jsonb_array_elements(v_items_json) AS item;

          RAISE NOTICE '[3] Invoice created directly: % (ID: %)', v_invoice_number, v_invoice_id;

          -- Record payment
          INSERT INTO public.payments (invoice_id, amount, discount, payment_method, reference, notes, user_id, created_at)
          VALUES (v_invoice_id, 4.00, 0, 'fonepay', v_payment_ref,
                  'Manual recovery: FonePay gateway confirmed Rs. 4.00 but POS did not complete lifecycle. PRN: b949c1a3-687f-4d50-95fd-f5a43c1db6a7',
                  v_user_id, v_now)
          RETURNING id INTO v_payment_id;

          RAISE NOTICE '[3] Payment recorded: ID=%', v_payment_id;
        ELSE
          -- Use the process_payment RPC for atomic processing
          v_rpc_result := public.process_payment(
            p_table_id          := v_table_id,
            p_customer_name     := v_customer_name,
            p_invoice_subtotal  := 4.00,
            p_invoice_discount  := 0,
            p_invoice_total     := 4.00,
            p_invoice_status    := 'paid',
            p_payment_method    := 'fonepay',
            p_payment_amount    := 4.00,
            p_payment_reference := v_payment_ref,
            p_payment_notes     := 'Manual recovery: FonePay gateway confirmed Rs. 4.00. PRN: b949c1a3-687f-4d50-95fd-f5a43c1db6a7',
            p_user_id           := v_user_id,
            p_paid_item_ids     := v_paid_item_ids,
            p_item_paid_status  := 'paid',
            p_batch_ids         := v_batch_ids,
            p_order_batch_ids   := v_batch_ids,
            p_customer_id       := NULL,
            p_invoice_items     := v_items_json
          );

          RAISE NOTICE '[3] RPC result: %', v_rpc_result;

          IF (v_rpc_result->>'success')::boolean THEN
            v_invoice_id := (v_rpc_result->>'invoice_id')::uuid;
            v_invoice_number := v_rpc_result->>'invoice_number';
            v_payment_id := (v_rpc_result->>'payment_id')::uuid;
            RAISE NOTICE '[3] RPC succeeded: Invoice=%, Payment=%', v_invoice_number, v_payment_id;
          ELSE
            RAISE EXCEPTION 'process_payment RPC failed: %', v_rpc_result->>'error';
          END IF;
        END IF;
      END;
    END;
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- 4. Force-close table session (safety net)
  -- ════════════════════════════════════════════════════════════════════════
  SELECT id INTO v_active_session_id
  FROM public.table_sessions
  WHERE table_id = v_table_id
    AND status = 'active'
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.table_sessions
    SET status = 'closed', end_time = v_now,
        closed_by = v_user_id
    WHERE id = v_active_session_id;
    RAISE NOTICE '[4] Table session closed: %', v_active_session_id;
  ELSE
    RAISE NOTICE '[4] No active session to close (may have auto-closed).';
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- 5. Reset table status to available
  -- ════════════════════════════════════════════════════════════════════════
  UPDATE public.restaurant_tables
  SET status = 'available', updated_at = v_now
  WHERE id = v_table_id AND status = 'occupied';

  IF FOUND THEN
    RAISE NOTICE '[5] Table 20 status reset to available.';
  ELSE
    RAISE NOTICE '[5] Table 20 was already available (no change needed).';
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- SUMMARY
  -- ════════════════════════════════════════════════════════════════════════
  RAISE NOTICE '══════════════════════════════════════════════════════════════';
  RAISE NOTICE ' RECOVERY COMPLETE';
  RAISE NOTICE '══════════════════════════════════════════════════════════════';
  RAISE NOTICE ' Table:    Table 20 (%)', v_table_id;
  RAISE NOTICE ' Invoice:  % (%)', COALESCE(v_invoice_number, 'N/A'), COALESCE(v_invoice_id::text, 'N/A');
  RAISE NOTICE ' Payment:  % (%)', v_payment_ref, COALESCE(v_payment_id::text, 'N/A');
  RAISE NOTICE ' Amount:   Rs. 4.00';
  RAISE NOTICE ' PRN:      b949c1a3-687f-4d50-95fd-f5a43c1db6a7';
  RAISE NOTICE '══════════════════════════════════════════════════════════════';
END;
$$;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 3: Verify the recovery
-- ════════════════════════════════════════════════════════════════════════════
SELECT '═══ VERIFICATION ═══' AS step;

SELECT '--- Table 20 status ---' AS info;
SELECT id, table_number, status, updated_at
FROM public.restaurant_tables
WHERE table_number = '20';

SELECT '--- Table sessions ---' AS info;
SELECT id, table_id, status, start_time, end_time, batch_count, total_amount, customer_name
FROM public.table_sessions
WHERE table_id = (SELECT id FROM public.restaurant_tables WHERE table_number = '20')
ORDER BY created_at DESC
LIMIT 3;

SELECT '--- Invoice created ---' AS info;
SELECT i.invoice_number, i.status, i.total, i.payment_method, i.created_at,
       (SELECT COUNT(*) FROM public.invoice_items ii WHERE ii.invoice_id = i.id) AS item_count
FROM public.invoices i
WHERE i.id = (SELECT MAX(id) FROM public.payments WHERE reference LIKE '%RECOVER-FP%' OR reference LIKE '%b949c1a3%')
   OR i.table_id = (SELECT id FROM public.restaurant_tables WHERE table_number = '20')
ORDER BY i.created_at DESC
LIMIT 3;

SELECT '--- Payment recorded ---' AS info;
SELECT p.id, p.amount, p.payment_method, p.reference, p.notes, p.created_at,
       i.invoice_number, i.status AS invoice_status
FROM public.payments p
JOIN public.invoices i ON i.id = p.invoice_id
WHERE p.reference LIKE '%RECOVER-FP%' OR p.reference LIKE '%b949c1a3%'
ORDER BY p.created_at DESC
LIMIT 3;

SELECT '--- Batch status ---' AS info;
SELECT ob.id, ob.status, ob.subtotal, ob.customer_name, ob.updated_at
FROM public.order_batches ob
WHERE ob.table_id = (SELECT id FROM public.restaurant_tables WHERE table_number = '20')
ORDER BY ob.created_at DESC
LIMIT 5;
