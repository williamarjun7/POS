import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/core/auth-context'
import { resetPassword as resetPasswordService, verifyEmail as verifyEmailService, resendVerificationEmail as resendService } from '@/lib/services/auth-service'
import { useRateLimit } from '@/lib/hooks/useRateLimit'
import type {
  LoginFormState,
  SignupFormState,
  ForgotPasswordFormState,
  ResetPasswordFormState,
  OTPState,
  PasswordStrength,
} from './types'

/* ── Validation helpers ── */

function validateEmail(email: string): string | undefined {
  if (!email) return 'Email is required'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Invalid email address'
  return undefined
}

function validatePassword(password: string): string | undefined {
  if (!password) return 'Password is required'
  if (password.length < 8) return 'Must be at least 8 characters'
  if (!/[A-Z]/.test(password)) return 'Must contain an uppercase letter'
  if (!/[a-z]/.test(password)) return 'Must contain a lowercase letter'
  if (!/[0-9]/.test(password)) return 'Must contain a number'
  return undefined
}

function validateRequired(value: string, label: string): string | undefined {
  if (!value.trim()) return `${label} is required`
  return undefined
}

function getPasswordStrength(password: string): PasswordStrength {
  let score = 0
  if (password.length >= 8) score++
  if (password.length >= 12) score++
  if (/[A-Z]/.test(password)) score++
  if (/[a-z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++
  if (score <= 2) return 'weak'
  if (score === 3) return 'fair'
  if (score === 4) return 'good'
  if (score === 5) return 'strong'
  return 'very-strong'
}

export function useLoginForm() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const { checkLimit, isLocked, remainingLockSeconds, isCooldown, remainingCooldownSeconds } = useRateLimit({ cooldownMs: 1500, maxAttempts: 5 })
  const [form, setForm] = useState<LoginFormState>({
    email: { value: '', touched: false },
    password: { value: '', touched: false },
    rememberMe: false,
  })
  const [step, setStep] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState<string | undefined>()
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | undefined>()

  const updateField = useCallback((field: 'email' | 'password', value: string) => {
    setForm(prev => ({
      ...prev,
      [field]: { value, touched: true, error: undefined },
    }))
    setError(undefined)
    setUnverifiedEmail(undefined)
  }, [])

  const validate = useCallback((): boolean => {
    const emailError = validateEmail(form.email.value)
    const passwordError = validateRequired(form.password.value, 'Password')
    setForm(prev => ({
      ...prev,
      email: { ...prev.email, error: emailError },
      password: { ...prev.password, error: passwordError },
    }))
    return !emailError && !passwordError
  }, [form])

  const handleSubmit = useCallback(async () => {
    if (!validate()) return
    if (!checkLimit()) {
      if (isLocked) {
        setError(`Too many attempts. Please try again in ${remainingLockSeconds} seconds.`)
      }
      return
    }
    setStep('loading')
    setError(undefined)
    setUnverifiedEmail(undefined)

    try {
      const { emailVerified } = await login(form.email.value, form.password.value)
      if (!emailVerified) {
        setError('Please verify your email before signing in.')
        setUnverifiedEmail(form.email.value)
        setStep('error')
        return
      }
      navigate('/dashboard')
    } catch (err: any) {
      setError(err?.message ?? 'Invalid email or password. Please try again.')
      setStep('error')
    }
  }, [validate, checkLimit, isLocked, remainingLockSeconds, login, form.email.value, form.password.value, navigate])

  const touchAll = useCallback(() => {
    setForm(prev => ({
      ...prev,
      email: { ...prev.email, touched: true, error: validateEmail(prev.email.value) },
      password: { ...prev.password, touched: true, error: validateRequired(prev.password.value, 'Password') },
    }))
  }, [])

  return { form, step, error, unverifiedEmail, setUnverifiedEmail, updateField, handleSubmit, validate, touchAll, setStep, setError, isLocked, remainingLockSeconds, isCooldown, remainingCooldownSeconds }
}

export function useSignupForm() {
  const navigate = useNavigate()
  const { signup } = useAuth()
  const { checkLimit, isLocked, remainingLockSeconds, isCooldown, remainingCooldownSeconds } = useRateLimit({ cooldownMs: 2000, maxAttempts: 3 })
  const [form, setForm] = useState<SignupFormState>({
    fullName: { value: '', touched: false },
    email: { value: '', touched: false },
    phone: { value: '', touched: false },
    password: { value: '', touched: false },
    confirmPassword: { value: '', touched: false },
    acceptTerms: false,
    newsletter: false,
  })
  const [step, setStep] = useState<'idle' | 'loading' | 'error' | 'success'>('idle')
  const [error, setError] = useState<string | undefined>()

  const updateField = useCallback((field: 'fullName' | 'email' | 'phone' | 'password' | 'confirmPassword', value: string) => {
    setForm(prev => ({
      ...prev,
      [field]: { value, touched: true, error: undefined },
    }))
    setError(undefined)
  }, [])

  const toggleCheckbox = useCallback((field: 'acceptTerms' | 'newsletter') => {
    setForm(prev => ({ ...prev, [field]: !prev[field] }))
  }, [])

  const validate = useCallback((): boolean => {
    const nameError = validateRequired(form.fullName.value, 'Full name')
    const emailError = validateEmail(form.email.value)
    const passwordError = validatePassword(form.password.value)
    const confirmError = form.password.value !== form.confirmPassword.value
      ? 'Passwords do not match'
      : undefined
    const termsError = !form.acceptTerms ? 'You must accept the terms' : undefined

    setForm(prev => ({
      ...prev,
      fullName: { ...prev.fullName, error: nameError },
      email: { ...prev.email, error: emailError },
      password: { ...prev.password, error: passwordError },
      confirmPassword: { ...prev.confirmPassword, error: confirmError },
    }))

    return !nameError && !emailError && !passwordError && !confirmError && !termsError
  }, [form])

  const handleSubmit = useCallback(async () => {
    if (!validate()) return
    if (!checkLimit()) {
      if (isLocked) {
        setError(`Too many attempts. Please try again in ${remainingLockSeconds} seconds.`)
      }
      return
    }
    setStep('loading')
    setError(undefined)

    try {
      await signup(form.email.value, form.password.value, form.fullName.value)
      setStep('success')
      navigate(`/verify-email?email=${encodeURIComponent(form.email.value)}`)
    } catch (err: any) {
      setError(err?.message ?? 'Something went wrong. Please try again.')
      setStep('error')
    }
  }, [validate, checkLimit, isLocked, remainingLockSeconds, signup, form.email.value, form.password.value, form.fullName.value, navigate])

  const passwordStrength = getPasswordStrength(form.password.value)

  return { form, step, error, passwordStrength, updateField, toggleCheckbox, handleSubmit, validate, setStep, isLocked, remainingLockSeconds, isCooldown, remainingCooldownSeconds }
}

export function useForgotPasswordForm() {
  const navigate = useNavigate()
  const { sendResetEmail } = useAuth()
  const { checkLimit, isLocked, remainingLockSeconds, isCooldown, remainingCooldownSeconds } = useRateLimit({ cooldownMs: 3000, maxAttempts: 3 })
  const [form, setForm] = useState<ForgotPasswordFormState>({
    email: { value: '', touched: false },
  })
  const [step, setStep] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [error, setError] = useState<string | undefined>()

  const updateEmail = useCallback((value: string) => {
    setForm({ email: { value, touched: true, error: undefined } })
    setError(undefined)
  }, [])

  const validate = useCallback((): boolean => {
    const error = validateEmail(form.email.value)
    setForm(prev => ({ email: { ...prev.email, error } }))
    return !error
  }, [form.email.value])

  const handleSubmit = useCallback(async () => {
    if (!validate()) return
    if (!checkLimit()) {
      if (isLocked) {
        setError(`Too many attempts. Please try again in ${remainingLockSeconds} seconds.`)
      }
      return
    }
    setStep('loading')
    setError(undefined)

    try {
      await sendResetEmail(form.email.value)
      setStep('success')
      navigate('/email-sent')
    } catch (err: any) {
      setError(err?.message ?? 'No account found with this email address.')
      setStep('error')
    }
  }, [validate, checkLimit, isLocked, remainingLockSeconds, sendResetEmail, form.email.value, navigate])

  return { form, step, error, updateEmail, handleSubmit, validate, isLocked, remainingLockSeconds, isCooldown, remainingCooldownSeconds }
}

export function useResetPasswordForm() {
  const navigate = useNavigate()
  const [form, setForm] = useState<ResetPasswordFormState>({
    password: { value: '', touched: false },
    confirmPassword: { value: '', touched: false },
  })
  const [step, setStep] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [error, setError] = useState<string | undefined>()

  const { checkLimit, isLocked, remainingLockSeconds, isCooldown, remainingCooldownSeconds } = useRateLimit({ cooldownMs: 2000, maxAttempts: 3 })

  const updateField = useCallback((field: 'password' | 'confirmPassword', value: string) => {
    setForm(prev => ({
      ...prev,
      [field]: { value, touched: true, error: undefined },
    }))
    setError(undefined)
  }, [])

  const validate = useCallback((): boolean => {
    const passwordError = validatePassword(form.password.value)
    const confirmError = form.password.value !== form.confirmPassword.value
      ? 'Passwords do not match'
      : undefined
    setForm(prev => ({
      ...prev,
      password: { ...prev.password, error: passwordError },
      confirmPassword: { ...prev.confirmPassword, error: confirmError },
    }))
    return !passwordError && !confirmError
  }, [form])

  const handleSubmit = useCallback(async () => {
    if (!validate()) return
    if (!checkLimit()) {
      if (isLocked) {
        setError(`Too many attempts. Please try again in ${remainingLockSeconds} seconds.`)
      }
      return
    }
    setStep('loading')
    setError(undefined)

    try {
      const { error } = await resetPasswordService(form.password.value)
      if (error) throw error
      setStep('success')
      navigate('/password-reset-success')
    } catch (err: any) {
      setError(err?.message ?? 'Failed to reset password. Please try again.')
      setStep('error')
    }
  }, [validate, checkLimit, isLocked, remainingLockSeconds, form.password.value, navigate])

  const passwordStrength = getPasswordStrength(form.password.value)

  return { form, step, error, passwordStrength, updateField, handleSubmit, validate, isLocked, remainingLockSeconds, isCooldown, remainingCooldownSeconds, setStep }
}

export function useOTP() {
  const [otp, setOtp] = useState<OTPState>({ digits: ['', '', '', '', '', ''] })
  const [step, setStep] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [countdown, setCountdown] = useState(60)
  const navigate = useNavigate()
  const [error, setError] = useState<string | undefined>()

  const updateDigit = useCallback((index: number, value: string) => {
    if (!/^\d?$/.test(value)) return
    setOtp(prev => {
      const digits = [...prev.digits]
      digits[index] = value
      return { digits, error: undefined }
    })
    setError(undefined)
  }, [])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (text.length === 6) {
      setOtp({ digits: text.split(''), error: undefined })
    }
  }, [])

  const isComplete = otp.digits.every(d => d !== '')
  const otpValue = otp.digits.join('')

  const handleVerify = useCallback(async (email?: string) => {
    if (!isComplete) {
      setOtp(prev => ({ ...prev, error: 'Please enter all 6 digits' }))
      return
    }
    setStep('loading')
    setError(undefined)

    try {
      const { error } = await verifyEmailService(email ?? '', otpValue)
      if (error) throw error
      setStep('success')
      // Show success briefly before navigating
      setTimeout(() => {
        if (email) {
          navigate('/login')
        } else {
          navigate('/email-verified')
        }
      }, 1500)
    } catch (err: any) {
      setError(err?.message ?? 'Invalid verification code. Please try again.')
      setStep('error')
    }
  }, [isComplete, otpValue, navigate])

  const handleResend = useCallback(async (email?: string) => {
    try {
      if (email) {
        await resendService(email)
      }
      setCountdown(60)
      setOtp({ digits: ['', '', '', '', '', ''] })
      setStep('idle')
      setError(undefined)
    } catch {
      // Silently fail - prevents user enumeration
    }
  }, [])

  return { otp, step, error, countdown, isComplete, otpValue, updateDigit, handlePaste, handleVerify, handleResend, setCountdown, setStep }
}
