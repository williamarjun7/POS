-- ═══════════════════════════════════════════════════════════════════
-- Migration: Backfill missing invoice_id on historical payments
-- ═══════════════════════════════════════════════════════════════════
--
-- Problem: The Customers.tsx ReceivePaymentModal's handleReceivePayment
-- function was inserting payment records WITHOUT setting invoice_id.
-- The ReceivePaymentModal then queries payments by invoice_id to compute
-- already-paid amounts — but these orphaned payments are invisible.
--
-- Root cause: handleReceivePayment used:
--   insert([{ customer_id, amount, payment_method, ... }])
--   -- MISSING: invoice_id
--
-- Fixed in code (20260725000100): now sets invoice_id when a single
-- invoice is selected.
--
-- This migration backfills existing orphaned records.
--
-- ═══════════════════════════════════════════════════════════════════

-- Step 1: Backfill invoice_id via customer_id FK match
-- Payments have customer_id, invoices have customer_id — direct join.
UPDATE payments p
SET invoice_id = (
  SELECT i.id
  FROM invoices i
  WHERE i.customer_id = p.customer_id
    AND i.total >= p.amount
  ORDER BY i.created_at DESC
  LIMIT 1
)
WHERE p.invoice_id IS NULL
  AND p.customer_id IS NOT NULL
  AND p.payment_method != 'credit';

-- Step 2: For invoices where customer_id is NULL (not yet backfilled),
--         match payments to invoices via the customers.name bridge.
--         Payments have customer_id → customers.id → customers.name
--         Invoices have customer_name (text field)
UPDATE payments p
SET invoice_id = (
  SELECT i.id
  FROM invoices i
  JOIN customers c ON c.name = i.customer_name
  WHERE c.id = p.customer_id
    AND i.total >= p.amount
  ORDER BY i.created_at DESC
  LIMIT 1
)
WHERE p.invoice_id IS NULL
  AND p.customer_id IS NOT NULL
  AND p.payment_method != 'credit';

-- Step 3: For payments where reference or notes contain an invoice number
UPDATE payments p
SET invoice_id = (
  SELECT i.id
  FROM invoices i
  WHERE i.invoice_number = p.reference
    OR i.invoice_number = REPLACE(p.notes, 'Payment received from ', '')
)
WHERE p.invoice_id IS NULL
  AND p.payment_method != 'credit';

-- Step 4: Report remaining orphaned payments (manual review needed)
SELECT COUNT(*) AS still_orphaned
FROM payments
WHERE invoice_id IS NULL
  AND payment_method != 'credit';

-- ═══════════════════════════════════════════════════════════════════
-- Verification query
-- ═══════════════════════════════════════════════════════════════════
--
-- SELECT
--   p.id AS payment_id,
--   p.amount,
--   p.payment_method,
--   p.invoice_id,
--   p.customer_id,
--   i.invoice_number,
--   i.customer_name
-- FROM payments p
-- LEFT JOIN invoices i ON i.id = p.invoice_id
-- WHERE p.invoice_id IS NULL
--   AND p.payment_method != 'credit'
-- ORDER BY p.created_at DESC;
