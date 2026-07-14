/**
 * Skeleton — Loading placeholder
 * Re-exports from boneyard-js with sensible defaults for className-only usage.
 */

import { type SkeletonProps as BoneyardSkeletonProps } from 'boneyard-js/react'

export interface SkeletonProps extends Partial<BoneyardSkeletonProps> {
  name?: string
  loading?: boolean
}

export function Skeleton({ loading, children, className, name, ...rest }: SkeletonProps) {
  if (name && loading !== undefined) {
    // Usage as a wrapper: <Skeleton name="dashboard" loading={isLoading}>...</Skeleton>
    // If loading, render the skeleton wrapper instead of children
    if (loading) {
      return (
        <div className="space-y-4 animate-pulse">
          <div className="h-8 w-64 rounded-md bg-muted" />
          <div className="h-4 w-96 rounded-md bg-muted" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-32 rounded-xl bg-muted" />
            ))}
          </div>
          <div className="h-64 w-full rounded-xl bg-muted mt-6" />
        </div>
      )
    }
    return <>{children}</>
  }

  // Simple className-only skeleton placeholder
  return <div className={`animate-pulse bg-muted ${className ?? ''}`} {...rest} />
}

export type { BoneyardSkeletonProps as SkeletonPropsType }
