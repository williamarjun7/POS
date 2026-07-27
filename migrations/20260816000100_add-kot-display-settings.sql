-- ============================================================================
-- Migration: Add KOT display option columns to print_settings
-- ============================================================================
-- Adds settings for controlling which optional fields appear on KOT prints.
-- Customer name and staff name are hidden by default (kitchen doesn't need them).
-- ============================================================================

ALTER TABLE public.print_settings
  ADD COLUMN IF NOT EXISTS kot_show_customer BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kot_show_staff BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.print_settings.kot_show_customer
  IS 'Whether to print customer/guest name on Kitchen Order Tickets';
COMMENT ON COLUMN public.print_settings.kot_show_staff
  IS 'Whether to print waiter/staff name on Kitchen Order Tickets';

-- ============================================================================
-- Verification
-- ============================================================================
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'print_settings'
-- ORDER BY ordinal_position;
