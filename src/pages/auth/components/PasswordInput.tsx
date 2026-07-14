import { useState, type InputHTMLAttributes } from 'react'
import { Eye, EyeOff, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'type'> {
  label: string
  error?: string
  touched?: boolean
}

export function PasswordInput({
  label,
  error,
  touched,
  className,
  id,
  value,
  disabled,
  ...props
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false)
  const [focused, setFocused] = useState(false)
  const inputId = id || `password-${label.toLowerCase().replace(/\s+/g, '-')}`

  const hasValue = typeof value === 'string' && value.length > 0
  const hasError = touched && !!error

  return (
    <div className="relative">
      <div
        className={cn(
          'group relative flex items-center rounded-lg border bg-background transition-all duration-200',
          focused && 'ring-2 ring-ring ring-offset-2 ring-offset-background',
          hasError && 'border-destructive ring-destructive/30',
          !hasError && !focused && 'border-input hover:border-muted-foreground/30',
          disabled && 'cursor-not-allowed opacity-50',
          className
        )}
      >
        {/* Lock icon */}
        <Lock
          className={cn(
            'ml-3 h-4 w-4 shrink-0 transition-colors',
            focused ? 'text-foreground' : 'text-muted-foreground',
            hasError && 'text-destructive'
          )}
        />

        {/* Input wrapper */}
        <div className="relative flex-1">
          <input
            id={inputId}
            type={showPassword ? 'text' : 'password'}
            value={value}
            disabled={disabled}
            onFocus={(e) => { setFocused(true); props.onFocus?.(e) }}
            onBlur={(e) => { setFocused(false); props.onBlur?.(e) }}
            className={cn(
              'peer w-full border-none bg-transparent pt-4 pb-1.5 pl-2 pr-10 text-sm text-foreground outline-none',
              'placeholder:text-transparent focus:placeholder:text-transparent',
              'disabled:cursor-not-allowed'
            )}
            placeholder={label}
            autoComplete={props.autoComplete || 'current-password'}
            aria-invalid={hasError}
            {...props}
          />

          {/* Floating label */}
          <label
            htmlFor={inputId}
            className={cn(
              'pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm transition-all duration-200',
              (focused || hasValue)
                ? 'top-2.5 text-[11px] font-medium'
                : 'text-muted-foreground',
              focused && !hasError && 'text-foreground',
              hasError && 'text-destructive'
            )}
          >
            {label}
          </label>
        </div>

        {/* Toggle password visibility */}
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className={cn(
            'mr-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors',
            'text-muted-foreground hover:bg-muted hover:text-foreground',
            focused && 'text-foreground'
          )}
          tabIndex={-1}
          aria-label={showPassword ? 'Hide password' : 'Show password'}
        >
          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}
