-- ═══════════════════════════════════════════════════════════════
-- Migration: Add Social QR & Printer Config fields
-- Description: Adds Instagram/TikTok QR fields to print_settings
-- Changes:
--   - enable_instagram_qr (BOOLEAN)
--   - instagram_url (TEXT)
--   - enable_tiktok_qr (BOOLEAN)
--   - tiktok_url (TEXT)
-- Author: System
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.print_settings
  ADD COLUMN IF NOT EXISTS enable_instagram_qr BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS instagram_url TEXT NOT NULL DEFAULT 'https://www.instagram.com/highlandscafemotel?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw==',
  ADD COLUMN IF NOT EXISTS enable_tiktok_qr BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tiktok_url TEXT NOT NULL DEFAULT 'https://www.tiktok.com/@highlandscafe1?is_from_webapp=1&sender_device=pc';

COMMENT ON COLUMN public.print_settings.enable_instagram_qr
  IS 'Whether to show Instagram QR code on printed receipts';
COMMENT ON COLUMN public.print_settings.instagram_url
  IS 'Instagram profile URL encoded in the receipt QR code';
COMMENT ON COLUMN public.print_settings.enable_tiktok_qr
  IS 'Whether to show TikTok QR code on printed receipts';
COMMENT ON COLUMN public.print_settings.tiktok_url
  IS 'TikTok profile URL encoded in the receipt QR code';

-- ═══════════════════════════════════════════════════════════════
-- Verification queries:
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'print_settings'
-- ORDER BY ordinal_position;
-- ═══════════════════════════════════════════════════════════════
