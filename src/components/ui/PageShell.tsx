/**
 * PageShell
 * ─────────
 * Unified page wrapper that provides:
 * - Page enter animation (via Framer Motion)
 * - Consistent max-width and padding
 * - Skeleton loading state
 * - Error boundary wrapper
 *
 * Usage:
 *   <PageShell title="Orders" loading={isLoading}>
 *     <PageHeader title="Orders" icon="ClipboardList" />
 *     <div>content</div>
 *   </PageShell>
 */

import { type ReactNode, Suspense } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { pageTransition } from '@/lib/animations/presets'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { PageSkeleton } from '@/components/ui/PageSkeleton'

// ── Props ───────────────────────────────────────────────────────

interface PageShellProps {
  children: ReactNode
  className?: string
  /** Show skeleton loading instead of content */
  loading?: boolean
  /** Skeleton layout variant */
  skeletonLayout?: 'default' | 'stats' | 'table' | 'form' | 'grid'
  /** Use error boundary */
  errorBoundary?: boolean
  /** Custom error fallback */
  errorFallback?: ReactNode
  /** Custom loading skeleton */
  loadingSkeleton?: ReactNode
  /** Max-width override (defaults to 1600px) */
  maxWidth?: string
}

// ── Component ───────────────────────────────────────────────────

export function PageShell({
  children,
  className,
  loading = false,
  skeletonLayout = 'default',
  errorBoundary = false,
  errorFallback,
  loadingSkeleton,
  maxWidth = 'max-w-[1600px]',
}: PageShellProps) {
  const shouldReduceMotion = useReducedMotion()

  const content = (
    <div className={cn('mx-auto', maxWidth)}>
      {loading ? (
        loadingSkeleton ?? <PageSkeleton layout={skeletonLayout} />
      ) : (
        children
      )}
    </div>
  )

  const motionContent = shouldReduceMotion ? (
    content
  ) : (
    <motion.div
      variants={pageTransition}
      initial="hidden"
      animate="visible"
      className={className}
    >
      {content}
    </motion.div>
  )

  if (errorBoundary) {
    return (
      <ErrorBoundary fallback={errorFallback}>
        {motionContent}
      </ErrorBoundary>
    )
  }

  return motionContent
}

// ── LazyRoute convenience wrapper ───────────────────────────────

interface LazyRouteProps {
  children: ReactNode
}

/**
 * Convenience wrapper for lazy-loaded routes.
 * Provides error boundary + suspense + page transition.
 *
 * Usage (in App.tsx):
 *   <LazyRoute><Orders /></LazyRoute>
 *
 * Replaces:
 *   <ErrorBoundary>
 *     <Suspense fallback={<PageLoader />}>{children}</Suspense>
 *   </ErrorBoundary>
 */
export function LazyRoute({ children }: LazyRouteProps) {
  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          <div className="p-6">
            <PageSkeleton layout="default" />
          </div>
        }
      >
        {children}
      </Suspense>
    </ErrorBoundary>
  )
}

// ═══════════════════════════════════════════════════════════════════
// BACKWARD COMPATIBILITY — alias for existing imports
// ═══════════════════════════════════════════════════════════════════

/**
 * @deprecated Use PageShell instead. This component is preserved for
 * backward compatibility until Phase 2 layout standardization.
 * Import from: `@/components/ui/PageShell`
 */
export { PageShell as PageTransition }
