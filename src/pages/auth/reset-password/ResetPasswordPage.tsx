import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle } from 'lucide-react'
import { AuthLayout } from '../components/AuthLayout'
import { AuthCard } from '../components/AuthCard'
import { AuthHeader } from '../components/AuthHeader'
import { PasswordInput } from '../components/PasswordInput'
import { PasswordStrength } from '../components/PasswordStrength'
import { SubmitButton } from '../components/SubmitButton'
import { useResetPasswordForm } from '../hooks'

export function ResetPasswordPage() {
  const { form, step, error, passwordStrength, updateField, handleSubmit, isLocked, remainingLockSeconds, isCooldown } = useResetPasswordForm()

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await handleSubmit()
  }

  return (
    <AuthLayout>
      <AuthCard>
        <AuthHeader
          title="Reset password"
          subtitle="Create a new password for your account"
        />

        <form onSubmit={onSubmit} noValidate className="space-y-5">
          {/* Error banner */}
          <AnimatePresence>
            {step === 'error' && (
              <motion.div
                initial={{ opacity: 0, y: -8, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -8, height: 0 }}
                className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive"
                role="alert"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error ?? 'Failed to reset password. Please try again.'}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* New Password */}
          <div className="space-y-2">
            <PasswordInput
              label="New password"
              value={form.password.value}
              error={form.password.error}
              touched={form.password.touched}
              onChange={(e) => updateField('password', e.target.value)}
              autoComplete="new-password"
            />
            <AnimatePresence>
              {form.password.touched && form.password.value && !form.password.error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <PasswordStrength strength={passwordStrength} />
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    <li className={form.password.value.length >= 8 ? 'text-emerald-500' : ''}>
                      • At least 8 characters
                    </li>
                    <li className={/[A-Z]/.test(form.password.value) ? 'text-emerald-500' : ''}>
                      • One uppercase letter
                    </li>
                    <li className={/[a-z]/.test(form.password.value) ? 'text-emerald-500' : ''}>
                      • One lowercase letter
                    </li>
                    <li className={/[0-9]/.test(form.password.value) ? 'text-emerald-500' : ''}>
                      • One number
                    </li>
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Confirm Password */}
          <PasswordInput
            label="Confirm new password"
            value={form.confirmPassword.value}
            error={form.confirmPassword.error}
            touched={form.confirmPassword.touched}
            onChange={(e) => updateField('confirmPassword', e.target.value)}
            autoComplete="new-password"
          />

          {/* Submit */}
          <SubmitButton
            type="submit"
            loading={step === 'loading'}
            disabled={isLocked || isCooldown}
            loadingText="Resetting password..."
          >
            {isLocked ? `Wait ${remainingLockSeconds}s` : 'Reset password'}
          </SubmitButton>
        </form>
      </AuthCard>
    </AuthLayout>
  )
}
