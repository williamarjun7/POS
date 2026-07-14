import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, ArrowLeft, AlertCircle } from 'lucide-react'
import { AuthLayout } from '../components/AuthLayout'
import { AuthCard } from '../components/AuthCard'
import { AuthHeader } from '../components/AuthHeader'
import { FormInput } from '../components/FormInput'
import { SubmitButton } from '../components/SubmitButton'
import { useForgotPasswordForm } from '../hooks'

export function ForgotPasswordPage() {
  const { form, step, error, updateEmail, handleSubmit, isLocked, remainingLockSeconds, isCooldown } = useForgotPasswordForm()

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await handleSubmit()
  }

  return (
    <AuthLayout>
      <AuthCard>
        {/* Back button */}
        <Link
          to="/login"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to login
        </Link>

        <AuthHeader
          title="Forgot password?"
          subtitle="Enter your email address and we'll send you a verification code to reset your password."
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
                <span>{error ?? 'No account found with this email address.'}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Email */}
          <FormInput
            label="Email address"
            type="email"
            value={form.email.value}
            error={form.email.error}
            touched={form.email.touched}
            leadingIcon={<Mail className="h-4 w-4" />}
            onChange={(e) => updateEmail(e.target.value)}
            autoComplete="email"
            inputMode="email"
          />

          {/* Submit */}
          <SubmitButton
            type="submit"
            loading={step === 'loading'}
            disabled={isLocked || isCooldown}
            loadingText="Sending code..."
          >
            {isLocked ? `Wait ${remainingLockSeconds}s` : 'Send verification code'}
          </SubmitButton>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Remember your password?{' '}
          <Link
            to="/login"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </AuthCard>
    </AuthLayout>
  )
}
