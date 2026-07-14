/**
 * Feature Flags Service
 * ─────────────────────
 * Reads feature flags from the `feature_flags` database table.
 * Flags are cached in React Query and auto-refreshed on interval.
 *
 * Database table: public.feature_flags
 * Columns: id, name, description, enabled, created_at, updated_at
 *
 * Usage:
 *   const { flags, isEnabled } = useFeatureFlags()
 *   const canUseMultiBranch = isEnabled('multi_branch')
 *   const canUseRoomService = flags.find(f => f.name === 'room_service')?.enabled
 */

import { useQuery } from '@tanstack/react-query'
import { insforge } from '@/lib/services/auth-service'
import type { FeatureFlagRow } from '@/lib/db/types'

/* ─── Query Key ────────────────────────────────────────────── */

export const featureFlagKeys = {
  all: ['feature_flags'] as const,
}

/* ─── Hook ─────────────────────────────────────────────────── */

export function useFeatureFlags() {
  const { data: flags = [], isLoading, error } = useQuery({
    queryKey: featureFlagKeys.all,
    queryFn: async (): Promise<FeatureFlagRow[]> => {
      const { data, error } = await insforge.database
        .from('feature_flags')
        .select('*')
        .order('name', { ascending: true })

      if (error) throw error
      return (data ?? []) as FeatureFlagRow[]
    },
    staleTime: 120_000,       // 2 min — flags change infrequently
    refetchInterval: 300_000,  // 5 min — background refresh
  })

  /**
   * Check if a specific feature flag is enabled by name.
   * Returns `false` if the flag doesn't exist in the DB.
   */
  const isEnabled = (flagName: string): boolean => {
    const flag = flags.find(f => f.name === flagName)
    return flag?.enabled ?? false
  }

  return {
    /** All feature flags from the database */
    flags,
    /** Check if a specific named flag is enabled */
    isEnabled,
    /** True while loading from DB */
    isLoading,
    /** Error message if the fetch failed */
    error: error ? (error instanceof Error ? error.message : 'Failed to load feature flags') : null,
  }
}

/* ─── Invalidation Helper ──────────────────────────────────── */

import { useQueryClient } from '@tanstack/react-query'

/**
 * Call after toggling a flag in the Admin panel to
 * immediately refresh the cached flags across the app.
 */
export function useInvalidateFeatureFlags() {
  const queryClient = useQueryClient()

  return () => {
    queryClient.invalidateQueries({ queryKey: featureFlagKeys.all })
  }
}
