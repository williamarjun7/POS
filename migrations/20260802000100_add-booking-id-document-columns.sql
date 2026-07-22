-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Add identity document columns to bookings table
-- ════════════════════════════════════════════════════════════════════════════
-- Adds columns to store guest identity document type (citizenship, passport,
-- driving_license, voter_id, other) and document number. These are collected
-- in the booking form but were never persisted to the database.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS id_type TEXT,
  ADD COLUMN IF NOT EXISTS id_number TEXT;

COMMENT ON COLUMN public.bookings.id_type IS 'Type of identity document (citizenship, passport, driving_license, voter_id, other)';
COMMENT ON COLUMN public.bookings.id_number IS 'Identity document number';
