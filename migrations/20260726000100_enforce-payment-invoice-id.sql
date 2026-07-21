-- ═══════════════════════════════════════════════════════════════════
-- Migration: Enforce invoice_id on non-credit payments
-- ═══════════════════════════════════════════════════════════════════
--
-- Problem: Payment records were being inserted without invoice_id,
-- making them invisible to the ReceivePaymentModal's outstanding
-- calculation (which queries payments by invoice_id).
--
-- This constraint prevents the entire class of bugs going forward:
-- any non-credit payment MUST reference an invoice.
--
-- ═══════════════════════════════════════════════════════════════════

-- Step 1: Clean any remaining orphaned non-credit payments that slipped through.
--         This should be a no-op if the backfill migration ran successfully,
--         but protects against edge cases.
UPDATE payments
SET invoice_id = (
  SELECT i.id FROM invoices i
  WHERE i.customer_id = payments.customer_id
     OR i.customer_name = (
       SELECT c.name FROM customers c WHERE c.id = payments.customer_id
     )
  ORDER BY i.created_at DESC
  LIMIT 1
)
WHERE invoice_id IS NULL
  AND payment_method != 'credit';

-- Step 2: Add CHECK constraint — non-credit payments MUST have an invoice_id.
--         Credit payments are exempt because credit-settlement records
--         (customer paying down their balance) don't map to a single invoice.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payments_non_credit_invoice_id_not_null'
  ) THEN
    ALTER TABLE payments
      ADD CONSTRAINT payments_non_credit_invoice_id_not_null
      CHECK (
        payment_method = 'credit'
        OR invoice_id IS NOT NULL
      );
  END IF;
END;
$$;

-- Step 3: Verify the constraint is in place
SELECT
  conname AS constraint_name,
  contype AS constraint_type,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conname = 'payments_non_credit_invoice_id_not_null';
