/**
 * ScreenLock
 * ──────────
 * Full-screen overlay that locks the POS when inactive.
 * The user unlocks with their PIN (or logs out if PIN is forgotten).
 *
 * Requirements:
 * - Full-screen overlay with backdrop blur
 * - Shows user name from auth context
 * - Secure PIN input (type="password", pattern [0-9]*)
 * - Auto-focuses on mount
 * - Submit on Enter key
 * - "Forgot PIN? Log out" link that logs out and redirects
 * - Subtle animation on wrong PIN (shake)
 */

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Lock, LogOut, AlertCircle, KeyRound, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '@/lib/core/auth-context'
import { cn } from '@/lib/utils'

interface ScreenLockProps {
  /** Called with the PIN to attempt unlock */
  onUnlock: (pin: string) => Promise<boolean>
  /** Called to log out */
  onLogout: () => Promise<void>
  /** User's name to display */
  userName: string
}

export function ScreenLock({ onUnlock, onLogout, userName }: ScreenLockProps) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [shake, setShake] = useState(false)
  const [showPin, setShowPin] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-focus the PIN input
  useEffect(() => {
    // Delay to ensure the component is rendered
    const timer = setTimeout(() => inputRef.current?.focus(), 100)
    return () => clearTimeout(timer)
  }, [])

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!pin.trim()) {
      setError('Please enter your PIN')
      setShake(true)
      setTimeout(() => setShake(false), 500)
      return
    }

    const valid = await onUnlock(pin)
    if (!valid) {
      setError('Incorrect PIN. Try again.')
      setShake(true)
      setPin('')
      setTimeout(() => setShake(false), 500)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
    // If valid, the parent component will remove this overlay
  }

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await onLogout()
    } catch {
      window.location.href = '/login'
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-background"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* Decorative blurred background */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-muted/30 to-background" />

      <motion.div
        className="relative z-10 w-full max-w-sm px-6 text-center"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Lock icon */}
        <motion.div
          className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10"
          animate={shake ? { x: [-8, 8, -6, 6, -3, 3, 0] } : {}}
          transition={{ duration: 0.4 }}
        >
          <Lock className="h-7 w-7 text-primary" />
        </motion.div>

        {/* Title */}
        <h1 className="text-xl font-bold text-foreground mb-1">Screen Locked</h1>
        <p className="text-sm text-muted-foreground mb-6">
          {userName ? `${userName}, enter your PIN to continue` : 'Enter your PIN to continue'}
        </p>

        {/* PIN Input */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <div className={cn(
              'flex items-center rounded-xl border-2 bg-card px-4 transition-all duration-200',
              error
                ? 'border-destructive/50 ring-2 ring-destructive/10'
                : 'border-border focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20',
            )}>
              <KeyRound className={cn('h-4 w-4 shrink-0 mr-3', error ? 'text-destructive' : 'text-muted-foreground')} />
              <input
                ref={inputRef}
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={pin}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '')
                  setPin(val)
                  if (error) setError('')
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmit()
                  if (e.key === 'Escape') {
                    setPin('')
                    inputRef.current?.focus()
                  }
                }}
                placeholder="Enter PIN"
                className="h-12 w-full bg-transparent text-lg font-bold tracking-[0.3em] text-foreground outline-none placeholder:text-muted-foreground/40 placeholder:tracking-normal"
                autoComplete="off"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-1.5 flex items-center gap-1.5 text-xs text-destructive"
              >
                <AlertCircle className="h-3 w-3" />
                {error}
              </motion.p>
            )}
          </div>

          {/* Submit button */}
          <motion.button
            type="submit"
            whileTap={{ scale: 0.97 }}
            className="w-full h-11 rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all"
          >
            Unlock
          </motion.button>
        </form>

        {/* Forgot PIN / Logout */}
        <div className="mt-8">
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <LogOut className="h-4 w-4" />
            {loggingOut ? 'Logging out...' : 'Forgot PIN? Log out'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
