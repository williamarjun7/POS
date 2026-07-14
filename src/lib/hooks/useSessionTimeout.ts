/**
 * useSessionTimeout Hook
 * ───────────────────────
 * Monitors user activity and auto-logs out after a configurable period of
 * inactivity. Shows a warning modal before the final logout so the user
 * can dismiss it and keep their session alive.
 *
 * Activity is detected via mousemove, keydown, click, touchstart, and
 * scroll events (throttled to avoid flooding the event loop).
 *
 * Usage:
 *   const { timeLeft, showWarning, dismissWarning, resetTimer, warnAt, timeoutAt } =
 *     useSessionTimeout({ warnBeforeMs: 60_000, timeoutMs: 30 * 60 * 1000 })
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/lib/core/auth-context'

interface SessionTimeoutOptions {
  /** How long without activity before the session times out. Default: 30 minutes */
  timeoutMs?: number
  /** Show the warning modal this many ms before timeout. Default: 60 seconds */
  warnBeforeMs?: number
}

interface SessionTimeoutResult {
  /** Seconds remaining until the session ends (after warning shown) */
  timeLeft: number
  /** Whether the warning modal should be visible */
  showWarning: boolean
  /** Call to dismiss the warning and reset the timer */
  dismissWarning: () => void
  /** Manually reset the inactivity timer */
  resetTimer: () => void
  /** The time (ms) remaining before the warning shows */
  warnAt: number
  /** The total timeout duration (ms) */
  timeoutAt: number
}

const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'] as const

export function useSessionTimeout(options?: SessionTimeoutOptions): SessionTimeoutResult {
  const timeoutMs = options?.timeoutMs ?? 30 * 60 * 1000 // 30 min default
  const warnBeforeMs = options?.warnBeforeMs ?? 60 * 1000 // 60 sec default
  const { logout } = useAuth()

  const [showWarning, setShowWarning] = useState(false)
  const [timeLeft, setTimeLeft] = useState(0)

  const lastActivityRef = useRef(Date.now())
  const warningShownRef = useRef(false)
  const loggedOutRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const throttleRef = useRef(0)

  const doLogout = useCallback(async () => {
    if (loggedOutRef.current) return
    loggedOutRef.current = true
    try {
      await logout()
    } catch {
      // Ignore logout errors — the user will be redirected anyway
    }
    // Force redirect to login
    window.location.href = '/login'
  }, [logout])

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now()
    warningShownRef.current = false
    setShowWarning(false)
    setTimeLeft(0)
  }, [])

  const dismissWarning = useCallback(() => {
    resetTimer()
  }, [resetTimer])

  // Track user activity
  useEffect(() => {
    const handler = () => {
      const now = Date.now()
      // Throttle to once per 5 seconds
      if (now - throttleRef.current < 5000) return
      throttleRef.current = now

      lastActivityRef.current = now
      if (warningShownRef.current) {
        // User is active again — dismiss warning
        warningShownRef.current = false
        setShowWarning(false)
        setTimeLeft(0)
      }
    }

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, handler, { passive: true })
    }

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, handler)
      }
    }
  }, [])

  // Check for inactivity and show warning / auto-logout
  useEffect(() => {
    const tick = () => {
      const elapsed = Date.now() - lastActivityRef.current
      const remaining = timeoutMs - elapsed

      if (remaining <= 0) {
        // Timeout reached — log out
        setShowWarning(false)
        doLogout()
        return
      }

      if (remaining <= warnBeforeMs && !warningShownRef.current) {
        warningShownRef.current = true
        setShowWarning(true)
        setTimeLeft(Math.ceil(remaining / 1000))
      }

      if (warningShownRef.current) {
        setTimeLeft(Math.ceil(remaining / 1000))
      }
    }

    timerRef.current = setInterval(tick, 1000)
    // Run immediately on mount
    tick()

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [timeoutMs, warnBeforeMs, doLogout])

  return {
    timeLeft,
    showWarning,
    dismissWarning,
    resetTimer,
    logout: doLogout,
    warnAt: warnBeforeMs,
    timeoutAt: timeoutMs,
  }
}
