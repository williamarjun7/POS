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

  -- STEP 0: Authorization + Server-side input validation
  IF p_user_id IS NOT NULL AND p_user_id != (SELECT auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED', 'error', 'You are not permitted to process this payment.', 'sqlstate', 'P0001', 'elapsed_ms', 0);
  END IF;

  v_user_role := public.get_user_role();
  IF v_user_role NOT IN ('admin', 'cashier', 'manager') THEN
    RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED', 'error', 'Your role does not permit processing payments.', 'details', jsonb_build_object('role', v_user_role), 'sqlstate', 'P0001', 'elapsed_ms', 0);
  END IF;

  IF p_payment_amount < 0 THEN
    RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_ERROR', 'error', 'Payment amount cannot be negative.', 'sqlstate', 'P0001', 'elapsed_ms', 0);
  END IF;

  IF p_invoice_total < 0 THEN
    RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_ERROR', 'error', 'Invoice total cannot be negative.', 'sqlstate', 'P0001', 'elapsed_ms', 0);
  END IF;

  IF p_payment_amount > p_invoice_total THEN
    RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_ERROR', 'error', 'Payment amount cannot exceed invoice total.', 'details', jsonb_build_object('payment_amount', p_payment_amount, 'invoice_total', p_invoice_total), 'sqlstate', 'P0001', 'elapsed_ms', 0);
  END IF;

  IF p_payment_amount > 0 AND (p_paid_item_ids IS NULL OR array_length(p_paid_item_ids, 1) IS NULL OR array_length(p_paid_item_ids, 1) = 0) THEN
    RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_ERROR', 'error', 'Payment requires at least one payable item.', 'sqlstate', 'P0001', 'elapsed_ms', 0);
  END IF;

  IF p_payment_amount > 0 AND (p_batch_ids IS NULL OR array_length(p_batch_ids, 1) IS NULL OR array_length(p_batch_ids, 1) = 0) THEN
    RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_ERROR', 'error', 'At least one batch must be specified for payment.', 'sqlstate', 'P0001', 'elapsed_ms', 0);
  END IF;

  IF p_invoice_status IS NULL OR p_invoice_status NOT IN ('paid', 'partial', 'credit_invoice', 'pending') THEN
    RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_ERROR', 'error', format('Invalid invoice status: %L.', p_invoice_status), 'sqlstate', 'P0001', 'elapsed_ms', 0);
  END IF;

  IF p_payment_method IS NULL OR p_payment_method NOT IN ('cash', 'credit', 'fonepay', 'reception_qr', 'split', 'online') THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_PAYMENT_METHOD', 'error', format('Invalid payment method: %L.', p_payment_method), 'details', jsonb_build_object('payment_method', p_payment_method), 'sqlstate', 'P0001', 'elapsed_ms', 0);
  END IF;

  IF array_length(p_paid_item_ids, 1) > 0 THEN
    SELECT id INTO v_dup_item_id FROM (SELECT unnest(p_paid_item_ids) AS id GROUP BY id HAVING COUNT(*) > 1 LIMIT 1) dups;
    IF v_dup_item_id IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_ERROR', 'error', 'Duplicate item IDs are not allowed.', 'details', jsonb_build_object('duplicate_item_id', v_dup_item_id), 'sqlstate', 'P0001', 'elapsed_ms', 0);
    END IF;
  END IF;

  IF array_length(p_paid_item_ids, 1) > 0 AND array_length(p_batch_ids, 1) > 0 AND p_table_id IS NOT NULL THEN
    SELECT obi.id INTO v_dup_item_id FROM order_batch_items obi JOIN order_batches ob ON ob.id = obi.batch_id WHERE obi.id = ANY(p_paid_item_ids) AND obi.batch_id = ANY(p_batch_ids) AND ob.table_id = p_table_id LIMIT 1;
    IF v_dup_item_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'code', 'INVALID_BATCH', 'error', 'Paid items do not match the supplied batches or table.', 'sqlstate', 'P0001', 'elapsed_ms', 0);
    END IF;
  END IF;

  IF array_length(p_batch_ids, 1) > 0 AND p_table_id IS NOT NULL THEN
    SELECT ob.table_id INTO v_batch_table_id FROM order_batches ob WHERE ob.id = p_batch_ids[1];
    IF v_batch_table_id IS DISTINCT FROM p_table_id THEN
      RETURN jsonb_build_object('success', false, 'code', 'INVALID_TABLE', 'error', 'Batch does not belong to the specified table.', 'sqlstate', 'P0001', 'elapsed_ms', 0);
    END IF;
  END IF;

  -- STEP 1: Idempotency Check
  IF p_payment_reference IS NOT NULL AND p_payment_reference != '' THEN
    SELECT id, invoice_id INTO v_existing_payment_id, v_existing_invoice_id FROM payments WHERE reference = p_payment_reference;
    IF v_existing_payment_id IS NOT NULL THEN
      SELECT invoice_number INTO v_invoice_number FROM invoices WHERE id = v_existing_invoice_id;
      RETURN jsonb_build_object('success', true, 'is_duplicate', true, 'invoice_id', v_existing_invoice_id, 'invoice_number', v_invoice_number, 'payment_id', v_existing_payment_id);
    END IF;
  END IF;
  v_step1_time := clock_timestamp();

  -- STEP 2: Find existing partial/credit invoice OR create new one
  IF p_table_id IS NOT NULL AND array_length(p_order_batch_ids, 1) > 0 THEN
    SELECT id, invoice_number INTO v_existing_invoice_id, v_existing_inv_number
    FROM invoices WHERE table_id = p_table_id AND status IN ('partial', 'credit_invoice') AND order_batch_ids && p_order_batch_ids
    ORDER BY created_at DESC LIMIT 1;
  END IF;

  IF v_existing_invoice_id IS NOT NULL THEN
    UPDATE invoices SET status = p_invoice_status WHERE id = v_existing_invoice_id;
    v_invoice_id := v_existing_invoice_id;
    v_invoice_number := v_existing_inv_number;
    v_is_new_invoice := false;
  ELSE
    v_invoice_number := format('INV-%s-%s', TO_CHAR(NOW(), 'YYYY'), NEXTVAL('invoice_number_seq'));
    INSERT INTO invoices (invoice_number, customer_name, table_id, order_batch_ids, subtotal, tax, discount, total, status, payment_method, user_id)
    VALUES (v_invoice_number, COALESCE(p_customer_name, 'Walk-in'), p_table_id, p_order_batch_ids, p_invoice_subtotal, p_invoice_tax, p_invoice_discount, p_invoice_total, p_invoice_status, p_payment_method, p_user_id)
    RETURNING id INTO v_invoice_id;
  END IF;
  v_step2_time := clock_timestamp();

  -- STEP 3: Update batch item statuses (CONCURRENCY GATE)
  IF array_length(p_paid_item_ids, 1) > 0 THEN
    UPDATE order_batch_items SET status = p_item_paid_status
    WHERE id = ANY(p_paid_item_ids) AND status NOT IN ('paid', 'cancelled', 'voided');
    GET DIAGNOSTICS v_affected_item_rows = ROW_COUNT;
    IF v_affected_item_rows = 0 THEN
      RAISE EXCEPTION 'These items have already been paid. No duplicate payment was created.' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  v_step3_time := clock_timestamp();

  -- STEP 4: Update batch-level statuses
  IF array_length(p_batch_ids, 1) > 0 THEN
    WITH batch_item_counts AS (
      SELECT obi.batch_id,
        COUNT(*) FILTER (WHERE obi.status IN ('paid', 'credit', 'cancelled', 'voided')) AS settled_count,
        COUNT(*) FILTER (WHERE obi.status IN ('paid', 'credit')) AS paid_count,
        COUNT(*) AS total_count
      FROM order_batch_items obi
      WHERE obi.batch_id = ANY(p_batch_ids)
      GROUP BY obi.batch_id
    )
    UPDATE order_batches ob
    SET status = CASE
      WHEN bic.settled_count = bic.total_count THEN 'paid'
      WHEN bic.paid_count > 0 THEN 'partial'
      ELSE ob.status
    END
    FROM batch_item_counts bic
    WHERE ob.id = bic.batch_id AND ob.status NOT IN ('paid', 'cancelled');
    GET DIAGNOSTICS v_batch_update_count = ROW_COUNT;
  END IF;
  v_step4_time := clock_timestamp();

  -- STEP 5: Record payment
  IF p_payment_amount > 0 AND p_payment_method IS DISTINCT FROM 'credit' THEN
    INSERT INTO payments (invoice_id, amount, discount, payment_method, reference, notes, user_id)
    VALUES (v_invoice_id, p_payment_amount, p_invoice_discount, p_payment_method, p_payment_reference, p_payment_notes, p_user_id)
    RETURNING id INTO v_payment_id;
  END IF;
  v_step5_time := clock_timestamp();

  RETURN jsonb_build_object(
    'success', true, 'is_duplicate', false, 'is_new_invoice', v_is_new_invoice,
    'invoice_id', v_invoice_id, 'invoice_number', v_invoice_number,
    'payment_id', v_payment_id, 'batch_update_count', v_batch_update_count,
    'timing_ms', jsonb_build_object(
      'total', EXTRACT(EPOCH FROM (v_step5_time - v_start_time)) * 1000,
      'idempotency', EXTRACT(EPOCH FROM (v_step1_time - v_start_time)) * 1000,
      'invoice', EXTRACT(EPOCH FROM (v_step2_time - v_step1_time)) * 1000,
      'batch_items', EXTRACT(EPOCH FROM (v_step3_time - v_step2_time)) * 1000,
      'batch_status', EXTRACT(EPOCH FROM (v_step4_time - v_step3_time)) * 1000,
      'payment', EXTRACT(EPOCH FROM (v_step5_time - v_step4_time)) * 1000
    )
  );

