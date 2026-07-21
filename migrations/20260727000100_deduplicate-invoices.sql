-- ═══════════════════════════════════════════════════════════════════
-- Migration: Deduplicate Invoices and Fix Customer Statistics
-- ═══════════════════════════════════════════════════════════════════
-- Guard: skips entirely if customers.total_orders column doesn't exist
-- (already dropped by 20260729000100_remove-dead-customer-columns).
-- ═══════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers'
      AND column_name = 'total_orders'
  ) THEN
    RAISE NOTICE 'Skipping deduplicate-invoices: customers.total_orders already dropped';
    RETURN;
  END IF;

  -- ── Find duplicate invoices ──────────────────────────────────────
  CREATE TEMP TABLE IF NOT EXISTS _dup_invoices (
    duplicate_id    UUID NOT NULL,
    survivor_id     UUID NOT NULL,
    customer_name   TEXT NOT NULL,
    invoice_total   DECIMAL(14,2) NOT NULL,
    order_batch_ids UUID[] NOT NULL
  );

  WITH dup_groups AS (
    SELECT
      LOWER(i1.customer_name) AS customer_key,
      i1.total, i1.id AS id1, i2.id AS id2,
      i1.created_at AS t1, i2.created_at AS t2
    FROM invoices i1
    JOIN invoices i2 ON
      LOWER(i1.customer_name) = LOWER(i2.customer_name)
      AND i1.total = i2.total
      AND i1.id < i2.id
      AND i1.status != 'cancelled' AND i2.status != 'cancelled'
      AND i1.customer_name != '' AND i1.customer_name != 'Walk-in'
      AND i2.customer_name != 'Walk-in'
      AND ABS(EXTRACT(EPOCH FROM (i1.created_at - i2.created_at))) < 120
  ),
  ranked AS (
    SELECT DISTINCT ON (id2) id2 AS duplicate_id, id1 AS survivor_id
    FROM dup_groups ORDER BY id2, id1
  )
  INSERT INTO _dup_invoices
  SELECT r.duplicate_id, r.survivor_id, i.customer_name, i.total, i.order_batch_ids
  FROM ranked r JOIN invoices i ON i.id = r.duplicate_id;

  RAISE NOTICE 'Duplicate invoices found: %', (SELECT COUNT(*) FROM _dup_invoices);

  -- ── Reassign payments from duplicates to survivors ───────────────
  UPDATE payments p SET invoice_id = d.survivor_id
  FROM _dup_invoices d WHERE p.invoice_id = d.duplicate_id;

  -- ── Delete duplicate invoice_items ───────────────────────────────
  DELETE FROM invoice_items ii USING _dup_invoices d WHERE ii.invoice_id = d.duplicate_id;

  -- ── Delete duplicate invoices ────────────────────────────────────
  DELETE FROM invoices i USING _dup_invoices d WHERE i.id = d.duplicate_id;

  -- ── Deduplicate credit payments ──────────────────────────────────
  CREATE TEMP TABLE IF NOT EXISTS _dup_credit_payments AS
  WITH credit_dups AS (
    SELECT p1.id AS keep_id, p2.id AS delete_id
    FROM payments p1 JOIN payments p2 ON
      p1.customer_id = p2.customer_id AND p1.amount = p2.amount
      AND p1.payment_method = 'credit' AND p2.payment_method = 'credit'
      AND p1.id < p2.id
      AND ABS(EXTRACT(EPOCH FROM (p1.created_at - p2.created_at))) < 120
  )
  SELECT DISTINCT ON (delete_id) keep_id, delete_id
  FROM credit_dups ORDER BY delete_id, keep_id;

  DELETE FROM payments p USING _dup_credit_payments d WHERE p.id = d.delete_id;

  -- ── Recalculate customer stats ───────────────────────────────────
  WITH customer_invoice_stats AS (
    SELECT c.id AS customer_id,
      COUNT(i.id)::INTEGER AS correct_orders,
      COALESCE(SUM(i.total), 0) AS correct_spent,
      MAX(i.created_at) AS correct_last_visit
    FROM customers c
    LEFT JOIN invoices i ON i.customer_id = c.id AND i.status != 'cancelled'
    GROUP BY c.id
  )
  UPDATE customers c SET
    total_orders = cis.correct_orders,
    total_spent  = cis.correct_spent,
    last_visit   = COALESCE(cis.correct_last_visit, c.last_visit)
  FROM customer_invoice_stats cis
  WHERE c.id = cis.customer_id
    AND (c.total_orders != cis.correct_orders OR c.total_spent != cis.correct_spent);

  -- ── Recalculate credit_balance ───────────────────────────────────
  WITH customer_credit_stats AS (
    SELECT p.customer_id,
      GREATEST(
        COALESCE(SUM(p.amount) FILTER (WHERE p.notes IS NULL OR p.notes !~* '^Credit payment'), 0)
        - COALESCE(SUM(p.amount) FILTER (WHERE p.notes ~* '^Credit payment'), 0),
      0) AS correct_credit_balance
    FROM payments p
    WHERE p.customer_id IS NOT NULL AND p.payment_method = 'credit'
    GROUP BY p.customer_id
  )
  UPDATE customers c SET credit_balance = ccs.correct_credit_balance
  FROM customer_credit_stats ccs
  WHERE c.id = ccs.customer_id AND c.credit_balance != ccs.correct_credit_balance;

  -- ── Fix customers matched by name ────────────────────────────────
  WITH name_matched_stats AS (
    SELECT c.id AS customer_id,
      COUNT(i.id)::INTEGER AS correct_orders,
      COALESCE(SUM(i.total), 0) AS correct_spent,
      MAX(i.created_at) AS correct_last_visit
    FROM customers c
    LEFT JOIN invoices i ON i.customer_name = c.name AND i.status != 'cancelled'
    WHERE i.customer_id IS NULL OR i.customer_id != c.id
    GROUP BY c.id
  )
  UPDATE customers c SET
    total_orders = COALESCE(nms.correct_orders, c.total_orders),
    total_spent  = COALESCE(nms.correct_spent, c.total_spent),
    last_visit   = COALESCE(nms.correct_last_visit, c.last_visit)
  FROM name_matched_stats nms
  WHERE c.id = nms.customer_id
    AND (COALESCE(nms.correct_orders, 0) != c.total_orders
      OR COALESCE(nms.correct_spent, 0) != c.total_spent);

  -- ── Backfill customer_id on orphaned invoices ────────────────────
  UPDATE invoices i SET customer_id = c.id
  FROM customers c
  WHERE i.customer_id IS NULL
    AND LOWER(i.customer_name) = LOWER(c.name)
    AND i.customer_name != '' AND i.customer_name != 'Walk-in';

  -- ── Cleanup ──────────────────────────────────────────────────────
  DROP TABLE IF EXISTS _dup_invoices;
  DROP TABLE IF EXISTS _dup_credit_payments;

END;
$$;
