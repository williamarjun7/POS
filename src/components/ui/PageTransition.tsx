import { type ReactNode } from "react"

interface PageTransitionProps {
  children: ReactNode
  className?: string
}

/**
 * Page-level wrapper.
 * Route transitions are handled centrally by RouteTransition in DashboardLayout.
 * This component is kept as a pass-through so existing pages don't need changes.
 */
export function PageTransition({ children, className }: PageTransitionProps) {
  return <div className={className}>{children}</div>
}
