import { useEffect, useCallback } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, ArrowLeft, RefreshCw, AlertCircle, Shield, CheckCircle2 } from 'lucide-react'
import { AuthLayout } from '../components/AuthLayout'
import { AuthCard } from '../components/AuthCard'
import { AuthHeader } from '../components/AuthHeader'
import { OTPInput } from '../components/OTPInput'
import { SubmitButton } from '../components/SubmitButton'
import { useOTP } from '../hooks'

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const email = searchParams.get('email') || ''
  const navigate = useNavigate()

  const {
    otp, step, error, countdown, isComplete,
    updateDigit, handlePaste, handleVerify, handleResend, setCountdown,
  } = useOTP()

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) return
    const timer = setInterval(() => {
      setCountdown((prev: number) => prev - 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [countdown, setCountdown])

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const onVerify = useCallback(() => {
    handleVerify(email)
  }, [handleVerify, email])

  const onResend = useCallback(() => {
    handleResend(email)
  }, [handleResend, email])

  // If no email in params, redirect to signup
  if (!email) {
    navigate('/signup', { replace: true })
    return null
  }

  return (
    <AuthLayout>
      <AuthCard>
        {/* Back button */}
        <Link
          to="/signup"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Change email
        </Link>

        <AuthHeader
          title="Verify your email"
          subtitle="We've sent a 6-digit verification code to your email. Enter the code below to activate your account."
        />

        {/* Email display */}
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 flex items-center justify-center gap-2 text-sm"
        >
          <div className="flex items-center gap-2 rounded-full bg-primary/5 px-4 py-2">
            <Mail className="h-4 w-4 text-primary" />
            <span className="font-medium text-foreground">{email}</span>
          </div>
        </motion.div>

        <div className="space-y-6">
          {/* Success banner */}
          <AnimatePresence>
            {step === 'success' && (
              <motion.div
                initial={{ opacity: 0, y: -8, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -8, height: 0 }}
                className="flex items-center gap-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400"
                role="alert"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>Email verified! Redirecting to login...</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error banner */}
          <AnimatePresence>
            {step === 'error' && error && (
              <motion.div
                initial={{ opacity: 0, y: -8, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -8, height: 0 }}
                className="flex items-center gap-2.5 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive"
                role="alert"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* OTP Input */}
          <OTPInput
            digits={otp.digits}
            onChange={updateDigit}
            onPaste={handlePaste}
            error={otp.error}
            disabled={step === 'loading' || step === 'success'}
          />

          {/* Resend section */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
          >
            {/* Countdown */}
            <p className="text-center text-sm text-muted-foreground">
              {countdown > 0 ? (
                <>
                  Didn't receive the code? Resend in{' '}
                  <span className="font-mono font-medium text-foreground">
                    {formatTime(countdown)}
                  </span>
                </>
              ) : (
                <button
                  onClick={onResend}
                  disabled={step === 'loading' || step === 'success'}
                  className="inline-flex items-center gap-1.5 font-medium text-primary underline-offset-4 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Resend code
                </button>
              )}
            </p>

            {/* Verify button */}
            <SubmitButton
              onClick={onVerify}
              disabled={!isComplete || step === 'success'}
              loading={step === 'loading'}
              loadingText="Verifying..."
              className="w-full"
            >
              Verify email
            </SubmitButton>
          </motion.div>
        </div>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.4 }}
          className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground/60"
        >
          <Shield className="h-3 w-3" />
          <span>The code expires in 10 minutes</span>
        </motion.div>
      </AuthCard>
    </AuthLayout>
  )
}
