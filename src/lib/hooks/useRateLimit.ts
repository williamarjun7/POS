/**
 * useRateLimit Hook
 * ──────────────────
 * Client-side rate limiter that prevents rapid form submissions and API calls.
 * Tracks attempt count and enforces a cooldown period between submissions.
 */

import { useState, useCallback, useEffect, useRef } from 'react'

interface RateLimitOptions {
  /** Minimum time (ms) between attempts. Default: 1000 */
  cooldownMs?: number
  /** Max attempts before locking. Default: 5 */
  maxAttempts?: number
  /** Auto-unlock after this many ms. Default: cooldownMs * 3 */
  lockDurationMs?: number
}

interface RateLimitResult {
  /** Call before executing an action. Returns false if rate-limited. */
  checkLimit: () => boolean
  /** Whether the action is currently locked due to too many attempts. */
  isLocked: boolean
  /** Seconds remaining until auto-unlock. */
  remainingLockSeconds: number
  /** True during the cooldown gap between individual attempts (before lockout). */
  isCooldown: boolean
  /** Seconds remaining until the cooldown expires. */
  remainingCooldownSeconds: number
  /** Current attempt count within the window. */
  attemptCount: number
  /** Max attempts allowed before locking. */
  maxAttempts: number
}

export function useRateLimit(options?: RateLimitOptions): RateLimitResult {
  const cooldownMs = options?.cooldownMs ?? 1000
  const maxAttempts = options?.maxAttempts ?? 5
  const lockDurationMs = options?.lockDurationMs ?? cooldownMs * 3

  const [isLocked, setIsLocked] = useState(false)
  const [remainingLockSeconds, setRemainingLockSeconds] = useState(0)
  const [isCooldown, setIsCooldown] = useState(false)
  const [remainingCooldownSeconds, setRemainingCooldownSeconds] = useState(0)
  const attemptRef = useRef(0)
  const lastAttemptRef = useRef(0)
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cooldownCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearCooldown = useCallback(() => {
    setIsCooldown(false)
    setRemainingCooldownSeconds(0)
    if (cooldownTimerRef.current) {
      clearTimeout(cooldownTimerRef.current)
      cooldownTimerRef.current = null
    }
    if (cooldownCountdownRef.current) {
      clearInterval(cooldownCountdownRef.current)
      cooldownCountdownRef.current = null
    }
  }, [])

  // Store clearCooldown in a ref so the useEffect doesn't need it as a dep
  const clearCooldownRef = useRef(clearCooldown)
  clearCooldownRef.current = clearCooldown

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (lockTimerRef.current) clearTimeout(lockTimerRef.current)
      if (countdownRef.current) clearInterval(countdownRef.current)
      clearCooldownRef.current()
    }
  }, [])

  const startCooldown = useCallback(() => {
    clearCooldown()

    setIsCooldown(true)
    setRemainingCooldownSeconds(Math.ceil(cooldownMs / 1000))

    // Countdown for UI display
    cooldownCountdownRef.current = setInterval(() => {
      setRemainingCooldownSeconds((prev) => {
        if (prev <= 1) {
          if (cooldownCountdownRef.current) {
            clearInterval(cooldownCountdownRef.current)
            cooldownCountdownRef.current = null
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)

    // Auto-clear cooldown
    cooldownTimerRef.current = setTimeout(() => {
      clearCooldown()
    }, cooldownMs)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cooldownMs])

  const startLock = useCallback(() => {
    clearCooldown()
    setIsLocked(true)
    setRemainingLockSeconds(Math.ceil(lockDurationMs / 1000))

    // Countdown for UI display
    countdownRef.current = setInterval(() => {
      setRemainingLockSeconds((prev) => {
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    // Auto-unlock
    lockTimerRef.current = setTimeout(() => {
      setIsLocked(false)
      setRemainingLockSeconds(0)
      attemptRef.current = 0
    }, lockDurationMs)
  }, [lockDurationMs])

  const checkLimit = useCallback((): boolean => {
    const now = Date.now()
    const timeSinceLastAttempt = now - lastAttemptRef.current

    // If locked, reject immediately
    if (isLocked) return false

    // If enough time has passed since last attempt, reset the counter
    if (timeSinceLastAttempt > cooldownMs * 2) {
      attemptRef.current = 1
      lastAttemptRef.current = now
      startCooldown()
      return true
    }

    // Check if within cooldown (minimum gap between submissions)
    if (timeSinceLastAttempt < cooldownMs) {
      return false
    }

    // Check max attempts
    if (attemptRef.current >= maxAttempts) {
      startLock()
      return false
    }

    attemptRef.current += 1
    lastAttemptRef.current = now
    startCooldown()
    return true
  }, [isLocked, cooldownMs, maxAttempts, startLock, startCooldown])

  return {
    checkLimit,
    isLocked,
    remainingLockSeconds,
    isCooldown,
    remainingCooldownSeconds,
    attemptCount: attemptRef.current,
    maxAttempts,
  }
}
