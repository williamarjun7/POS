-- ═══════════════════════════════════════════════════════════════
-- Migration: Add KOT print settings columns (2026-08-13)
-- ─────────────────────────────────────────────────────────────
-- Adds support for Kitchen Order Ticket (KOT) auto-printing:
--   - kot_enabled: whether to auto-print KOT when order is placed
--   - kot_print_copies: number of KOT copies to print (1–10)
--
-- These columns enable the KOT feature in PrintSettings → POS
-- without requiring a feature flag.
-- ═══════════════════════════════════════════════════════════════

-- Step 1: Add KOT columns to the singleton print_settings row
-- Both are nullable so existing rows get defaults from the frontend code.
ALTER TABLE public.print_settings
  ADD COLUMN IF NOT EXISTS kot_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kot_print_copies INTEGER NOT NULL DEFAULT 1
    CHECK (kot_print_copies >= 1 AND kot_print_copies <= 10);

-- Step 2: Column documentation
COMMENT ON COLUMN public.print_settings.kot_enabled IS 'Whether to auto-print a Kitchen Order Ticket when an order is placed from POS';
COMMENT ON COLUMN public.print_settings.kot_print_copies IS 'Number of KOT copies to print (1–10, default 1)';

-- ═══════════════════════════════════════════════════════════════
-- VERIFICATION
-- ═══════════════════════════════════════════════════════════════
--
-- Run after migration:
--   SELECT kot_enabled, kot_print_copies FROM public.print_settings LIMIT 1;
--   \d+ public.print_settings
