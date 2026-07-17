/**
 * useScreenLock
 * ─────────────
 * Tracks user activity and automatically locks the screen after a
 * configurable period of inactivity.
 *
 * The screen lock is UI-only — it does NOT invalidate the backend
 * auth session. The user unlocks with their PIN and continues working.
 *
 * Usage:
 *   const { isLocked, lock, unlockWithPin, resetTimer } = useScreenLock()
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  lockScreen as storeLock,
  unlockScreen as storeUnlock,
  isScreenLocked,
  verifyPin,
  getScreenLockTimeout,
} from '@/lib/services/session-store'

const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'] as const

interface ScreenLockResult {
  /** Whether the screen is currently locked */
  isLocked: boolean
  /** Manually lock the screen */
  lock: () => void
  /** Attempt to unlock with a PIN. Returns true if correct. */
  unlockWithPin: (pin: string) => Promise<boolean>
  /** Reset the inactivity timer */
  resetTimer: () => void
  /** Seconds remaining until auto-lock */
  timeUntilLock: number
}

export function useScreenLock(): ScreenLockResult {
  const [isLocked, setIsLocked] = useState(isScreenLocked())
  const [timeUntilLock, setTimeUntilLock] = useState(0)
  const lastActivityRef = useRef(Date.now())
  const throttleRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const lock = useCallback(() => {
    storeLock()
    setIsLocked(true)
  }, [])

  const unlockWithPin = useCallback(async (pin: string): Promise<boolean> => {
    const valid = await verifyPin(pin)
    if (valid) {
      storeUnlock()
      setIsLocked(false)
      lastActivityRef.current = Date.now()
    }
    return valid
  }, [])

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now()
  }, [])

  // Track user activity
  useEffect(() => {
    const handler = () => {
      const now = Date.now()
      if (now - throttleRef.current < 3000) return
      throttleRef.current = now
      lastActivityRef.current = now
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

  // Check inactivity and auto-lock
  useEffect(() => {
    const timeout = getScreenLockTimeout()

    const tick = () => {
      // Don't re-lock if already locked
      if (isScreenLocked()) {
        setTimeUntilLock(0)
        return
      }

      const elapsed = Date.now() - lastActivityRef.current
      const remaining = Math.max(0, timeout - elapsed)
      setTimeUntilLock(Math.ceil(remaining / 1000))

      if (remaining <= 0) {
        lock()
      }
    }

    timerRef.current = setInterval(tick, 1000)
    tick()

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [lock])

  return {
    isLocked,
    lock,
    unlockWithPin,
    resetTimer,
    timeUntilLock,
  }
}
