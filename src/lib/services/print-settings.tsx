/**
 * PrintSettings
 * ──────────────
 * Shared print settings store with DB-first persistence.
 *
 * On mount: loads from InsForge DB; falls back to localStorage if offline.
 * On change: writes to localStorage immediately + debounced upsert to DB.
 *
 * Provides:
 *   - PrintSettingsProvider (wrap at app root, inside AuthProvider)
 *   - usePrintSettings() hook
 *   - getPrintSettings() for non-React code (e.g. print-service)
 *
 * Database table: public.print_settings (singleton — one row shared by all users)
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { insforge } from '@/lib/services/auth-service';
import { useAuth } from '@/lib/core/auth-context';

/* ─── Types ─────────────────────────────────────────────────── */

export type PaperSize = '58mm' | '80mm' | 'A4';

export interface PrintSettings {
  /** Business phone displayed on invoices */
  phone: string;
  /** PAN / VAT number displayed on invoices */
  pan: string;
  /** Paper size for thermal / A4 printing */
  paperSize: PaperSize;
  /** Whether to show the business logo on invoices */
  showLogo: boolean;
  /** Whether to auto-print receipts after payment */
  autoPrint: boolean;
  /** Number of print copies */
  printCopies: number;
  /** Google Review URL for the review QR code on receipts */
  googleReviewUrl: string;
  /** Whether to show the Google Review QR code on receipts */
  enableGoogleReviewQr: boolean;
  /** Whether to auto-print KOT (Kitchen Order Ticket) when order is placed */
  kotEnabled: boolean;
  /** Number of KOT copies to print */
  kotPrintCopies: number;
  /** Instagram URL for the Instagram QR code on receipts */
  instagramUrl: string;
  /** Whether to show the Instagram QR code on receipts */
  enableInstagramQr: boolean;
  /** TikTok URL for the TikTok QR code on receipts */
  tiktokUrl: string;
  /** Whether to show the TikTok QR code on receipts */
  enableTiktokQr: boolean;
  /** Whether to print customer name on Kitchen Order Tickets */
  showCustomerOnKot: boolean;
  /** Whether to print waiter/staff name on Kitchen Order Tickets */
  showStaffOnKot: boolean;
  /** Static IP address of the dedicated network kitchen printer */
  kitchenPrinterIp: string;
  /** TCP port for the kitchen printer (default: 9100 for ESC/POS) */
  kitchenPrinterPort: number;
}

/** Raw DB row shape (snake_case) for the print_settings table */
interface PrintSettingsRow {
  id: string;
  phone: string;
  pan: string;
  paper_size: string;
  show_logo: boolean;
  auto_print: boolean;
  print_copies: number;
  google_review_url: string;
  enable_google_review_qr: boolean;
  kot_enabled: boolean;
  kot_print_copies: number;
  enable_instagram_qr: boolean;
  instagram_url: string;
  enable_tiktok_qr: boolean;
  tiktok_url: string;
  kot_show_customer: boolean;
  kot_show_staff: boolean;
  kitchen_printer_ip: string;
  kitchen_printer_port: number;
  created_at: string;
  updated_at: string;
}

/* ─── Defaults ──────────────────────────────────────────────── */

const STORAGE_KEY = 'highlands-print-settings';

const DEFAULT_SETTINGS: PrintSettings = {
  phone: 'xxxxxxxxxx',
  pan: 'xxxxxxxxx',
  paperSize: '80mm',
  showLogo: true,
  autoPrint: false,
  printCopies: 1,
  googleReviewUrl: 'https://g.page/r/CYSJDIQPF_uwEAE/review',
  enableGoogleReviewQr: true,
  kotEnabled: false,
  kotPrintCopies: 1,
  instagramUrl: 'https://www.instagram.com/highlandscafemotel?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw==',
  enableInstagramQr: false,
  tiktokUrl: 'https://www.tiktok.com/@highlandscafe1?is_from_webapp=1&sender_device=pc',
  enableTiktokQr: false,
  showCustomerOnKot: false,
  showStaffOnKot: false,
  kitchenPrinterIp: '',
  kitchenPrinterPort: 0,
};

