-- Add guest count columns to bookings
-- Allows capturing number of adults and children for each booking

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS adults INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS children INTEGER NOT NULL DEFAULT 0;
