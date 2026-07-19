-- ═══════════════════════════════════════════════════════════════════
-- DRY RUN: Audit duplicate invoices
-- ═══════════════════════════════════════════════════════════════════
-- This query ONLY reads data — no modifications.
-- ═══════════════════════════════════════════════════════════════════

-- 1. Find duplicate invoices
SELECT
  LOWER(i1.customer_name) AS customer,
  i1.total AS amount,
  i1.invoice_number AS invoice_1,
  i2.invoice_number AS invoice_2,
  i1.id AS id1,
  i2.id AS id2,
  i1.created_at AS created_1,
  i2.created_at AS created_2,
  ROUND(EXTRACT(EPOCH FROM (i2.created_at - i1.created_at))::numeric, 1) AS seconds_apart
FROM invoices i1
JOIN invoices i2 ON
  LOWER(i1.customer_name) = LOWER(i2.customer_name)
  AND i1.total = i2.total
  AND i1.id < i2.id
  AND i1.status != 'cancelled'
  AND i2.status != 'cancelled'
  AND i1.customer_name != ''
  AND i1.customer_name != 'Walk-in'
  AND ABS(EXTRACT(EPOCH FROM (i1.created_at - i2.created_at))) < 15
  AND i1.order_batch_ids && i2.order_batch_ids
ORDER BY i1.created_at DESC;

-- 2. Find duplicate credit payments
SELECT
  p1.customer_id,
  p1.amount,
  p1.id AS payment_1,
  p2.id AS payment_2,
  p1.created_at AS created_1,
  p2.created_at AS created_2,
  ROUND(EXTRACT(EPOCH FROM (p2.created_at - p1.created_at))::numeric, 1) AS seconds_apart,
  p1.notes AS notes_1,
  p2.notes AS notes_2
FROM payments p1
JOIN payments p2 ON
  p1.customer_id = p2.customer_id
  AND p1.amount = p2.amount
  AND p1.payment_method = 'credit'
  AND p2.payment_method = 'credit'
  AND p1.id < p2.id
  AND ABS(EXTRACT(EPOCH FROM (p1.created_at - p2.created_at))) < 15
  AND (p1.invoice_id = p2.invoice_id OR (p1.invoice_id IS NULL AND p2.invoice_id IS NULL))
ORDER BY p1.created_at DESC;

-- 3. Summary: customers affected by duplicates
SELECT
  c.name,
  c.total_orders AS current_orders,
  c.total_spent AS current_spent,
  c.credit_balance AS current_credit
FROM customers c
WHERE c.id IN (
  SELECT DISTINCT i.customer_id
  FROM invoices i
  WHERE i.id IN (
    SELECT i1.id
    FROM invoices i1
    JOIN invoices i2 ON
      LOWER(i1.customer_name) = LOWER(i2.customer_name)
      AND i1.total = i2.total
      AND i1.id < i2.id
      AND i1.status != 'cancelled'
      AND ABS(EXTRACT(EPOCH FROM (i1.created_at - i2.created_at))) < 15
      AND i1.order_batch_ids && i2.order_batch_ids
  )
)
ORDER BY c.name;