/* ─── Mapper helpers ────────────────────────────────────────── */

function rowToSettings(row: PrintSettingsRow): PrintSettings {
  return {
    phone: row.phone,
    pan: row.pan,
    paperSize: row.paper_size as PaperSize,
    showLogo: row.show_logo,
    autoPrint: row.auto_print,
    printCopies: row.print_copies,
    googleReviewUrl: row.google_review_url ?? DEFAULT_SETTINGS.googleReviewUrl,
    enableGoogleReviewQr: row.enable_google_review_qr ?? DEFAULT_SETTINGS.enableGoogleReviewQr,
    kotEnabled: row.kot_enabled ?? DEFAULT_SETTINGS.kotEnabled,
    kotPrintCopies: row.kot_print_copies ?? DEFAULT_SETTINGS.kotPrintCopies,
    instagramUrl: row.instagram_url ?? DEFAULT_SETTINGS.instagramUrl,
    enableInstagramQr: row.enable_instagram_qr ?? DEFAULT_SETTINGS.enableInstagramQr,
    tiktokUrl: row.tiktok_url ?? DEFAULT_SETTINGS.tiktokUrl,
    enableTiktokQr: row.enable_tiktok_qr ?? DEFAULT_SETTINGS.enableTiktokQr,
    showCustomerOnKot: row.kot_show_customer ?? DEFAULT_SETTINGS.showCustomerOnKot,
    showStaffOnKot: row.kot_show_staff ?? DEFAULT_SETTINGS.showStaffOnKot,
    kitchenPrinterIp: row.kitchen_printer_ip ?? DEFAULT_SETTINGS.kitchenPrinterIp,
    kitchenPrinterPort: row.kitchen_printer_port ?? DEFAULT_SETTINGS.kitchenPrinterPort,
  };
}

function settingsToRow(
  settings: PrintSettings,
  existingId?: string,
): Record<string, unknown> {
  return {
    ...(existingId ? { id: existingId } : {}),
    phone: settings.phone,
    pan: settings.pan,
    paper_size: settings.paperSize,
    show_logo: settings.showLogo,
    auto_print: settings.autoPrint,
    print_copies: settings.printCopies,
    google_review_url: settings.googleReviewUrl,
    enable_google_review_qr: settings.enableGoogleReviewQr,
    kot_enabled: settings.kotEnabled,
    kot_print_copies: settings.kotPrintCopies,
    enable_instagram_qr: settings.enableInstagramQr,
    instagram_url: settings.instagramUrl,
    enable_tiktok_qr: settings.enableTiktokQr,
    tiktok_url: settings.tiktokUrl,
    kot_show_customer: settings.showCustomerOnKot,
    kot_show_staff: settings.showStaffOnKot,
    kitchen_printer_ip: settings.kitchenPrinterIp,
    kitchen_printer_port: settings.kitchenPrinterPort,
  };
}

/* ─── LocalStorage load / save ──────────────────────────────── */

function loadFromStorage(): PrintSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return { ...DEFAULT_SETTINGS, ...parsed };
      }
    }
  } catch (e) {
    console.warn('[PrintSettings] Corrupt localStorage data, using defaults:', e);
  }
  return { ...DEFAULT_SETTINGS };
}

function saveToStorage(settings: PrintSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('[PrintSettings] Failed to save to localStorage:', e);
  }
}

/* ─── DB load / save ────────────────────────────────────────── */

/**
 * Fetch the singleton print_settings row from the DB.
 * Returns null if no row exists yet.
 */
