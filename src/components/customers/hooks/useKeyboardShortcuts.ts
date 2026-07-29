/**
 * useKeyboardShortcuts
 * ────────────────────
 * Registers keyboard shortcuts for the Customers page.
 *
 * Supported shortcuts:
 *   Arrow Up    — move selection up
 *   Arrow Down  — move selection down
 *   Enter       — open selected customer profile
 *   Escape      — close customer profile
 *   Ctrl+F      — focus search input (without browser default)
 */

import { useEffect, useCallback } from "react"

export interface KeyboardShortcutConfig {
  /** Total number of items in the list */
  itemCount: number
  /** Currently highlighted index */
  highlightedIndex: number
  /** Set highlighted index */
  onHighlight: (index: number) => void
  /** Open customer at index */
  onOpen: (index: number) => void
  /** Close profile */
  onClose: () => void
  /** Focus search input */
  onFocusSearch: () => void
  /** Whether a modal/dialog is open (disable shortcuts) */
  isModalOpen?: boolean
  /** Whether profile panel is open */
  isProfileOpen?: boolean
  /** Whether search input is focused */
  isSearchFocused?: boolean
}

export function useKeyboardShortcuts({
  itemCount,
  highlightedIndex,
  onHighlight,
  onOpen,
  onClose,
  onFocusSearch,
  isModalOpen = false,
  isProfileOpen = false,
  isSearchFocused = false,
}: KeyboardShortcutConfig) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't intercept when typing in inputs (unless it's Ctrl+F)
      const target = e.target as HTMLElement
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable

      // Escape: close profile (works everywhere)
      if (e.key === "Escape" && isProfileOpen) {
        e.preventDefault()
        onClose()
        return
      }

      // Ctrl+F: focus search (works even in inputs)
      if ((e.key === "f" || e.key === "F") && (e.ctrlKey || e.metaKey)) {
        if (!isSearchFocused) {
          e.preventDefault()
          onFocusSearch()
        }
        return
      }

      // Don't handle navigation shortcuts when modals are open or typing in inputs
      if (isModalOpen || isInput) return

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault()
          onHighlight(Math.min(highlightedIndex + 1, itemCount - 1))
          break
        case "ArrowUp":
          e.preventDefault()
          onHighlight(Math.max(highlightedIndex - 1, 0))
          break
        case "Enter":
          e.preventDefault()
          if (itemCount > 0 && highlightedIndex >= 0 && highlightedIndex < itemCount) {
            onOpen(highlightedIndex)
          }
          break
      }
    },
    [itemCount, highlightedIndex, onHighlight, onOpen, onClose, onFocusSearch, isModalOpen, isProfileOpen, isSearchFocused],
  )

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])
}
