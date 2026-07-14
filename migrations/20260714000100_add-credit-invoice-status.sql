-- ============================================================================
-- MIGRATION: Add credit_invoice Status to Invoices (2026-07-14)
-- ────────────────────────────────────────────────────────────────────────────
-- The codebase now creates credit invoices with status 'credit_invoice',
-- but the DB CHECK constraint only allowed ('paid','pending','overdue',
-- 'partial','cancelled'). This migration adds 'credit_invoice' to the
-- allowed values.
--
-- Changes:
--   1. Drop & recreate the CHECK constraint on invoices.status
--      (adds 'credit_invoice' to the enum)
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- PART 1: Update CHECK constraint on invoices.status
-- ────────────────────────────────────────────────────────────────────────────
-- Old: ('paid','pending','overdue','partial','cancelled')
-- New: ('paid','pending','overdue','partial','credit_invoice','cancelled')

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_status_check;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('paid','pending','overdue','partial','credit_invoice','cancelled'));

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Run these after migration to verify:
--
-- 1. Check the new constraint is in place:
--    SELECT constraint_name, check_clause
--    FROM information_schema.check_constraints
--    WHERE constraint_name = 'invoices_status_check';
--
-- 2. Test inserting a credit_invoice row (should succeed):
--    INSERT INTO public.invoices (invoice_number, customer_name, total, status)
--    VALUES ('TEST-CREDIT-INV', 'Test Customer', 100, 'credit_invoice');
--    DELETE FROM public.invoices WHERE invoice_number = 'TEST-CREDIT-INV';