EXCEPTION
  WHEN unique_violation THEN
    DECLARE v_uv_constraint TEXT;
    BEGIN
      GET STACKED DIAGNOSTICS v_uv_constraint = CONSTRAINT_NAME;
      v_elapsed_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000;
      IF v_uv_constraint = 'payments_reference_unique' THEN
        SELECT id, invoice_id INTO v_existing_payment_id, v_existing_invoice_id FROM payments WHERE reference = p_payment_reference;
        IF FOUND THEN
          SELECT invoice_number INTO v_invoice_number FROM invoices WHERE id = v_existing_invoice_id;
          RETURN jsonb_build_object('success', true, 'is_duplicate', true, 'invoice_id', v_existing_invoice_id, 'invoice_number', v_invoice_number, 'payment_id', v_existing_payment_id, 'constraint_name', v_uv_constraint, 'elapsed_ms', v_elapsed_ms);
        END IF;
      END IF;
      RAISE;
    END;
  WHEN OTHERS THEN
    v_elapsed_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000;
    IF SQLSTATE = 'P0001' AND position('already been paid' in SQLERRM) > 0 THEN
      RETURN jsonb_build_object('success', false, 'code', 'CONCURRENCY_CONFLICT', 'error', SQLERRM, 'sqlstate', SQLSTATE, 'elapsed_ms', v_elapsed_ms);
    END IF;
    RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'code', 'UNKNOWN', 'sqlstate', SQLSTATE, 'elapsed_ms', v_elapsed_ms);
END;
$$;
