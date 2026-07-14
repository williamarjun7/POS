import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, ArrowLeft, RefreshCw, AlertCircle } from 'lucide-react'
import { AuthLayout } from '../components/AuthLayout'
import { AuthCard } from '../components/AuthCard'
import { AuthHeader } from '../components/AuthHeader'
import { OTPInput } from '../components/OTPInput'
import { SubmitButton } from '../components/SubmitButton'
import { useOTP } from '../hooks'

export function VerifyCodePage() {
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

  return (
    <AuthLayout>
      <AuthCard>
        {/* Back button */}
        <Link
          to="/forgot-password"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Change email
        </Link>

        <AuthHeader
          title="Check your email"
          subtitle="We've sent a 6-digit verification code to your email. Enter the code below."
        />

        {/* Email display */}
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 flex items-center justify-center gap-2 text-sm text-muted-foreground"
        >
          <Mail className="h-4 w-4" />
          <span>user@example.com</span>
        </motion.div>

        <div className="space-y-6">
          {/* Error banner */}
          <AnimatePresence>
            {step === 'error' && error && (
              <motion.div
                initial={{ opacity: 0, y: -8, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -8, height: 0 }}
                className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive"
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
            disabled={step === 'loading'}
          />

          {/* Countdown */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center text-sm text-muted-foreground"
          >
            {countdown > 0 ? (
              <>
                Resend code in{' '}
                <span className="font-mono font-medium text-foreground">
                  {formatTime(countdown)}
                </span>
              </>
            ) : (
              <button
                onClick={handleResend}
                className="inline-flex items-center gap-1.5 font-medium text-primary underline-offset-4 hover:underline"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Resend code
              </button>
            )}
          </motion.p>

          {/* Verify button */}
          <SubmitButton
            onClick={handleVerify}
            disabled={!isComplete}
            loading={step === 'loading'}
            loadingText="Verifying..."
            className="w-full"
          >
            Verify email
          </SubmitButton>
        </div>
      </AuthCard>
    </AuthLayout>
  )
}
