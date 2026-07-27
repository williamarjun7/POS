-- ============================================================================
-- Migration: Add Google Review QR columns to print_settings
-- ============================================================================
-- Adds the missing google_review_url and enable_google_review_qr columns
-- that the frontend already expects but were never added to the DB schema.
-- ============================================================================

ALTER TABLE public.print_settings
  ADD COLUMN IF NOT EXISTS google_review_url TEXT NOT NULL DEFAULT 'https://g.page/r/CYSJDIQPF_uwEAE/review',
  ADD COLUMN IF NOT EXISTS enable_google_review_qr BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.print_settings.google_review_url
  IS 'Google Review URL for the review QR code on printed receipts';
COMMENT ON COLUMN public.print_settings.enable_google_review_qr
  IS 'Whether to show the Google Review QR code on printed receipts';

-- ============================================================================
-- Verification
-- ============================================================================
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'print_settings'
-- ORDER BY ordinal_position;
