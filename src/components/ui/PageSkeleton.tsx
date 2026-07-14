import { cn } from "@/lib/utils"

interface PageSkeletonProps {
  layout?: "default" | "stats" | "table" | "form" | "grid"
}

function Pulse({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-muted", className)} />
}

function SkeletonRow({ cols = 4 }: { cols?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {Array.from({ length: cols }).map((_, i) => (
        <Pulse key={i} className="h-24 rounded-xl" />
      ))}
    </div>
  )
}

function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      <Pulse className="h-10 w-full rounded-lg" />
      {Array.from({ length: rows }).map((_, i) => (
        <Pulse key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  )
}

function SkeletonForm() {
  return (
    <div className="space-y-4">
      <Pulse className="h-10 w-full rounded-xl" />
      <div className="grid grid-cols-2 gap-4">
        <Pulse className="h-10 rounded-xl" />
        <Pulse className="h-10 rounded-xl" />
      </div>
      <Pulse className="h-10 w-full rounded-xl" />
      <div className="flex justify-end gap-3 pt-4">
        <Pulse className="h-10 w-24 rounded-xl" />
        <Pulse className="h-10 w-32 rounded-xl" />
      </div>
    </div>
  )
}

function SkeletonGrid({ items = 6 }: { items?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: items }).map((_, i) => (
        <Pulse key={i} className="h-40 rounded-xl" />
      ))}
    </div>
  )
}

export function PageSkeleton({ layout = "default" }: PageSkeletonProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Pulse className="h-10 w-10 rounded-xl" />
        <div className="space-y-2">
          <Pulse className="h-6 w-48" />
          <Pulse className="h-4 w-72" />
        </div>
      </div>
      {/* Layout-specific content */}
      {layout === "stats" && (
        <>
          <SkeletonRow cols={4} />
          <Pulse className="h-10 w-full rounded-xl" />
          <SkeletonTable rows={6} />
        </>
      )}
      {layout === "table" && (
        <>
          <Pulse className="h-10 w-full rounded-xl" />
          <SkeletonTable rows={8} />
        </>
      )}
      {layout === "form" && (
        <div className="rounded-xl border border-border bg-card p-6">
          <SkeletonForm />
        </div>
      )}
      {layout === "grid" && (
        <>
          <SkeletonRow cols={4} />
          <SkeletonGrid items={6} />
        </>
      )}
      {layout === "default" && (
        <>
          <SkeletonRow cols={4} />
          <Pulse className="h-10 w-full rounded-xl" />
          <SkeletonTable rows={5} />
        </>
      )}
    </div>
  )
}
