-- ═══════════════════════════════════════════════════════════════════
-- Migration: Deduplicate Invoices and Fix Customer Statistics
-- ═══════════════════════════════════════════════════════════════════
--
-- Problem: A bug in the partial payment flow caused duplicate invoices
-- to be created for the same sale (same customer, same total, created
-- within ~1 minute of each other). Real data shows duplicates 51 seconds
-- apart with mismatched order_batch_ids (one has empty array, the other
-- has the batch). This caused:
--
--   * Customer total_orders doubled (2 instead of 1)
--   * Customer total_spent doubled (Rs. 1,240 instead of Rs. 620)
--   * Invoices tab showing 2 entries instead of 1
--   * Credit payment records duplicated (recordCreditCharge called twice)
--   * Customer credit_balance doubled (Rs. 440 instead of Rs. 220)
--
-- Strategy:
--   1. Identify duplicate groups (same customer_name, same total,
--      created ≤120 seconds apart)
--   2. For each group, keep the EARLIEST invoice (the "survivor")
--   3. Reassign payments from duplicates to the survivor
--   4. DELETE redundant invoice_items from the duplicate (survivor
--      already has its own items covering the same order)
--   5. Delete duplicate invoices
--   6. Remove duplicate credit payment records (same customer_id +
--      same amount created within 120s)
--   7. Recalculate customer total_orders, total_spent from remaining
--      unique invoices
--   8. Recalculate credit_balance from surviving credit payment records
--      only (credit_balance = SUM credit-charge payments - SUM credit-payments)
--
-- This migration is IDEMPOTENT — safe to run multiple times.
-- The temp table is dropped at the end regardless.
-- ═══════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════
-- STEP 0: Create a temporary table to hold deduplication decisions
-- ═══════════════════════════════════════════════════════════════════

CREATE TEMP TABLE IF NOT EXISTS _dup_invoices (
  duplicate_id       UUID NOT NULL,
  survivor_id        UUID NOT NULL,
  customer_name      TEXT NOT NULL,
  invoice_total      DECIMAL(14,2) NOT NULL,
  order_batch_ids    UUID[] NOT NULL
);

-- ═══════════════════════════════════════════════════════════════════
-- STEP 1: Find duplicate invoice groups
-- ═══════════════════════════════════════════════════════════════════
--
-- A "duplicate" is an invoice where:
--   * Same customer_name (case-insensitive, non-empty, not Walk-in)
--   * Same total
--   * Created within 120 seconds of each other
--      (Real data shows 51s gap; 120s is safe since same customer +
--       same total + same time window guarantees duplication)
--   * Both statuses are NOT 'cancelled'
--
-- We keep the EARLIEST invoice as the survivor.
-- ═══════════════════════════════════════════════════════════════════

WITH dup_groups AS (
  SELECT
    LOWER(i1.customer_name) AS customer_key,
    i1.total,
    i1.id AS id1,
    i2.id AS id2,
    i1.created_at AS t1,
    i2.created_at AS t2
  FROM invoices i1
  JOIN invoices i2 ON
    LOWER(i1.customer_name) = LOWER(i2.customer_name)
    AND i1.total = i2.total
    AND i1.id < i2.id  -- Prevent A-B / B-A duplicates, only A-B
    AND i1.status != 'cancelled'
    AND i2.status != 'cancelled'
    AND i1.customer_name != ''
    AND i1.customer_name != 'Walk-in'
    AND i2.customer_name != 'Walk-in'
    AND ABS(EXTRACT(EPOCH FROM (i1.created_at - i2.created_at))) < 120
),
ranked AS (
  SELECT DISTINCT ON (id2)
    id2 AS duplicate_id,
    id1 AS survivor_id
  FROM dup_groups
  ORDER BY id2, id1  -- Pick the first id1 as survivor for each duplicate
)
INSERT INTO _dup_invoices (duplicate_id, survivor_id, customer_name, invoice_total, order_batch_ids)
SELECT
  r.duplicate_id,
  r.survivor_id,
  i.customer_name,
  i.total,
  i.order_batch_ids
FROM ranked r
JOIN invoices i ON i.id = r.duplicate_id;

-- ═══════════════════════════════════════════════════════════════════
-- STEP 1b: Report findings (useful to see before continuing)
-- ═══════════════════════════════════════════════════════════════════

SELECT
  'DUPLICATE INVOICES FOUND: ' || COUNT(*)::TEXT AS result
FROM _dup_invoices;

