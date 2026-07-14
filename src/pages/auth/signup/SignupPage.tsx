import { Link } from 'react-router-dom'
import { useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, User, AlertCircle, Check, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AuthLayout } from '../components/AuthLayout'
import { AuthCard } from '../components/AuthCard'
import { AuthHeader } from '../components/AuthHeader'
import { FormInput } from '../components/FormInput'
import { PasswordInput } from '../components/PasswordInput'
import { PasswordStrength } from '../components/PasswordStrength'
import { SubmitButton } from '../components/SubmitButton'
import { useSignupForm } from '../hooks'

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

export function SignupPage() {
  const {
    form, step, error, passwordStrength,
    updateField, toggleCheckbox, handleSubmit,
    isLocked, remainingLockSeconds, isCooldown,
  } = useSignupForm()

  const onSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    await handleSubmit()
  }, [handleSubmit])

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
          title="Create an account"
          subtitle="Fill in your details to get started with managing your business"
        />

        <motion.form
          onSubmit={onSubmit}
          noValidate
          variants={stagger.container}
          initial="initial"
          animate="animate"
          className="space-y-4"
        >
          {/* Error banner */}
          <AnimatePresence>
            {step === 'error' && (
              <motion.div
                variants={stagger.item}
                initial={{ opacity: 0, y: -8, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -8, height: 0 }}
                className="flex items-center gap-2.5 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive"
                role="alert"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error ?? 'Something went wrong. Please try again.'}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Full Name */}
          <motion.div variants={stagger.item}>
            <FormInput
              label="Full name"
              type="text"
              value={form.fullName.value}
              error={form.fullName.error}
              touched={form.fullName.touched}
              leadingIcon={<User className="h-4 w-4" />}
              onChange={(e) => updateField('fullName', e.target.value)}
              autoComplete="name"
            />
          </motion.div>

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
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Confirm Password */}
          <motion.div variants={stagger.item}>
            <PasswordInput
              label="Confirm password"
              value={form.confirmPassword.value}
              error={form.confirmPassword.error}
              touched={form.confirmPassword.touched}
              onChange={(e) => updateField('confirmPassword', e.target.value)}
              autoComplete="new-password"
            />
          </motion.div>

          {/* Terms & conditions */}
          <motion.div variants={stagger.item}>
            <label className="group flex cursor-pointer items-start gap-3 select-none">
              <div className="relative mt-0.5 shrink-0">
                <input
                  type="checkbox"
                  checked={form.acceptTerms}
                  onChange={() => toggleCheckbox('acceptTerms')}
                  className="peer sr-only"
                />
                <div
                  className={cn(
                    'flex h-5 w-5 items-center justify-center rounded-md border-2 transition-all duration-200',
                    form.acceptTerms
                      ? 'border-primary bg-primary shadow-sm shadow-primary/25'
                      : 'border-muted-foreground/30 bg-transparent group-hover:border-muted-foreground/50 group-hover:bg-muted/50'
                  )}
                >
                  <motion.div
                    initial={false}
                    animate={form.acceptTerms ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                  >
                    <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />
                  </motion.div>
                </div>
              </div>
              <span className="text-sm text-muted-foreground leading-relaxed group-hover:text-foreground transition-colors duration-200">
                I agree to the{' '}
                <span className="font-medium text-primary underline-offset-4 hover:underline cursor-pointer">Terms of Service</span>
                {' '}and{' '}
                <span className="font-medium text-primary underline-offset-4 hover:underline cursor-pointer">Privacy Policy</span>
              </span>
            </label>
          </motion.div>

          {/* Submit */}
          <motion.div variants={stagger.item}>
            <SubmitButton
              type="submit"
              loading={step === 'loading'}
              disabled={isLocked || isCooldown}
              loadingText="Creating account..."
            >
              {isLocked ? `Wait ${remainingLockSeconds}s` : 'Create account'}
            </SubmitButton>
          </motion.div>
        </motion.form>

        {/* Sign in link */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.4 }}
          className="mt-6 text-center text-sm text-muted-foreground"
        >
          Already have an account?{' '}
          <Link
            to="/login"
            className="font-medium text-primary underline-offset-4 after:absolute after:bottom-0 after:left-0 after:h-px after:w-full after:origin-right after:scale-x-0 after:bg-primary after:transition-transform after:duration-300 hover:after:origin-left hover:after:scale-x-100 relative"
          >
            Sign in
          </Link>
        </motion.p>
      </AuthCard>
    </AuthLayout>
  )
}
