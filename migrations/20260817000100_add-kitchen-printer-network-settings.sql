-- ═══════════════════════════════════════════════════════════════
-- Migration: Add kitchen printer network settings
-- ─────────────────────────────────────────────────────────────
-- Adds IP address and port fields for the dedicated network
-- kitchen printer. The standard thermal printer settings
-- (paper size, copies, etc.) are reused across both printers.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.print_settings
  ADD COLUMN IF NOT EXISTS kitchen_printer_ip   TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS kitchen_printer_port INTEGER NOT NULL DEFAULT 9100;
-- Port 9100 is the default ESC/POS network port for
-- thermal receipt printers (Epson, ZYWELL, Star, etc.)

COMMENT ON COLUMN public.print_settings.kitchen_printer_ip   IS 'Static IP address of the network kitchen printer';
COMMENT ON COLUMN public.print_settings.kitchen_printer_port IS 'TCP port for raw ESC/POS network printing (default: 9100)';
