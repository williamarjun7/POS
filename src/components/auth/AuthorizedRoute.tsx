/**
 * AuthorizedRoute — Route-level permission guard
 * ──────────────────────────────────────────────
 *
 * Wraps individual dashboard routes to enforce permission-based access.
 * Renders a meaningful "Access Denied" fallback instead of redirecting,
 * so users know they lack permission rather than getting a confusing redirect.
 *
 * Usage in App.tsx:
 *   <Route path="admin" element={
 *     <AuthorizedRoute permission="users.manage" redirectTo="/dashboard">
 *       <LazyRoute><Admin /></LazyRoute>
 *     </AuthorizedRoute>
 *   } />
 *
 * The ProtectedRoute (above this in the tree) already ensures the user
 * is authenticated. This component adds the authorization layer.
 */

import { Navigate } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { usePermissions, type Permission } from '@/lib/core/permissions'

interface AuthorizedRouteProps {
  permission: Permission
  children: React.ReactNode
  /** Where to redirect if the user lacks permission. Defaults to "/dashboard". */
  redirectTo?: string
  /** Show an inline "Access Denied" message instead of redirecting. */
  showAccessDenied?: boolean
}

export function AuthorizedRoute({
  permission,
  children,
  redirectTo = '/dashboard',
  showAccessDenied = false,
}: AuthorizedRouteProps) {
  const { can } = usePermissions()

  if (can(permission)) {
    return <>{children}</>
  }

  // Option A: show Access Denied inline (better UX — explains what happened)
  if (showAccessDenied) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-destructive/10">
          <ShieldAlert className="h-8 w-8 text-destructive" />
        </div>
        <h2 className="text-xl font-bold text-foreground">Access Denied</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          You don't have the required permissions to access this page.
          Please contact an administrator if you believe this is an error.
        </p>
        <a
          href={redirectTo}
          className="mt-2 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Go to Dashboard
        </a>
      </div>
    )
  }

  // Option B: redirect to dashboard
  return <Navigate to={redirectTo} replace />
}
