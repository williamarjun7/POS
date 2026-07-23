/**
 * BusinessSettings
 * ─────────────────
 * Shared business settings store with DB persistence.
 *
 * The business_settings table is a singleton (one row shared by all users).
 * Provides a React hook for loading/saving from Admin.tsx.
 */

import { useState, useEffect, useCallback } from 'react';
import { insforge } from '@/lib/services/auth-service';
import type { BusinessSettingsRow } from '@/lib/db/types';

/* ─── Types ─────────────────────────────────────────────────── */

export interface BusinessSettings {
  name: string;
  address: string;
  phone: string;
  email: string;
}

/* ─── Defaults ──────────────────────────────────────────────── */

const DEFAULT_SETTINGS: BusinessSettings = {
  name: 'My Business',
  address: '',
  phone: '',
  email: '',
};

/* ─── Mapper helpers ────────────────────────────────────────── */

function rowToSettings(row: BusinessSettingsRow): BusinessSettings {
  return {
    name: row.business_name,
    address: row.address,
    phone: row.phone,
    email: row.email,
  };
}

function settingsToDb(
  s: BusinessSettings,
  existingId?: string,
): Record<string, unknown> {
  return {
    ...(existingId ? { id: existingId } : {}),
    business_name: s.name,
    address: s.address,
    phone: s.phone,
    email: s.email,
  };
}

/* ─── DB operations ─────────────────────────────────────────── */

let _rowId: string | undefined;

async function loadFromDb(): Promise<BusinessSettings | null> {
  try {
    const { data, error } = await insforge.database
      .from('business_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('[BusinessSettings] DB load failed:', error.message);
      return null;
    }
    if (!data) return null;

    const row = data as BusinessSettingsRow;
    _rowId = row.id;
    return rowToSettings(row);
  } catch (err) {
    console.warn('[BusinessSettings] DB load error:', err);
    return null;
  }
}

async function saveToDb(s: BusinessSettings): Promise<void> {
  if (_rowId) {
    const { error } = await insforge.database
      .from('business_settings')
      .update(settingsToDb(s, _rowId))
      .eq('id', _rowId);

    if (error) {
      _rowId = undefined;
      throw error;
    }
  } else {
    const { data: existing } = await insforge.database
      .from('business_settings')
      .select('id')
      .limit(1)
      .maybeSingle();

    if (existing) {
      _rowId = existing.id as string;
      const { error } = await insforge.database
        .from('business_settings')
        .update(settingsToDb(s, _rowId))
        .eq('id', _rowId);
      if (error) throw error;
    } else {
      const { data: inserted, error } = await insforge.database
        .from('business_settings')
        .insert([settingsToDb(s)])
        .select()
        .single();
      if (error) throw error;
      _rowId = (inserted as BusinessSettingsRow).id;
    }
  }
}

/* ─── React Hook ────────────────────────────────────────────── */

export interface UseBusinessSettingsReturn {
  /** Current settings (starts as defaults, loaded from DB on mount) */
  settings: BusinessSettings;
  /** Update a partial set of fields (optimistic — does not save to DB) */
  update: (partial: Partial<BusinessSettings>) => void;
  /** Save all settings to the DB */
  save: () => Promise<void>;
  /** True while saving to DB */
  isSaving: boolean;
  /** True while loading from DB on mount */
  isLoading: boolean;
  /** Reset to defaults */
  reset: () => void;
}

export function useBusinessSettings(): UseBusinessSettingsReturn {
  const [settings, setSettings] = useState<BusinessSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const dbSettings = await loadFromDb();
      if (cancelled) return;
      if (dbSettings) setSettings(dbSettings);
      setIsLoading(false);
    })();

    return () => { cancelled = true; };
  }, []);

  const update = useCallback((partial: Partial<BusinessSettings>) => {
    setSettings(prev => ({ ...prev, ...partial }));
  }, []);

  const save = useCallback(async (overrideSettings?: BusinessSettings) => {
    setIsSaving(true);
    try {
      // If an override is provided (e.g. business info form edited locally),
      // use it instead of the potentially stale closure-captured settings.
      await saveToDb(overrideSettings ?? settings);
    } finally {
      setIsSaving(false);
    }
  }, [settings]);

  const reset = useCallback(() => {
    setSettings({ ...DEFAULT_SETTINGS });
    _rowId = undefined;
  }, []);

  return { settings, update, save, isSaving, isLoading, reset };
}
