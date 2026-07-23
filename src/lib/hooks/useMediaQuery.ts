import { useState, useEffect } from "react"

/**
 * Tracks whether a CSS media query matches the current viewport.
 *
 * @param query - A CSS media query string, e.g. "(min-width: 1024px)"
 * @returns `true` when the query matches, `false` otherwise.
 *
 * @example
 * ```tsx
 * const isLg = useMediaQuery("(min-width: 1024px)")
 * const isDark = useMediaQuery("(prefers-color-scheme: dark)")
 * ```
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined") return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    const mq = window.matchMedia(query)
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches)
    mq.addEventListener("change", handler)
    // Sync in case the value changed between render and effect
    setMatches(mq.matches)
    return () => mq.removeEventListener("change", handler)
  }, [query])

  return matches
}
