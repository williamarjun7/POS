/**
 * useRecentCustomers
 * ──────────────────
 * Persists recently viewed customer IDs to localStorage
 * and returns a deduplicated, reverse-chronological list.
 *
 * Usage:
 *   const { recentIds, addRecent } = useRecentCustomers()
 *   addRecent(customerId)  // call when a customer is opened
 *   recentIds              // ["id3", "id1", "id5"] most recent first
 */

import { useState, useCallback } from "react"

const STORAGE_KEY = "pos:recent-customers"
const MAX_RECENT = 20

function readIds(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((id): id is string => typeof id === "string")
  } catch {
    return []
  }
}

function writeIds(ids: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids.slice(0, MAX_RECENT)))
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

export function useRecentCustomers() {
  const [recentIds, setRecentIds] = useState<string[]>(readIds)

  const addRecent = useCallback((id: string) => {
    setRecentIds(prev => {
      // Remove duplicate, prepend to front
      const next = [id, ...prev.filter(x => x !== id)]
      const trimmed = next.slice(0, MAX_RECENT)
      writeIds(trimmed)
      return trimmed
    })
  }, [])

  const clearRecent = useCallback(() => {
    setRecentIds([])
    writeIds([])
  }, [])

  return { recentIds, addRecent, clearRecent }
}
