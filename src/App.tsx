import { Suspense, lazy, useEffect, useState, useCallback } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { ThemeProvider } from '@/lib/core/theme-context'
import { AuthProvider, useAuth } from '@/lib/core/auth-context'
import { PrintSettingsProvider } from '@/lib/services/print-settings'
import { ToastProvider } from '@/components/ui/toast'
import { DashboardLayout } from '@/layouts/DashboardLayout'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { AuthorizedRoute } from '@/components/auth/AuthorizedRoute'
import { SplashScreen } from '@/components/SplashScreen'
import { SessionTimeoutModal } from '@/components/SessionTimeoutModal'
import { ScrollToTop } from '@/components/ScrollToTop'
import { RouteTransition } from '@/components/RouteTransition'
import { useSessionTimeout } from '@/lib/hooks/useSessionTimeout'
import { useScreenLock } from '@/lib/hooks/useScreenLock'
import { ScreenLock } from '@/components/ScreenLock'
import { hasPin as hasStoredPin } from '@/lib/services/session-store'
import { startRealtimePolling, subscribeToPostgresChanges } from '@/lib/services/realtime'
import type { SuccessType } from '@/pages/auth/types'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cache data for 30s by default — drastically reduces redundant
      // API calls on page navigation. Live data is pushed via WebSocket
      // and polling (started below), so staleTime=0 just wastes bandwidth.
      // Individual queries with more volatile data override this locally
      // (e.g. payments, pending invoices, active orders: 10-15s).
      staleTime: 30_000,
      retry: 1,
      // Don't refetch on mount if data is still fresh. The realtime
      // subscriptions + polling keep the cache warm.
      refetchOnMount: false,
      refetchOnWindowFocus: false,
    },
  },
})

const SPLASH_MIN_DURATION = 1500

const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage').then(m => ({ default: m.default })))
const POS = lazy(() => import('@/pages/POS').then(m => ({ default: m.POS })))
const Orders = lazy(() => import('@/pages/Orders').then(m => ({ default: m.Orders })))
const Customers = lazy(() => import('@/pages/Customers').then(m => ({ default: m.Customers })))
const Operations = lazy(() => import('@/pages/Operations').then(m => ({ default: m.Operations })))
const Menu = lazy(() => import('@/pages/Menu').then(m => ({ default: m.Menu })))
const Inventory = lazy(() => import('@/pages/Inventory').then(m => ({ default: m.Inventory })))
const Suppliers = lazy(() => import('@/pages/Suppliers').then(m => ({ default: m.Suppliers })))
const RoomTypesPage = lazy(() => import('@/pages/RoomTypes').then(m => ({ default: m.RoomTypes })))
const ExpensesPage = lazy(() => import('@/pages/Expenses').then(m => ({ default: m.Expenses })))
const Finance = lazy(() => import('@/pages/Finance').then(m => ({ default: m.Finance })))
const OperationalAnalytics = lazy(() => import('@/pages/OperationalAnalytics').then(m => ({ default: m.default })))
const Reports = lazy(() => import('@/pages/Reports').then(m => ({ default: m.Reports })))
const Admin = lazy(() => import('@/pages/Admin').then(m => ({ default: m.Admin })))
const PaymentRecovery = lazy(() => import('@/pages/PaymentRecovery').then(m => ({ default: m.PaymentRecovery })))
const PrintSettingsPage = lazy(() => import('@/pages/PrintSettings').then(m => ({ default: m.PrintSettingsPage })))
const Profile = lazy(() => import('@/pages/Profile').then(m => ({ default: m.Profile })))
const Billing = lazy(() => import('@/pages/Billing').then(m => ({ default: m.Billing })))
const NotFound = lazy(() => import('@/pages/NotFound').then(m => ({ default: m.NotFound })))

// Auth pages
const LoginPage = lazy(() => import('@/pages/auth/login/LoginPage').then(m => ({ default: m.LoginPage })))
const SignupPage = lazy(() => import('@/pages/auth/signup/SignupPage').then(m => ({ default: m.SignupPage })))
const ForgotPasswordPage = lazy(() => import('@/pages/auth/forgot-password/ForgotPasswordPage').then(m => ({ default: m.ForgotPasswordPage })))
const VerifyCodePage = lazy(() => import('@/pages/auth/verify-code/VerifyCodePage').then(m => ({ default: m.VerifyCodePage })))
const ResetPasswordPage = lazy(() => import('@/pages/auth/reset-password/ResetPasswordPage').then(m => ({ default: m.ResetPasswordPage })))
const AuthErrorPage = lazy(() => import('@/pages/auth/AuthErrorPage').then(m => ({ default: m.AuthErrorPage })))
const VerifyEmailPage = lazy(() => import('@/pages/auth/verify-email/VerifyEmailPage').then(m => ({ default: m.VerifyEmailPage })))

