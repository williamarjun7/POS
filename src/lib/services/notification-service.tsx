/**
 * NotificationService
 * ────────────────────
 * DB-backed CRUD for in-app notifications.
 *
 * Table: public.notifications
 * RLS: authenticated users can SELECT their own, UPDATE read status, DELETE
 */

import { useState, useEffect, useCallback } from 'react'
import { insforge } from '@/lib/services/auth-service'
import type { NotificationRow } from '@/lib/db/types'
import type { Notification, NotificationType } from '@/types'

/* ─── Mapper ──────────────────────────────────────────────── */

function rowToNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    type: row.type as NotificationType,
    title: row.title,
    message: row.message,
    timestamp: new Date(row.created_at),
    read: row.read,
    actionUrl: row.action_url ?? undefined,
  }
}

/* ─── DB operations ───────────────────────────────────────── */

export async function createNotification(data: {
  type: Notification['type']
  title: string
  message: string
  userId?: string
  actionUrl?: string
}): Promise<void> {
  await insforge.database
    .from('notifications')
    .insert([{
      type: data.type,
      title: data.title,
      message: data.message,
      user_id: data.userId ?? null,
      action_url: data.actionUrl ?? null,
    }])
}

async function fetchNotificationsFromDb(): Promise<Notification[]> {
  const { data, error } = await insforge.database
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map((row: unknown) => rowToNotification(row as NotificationRow))
}

async function updateNotificationReadInDb(id: string, read: boolean): Promise<void> {
  const { error } = await insforge.database
    .from('notifications')
    .update({ read })
    .eq('id', id)

  if (error) throw error
}

async function markAllReadInDb(): Promise<void> {
  const { error } = await insforge.database
    .from('notifications')
    .update({ read: true })
    .eq('read', false)

  if (error) throw error
}

async function deleteNotificationFromDb(id: string): Promise<void> {
  const { error } = await insforge.database
    .from('notifications')
    .delete()
    .eq('id', id)

  if (error) throw error
}

async function clearAllNotificationsFromDb(): Promise<void> {
  const { error } = await insforge.database
    .from('notifications')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000') // delete all

  if (error) throw error
}

/* ─── React Hook ──────────────────────────────────────────── */

export interface UseNotificationsReturn {
  notifications: Notification[]
  unreadCount: number
  isLoading: boolean
  loadError: string | null
  markAsRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
  dismiss: (id: string) => Promise<void>
  clearAll: () => Promise<void>
  refresh: () => Promise<void>
}

export function useNotifications(): UseNotificationsReturn {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const unreadCount = notifications.filter((n) => !n.read).length

  const refresh = useCallback(async () => {
    setLoadError(null)
    try {
      const data = await fetchNotificationsFromDb()
      setNotifications(data)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load notifications')
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      setIsLoading(true)
      try {
        const data = await fetchNotificationsFromDb()
        if (!cancelled) setNotifications(data)
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load notifications')
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [])

  const markAsRead = useCallback(async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
    try {
      await updateNotificationReadInDb(id, true)
    } catch {
      // Optimistic update — revert on error
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: false } : n)))
    }
  }, [])

  const markAllRead = useCallback(async () => {
    const prev = notifications
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    try {
      await markAllReadInDb()
    } catch {
      // Revert
      setNotifications(prev)
    }
  }, [notifications])

  const dismiss = useCallback(async (id: string) => {
    const prev = notifications
    setNotifications((prev) => prev.filter((n) => n.id !== id))
    try {
      await deleteNotificationFromDb(id)
    } catch {
      // Revert
      setNotifications(prev)
    }
  }, [notifications])

  const clearAll = useCallback(async () => {
    const prev = notifications
    setNotifications([])
    try {
      await clearAllNotificationsFromDb()
    } catch {
      // Revert
      setNotifications(prev)
    }
  }, [notifications])

  return { notifications, unreadCount, isLoading, loadError, markAsRead, markAllRead, dismiss, clearAll, refresh }
}
