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
  };
}

/* ─── LocalStorage load / save ──────────────────────────────── */

function loadFromStorage(): PrintSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch { /* ignore corrupt data */ }
  return { ...DEFAULT_SETTINGS };
}

function saveToStorage(settings: PrintSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch { /* storage full or unavailable — silently ignore */ }
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
      // Permission denied (42501) or table doesn't exist — use local defaults
      // instead of flooding the console. The migration may not be applied yet
      // or the user might not have the required role.
      if (error.code !== '42501') {
        console.warn('[PrintSettings] DB load failed:', error.message);
      } else if (import.meta.env.DEV) {
        console.info('[PrintSettings] Using local defaults (DB load not available)');
      }
      return null;
    }
    if (!data) return null;

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
  const [settings, setSettings] = useState<PrintSettings>(loadFromStorage);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const dbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── On mount: fetch from DB, merge with local state ──────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const dbSettings = await loadFromDb();
      if (cancelled) return;

      if (dbSettings) {
        // DB is source of truth — merge into state
        setSettings(dbSettings);
        saveToStorage(dbSettings);
        _cachedSettings = dbSettings;
        setLastSyncedAt(new Date().toISOString());
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // ── On every change: sync to localStorage immediately + debounced DB ──
  useEffect(() => {
    saveToStorage(settings);
    _cachedSettings = settings;

    // Debounce DB write (300ms) — background failures are non-fatal since
    // localStorage is the live fallback. Log non-permission errors in DEV.
    if (dbTimerRef.current) clearTimeout(dbTimerRef.current);
    dbTimerRef.current = setTimeout(() => {
      saveToDb(settings)
        .then(() => setLastSyncedAt(new Date().toISOString()))
        .catch((err: { code?: string; message?: string }) => {
          if (import.meta.env.DEV && err?.code !== '42501') {
            console.info('[PrintSettings] Auto-sync skipped:', err?.message || 'unknown');
          }
        });
    }, 300);

    return () => {
      if (dbTimerRef.current) clearTimeout(dbTimerRef.current);
    };
  }, [settings]);

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

export function usePrintSettings(): PrintSettingsContextValue {
  const ctx = useContext(PrintSettingsContext);
  if (!ctx) {
    throw new Error('usePrintSettings must be used within a PrintSettingsProvider');
  }
  return ctx;
}
