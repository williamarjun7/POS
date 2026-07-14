export type AuthStep = 'idle' | 'loading' | 'success' | 'error'

export interface AuthFieldState {
  value: string
  error?: string
  touched: boolean
}

export interface LoginFormState {
  email: AuthFieldState
  password: AuthFieldState
  rememberMe: boolean
}

export interface SignupFormState {
  fullName: AuthFieldState
  email: AuthFieldState
  phone: AuthFieldState
  password: AuthFieldState
  confirmPassword: AuthFieldState
  acceptTerms: boolean
  newsletter: boolean
}

export interface ForgotPasswordFormState {
  email: AuthFieldState
}

export interface ResetPasswordFormState {
  password: AuthFieldState
  confirmPassword: AuthFieldState
}

export interface OTPState {
  digits: string[]
  error?: string
}

export type PasswordStrength = 'weak' | 'fair' | 'good' | 'strong' | 'very-strong'

export type SuccessType =
  | 'password-reset'
  | 'email-sent'
  | 'email-verified'

export interface AuthError {
  title: string
  message: string
  action?: {
    label: string
    to: string
  }
}