-- ═══════════════════════════════════════════════════════════════════
-- STEP 2: Reassign payments from duplicates to survivors
-- ═══════════════════════════════════════════════════════════════════
-- SAFETY: The duplicate invoice typically has NO payments linked
-- (the original bug created the second invoice but the payment was
-- already recorded on the first invoice). This step is a no-op in
-- the common case but handles edge cases where payments were linked
-- to the wrong invoice.
-- ═══════════════════════════════════════════════════════════════════

UPDATE payments p
SET invoice_id = d.survivor_id
FROM _dup_invoices d
WHERE p.invoice_id = d.duplicate_id;

-- ═══════════════════════════════════════════════════════════════════
-- STEP 3: DELETE invoice_items from the duplicate invoice
-- ═══════════════════════════════════════════════════════════════════
-- IMPORTANT: The survivor already has its own invoice_items covering
-- the same order items (same order_batch_ids). Merging the duplicate's
-- items would create duplicate rows in the survivor. Instead, we
-- simply delete the duplicate's items — the survivor's items suffice.
-- ═══════════════════════════════════════════════════════════════════

DELETE FROM invoice_items ii
USING _dup_invoices d
WHERE ii.invoice_id = d.duplicate_id;

-- ═══════════════════════════════════════════════════════════════════
-- STEP 4: Delete duplicate invoices
-- ═══════════════════════════════════════════════════════════════════

DELETE FROM invoices i
USING _dup_invoices d
WHERE i.id = d.duplicate_id;

-- ═══════════════════════════════════════════════════════════════════
-- STEP 5: Deduplicate credit payment records
-- ═══════════════════════════════════════════════════════════════════
-- The duplicate invoice bug caused recordCreditCharge in POS.tsx to
-- run twice, creating two identical payment_method='credit' records
-- for the same customer and amount. Remove the second one.
-- 
-- Note: Matching by customer_id + amount + method + within 120s,
--       regardless of invoice_id linkage (since credit charges from
--       the duplicate invoice may have different invoice_id values).
-- ═══════════════════════════════════════════════════════════════════

CREATE TEMP TABLE IF NOT EXISTS _dup_credit_payments AS
WITH credit_dups AS (
  SELECT
    p1.id AS keep_id,
    p2.id AS delete_id
  FROM payments p1
  JOIN payments p2 ON
    p1.customer_id = p2.customer_id
    AND p1.amount = p2.amount
    AND p1.payment_method = 'credit'
    AND p2.payment_method = 'credit'
    AND p1.id < p2.id
    AND ABS(EXTRACT(EPOCH FROM (p1.created_at - p2.created_at))) < 120
)
SELECT DISTINCT ON (delete_id)
  keep_id,
  delete_id
FROM credit_dups
ORDER BY delete_id, keep_id;

SELECT
  'DUPLICATE CREDIT PAYMENTS FOUND: ' || COUNT(*)::TEXT AS result
FROM _dup_credit_payments;

DELETE FROM payments p
USING _dup_credit_payments d
WHERE p.id = d.delete_id;

-- ═══════════════════════════════════════════════════════════════════
-- STEP 6: Recalculate customer statistics from canonical invoices
-- ═══════════════════════════════════════════════════════════════════
--
-- For each customer, recalculate:
--   total_orders  = COUNT of non-cancelled invoices (now deduplicated)
--   total_spent   = SUM of invoice totals for non-cancelled invoices
--   last_visit    = MAX of invoice created_at
-- ═══════════════════════════════════════════════════════════════════

WITH customer_invoice_stats AS (
  SELECT
    c.id AS customer_id,
    COUNT(i.id)::INTEGER AS correct_orders,
    COALESCE(SUM(i.total), 0) AS correct_spent,
    MAX(i.created_at) AS correct_last_visit
  FROM customers c
  LEFT JOIN invoices i ON i.customer_id = c.id AND i.status != 'cancelled'
  GROUP BY c.id
)
UPDATE customers c
SET
  total_orders = cis.correct_orders,
  total_spent  = cis.correct_spent,
  last_visit   = COALESCE(cis.correct_last_visit, c.last_visit)
FROM customer_invoice_stats cis
WHERE c.id = cis.customer_id
  AND (
    c.total_orders  != cis.correct_orders
    OR c.total_spent != cis.correct_spent
  );

