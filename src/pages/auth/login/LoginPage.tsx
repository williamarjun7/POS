import { Link } from 'react-router-dom'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, AlertCircle, Check, Shield, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AuthLayout } from '../components/AuthLayout'
import { AuthCard } from '../components/AuthCard'
import { AuthHeader } from '../components/AuthHeader'
import { FormInput } from '../components/FormInput'
import { PasswordInput } from '../components/PasswordInput'
import { SubmitButton } from '../components/SubmitButton'
import { resendVerificationEmail } from '@/lib/services/auth-service'

import { useLoginForm } from '../hooks'

const stagger = {
  container: {
    animate: {
      transition: {
        staggerChildren: 0.08,
        delayChildren: 0.1,
      },
    },
  },
  item: {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const } },
  },
}

export function LoginPage() {
  const { form, step, updateField, handleSubmit, touchAll, error, isLocked, remainingLockSeconds, isCooldown, unverifiedEmail } = useLoginForm()
  const [rememberMe, setRememberMe] = useState(false)
  const [resending, setResending] = useState(false)
  const [resendSent, setResendSent] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    touchAll()
    await handleSubmit()
  }

  const handleResendVerification = async () => {
    if (!unverifiedEmail || resending) return
    setResending(true)
    try {
      await resendVerificationEmail(unverifiedEmail)
      setResendSent(true)
    } catch {
      // Silently fail - don't reveal if email exists
    } finally {
      setResending(false)
    }
  }

  return (
    <AuthLayout>
      <AuthCard>
        <AuthHeader
          title="Welcome back"
          subtitle="Sign in to your account to continue managing your business"
        />

        <motion.form
          onSubmit={onSubmit}
          noValidate
          variants={stagger.container}
          initial="initial"
          animate="animate"
          className="space-y-5"
        >
          {/* Error banner */}
          <AnimatePresence>
            {step === 'error' && (
              <motion.div
                variants={stagger.item}
                initial={{ opacity: 0, y: -8, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -8, height: 0 }}
                className="flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive"
                role="alert"
              >
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span>{error ?? 'Invalid email or password. Please try again.'}</span>
                  {unverifiedEmail && !resendSent && (
                    <div className="mt-2 flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={handleResendVerification}
                        disabled={resending}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive underline-offset-4 hover:underline disabled:opacity-50"
                      >
                        <RefreshCw className={cn('h-3 w-3', resending && 'animate-spin')} />
                        {resending ? 'Sending...' : 'Resend verification code'}
                      </button>
                    </div>
                  )}
                  {unverifiedEmail && resendSent && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      If an account exists, a new verification code has been sent.
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Email */}
          <motion.div variants={stagger.item}>
            <FormInput
              label="Email address"
              type="email"
              value={form.email.value}
              error={form.email.error}
              touched={form.email.touched}
              leadingIcon={<Mail className="h-4 w-4" />}
              onChange={(e) => updateField('email', e.target.value)}
              autoComplete="email"
              inputMode="email"
            />
          </motion.div>

          {/* Password */}
          <motion.div variants={stagger.item} className="space-y-2">
            <PasswordInput
              label="Password"
              value={form.password.value}
              error={form.password.error}
              touched={form.password.touched}
              onChange={(e) => updateField('password', e.target.value)}
              autoComplete="current-password"
            />

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.3 }}
              className="flex items-center justify-between"
            >
              {/* Custom Remember me checkbox */}
              <label className="group flex cursor-pointer items-center gap-2.5 select-none">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={() => setRememberMe(!rememberMe)}
                    className="peer sr-only"
                  />
                  <div
                    className={cn(
                      'flex h-5 w-5 items-center justify-center rounded-md border-2 transition-all duration-200',
                      rememberMe
                        ? 'border-primary bg-primary shadow-sm shadow-primary/25'
                        : 'border-muted-foreground/30 bg-transparent group-hover:border-muted-foreground/50 group-hover:bg-muted/50'
                    )}
                  >
                    <motion.div
                      initial={false}
                      animate={rememberMe ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                    >
                      <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />
                    </motion.div>
                  </div>
                </div>
                <span className="text-sm text-muted-foreground transition-colors duration-200 group-hover:text-foreground">
                  Remember me
                </span>
              </label>

              {/* Forgot password link */}
              <motion.div
                whileHover={{ x: 2 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              >
                <Link
                  to="/forgot-password"
                  className="relative text-sm font-medium text-primary underline-offset-4 after:absolute after:bottom-0 after:left-0 after:h-px after:w-full after:origin-right after:scale-x-0 after:bg-primary after:transition-transform after:duration-300 hover:after:origin-left hover:after:scale-x-100"
                >
                  Forgot password?
                </Link>
              </motion.div>
            </motion.div>
          </motion.div>

          {/* Submit */}
          <motion.div variants={stagger.item}>
            <SubmitButton
              type="submit"
              loading={step === 'loading'}
              disabled={isLocked || isCooldown}
              loadingText="Signing in..."
            >
              {isLocked ? `Wait ${remainingLockSeconds}s` : 'Sign in'}
            </SubmitButton>
          </motion.div>
        </motion.form>

        {/* Signup link */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.45, duration: 0.4 }}
          className="mt-6 text-center text-sm text-muted-foreground"
        >
          Don't have an account?{' '}
          <Link
            to="/signup"
            className="font-medium text-primary underline-offset-4 after:absolute after:bottom-0 after:left-0 after:h-px after:w-full after:origin-right after:scale-x-0 after:bg-primary after:transition-transform after:duration-300 hover:after:origin-left hover:after:scale-x-100 relative"
          >
            Sign up
          </Link>
        </motion.p>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.4 }}
          className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground/60"
        >
          <Shield className="h-3 w-3" />
          <span>Secured with end-to-end encryption</span>
        </motion.div>
      </AuthCard>
    </AuthLayout>
  )
}
