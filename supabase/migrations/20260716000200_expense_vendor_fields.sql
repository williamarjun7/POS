-- Migration: Add vendor, receipt_number, and updated_at to expenses table
-- Date: 2026-07-16

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS vendor VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS receipt_number VARCHAR(100) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Backfill updated_at for existing rows
UPDATE public.expenses SET updated_at = created_at WHERE updated_at IS NULL;

-- Trigger to auto-update updated_at on row modification
CREATE OR REPLACE FUNCTION update_expenses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_expenses_updated_at ON public.expenses;
CREATE TRIGGER set_expenses_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION update_expenses_updated_at();

-- Index for vendor lookups
CREATE INDEX IF NOT EXISTS idx_expenses_vendor ON public.expenses(vendor);