-- ═══════════════════════════════════════════════════════════════════
-- STEP 7: Recalculate credit_balance from surviving credit records
-- ═══════════════════════════════════════════════════════════════════
--
-- credit_balance is NOT the same as invoice outstanding. It tracks
-- the customer credit account balance — how much the customer owes
-- from credit purchases MINUS what they've repaid.
--
-- Formula: credit_balance = SUM credit-charge - SUM credit-payments
--   - Credit charges are payments with method='credit' where the
--     notes do NOT start with 'Credit payment' (they record new debt)
--   - Credit payments are also method='credit' but with notes
--     starting with 'Credit payment' (they reduce debt)
-- ═══════════════════════════════════════════════════════════════════

WITH customer_credit_stats AS (
  SELECT
    p.customer_id,
    GREATEST(
      COALESCE(SUM(p.amount) FILTER (WHERE p.notes IS NULL OR p.notes !~* '^Credit payment'), 0)
      -
      COALESCE(SUM(p.amount) FILTER (WHERE p.notes ~* '^Credit payment'), 0),
    0) AS correct_credit_balance
  FROM payments p
  WHERE p.customer_id IS NOT NULL
    AND p.payment_method = 'credit'
  GROUP BY p.customer_id
)
UPDATE customers c
SET credit_balance = ccs.correct_credit_balance
FROM customer_credit_stats ccs
WHERE c.id = ccs.customer_id
  AND c.credit_balance != ccs.correct_credit_balance;

-- ═══════════════════════════════════════════════════════════════════
-- STEP 8: Also fix customers matched by name (not customer_id)
-- ═══════════════════════════════════════════════════════════════════

WITH name_matched_stats AS (
  SELECT
    c.id AS customer_id,
    COUNT(i.id)::INTEGER AS correct_orders,
    COALESCE(SUM(i.total), 0) AS correct_spent,
    MAX(i.created_at) AS correct_last_visit
  FROM customers c
  LEFT JOIN invoices i ON i.customer_name = c.name AND i.status != 'cancelled'
  WHERE i.customer_id IS NULL OR i.customer_id != c.id
  GROUP BY c.id
)
UPDATE customers c
SET
  total_orders = COALESCE(nms.correct_orders, c.total_orders),
  total_spent  = COALESCE(nms.correct_spent, c.total_spent),
  last_visit   = COALESCE(nms.correct_last_visit, c.last_visit)
FROM name_matched_stats nms
WHERE c.id = nms.customer_id
  AND (
    COALESCE(nms.correct_orders, 0) != c.total_orders
    OR COALESCE(nms.correct_spent, 0) != c.total_spent
  );

-- ═══════════════════════════════════════════════════════════════════
-- STEP 9: Backfill customer_id on orphaned invoices
-- ═══════════════════════════════════════════════════════════════════

UPDATE invoices i
SET customer_id = c.id
FROM customers c
WHERE i.customer_id IS NULL
  AND LOWER(i.customer_name) = LOWER(c.name)
  AND i.customer_name != ''
  AND i.customer_name != 'Walk-in';

-- ═══════════════════════════════════════════════════════════════════
-- STEP 10: Cleanup — drop temp tables
-- ═══════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS _dup_invoices;
DROP TABLE IF EXISTS _dup_credit_payments;

-- ═══════════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES (copy/paste after running)
-- ═══════════════════════════════════════════════════════════════════
--
-- 1. Check no duplicate invoices remain:
--    SELECT LOWER(customer_name), total, COUNT(*)
--    FROM invoices
--    WHERE customer_name != '' AND status != 'cancelled'
--    GROUP BY LOWER(customer_name), total
--    HAVING COUNT(*) > 1;
--
-- 2. Check customers with correct stats:
--    SELECT name, total_orders, total_spent, credit_balance
--    FROM customers
--    WHERE total_orders > 0
--    ORDER BY total_spent DESC;
--
-- 3. Verify per-invoice totals match payments:
--    SELECT
--      i.invoice_number,
--      i.total AS invoice_total,
--      COALESCE(SUM(p.amount) FILTER (WHERE p.payment_method != 'credit'), 0) AS paid,
--      i.total - COALESCE(SUM(p.amount) FILTER (WHERE p.payment_method != 'credit'), 0) AS outstanding
--    FROM invoices i
--    LEFT JOIN payments p ON p.invoice_id = i.id
--    GROUP BY i.id, i.invoice_number, i.total
--    ORDER BY i.created_at DESC;
--
-- 4. Check no duplicate credit payments remain:
--    SELECT customer_id, amount, COUNT(*)
--    FROM payments
--    WHERE payment_method = 'credit'
--    GROUP BY customer_id, amount
--    HAVING COUNT(*) > 1;
--
-- ═══════════════════════════════════════════════════════════════════