// Import success page directly for dynamic type prop (avoids broken lazy wrapper)
import { SuccessPage } from '@/pages/auth/success/SuccessPage'

function SuccessRoute({ type }: { type: SuccessType }) {
  return <SuccessPage type={type} />
}

function PageLoader() {
  return (
    <div className="p-6 space-y-4">
      <div className="h-8 w-64 rounded-md bg-muted animate-pulse" />
      <div className="h-4 w-96 rounded-md bg-muted animate-pulse" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-32 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
      <div className="h-64 w-full rounded-xl bg-muted animate-pulse mt-6" />
    </div>
  )
}

function LazyRoute({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>{children}</Suspense>
    </ErrorBoundary>
  )
}

/**
 * Inner component that lives inside AuthProvider so it can consume auth context.
 * Starts realtime polling / WebSocket subscriptions only after auth is resolved,
 * so queries never fire before the SDK has a valid JWT.
 */
function AuthAwareRealtimeSync() {
  const { isReady } = useAuth()

  useEffect(() => {
    if (!isReady) return
    const unsubWs = subscribeToPostgresChanges(queryClient)
    const unsubPoll = startRealtimePolling(queryClient)
    return () => {
      unsubWs()
      unsubPoll()
    }
  }, [isReady])

  return null
}

/**
 * Runs payment recovery on startup — finds any pending confirmed payments
 * that were interrupted by a browser crash, network timeout, or temporary
 * backend failure, and resumes processing them.
 *
 * Only runs once per browser session (guarded by sessionStorage flag).
 */
function StartupPaymentRecovery() {
  const { isReady } = useAuth()

  useEffect(() => {
    if (!isReady) return

    let cancelled = false

    const run = async () => {
      try {
        const { runStartupRecoveryOnce } = await import('@/lib/services/payment-recovery')
        if (cancelled) return
        const result = await runStartupRecoveryOnce()
        if (result && import.meta.env.DEV) {
          console.log('[STARTUP_RECOVERY]', result.summary)
        }
      } catch {
        // Non-critical — recovery failures must never break the app
      }
    }

    run()
    return () => { cancelled = true }
  }, [isReady])

  return null
}

/**
 * Inner component that lives inside AuthProvider so it can consume auth context.
 * Renders the screen lock overlay for authenticated users when idle,
 * and the session timeout modal when the session is about to expire.
 */
