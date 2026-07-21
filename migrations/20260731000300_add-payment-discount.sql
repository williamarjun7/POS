-- ═══════════════════════════════════════════════════════════════
-- Migration: Add discount column to payments table
-- ─────────────────────────────────────────────────────────────
-- Enables per-payment discount tracking so reports can surface
-- "discounts given by payment method" or "discounts per cashier."
--
-- The invoice-level discount is still the authoritative total
-- discount for the invoice. The payment-level discount is for
-- granular financial reporting.
--
-- Relationship: For any payment record:
--   payment.amount + payment.discount = face value of items paid
--   invoice.discount = SUM(payment.discount for that invoice)
--   invoice.total = invoice.subtotal - invoice.discount + tax
-- ═══════════════════════════════════════════════════════════════

-- Step 1: Add discount column (nullable, defaults to 0)
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS discount DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (discount >= 0);

-- Step 2: Comment for documentation
COMMENT ON COLUMN public.payments.discount IS
  'Discount applied to this specific payment. Non-zero for split/partial payments with discounts. The invoice-level discount is the authoritative total — this is for granular reporting.';
