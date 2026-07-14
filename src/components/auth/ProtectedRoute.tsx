import { Navigate, Outlet } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Loader2, MailQuestion } from 'lucide-react'
import { useAuth } from '@/lib/core/auth-context'

export function ProtectedRoute() {
  const { user, isAuthenticated, isLoading } = useAuth()

  // Show a centered loading spinner while auth is being resolved
  if (isLoading) {
    return (
      <motion.div
        className="flex h-screen w-screen items-center justify-center bg-background"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Signing in...</p>
        </div>
      </motion.div>
    )
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  // Block unverified users from accessing the app
  if (user && !user.emailVerified) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="mx-auto max-w-md text-center px-4">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-xl bg-primary/5">
            <MailQuestion className="h-8 w-8 text-primary" />
          </div>
          <h2 className="mb-2 text-2xl font-bold text-foreground">Verify your email</h2>
          <p className="mb-6 text-sm text-muted-foreground leading-relaxed">
            Please verify your email address before accessing the dashboard.
            Check your inbox for a verification code.
          </p>
          <a
            href={`/verify-email?email=${encodeURIComponent(user.email)}`}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-gradient-to-r from-primary to-primary/90 px-6 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all duration-200"
          >
            Go to verification
          </a>
        </div>
      </div>
    )
  }

  // Render child dashboard routes
  return <Outlet />
}
