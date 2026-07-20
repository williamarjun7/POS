-- ============================================================================
-- Migration: Add discount column to bookings table
-- Date: July 30, 2026
--
-- Adds a `discount` column to track discounts applied during booking/reservation.
-- The discount amount is subtracted from the subtotal to compute the final total:
--   total = (nights × nightly_rate) - discount
-- ============================================================================

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS discount DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (discount >= 0);
