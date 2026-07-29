/**
 * SplitPane — Draggable split-pane layout
 * ────────────────────────────────────────
 *
 * A horizontal split-pane with a draggable divider, localStorage
 * persistence, and independent scroll areas.
 *
 * Desktop: side-by-side panes with draggable divider
 * Mobile: stacked vertically (no divider)
 */

import { useState, useRef, useCallback, useEffect, type ReactNode } from "react"
import { cn } from "@/lib/utils"

interface SplitPaneProps {
  /** Left panel content */
  left: ReactNode
  /** Right panel content (takes remaining space) */
  right: ReactNode
  /** localStorage key for persisting divider position */
  storageKey?: string
  /** Default left panel width as percentage or px (default: 35) */
  defaultLeftPercent?: number
  /** Minimum left panel width in px (default: 320) */
  minLeftWidth?: number
  /** Minimum right panel width in px (default: 500) */
  minRightWidth?: number
  /** Show on mobile as stacked? (default: true) */
  stackOnMobile?: boolean
  className?: string
}

export function SplitPane({
  left,
  right,
  storageKey = "split-pane-position",
  defaultLeftPercent = 35,
  minLeftWidth = 320,
  minRightWidth = 500,
  stackOnMobile = true,
  className,
}: SplitPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1024)
  const [leftPercent, setLeftPercent] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const parsed = Number.parseFloat(saved)
        if (!Number.isNaN(parsed) && parsed >= 10 && parsed <= 90) return parsed
      }
    } catch { /* ignore */ }
    return defaultLeftPercent
  })

  // Persist to localStorage
  const persistLeftPercent = useCallback((pct: number) => {
    setLeftPercent(pct)
    try {
      localStorage.setItem(storageKey, String(pct))
    } catch { /* ignore */ }
  }, [storageKey])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const containerWidth = rect.width
    if (containerWidth <= 0) return

    let newLeftPx = e.clientX - rect.left
    // Clamp to min/max
    const maxLeftPx = containerWidth - minRightWidth
    newLeftPx = Math.max(minLeftWidth, Math.min(newLeftPx, maxLeftPx))
    const newLeftPercent = (newLeftPx / containerWidth) * 100
    persistLeftPercent(Math.round(newLeftPercent * 10) / 10)
  }, [isDragging, minLeftWidth, minRightWidth, persistLeftPercent])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  // Track viewport width for responsive layout
  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= 1024)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!isDragging) return
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex w-full",
        stackOnMobile ? "flex-col lg:flex-row" : "flex-row",
        isDragging && "cursor-col-resize",
        className,
      )}
    >
      {/* Left panel */}
      <div
        className={cn(
          "overflow-hidden shrink-0",
          stackOnMobile ? "w-full lg:overflow-y-auto no-scrollbar" : "overflow-y-auto no-scrollbar",
        )}
        style={{ width: stackOnMobile ? (isDesktop ? `${leftPercent}%` : '100%') : `${leftPercent}%`, minWidth: stackOnMobile ? undefined : minLeftWidth, flexShrink: 0 }}
      >
        {left}
      </div>

      {/* Divider — only show on desktop */}
      <div
        className={cn(
          "relative flex-shrink-0 z-10",
          "hidden lg:block",
        )}
        style={{ width: 0 }}
      >
        <div
          onMouseDown={handleMouseDown}
          className={cn(
            "absolute inset-y-0 left-1/2 -translate-x-1/2 w-3 cursor-col-resize",
            "flex items-center justify-center",
            isDragging && "bg-primary/10 rounded-full",
          )}
        >
          <div
            className={cn(
              "h-10 w-0.5 rounded-full transition-colors duration-150",
              isDragging ? "bg-primary" : "bg-border hover:bg-muted-foreground/30",
            )}
          />
        </div>
      </div>

      {/* Right panel — takes remaining space */}
      <div
        className={cn(
          "flex-1 min-w-0 overflow-hidden",
          stackOnMobile ? "lg:overflow-y-auto no-scrollbar" : "overflow-y-auto no-scrollbar",
        )}
        style={{ minWidth: stackOnMobile ? (isDesktop ? minRightWidth : undefined) : minRightWidth }}
      >
        {right}
      </div>
    </div>
  )
}
