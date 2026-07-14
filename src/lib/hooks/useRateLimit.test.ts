import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRateLimit } from './useRateLimit'

describe('useRateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ─── Initial State ─────────────────────────────────────

  it('starts with no cooldown or lock, and allows first attempt', () => {
    const { result } = renderHook(() => useRateLimit())
    expect(result.current.isCooldown).toBe(false)
    expect(result.current.isLocked).toBe(false)
    expect(result.current.remainingCooldownSeconds).toBe(0)
    expect(result.current.remainingLockSeconds).toBe(0)
    expect(result.current.checkLimit()).toBe(true)
  })

  // ─── Cooldown ──────────────────────────────────────────

  it('starts cooldown after a successful attempt', () => {
    const { result } = renderHook(() => useRateLimit({ cooldownMs: 1000 }))

    act(() => { result.current.checkLimit() })
    expect(result.current.isCooldown).toBe(true)
  })

  it('blocks a second attempt within the cooldown window', () => {
    const { result } = renderHook(() => useRateLimit({ cooldownMs: 1000 }))

    act(() => { result.current.checkLimit() })
    expect(result.current.checkLimit()).toBe(false)
  })

  it('allows a new attempt after cooldown expires', () => {
    const { result } = renderHook(() => useRateLimit({ cooldownMs: 1000 }))

    act(() => { result.current.checkLimit() })
    act(() => { vi.advanceTimersByTime(1000) })
    expect(result.current.checkLimit()).toBe(true)
  })

  it('shows remainingCooldownSeconds counting down to 0', () => {
    const { result } = renderHook(() => useRateLimit({ cooldownMs: 3000 }))

    act(() => { result.current.checkLimit() })
    // Initially ceil(3000/1000) = 3
    expect(result.current.remainingCooldownSeconds).toBe(3)

    act(() => { vi.advanceTimersByTime(1000) })
    expect(result.current.remainingCooldownSeconds).toBe(2)

    act(() => { vi.advanceTimersByTime(1000) })
    expect(result.current.remainingCooldownSeconds).toBe(1)

    act(() => { vi.advanceTimersByTime(1000) })
    expect(result.current.remainingCooldownSeconds).toBe(0)
    expect(result.current.isCooldown).toBe(false)
  })

  it('resets remainingCooldownSeconds when cooldown timer fires after expiry', () => {
    const { result } = renderHook(() => useRateLimit({ cooldownMs: 5000, maxAttempts: 10 }))

    // First attempt starts 5s cooldown
    act(() => { result.current.checkLimit() })
    expect(result.current.remainingCooldownSeconds).toBe(5)

    // Wait out the full cooldown
    act(() => { vi.advanceTimersByTime(5000) })
    expect(result.current.isCooldown).toBe(false)
    expect(result.current.remainingCooldownSeconds).toBe(0)

    // Second attempt restarts cooldown
    act(() => { result.current.checkLimit() })
    expect(result.current.remainingCooldownSeconds).toBe(5)
  })

  // ─── Lockout ───────────────────────────────────────────

  it('locks after exceeding max attempts', () => {
    const { result } = renderHook(() => useRateLimit({ cooldownMs: 10, maxAttempts: 3 }))

    for (let i = 0; i < 3; i++) {
      act(() => { result.current.checkLimit() })
      act(() => { vi.advanceTimersByTime(10) })
    }

    // 4th call triggers lockout — must wrap in act() to flush state
    let blocked = false
    act(() => { blocked = result.current.checkLimit() })
    expect(blocked).toBe(false)
    expect(result.current.isLocked).toBe(true)
  })

  it('remains locked while lockDurationMs is active', () => {
    const { result } = renderHook(() => useRateLimit({ cooldownMs: 10, maxAttempts: 2 }))

    // Hit the lock
    act(() => { result.current.checkLimit() })
    act(() => { vi.advanceTimersByTime(10) })
    act(() => { result.current.checkLimit() })
    act(() => { vi.advanceTimersByTime(10) })
    act(() => { result.current.checkLimit() }) // triggers lockout

    expect(result.current.isLocked).toBe(true)
    // Still locked mid-duration
    act(() => { vi.advanceTimersByTime(10) })
    expect(result.current.checkLimit()).toBe(false)
  })

  it('auto-unlocks after lockDurationMs', () => {
    const lockDurationMs = 500
    const { result } = renderHook(() => useRateLimit({ cooldownMs: 10, maxAttempts: 2, lockDurationMs }))

    // Hit the lock
    act(() => { result.current.checkLimit() })
    act(() => { vi.advanceTimersByTime(10) })
    act(() => { result.current.checkLimit() })
    act(() => { vi.advanceTimersByTime(10) })
    act(() => { result.current.checkLimit() }) // lockout

    expect(result.current.isLocked).toBe(true)

    // Advance past the lock duration
    act(() => { vi.advanceTimersByTime(lockDurationMs) })
    expect(result.current.isLocked).toBe(false)
    expect(result.current.remainingLockSeconds).toBe(0)
  })

  it('shows remainingLockSeconds counting down during lockout', () => {
    const { result } = renderHook(() => useRateLimit({ cooldownMs: 10, maxAttempts: 2, lockDurationMs: 3000 }))

    // Hit the lock
    act(() => { result.current.checkLimit() })
    act(() => { vi.advanceTimersByTime(10) })
    act(() => { result.current.checkLimit() })
    act(() => { vi.advanceTimersByTime(10) })
    act(() => { result.current.checkLimit() }) // lockout

    // Ceil(3000/1000) = 3
    expect(result.current.remainingLockSeconds).toBe(3)

    act(() => { vi.advanceTimersByTime(1000) })
    expect(result.current.remainingLockSeconds).toBe(2)

    act(() => { vi.advanceTimersByTime(2000) })
    expect(result.current.remainingLockSeconds).toBe(0)
    expect(result.current.isLocked).toBe(false)
  })

  // ─── Attempt Counter Reset on Inactivity ──────────────

  it('resets the attempt counter after inactivity longer than cooldownMs * 2', () => {
    const { result } = renderHook(() => useRateLimit({ cooldownMs: 100, maxAttempts: 3 }))

    // Make 2 attempts
    act(() => { result.current.checkLimit() })
    act(() => { vi.advanceTimersByTime(100) })
    act(() => { result.current.checkLimit() })

    // Wait > cooldownMs * 2 (200ms) of inactivity
    act(() => { vi.advanceTimersByTime(300) })

    // Next call should reset counter to 1 and succeed
    expect(result.current.checkLimit()).toBe(true)

    // After reset, we can make maxAttempts more attempts
    act(() => { vi.advanceTimersByTime(100) })
    expect(result.current.checkLimit()).toBe(true)
    act(() => { vi.advanceTimersByTime(100) })
    expect(result.current.checkLimit()).toBe(true)
    act(() => { vi.advanceTimersByTime(100) })

    // 4th attempt (after reset: count 1→2→3→4) triggers lockout — wrap in act()
    let blocked = false
    act(() => { blocked = result.current.checkLimit() })
    expect(blocked).toBe(false)
    expect(result.current.isLocked).toBe(true)
  })

  // ─── Lock Clears Cooldown ────────────────────────────

  it('clears cooldown state when transitioning to lockout', () => {
    const { result } = renderHook(() => useRateLimit({ cooldownMs: 10, maxAttempts: 2 }))

    // First attempt — cooldown active
    act(() => { result.current.checkLimit() })
    expect(result.current.isCooldown).toBe(true)

    // Advance past cooldown and hit max attempts
    act(() => { vi.advanceTimersByTime(10) })
    act(() => { result.current.checkLimit() }) // 2nd attempt
    act(() => { vi.advanceTimersByTime(10) })
    act(() => { result.current.checkLimit() }) // triggers lockout

    // Cooldown should be cleared when lock takes over
    expect(result.current.isCooldown).toBe(false)
    expect(result.current.isLocked).toBe(true)
  })

  // ─── Configurable Options ────────────────────────────

  it('accepts custom cooldownMs', () => {
    const { result } = renderHook(() => useRateLimit({ cooldownMs: 5000, maxAttempts: 10 }))

    act(() => { result.current.checkLimit() })
    expect(result.current.remainingCooldownSeconds).toBe(5) // ceil(5000/1000)

    act(() => { vi.advanceTimersByTime(4999) })
    // Still within cooldown
    expect(result.current.checkLimit()).toBe(false)

    act(() => { vi.advanceTimersByTime(1) })
    expect(result.current.isCooldown).toBe(false)
  })

  it('accepts custom lockDurationMs', () => {
    const { result } = renderHook(() => useRateLimit({ cooldownMs: 10, maxAttempts: 1, lockDurationMs: 2000 }))

    act(() => { result.current.checkLimit() })
    act(() => { vi.advanceTimersByTime(10) })
    let blocked = false
    act(() => { blocked = result.current.checkLimit() })
    expect(blocked).toBe(false)

    expect(result.current.remainingLockSeconds).toBe(2) // ceil(2000/1000)

    act(() => { vi.advanceTimersByTime(2000) })
    expect(result.current.isLocked).toBe(false)
  })

  it('uses defaults when no options provided', () => {
    const { result } = renderHook(() => useRateLimit())

    expect(result.current.maxAttempts).toBe(5)
    act(() => { result.current.checkLimit() })
    // Default cooldownMs = 1000
    expect(result.current.remainingCooldownSeconds).toBe(1)
  })

  // ─── Cleanup on Unmount ──────────────────────────────

  it('clears timers on unmount after an attempt', () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')

    const { result, unmount } = renderHook(() => useRateLimit({ cooldownMs: 5000 }))

    act(() => { result.current.checkLimit() })

    unmount()

    expect(clearIntervalSpy).toHaveBeenCalled()
    expect(clearTimeoutSpy).toHaveBeenCalled()
  })

  it('clears timers on unmount after a lockout', () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')

    const { result, unmount } = renderHook(() => useRateLimit({ cooldownMs: 10, maxAttempts: 1 }))

    // Trigger lock
    act(() => { result.current.checkLimit() })
    act(() => { vi.advanceTimersByTime(10) })
    act(() => { result.current.checkLimit() })

    unmount()

    expect(clearTimeoutSpy).toHaveBeenCalled()
    expect(clearIntervalSpy).toHaveBeenCalled()
  })
})
