import { useRef, useCallback, useEffect } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface OTPInputProps {
  digits: string[]
  onChange: (index: number, value: string) => void
  onPaste: (e: React.ClipboardEvent) => void
  error?: string
  disabled?: boolean
}

export function OTPInput({ digits, onChange, onPaste, error, disabled }: OTPInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  const focusNext = useCallback((index: number) => {
    if (index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
  }, [])

  const focusPrev = useCallback((index: number) => {
    if (index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }, [])

  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Backspace' && !digits[index] && index > 0) {
        focusPrev(index)
      }
      if (e.key === 'ArrowLeft') focusPrev(index)
      if (e.key === 'ArrowRight') focusNext(index)
    },
    [digits, focusNext, focusPrev]
  )

  const handleChange = useCallback(
    (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value
      if (/^\d$/.test(val)) {
        onChange(index, val)
        focusNext(index)
      } else if (val === '') {
        onChange(index, '')
      }
    },
    [onChange, focusNext]
  )

  // Auto-focus first input on mount
  useEffect(() => {
    inputRefs.current[0]?.focus()
  }, [])

  return (
    <div className="space-y-3">
      <div
        className="flex items-center justify-center gap-2 sm:gap-3"
        onPaste={onPaste}
      >
        {digits.map((digit, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05, duration: 0.2 }}
            className="relative"
          >
            <input
              ref={(el) => { inputRefs.current[index] = el }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(index, e)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              onPaste={(e) => onPaste(e)}
              disabled={disabled}
              autoComplete="one-time-code"
              aria-label={`Digit ${index + 1}`}
              className={cn(
                'h-12 w-10 rounded-lg border text-center text-lg font-semibold outline-none transition-all duration-200 sm:h-14 sm:w-12',
                'bg-background text-foreground',
                digit
                  ? 'border-primary/40 shadow-sm'
                  : 'border-input hover:border-muted-foreground/30',
                error && 'border-destructive ring-1 ring-destructive/30',
                !error && digit && 'ring-2 ring-ring/30',
                disabled && 'opacity-50 cursor-not-allowed'
              )}
            />
            {/* Focus ring animation */}
            <div
              className={cn(
                'pointer-events-none absolute inset-0 rounded-lg transition-opacity duration-200',
                digit && !error && 'opacity-0'
              )}
            />
          </motion.div>
        ))}
      </div>

      {error && (
        <motion.p
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center text-xs text-destructive"
          role="alert"
        >
          {error}
        </motion.p>
      )}
    </div>
  )
}
