-- ============================================================================
-- Migration: Remove dead columns from customers table
-- Date: July 29, 2026
--
-- These columns are no longer maintained by any code path:
--   - total_orders    (last written by updateCustomerAfterInvoice — removed Phase 1)
--   - total_spent     (last written by updateCustomerAfterInvoice — removed Phase 1)
--   - loyalty_points  (never written by any code — always 0)
--   - credit_balance  (last written by recordCreditCharge — removed Phase 1)
--
-- All values are now computed dynamically from invoices and real payments.
-- ============================================================================

ALTER TABLE public.customers
  DROP COLUMN IF EXISTS total_orders,
  DROP COLUMN IF EXISTS total_spent,
  DROP COLUMN IF EXISTS loyalty_points,
  DROP COLUMN IF EXISTS credit_balance;