async function loadFromDb(): Promise<PrintSettings | null> {
  try {
    const { data, error } = await insforge.database
      .from('print_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (error) {
      // Always warn on DB load failures so the user can diagnose sync issues
      if (error.code === '42501') {
        console.warn('[PrintSettings] DB load: permission denied — user role lacks SELECT on print_settings table');
      } else if (error.code === '401') {
        console.warn('[PrintSettings] DB load: not authenticated — session may have expired');
      } else if (error.code === '404' || error.message?.includes('relation') || error.message?.includes('does not exist')) {
        console.warn('[PrintSettings] DB load: print_settings table does not exist — run migrations');
      } else {
        console.warn('[PrintSettings] DB load failed:', error.code, error.message);
      }
      return null;
    }
    if (!data) {
      return null;
    }

    console.log('[PrintSettings] ✓ Loaded from DB');
    return rowToSettings(data as PrintSettingsRow);
  } catch (err) {
    console.warn('[PrintSettings] DB load error:', err);
    return null;
  }
}

/** The singleton row ID — cached after first fetch so subsequent upserts are fast. */
let _dbRowId: string | undefined;

/**
 * Upsert the singleton print_settings row.
 * Throws on failure so callers (syncNow) can surface the error to the UI.
 * Optimistically updates localStorage even if the DB write fails.
 */
async function saveToDb(settings: PrintSettings): Promise<void> {
  if (_dbRowId) {
    // Row exists → update by ID
    const { error } = await insforge.database
      .from('print_settings')
      .update(settingsToRow(settings, _dbRowId))
      .eq('id', _dbRowId);

    if (error) {
      // Row may have been deleted; clear cache so next write re-discovers
      _dbRowId = undefined;
      throw error;
    }
  } else {
    // No row yet → try to find one (race condition guard), then insert
    const { data: existing, error: findError } = await insforge.database
      .from('print_settings')
      .select('id')
      .limit(1)
      .maybeSingle();

    if (findError) throw findError;

    if (existing) {
      _dbRowId = existing.id as string;
      const { error } = await insforge.database
        .from('print_settings')
        .update(settingsToRow(settings, _dbRowId))
        .eq('id', _dbRowId);

      if (error) throw error;
    } else {
      // Insert the singleton row.
      // Let errors propagate so callers (syncNow) can signal success/failure.
      // Auto-sync debounce handles the error via .catch().
      const { data: inserted, error } = await insforge.database
        .from('print_settings')
        .insert([settingsToRow(settings)])
        .select()
        .single();

      if (error) throw error;
      _dbRowId = (inserted as PrintSettingsRow).id;
    }
  }
}

/* ─── Non-React accessor (for print-service.ts) ─────────────── */

let _cachedSettings: PrintSettings = loadFromStorage();

/** Synchronous snapshot for non-React code. Always up-to-date. */
// eslint-disable-next-line react/only-export-components
export function getPrintSettings(): PrintSettings {
  return _cachedSettings;
}

/* ─── React Context ─────────────────────────────────────────── */

interface PrintSettingsContextValue {
  settings: PrintSettings;
  update: (partial: Partial<PrintSettings>) => void;
  reset: () => void;
  /** Force an immediate DB sync (used by the Save button). Returns a promise. */
  syncNow: () => Promise<void>;
  /** True while a manual sync is in progress */
  isSaving: boolean;
  /** ISO timestamp of the last successful DB sync */
  lastSyncedAt: string | null;
}

const PrintSettingsContext = createContext<PrintSettingsContextValue | undefined>(undefined);

/* ─── Provider ──────────────────────────────────────────────── */

