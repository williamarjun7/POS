import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { AuthLayout } from '../components/AuthLayout'
import { AuthCard } from '../components/AuthCard'
import { Button } from '@/components/ui/button'
import logoSrc from '@/assets/logo.png'
import type { SuccessType } from '../types'

interface SuccessPageProps {
  type: SuccessType
}

const SUCCESS_CONFIG: Record<SuccessType, {
  icon: React.ReactNode
  title: string
  subtitle: string
  action: { label: string; to: string }
  secondaryAction?: { label: string; to: string }
}> = {
  'password-reset': {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10 text-emerald-500">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" opacity="0.3" fill="currentColor" fillOpacity="0.1" />
        <path d="M8 12l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: 'Password changed',
    subtitle: 'Your password has been reset successfully. You can now sign in with your new password.',
    action: { label: 'Sign in', to: '/login' },
  },
  'email-sent': {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10 text-primary">
        <rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" opacity="0.3" fill="currentColor" fillOpacity="0.05" />
        <path d="M22 6l-10 7L2 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M16 14h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
        <path d="M2 14h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
        <path d="M12 18v-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    title: 'Email sent',
    subtitle: 'We\'ve sent a verification code to your email. Please check your inbox and follow the instructions.',
    action: { label: 'Open email app', to: '#' },
    secondaryAction: { label: 'Enter code manually', to: '/verify-code' },
  },
  'email-verified': {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10 text-emerald-500">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" opacity="0.3" fill="currentColor" fillOpacity="0.1" />
        <path d="M8 12l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: 'Email verified',
    subtitle: 'Your email has been verified successfully. You can now continue to sign in.',
    action: { label: 'Continue to sign in', to: '/login' },
  },
}

export function SuccessPage({ type }: SuccessPageProps) {
  const config = SUCCESS_CONFIG[type]

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

        {/* Success icon */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
          className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-emerald-500/10"
        >
          {config.icon}
        </motion.div>

        {/* Animated rings */}
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: [0, 0.3, 0], scale: [1, 1.3, 1.6] }}
          transition={{ duration: 1.5, delay: 0.3, repeat: Infinity, repeatDelay: 2 }}
          className="absolute left-1/2 top-[72px] h-20 w-20 -translate-x-1/2 rounded-full border-2 border-emerald-500/30"
        />

        {/* Title */}
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.3 }}
          className="mb-2 text-2xl font-bold text-foreground"
        >
          {config.title}
        </motion.h2>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.3 }}
          className="mb-8 text-sm text-muted-foreground leading-relaxed"
        >
          {config.subtitle}
        </motion.p>

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.3 }}
          className="space-y-3"
        >
          <Link to={config.action.to}>
            <Button className="w-full h-11">
              {config.action.label}
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>

          {config.secondaryAction && (
            <Link to={config.secondaryAction.to}>
              <Button variant="outline" className="w-full h-11">
                {config.secondaryAction.label}
              </Button>
            </Link>
          )}
        </motion.div>
      </AuthCard>
    </AuthLayout>
  )
}
