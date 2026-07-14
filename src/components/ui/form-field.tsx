import { type ReactNode, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes, useId } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"

interface FormFieldBaseProps {
  label: string
  error?: string
  required?: boolean
  description?: string
  children?: ReactNode
  inputId?: string
}

export function FormField({ label, error, required, description, children, inputId }: FormFieldBaseProps) {
  const errorId = inputId ? `${inputId}-error` : undefined
  const descId = inputId ? `${inputId}-desc` : undefined

  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="text-destructive">*</span>}
      </label>
      {children}
      {description && !error && (
        <p id={descId} className="text-[11px] text-muted-foreground/60">{description}</p>
      )}
      <AnimatePresence mode="wait">
        {error && (
          <motion.p
            id={errorId}
            initial={{ opacity: 0, y: -4, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -4, height: 0 }}
            transition={{ duration: 0.15 }}
            role="alert"
            className="text-xs text-destructive"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}

interface FormInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
  leadingIcon?: ReactNode
}

export function FormInput({ label, error, required, className, leadingIcon, id: externalId, ...props }: FormInputProps) {
  const autoId = useId()
  const inputId = externalId ?? `fi-${autoId}`

  return (
    <FormField label={label} error={error} required={required} inputId={inputId}>
      <div className="relative">
        {leadingIcon && (
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/50">
            {leadingIcon}
          </span>
        )}
        <input
          id={inputId}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className={cn(
            "h-10 w-full rounded-xl border border-border bg-background text-sm text-foreground outline-none transition-all duration-150 placeholder:text-muted-foreground/60",
            "focus:border-primary focus:shadow-[0_0_0_3px] focus:shadow-primary/10",
            "hover:border-foreground/30",
            leadingIcon ? "pl-10 pr-4" : "px-4",
            error && "border-destructive focus:shadow-destructive/10",
            className
          )}
          onWheel={props.type === 'number' ? (e: React.WheelEvent<HTMLInputElement>) => (e.target as HTMLInputElement).blur() : undefined}
          {...props}
        />
      </div>
    </FormField>
  )
}

interface FormSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  error?: string
  options?: { value: string; label: string }[]
  children?: React.ReactNode
}

export function FormSelect({ label, error, required, options, className, id: externalId, ...props }: FormSelectProps) {
  const autoId = useId()
  const inputId = externalId ?? `fs-${autoId}`

  return (
    <FormField label={label} error={error} required={required} inputId={inputId}>
      <div className="relative">
        <select
          id={inputId}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className={cn(
            "h-10 w-full appearance-none rounded-xl border border-border bg-background pl-4 pr-10 text-sm text-foreground outline-none transition-all duration-150",
            "focus:border-primary focus:shadow-[0_0_0_3px] focus:shadow-primary/10",
            "hover:border-foreground/30",
            error && "border-destructive focus:shadow-destructive/10",
            className
          )}
          {...props}
        >
          {options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/50">
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
      </div>
    </FormField>
  )
}

interface FormTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string
  error?: string
}

export function FormTextarea({ label, error, required, className, id: externalId, ...props }: FormTextareaProps) {
  const autoId = useId()
  const inputId = externalId ?? `ft-${autoId}`

  return (
    <FormField label={label} error={error} required={required} inputId={inputId}>
      <textarea
        id={inputId}
        aria-invalid={!!error}
        aria-describedby={error ? `${inputId}-error` : undefined}
        className={cn(
          "w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none transition-all duration-150 placeholder:text-muted-foreground/60",
          "focus:border-primary focus:shadow-[0_0_0_3px] focus:shadow-primary/10",
          "hover:border-foreground/30",
          error && "border-destructive focus:shadow-destructive/10",
          className
        )}
        {...props}
      />
    </FormField>
  )
}

interface FormToggleProps {
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

export function FormToggle({ label, description, checked, onChange, disabled }: FormToggleProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => { if (!disabled) onChange(!checked) }}
        disabled={disabled}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-all duration-200",
          checked ? "bg-primary" : "bg-muted hover:bg-muted-foreground/20",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-200",
            checked ? "translate-x-5" : "translate-x-0"
          )}
        />
      </button>
    </div>
  )
}

interface FormActionsProps {
  children: ReactNode
}

export function FormActions({ children }: FormActionsProps) {
  return <div className="flex items-center justify-end gap-3 pt-4">{children}</div>
}
