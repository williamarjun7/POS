import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AlertTriangle, RefreshCw, ArrowLeft, ShieldAlert } from 'lucide-react'
import { AuthLayout } from './components/AuthLayout'
import { AuthCard } from './components/AuthCard'
import { Button } from '@/components/ui/button'
import logoSrc from '@/assets/logo.png'
import type { AuthError } from './types'

const AUTH_ERRORS: Record<string, AuthError> = {
  'link-expired': {
    title: 'Link expired',
    message: 'This verification link has expired. Please request a new one to continue.',
    action: { label: 'Request new link', to: '/forgot-password' },
  },
  'invalid-code': {
    title: 'Invalid code',
    message: 'The verification code you entered is invalid. Please check and try again.',
    action: { label: 'Try again', to: '/verify-code' },
  },
  'too-many-attempts': {
    title: 'Too many attempts',
    message: 'You\'ve made too many attempts. Please wait a moment and try again.',
    action: { label: 'Try again', to: '/login' },
  },
  'network-error': {
    title: 'Network error',
    message: 'Unable to connect to the server. Please check your connection and try again.',
    action: { label: 'Retry', to: '/login' },
  },
  'maintenance': {
    title: 'Under maintenance',
    message: 'We\'re currently performing some maintenance. Please check back shortly.',
    action: { label: 'Go to login', to: '/login' },
  },
}

interface AuthErrorPageProps {
  type?: keyof typeof AUTH_ERRORS
  title?: string
  message?: string
}

export function AuthErrorPage({ type, title, message }: AuthErrorPageProps) {
  const config = type ? AUTH_ERRORS[type] : null

  const displayTitle = title || config?.title || 'Something went wrong'
  const displayMessage = message || config?.message || 'An unexpected error occurred. Please try again.'
  const action = config?.action

  return (
    <AuthLayout>
      <AuthCard className="text-center">
        {/* Business logo */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="mb-6 flex flex-col items-center"
        >
          <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/20 ring-4 ring-primary/10 overflow-hidden">
            <img
              src={logoSrc}
              alt="Highlands Cafe & Motel Inn"
              className="h-full w-full rounded-2xl object-cover"
            />
          </div>
          <p className="text-[11px] font-medium tracking-[0.15em] uppercase text-muted-foreground/60">
            Highlands Cafe & Motel Inn
          </p>
        </motion.div>

        {/* Error icon */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
          className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-destructive/10"
        >
          <motion.div
            animate={{ rotate: [0, -10, 10, -10, 0] }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            {type === 'maintenance' ? (
              <ShieldAlert className="h-10 w-10 text-destructive" />
            ) : (
              <AlertTriangle className="h-10 w-10 text-destructive" />
            )}
          </motion.div>
        </motion.div>

        {/* Title */}
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.3 }}
          className="mb-2 text-2xl font-bold text-foreground"
        >
          {displayTitle}
        </motion.h2>

        {/* Message */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.3 }}
          className="mb-8 text-sm text-muted-foreground leading-relaxed"
        >
          {displayMessage}
        </motion.p>

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.3 }}
          className="flex flex-col items-center gap-3"
        >
          {action && (
            <Link to={action.to} className="w-full">
              <Button className="w-full h-11">
                <RefreshCw className="h-4 w-4 mr-2" />
                {action.label}
              </Button>
            </Link>
          )}
          <Link to="/login" className="w-full">
            <Button variant="outline" className="w-full h-11">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to login
            </Button>
          </Link>
        </motion.div>
      </AuthCard>
    </AuthLayout>
  )
}