export function PrintSettingsProvider({ children }: { children: React.ReactNode }) {
  const { isReady: authReady, user } = useAuth();
  const [settings, setSettings] = useState<PrintSettings>(loadFromStorage);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const dbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLoadDone = useRef(false);

  // ── On mount: fetch from DB once auth is ready AND user is authenticated ──
  useEffect(() => {
    if (!authReady || !user) return;
    let cancelled = false;

    (async () => {
      const dbSettings = await loadFromDb();
      if (cancelled) return;

      if (dbSettings) {
        // Merge: DB is the primary source, but keep any localStorage values
        // that contain real user data not yet synced to DB. This handles the
        // case where the auto-sync hasn't pushed local changes yet.
        const local = loadFromStorage();
        const merged = { ...dbSettings };
        // Only override from localStorage if the local value is a non-empty,
        // non-default string — prevents empty/default data from overwriting
        // the correct DB values.
        if (local.phone && local.phone !== DEFAULT_SETTINGS.phone) merged.phone = local.phone;
        if (local.pan && local.pan !== DEFAULT_SETTINGS.pan) merged.pan = local.pan;

        console.log('[PrintSettings] ✓ DB loaded');
        setSettings(merged);
        saveToStorage(merged);
        _cachedSettings = merged;
        setLastSyncedAt(new Date().toISOString());
      }

      // Mark initial load complete so the auto-save effect can safely write
      initialLoadDone.current = true;
    })();

    return () => { cancelled = true; };
  }, [authReady, user]);

  // ── On every change: sync to localStorage immediately + debounced DB ──
  useEffect(() => {
    saveToStorage(settings);
    _cachedSettings = settings;

    // Don't try DB writes before auth is ready AND initial DB load is done
    // (avoids 401 race where the debounce fires before the session token is attached)
    if (!authReady || !user || !initialLoadDone.current) return;

    // Debounce DB write (300ms) — background failures are non-fatal since
    // localStorage is the live fallback. Always log errors so the user can
    // diagnose sync issues via DevTools.
    if (dbTimerRef.current) clearTimeout(dbTimerRef.current);
    dbTimerRef.current = setTimeout(() => {
      saveToDb(settings)
        .then(() => setLastSyncedAt(new Date().toISOString()))
        .catch((err: { code?: string; message?: string }) => {
          if (err?.code === '42501') {
            console.warn('[PrintSettings] Auto-sync: permission denied — check user role (admin/manager required to write)');
          } else if (err?.code === '401') {
            console.warn('[PrintSettings] Auto-sync: session expired — re-login required');
          } else if (err?.message?.includes('relation') || err?.message?.includes('does not exist')) {
            console.warn('[PrintSettings] Auto-sync: print_settings table missing — run latest migration');
          } else {
            console.warn('[PrintSettings] Auto-sync failed:', err?.message || 'unknown error');
          }
        });
    }, 300);

    return () => {
      if (dbTimerRef.current) clearTimeout(dbTimerRef.current);
    };
  }, [settings, authReady]);

  const update = useCallback((partial: Partial<PrintSettings>) => {
    setSettings(prev => ({ ...prev, ...partial }));
  }, []);

  const reset = useCallback(() => {
    setSettings({ ...DEFAULT_SETTINGS });
    _dbRowId = undefined; // Force re-insert on next DB write
  }, []);

  const syncNow = useCallback(async () => {
    // Cancel any pending debounced auto-save to avoid double writes
    if (dbTimerRef.current) clearTimeout(dbTimerRef.current);

    setIsSaving(true);
    try {
      await saveToDb(settings);
      setLastSyncedAt(new Date().toISOString());
    } finally {
      setIsSaving(false);
    }
  }, [settings]);

  return (
    <PrintSettingsContext.Provider value={{ settings, update, reset, syncNow, isSaving, lastSyncedAt }}>
      {children}
    </PrintSettingsContext.Provider>
  );
}

/* ─── Hook ──────────────────────────────────────────────────── */

// eslint-disable-next-line react/only-export-components
export function usePrintSettings(): PrintSettingsContextValue {
  const ctx = useContext(PrintSettingsContext);
  if (!ctx) {
    throw new Error('usePrintSettings must be used within a PrintSettingsProvider');
  }
  return ctx;
}
