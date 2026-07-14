/**
 * ActivityLogService
 * ──────────────────
 * DB-backed CRUD for activity logs (audit trail).
 *
 * Table: public.activity_logs
 * RLS: authenticated users can SELECT, INSERT
 */

import { useState, useEffect, useCallback } from 'react';
import { insforge } from '@/lib/services/auth-service';
import type { ActivityLogRow } from '@/lib/db/types';

/* ─── Frontend ActivityLog type (camelCase) ────────────────── */

export interface ActivityLog {
  id: string;
  activityType: string;
  entityId: string;
  entityLabel: string;
  status: string;
  details: string;
  userId: string;
  userName: string;
  amount: number;
  ipAddress: string;
  location: string;
  createdAt: string;
}

/* ─── Mapper helper ────────────────────────────────────────── */

function rowToActivityLog(row: ActivityLogRow): ActivityLog {
  return {
    id: row.id,
    activityType: row.activity_type,
    entityId: row.entity_id ?? '',
    entityLabel: row.entity_label ?? '',
    status: row.status ?? '',
    details: row.details ?? '',
    userId: row.user_id ?? '',
    userName: row.user_name ?? 'System',
    amount: row.amount ? Number(row.amount) : 0,
    ipAddress: row.ip_address ?? '',
    location: row.location ?? '',
    createdAt: row.created_at,
  };
}

/* ─── Log data type for insertion ──────────────────────────── */

export interface NewActivityLogData {
  activityType: string;
  entityId?: string;
  entityLabel?: string;
  status?: string;
  details?: string;
  userId?: string;
  userName?: string;
  amount?: number;
  ipAddress?: string;
  location?: string;
}

/* ─── DB operations ─────────────────────────────────────────── */

async function fetchActivityLogsFromDb(limit = 50): Promise<ActivityLog[]> {
  const { data, error } = await insforge.database
    .from('activity_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map((row: unknown) => rowToActivityLog(row as ActivityLogRow));
}

async function createActivityLogInDb(data: NewActivityLogData): Promise<ActivityLog | null> {
  const { data: inserted, error } = await insforge.database
    .from('activity_logs')
    .insert([
      {
        activity_type: data.activityType,
        entity_id: data.entityId ?? null,
        entity_label: data.entityLabel ?? null,
        status: data.status ?? null,
        details: data.details ?? null,
        user_id: data.userId ?? null,
        user_name: data.userName ?? null,
        amount: data.amount ?? null,
        ip_address: data.ipAddress ?? null,
        location: data.location ?? null,
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return inserted ? rowToActivityLog(inserted as ActivityLogRow) : null;
}

/* ─── React Hook ────────────────────────────────────────────── */

export interface UseActivityLogsReturn {
  /** Activity logs (from DB), most recent first */
  logs: ActivityLog[];
  /** True while loading from DB */
  isLoading: boolean;
  /** Error message if load failed */
  loadError: string | null;
  /** Log a new activity (saves to DB, updates local list) */
  logActivity: (data: NewActivityLogData) => Promise<ActivityLog | null>;
  /** Refetch from DB */
  refresh: () => Promise<void>;
}

export function useActivityLogs(limit = 50): UseActivityLogsReturn {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await fetchActivityLogsFromDb(limit);
      setLogs(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load activity logs';
      setLoadError(msg);
    }
  }, [limit]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setIsLoading(true);
      try {
        const data = await fetchActivityLogsFromDb(limit);
        if (!cancelled) setLogs(data);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load activity logs');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [limit]);

  const logActivity = useCallback(async (data: NewActivityLogData): Promise<ActivityLog | null> => {
    const created = await createActivityLogInDb(data);
    if (created) {
      setLogs(prev => [created, ...prev]);
    }
    return created;
  }, []);

  return { logs, isLoading, loadError, logActivity, refresh };
}

/* ─── Standalone helpers (for one-off logging without hook) ── */

/**
 * Log an activity silently (no error thrown — safe for non-critical paths).
 * Returns the created log entry or null on failure.
 */
export async function logActivitySafe(data: NewActivityLogData): Promise<ActivityLog | null> {
  try {
    return await createActivityLogInDb(data);
  } catch {
    return null;
  }
}
