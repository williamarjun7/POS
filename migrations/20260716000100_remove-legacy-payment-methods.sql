-- ============================================================================
-- MIGRATION: Remove Legacy Payment Methods (2026-07-16)
-- ────────────────────────────────────────────────────────────────────────────
-- The POS now supports only four payment methods: cash, reception_qr, fonepay,
-- and credit. The legacy 'card' and 'bank_transfer' values are removed from
-- CHECK constraints to prevent new inserts from using them.
--
-- Changes:
--   1. Migrate any existing records with 'card' or 'bank_transfer' to 'cash'
--   2. Drop & recreate CHECK constraint on payments.payment_method
--      (removes 'card', 'bank_transfer')
--   3. Drop & recreate CHECK constraint on expenses.payment_method
--      (removes 'card', 'bank_transfer', adds 'reception_qr')
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- PART 1: Migrate legacy payment method values
-- ────────────────────────────────────────────────────────────────────────────
-- Legacy 'card' and 'bank_transfer' are no longer supported. Any existing
-- records using them are reassigned to 'cash' so the new CHECK constraints
-- won't fail.

UPDATE public.payments
SET payment_method = 'cash'
WHERE payment_method IN ('card', 'bank_transfer');

UPDATE public.expenses
SET payment_method = 'cash'
WHERE payment_method IN ('card', 'bank_transfer');

-- ────────────────────────────────────────────────────────────────────────────
-- PART 2: Update CHECK constraint on payments.payment_method
-- ────────────────────────────────────────────────────────────────────────────
-- Old: ('cash','fonepay','card','bank_transfer','credit','reception_qr')
-- New: ('cash','fonepay','credit','reception_qr')

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_payment_method_check;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_payment_method_check
  CHECK (payment_method IN ('cash','fonepay','credit','reception_qr'));

-- ────────────────────────────────────────────────────────────────────────────
-- PART 3: Update CHECK constraint on expenses.payment_method
-- ────────────────────────────────────────────────────────────────────────────
-- Old: ('cash','fonepay','card','bank_transfer','credit')
-- New: ('cash','fonepay','credit','reception_qr')

ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_payment_method_check;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_payment_method_check
  CHECK (payment_method IN ('cash','fonepay','credit','reception_qr'));

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
--
-- Run these after migration to verify:
--
-- 1. Check no legacy payment methods remain:
--    SELECT COUNT(*) FROM public.payments WHERE payment_method IN ('card', 'bank_transfer');
--    SELECT COUNT(*) FROM public.expenses WHERE payment_method IN ('card', 'bank_transfer');
--
-- 2. Check new constraints are in place:
--    SELECT constraint_name, check_clause
--    FROM information_schema.check_constraints
--    WHERE constraint_name IN ('payments_payment_method_check', 'expenses_payment_method_check');
--
-- 3. Test inserting a valid payment (should succeed):
--    INSERT INTO public.payments (invoice_id, amount, payment_method)
--    VALUES (NULL, 100, 'cash');
--    DELETE FROM public.payments WHERE amount = 100 AND invoice_id IS NULL;
--
-- 4. Test that 'card' is rejected (should fail):
--    INSERT INTO public.payments (invoice_id, amount, payment_method)
--    VALUES (NULL, 100, 'card');
--    -- Expected: ERROR: new row for relation "payments" violates check constraint
