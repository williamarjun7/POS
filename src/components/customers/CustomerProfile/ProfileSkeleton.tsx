/**
 * ProfileSkeleton — Shimmer skeleton loader for CustomerProfile
 * ────────────────────────────────────────────────────────────
 *
 * Matches the exact layout of the CustomerProfile to prevent
 * layout shift when transitioning from loading to loaded state.
 */

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

/* ─── Shimmer bar ──────────────────────────────────────────── */

function ShimmerBar({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-muted/60",
        className
      )}
    >
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
    </div>
  )
}

/* ─── Shimmer circle ───────────────────────────────────────── */

function ShimmerCircle({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-full bg-muted/60",
        className
      )}
    >
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
    </div>
  )
}

/* ─── Main Skeleton ────────────────────────────────────────── */

export function ProfileSkeleton() {
  return (
    <div className="flex h-full flex-col bg-card rounded-2xl border border-border shadow-xl overflow-hidden">
      {/* ── Header skeleton ── */}
      <div className="relative overflow-hidden p-5 pb-4">
        {/* Top bar: close button + actions */}
        <div className="flex items-center justify-between mb-5">
          <ShimmerBar className="h-8 w-8 rounded-xl" />
          <div className="flex items-center gap-1.5">
            <ShimmerBar className="h-8 w-14 rounded-xl" />
            <ShimmerBar className="h-8 w-20 rounded-xl" />
            <ShimmerBar className="h-8 w-20 rounded-xl" />
          </div>
        </div>

        {/* Avatar + info row */}
        <div className="flex items-center gap-4">
          <ShimmerCircle className="h-16 w-16" />
          <div className="flex-1 space-y-2.5">
            <ShimmerBar className="h-5 w-48" />
            <div className="flex gap-1.5">
              <ShimmerBar className="h-6 w-28 rounded-lg" />
              <ShimmerBar className="h-6 w-36 rounded-lg" />
            </div>
            <div className="flex gap-3">
              <ShimmerBar className="h-4 w-36" />
              <ShimmerBar className="h-4 w-32" />
            </div>
            <div className="flex gap-2">
              <ShimmerBar className="h-5 w-24 rounded-full" />
              <ShimmerBar className="h-5 w-28 rounded-full" />
            </div>
          </div>
        </div>

        {/* 4 KPI cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-border bg-card/50 p-3"
            >
              <ShimmerBar className="h-6 w-6 rounded-lg mb-2" />
              <ShimmerBar className="h-5 w-20 mb-1.5" />
              <ShimmerBar className="h-3 w-14" />
            </div>
          ))}
        </div>
      </div>

      {/* ── Tab bar skeleton ── */}
      <div className="px-4 pb-1 pt-3">
        <div className="flex gap-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <ShimmerBar
              key={i}
              className={cn(
                "h-8 rounded-lg",
                i === 0 ? "w-20" : "w-24"
              )}
            />
          ))}
        </div>
      </div>

      {/* ── Content skeleton ── */}
      <div className="flex-1 overflow-y-auto p-5 pt-4">
        {/* Analystics cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 mb-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-border bg-card/50 p-3.5"
            >
              <ShimmerBar className="h-7 w-7 rounded-lg mb-2.5" />
              <ShimmerBar className="h-5 w-24 mb-1" />
              <ShimmerBar className="h-3 w-16 mb-0.5" />
              <ShimmerBar className="h-3 w-20" />
            </div>
          ))}
        </div>

        {/* Recent visits section */}
        <div className="rounded-xl border border-border bg-card/50 p-5">
          <div className="flex items-center gap-2 mb-4">
            <ShimmerBar className="h-5 w-5 rounded" />
            <ShimmerBar className="h-5 w-32" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-xl p-3"
              >
                <div className="flex items-center gap-3">
                  <ShimmerBar className="h-8 w-8 rounded-lg" />
                  <div className="space-y-1.5">
                    <ShimmerBar className="h-4 w-32" />
                    <ShimmerBar className="h-3 w-44" />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <ShimmerBar className="h-4 w-16" />
                  <ShimmerBar className="h-5 w-14 rounded-md" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
