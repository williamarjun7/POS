/**
 * useFavorites
 * ────────────
 * Automatically ranks customers by visit frequency, total spend,
 * and recency to surface "favorite" customers without manual pinning.
 *
 * Usage:
 *   const { favoriteIds } = useFavorites(customers, customerStats)
 *   favoriteIds  // ["id3", "id1", "id5"] ranked by score
 */

import { useMemo } from "react"
import type { Customer } from "@/lib/services/customer-service"
import type { CustomerStats } from "@/lib/services/customer-aggregation"

interface FavoritesConfig {
  /** Number of favorites to return (default 5) */
  limit?: number
}

export function useFavorites(
  customers: Customer[],
  statsMap: Map<string, CustomerStats>,
  config: FavoritesConfig = {},
): { favoriteIds: string[] } {
  const { limit = 5 } = config

  return useMemo(() => {
    const scored = customers
      .map(c => {
        const stats = statsMap.get(c.id)
        const visits = stats?.totalOrders ?? 0
        const spent = stats?.totalSpent ?? 0
        const lastVisit = c.lastVisit ? new Date(c.lastVisit).getTime() : 0
        const now = Date.now()
        const daysSinceLastVisit = lastVisit > 0 ? (now - lastVisit) / (1000 * 60 * 60 * 24) : 999

        // Scoring formula: weight visits + spend, bonus for recency
        const recencyScore = Math.max(0, 30 - daysSinceLastVisit) / 30 // 0–1, higher for recent
        const score = (visits * 10) + (spent / 100) + (recencyScore * 50)

        return { id: c.id, score }
      })
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.id)

    return { favoriteIds: scored }
  }, [customers, statsMap, limit])
}