function AuthAwareSessionTimeout() {
  const { showWarning, timeLeft, dismissWarning, logout } = useSessionTimeout()
  const { user } = useAuth()
  const { isLocked, unlockWithPin } = useScreenLock()
  const [loggingOut, setLoggingOut] = useState(false)

  const handleLogout = useCallback(async () => {
    setLoggingOut(true)
    try {
      await logout()
    } catch {
      window.location.href = '/login'
    }
  }, [logout])

  return (
    <>
      {/* Screen lock overlay (takes priority over session timeout) */}
      {isLocked && user && hasStoredPin() && (
        <ScreenLock
          onUnlock={unlockWithPin}
          onLogout={handleLogout}
          userName={user.name}
        />
      )}
      {/* Session timeout warning (only when screen is not locked) */}
      {!isLocked && (
        <SessionTimeoutModal
          show={showWarning}
          timeLeft={timeLeft}
          onDismiss={dismissWarning}
          onLogout={handleLogout}
        />
      )}
    </>
  )
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true)

  const dismissSplash = useCallback(() => {
    setShowSplash(false)
  }, [])

  // Auto-dismiss splash after minimum duration
  useEffect(() => {
    const timer = setTimeout(dismissSplash, SPLASH_MIN_DURATION)
    return () => clearTimeout(timer)
  }, [dismissSplash])

  return (
    <QueryClientProvider client={queryClient}>
      <SplashScreen isVisible={showSplash} />
      <ThemeProvider>          <AuthProvider>
            <AuthAwareSessionTimeout />
            <AuthAwareRealtimeSync />
            <StartupPaymentRecovery />
            <PrintSettingsProvider>
            <ToastProvider>
            <BrowserRouter>
            <ScrollToTop />
            <Routes>
              {/* Auth routes (outside dashboard layout) */}
              <Route element={<RouteTransition><Outlet /></RouteTransition>}>
              <Route path="/login" element={
                <LazyRoute><LoginPage /></LazyRoute>
              } />
              <Route path="/signup" element={
                <LazyRoute><SignupPage /></LazyRoute>
              } />
              <Route path="/verify-email" element={
                <LazyRoute><VerifyEmailPage /></LazyRoute>
              } />
              <Route path="/forgot-password" element={
                <LazyRoute><ForgotPasswordPage /></LazyRoute>
              } />
              <Route path="/verify-code" element={
                <LazyRoute><VerifyCodePage /></LazyRoute>
              } />
              <Route path="/reset-password" element={
                <LazyRoute><ResetPasswordPage /></LazyRoute>
              } />
              <Route path="/password-reset-success" element={
                <LazyRoute><SuccessRoute type="password-reset" /></LazyRoute>
              } />
              <Route path="/email-sent" element={
                <LazyRoute><SuccessRoute type="email-sent" /></LazyRoute>
              } />
              <Route path="/email-verified" element={
                <LazyRoute><SuccessRoute type="email-verified" /></LazyRoute>
              } />
              <Route path="/auth-error" element={
                <LazyRoute><AuthErrorPage type="maintenance" /></LazyRoute>
              } />
              </Route>


              <Route element={<ProtectedRoute />}>
                <Route element={<DashboardLayout />}>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={
                  <LazyRoute><DashboardPage /></LazyRoute>
                } />
                <Route path="pos" element={
                  <AuthorizedRoute permission="orders.create" showAccessDenied>
                    <LazyRoute><POS /></LazyRoute>
                  </AuthorizedRoute>
                } />
                <Route path="orders" element={
                  <AuthorizedRoute permission="orders.view" showAccessDenied>
                    <LazyRoute><Orders /></LazyRoute>
                  </AuthorizedRoute>
                } />
                <Route path="customers" element={
                  <AuthorizedRoute permission="customers.view" showAccessDenied>
                    <LazyRoute><Customers /></LazyRoute>
                  </AuthorizedRoute>
                } />
                <Route path="operations" element={
                  <AuthorizedRoute permission="operations.view" showAccessDenied>
                    <LazyRoute><Operations /></LazyRoute>
                  </AuthorizedRoute>
                } />
                <Route path="menu" element={
                  <AuthorizedRoute permission="menu.view" showAccessDenied>
                    <LazyRoute><Menu /></LazyRoute>
                  </AuthorizedRoute>
                } />
                <Route path="inventory" element={
                  <AuthorizedRoute permission="inventory.view" showAccessDenied>
                    <LazyRoute><Inventory /></LazyRoute>
                  </AuthorizedRoute>
                } />
                <Route path="suppliers" element={
                  <AuthorizedRoute permission="suppliers.view" showAccessDenied>
                    <LazyRoute><Suppliers /></LazyRoute>
                  </AuthorizedRoute>
                } />
                <Route path="supplier-payments" element={<Navigate to="/suppliers" replace />} />
                <Route path="expenses" element={
                  <AuthorizedRoute permission="expenses.create" showAccessDenied>
                    <LazyRoute><ExpensesPage /></LazyRoute>
                  </AuthorizedRoute>
                } />
                <Route path="room-types" element={
                  <AuthorizedRoute permission="operations.manage" showAccessDenied>
                    <LazyRoute><RoomTypesPage /></LazyRoute>
                  </AuthorizedRoute>
                } />
                <Route path="finance" element={
                  <AuthorizedRoute permission="finance.view" showAccessDenied>
                    <LazyRoute><Finance /></LazyRoute>
                  </AuthorizedRoute>
                } />
                <Route path="analytics" element={
                  <AuthorizedRoute permission="reports.view" showAccessDenied>
                    <LazyRoute><OperationalAnalytics /></LazyRoute>
                  </AuthorizedRoute>
                } />
                <Route path="reports" element={
                  <AuthorizedRoute permission="reports.view" showAccessDenied>
                    <LazyRoute><Reports /></LazyRoute>
                  </AuthorizedRoute>
                } />
                <Route path="admin" element={
                  <AuthorizedRoute permission="users.manage" showAccessDenied>
                    <LazyRoute><Admin /></LazyRoute>
                  </AuthorizedRoute>
                } />
                <Route path="payment-recovery" element={
                  <AuthorizedRoute permission="finance.manage" showAccessDenied>
                    <LazyRoute><PaymentRecovery /></LazyRoute>
                  </AuthorizedRoute>
                } />
                <Route path="print-settings" element={
                  <AuthorizedRoute permission="print.manage" showAccessDenied>
                    <LazyRoute><PrintSettingsPage /></LazyRoute>
                  </AuthorizedRoute>
                } />
                <Route path="profile" element={
                  <LazyRoute><Profile /></LazyRoute>
                } />
                <Route path="billing/:id" element={
                  <AuthorizedRoute permission="orders.view" showAccessDenied>
                    <LazyRoute><Billing /></LazyRoute>
                  </AuthorizedRoute>
                } />
                <Route path="*" element={
                  <LazyRoute><NotFound /></LazyRoute>
                } />
              </Route>
              </Route>
            </Routes>
          </BrowserRouter>            </ToastProvider>
            </PrintSettingsProvider>
          </AuthProvider>
    </ThemeProvider>
    </QueryClientProvider>
  )
}
