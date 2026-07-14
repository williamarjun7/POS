import { useState, useRef, type InputHTMLAttributes } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FormInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string
  error?: string
  touched?: boolean
  success?: boolean
  leadingIcon?: React.ReactNode
  trailingIcon?: React.ReactNode
  onClear?: () => void
  showValidationIcon?: boolean
}

export function FormInput({
  label,
  error,
  touched,
  success,
  leadingIcon,
  trailingIcon,
  onClear,
  showValidationIcon = true,
  className,
  id,
  value,
  onFocus,
  onBlur,
  disabled,
  ...props
}: FormInputProps) {
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = id || `input-${label.toLowerCase().replace(/\s+/g, '-')}`

  const hasValue = typeof value === 'string' && value.length > 0
  const isFloating = focused || hasValue
  const hasError = touched && !!error
  const isValid = touched && !error && hasValue && success

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setFocused(true)
    onFocus?.(e)
  }

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setFocused(false)
    onBlur?.(e)
  }

  return (
    <div className="relative">
      <div
        className={cn(
          'group relative flex items-center rounded-lg border bg-background transition-all duration-200',
          focused && 'ring-2 ring-ring ring-offset-2 ring-offset-background',
          hasError && 'border-destructive ring-destructive/30',
          isValid && !hasError && 'border-emerald-500/50',
          !hasError && !isValid && !focused && 'border-input hover:border-muted-foreground/30',
          disabled && 'cursor-not-allowed opacity-50',
          className
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {/* Leading icon */}
        {leadingIcon && (
          <span
            className={cn(
              'ml-3 flex shrink-0 items-center justify-center',
              focused ? 'text-foreground' : 'text-muted-foreground',
              hasError && 'text-destructive'
            )}
          >
            {leadingIcon}
          </span>
        )}

        {/* Input wrapper for floating label */}
        <div className="relative flex-1">
          <input
            ref={inputRef}
            id={inputId}
            value={value}
            disabled={disabled}
            onFocus={handleFocus}
            onBlur={handleBlur}
            className={cn(
              'peer w-full border-none bg-transparent pt-4 pb-1.5 text-sm text-foreground outline-none',
              'placeholder:text-transparent focus:placeholder:text-transparent',
              'disabled:cursor-not-allowed',
              leadingIcon ? 'pl-2' : 'pl-3',
              (trailingIcon || onClear || showValidationIcon) && hasValue ? 'pr-10' : 'pr-3'
            )}
            placeholder={label}
            autoComplete={props.autoComplete || 'off'}
            aria-invalid={hasError}
            aria-describedby={hasError ? `${inputId}-error` : undefined}
            {...props}
          />

          {/* Floating label */}
          <label
            htmlFor={inputId}
            className={cn(
              'pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 text-sm transition-all duration-200',
              leadingIcon ? 'left-2' : 'left-3',
              isFloating
                ? 'top-2.5 text-[11px] font-medium'
                : 'text-muted-foreground',
              focused && !hasError && 'text-foreground',
              hasError && 'text-destructive',
              isValid && !hasError && 'text-emerald-500'
            )}
          >
            {label}
          </label>
        </div>

        {/* Validation icons / clear */}
        <AnimatePresence mode="wait">
          {hasValue && showValidationIcon && (
            <motion.div
              key={hasError ? 'error' : isValid ? 'success' : 'clear'}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={{ duration: 0.15 }}
              className="mr-3 flex shrink-0 items-center"
            >
              {hasError ? (
                <AlertCircle className="h-4 w-4 text-destructive" />
              ) : isValid ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : onClear ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onClear()
                  }}
                  className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  tabIndex={-1}
                  aria-label="Clear input"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                    <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Error message */}
      <AnimatePresence>
        {hasError && (
          <motion.p
            id={`${inputId}-error`}
            initial={{ opacity: 0, y: -4, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -4, height: 0 }}
            transition={{ duration: 0.2 }}
            role="alert"
            className="mt-1.5 flex items-center gap-1 px-1 text-xs text-destructive"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}
