import { useState, useEffect, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"

// ── SmartDropdown ────────────────────────────────────────────
// A portal-based dropdown that:
//   • Detects viewport space and opens upward if insufficient room below
//   • Clamps to viewport edges so it's never clipped
//   • Has a max-height with internal scrolling when content overflows
//   • Supports keyboard navigation (Escape, Arrow Up/Down)
//   • Closes on click outside
//   • Re-positions on window resize / scroll

// ── Parse a Tailwind width class like "w-52" to pixel value (52 → 208) ──
function parseTailwindWidth(widthClass: string): number {
  // Supports "w-<number>" patterns (e.g. w-52, w-56, w-48, w-64, w-72)
  const match = widthClass.match(/\bw-(\d+)\b/)
  if (!match) return 208 // fallback
  // Tailwind uses 4px per unit
  return parseInt(match[1], 10) * 4
}

interface SmartDropdownProps {
  open: boolean
  onClose: () => void
  triggerRef: React.RefObject<HTMLElement | null>
  children: React.ReactNode
  className?: string
  /** Tailwind width class e.g. "w-52" */
  width?: string
  /** Horizontal alignment relative to trigger */
  align?: "start" | "end"
  /** Maximum height – default clamps to half the viewport */
  maxHeight?: string
  /** Horizontal offset in px from the trigger edge (default 0) */
  offsetX?: number
  /** Vertical offset in px from the trigger edge (default 4) */
  offsetY?: number
}

export function SmartDropdown({
  open,
  onClose,
  triggerRef,
  children,
  className = "",
  width = "w-52",
  align = "end",
  maxHeight = "min(50vh, 400px)",
  offsetX = 0,
  offsetY = 4,
}: SmartDropdownProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const shouldReduceMotion = useReducedMotion()

  // Position state
  const [pos, setPos] = useState({ top: 0, left: 0, openUpward: false })

  // ── Position calculation ───────────────────────────────────
  const updatePosition = useCallback(() => {
    if (!open || !triggerRef.current) return

    const triggerRect = triggerRef.current.getBoundingClientRect()
    const menuWidth = parseTailwindWidth(width)
    const estimatedMenuHeight = 380 // estimate before render

    const vw = window.innerWidth
    const vh = window.innerHeight
    const safeGutter = 8

    // ── Vertical ─────────────────────────────────────────────
    const spaceBelow = vh - triggerRect.bottom - offsetY
    const spaceAbove = triggerRect.top - offsetY

    let top: number
    let openUpward = false

    if (spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow) {
      // Open upward
      openUpward = true
      top = Math.max(safeGutter, triggerRect.top - offsetY - estimatedMenuHeight)
      // Clamp so bottom isn't cut off when opening upward
      if (top + estimatedMenuHeight > vh - safeGutter) {
        top = vh - safeGutter - estimatedMenuHeight
      }
    } else {
      // Open downward (default)
      top = triggerRect.bottom + offsetY
    }

    // Final vertical clamp
    top = Math.max(safeGutter, Math.min(top, vh - safeGutter))

    // ── Horizontal ───────────────────────────────────────────
    let left: number
    if (align === "end") {
      left = triggerRect.right - menuWidth + offsetX
    } else {
      left = triggerRect.left + offsetX
    }

    // Clamp to viewport
    left = Math.max(safeGutter, Math.min(left, vw - menuWidth - safeGutter))

    setPos({ top, left, openUpward })
  }, [open, triggerRef, align, offsetX, offsetY, width])

  // Update position when menu opens or window changes
  useEffect(() => {
    updatePosition()
  }, [open, updatePosition])

  useEffect(() => {
    if (!open) return
    const handle = () => updatePosition()
    window.addEventListener("resize", handle)
    window.addEventListener("scroll", handle, { passive: true })
    return () => {
      window.removeEventListener("resize", handle)
      window.removeEventListener("scroll", handle)
    }
  }, [open, updatePosition])

  // ── Click outside ──────────────────────────────────────────
  // We use a document-level mousedown listener instead of relying
  // on the backdrop because the backdrop could intercept clicks on
  // the trigger itself (causing a double-toggle). The listener
  // skips clicks on the trigger (so toggling works normally) and
  // on the menu itself.
  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        onClose()
      }
    }
    // Use mousedown for immediate response; mouseUp would also work
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [open, onClose, triggerRef])

  // ── Keyboard navigation ────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const menu = menuRef.current
    if (!menu) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const items = menu.querySelectorAll<HTMLElement>("[data-menu-item]")
      if (items.length === 0) return

      switch (e.key) {
        case "Escape":
          e.preventDefault()
          onClose()
          triggerRef.current?.focus()
          break

        case "ArrowDown":
          e.preventDefault()
          {
            const currentIndex = Array.from(items).findIndex(
              (item) => item === document.activeElement
            )
            const nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0
            items[nextIndex]?.focus()
          }
          break

        case "ArrowUp":
          e.preventDefault()
          {
            const currentIndex = Array.from(items).findIndex(
              (item) => item === document.activeElement
            )
            const prevIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1
            items[prevIndex]?.focus()
          }
          break
      }
    }

    menu.addEventListener("keydown", handleKeyDown)
    return () => menu.removeEventListener("keydown", handleKeyDown)
  }, [open, onClose, triggerRef])

  // ── Focus first item on open ───────────────────────────────
  useEffect(() => {
    if (!open || !menuRef.current) return
    const raf = requestAnimationFrame(() => {
      const firstItem = menuRef.current?.querySelector<HTMLElement>("[data-menu-item]")
      firstItem?.focus()
    })
    return () => cancelAnimationFrame(raf)
  }, [open])

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop – visual overlay; not interactive (click-outside handled by document listener above) */}
          <motion.div
            key="smart-dd-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            className="fixed inset-0 z-[99] pointer-events-none"
            aria-hidden="true"
          />

          {/* Menu */}
          <motion.div
            ref={menuRef}
            key="smart-dd-menu"
            role="menu"
            initial={
              shouldReduceMotion
                ? false
                : { opacity: 0, scale: 0.95, y: pos.openUpward ? 6 : -6 }
            }
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={
              shouldReduceMotion
                ? false
                : { opacity: 0, scale: 0.95, y: pos.openUpward ? 6 : -6 }
            }
            transition={{ duration: 0.12, ease: "easeOut" }}
            className={cn(
              "fixed z-[100] overflow-y-auto rounded-xl border border-border bg-card shadow-xl shadow-black/10 focus:outline-none",
              width,
              className,
            )}
            style={{
              top: pos.top,
              left: pos.left,
              maxHeight,
            }}
            tabIndex={-1}
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}
