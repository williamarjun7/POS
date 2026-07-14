/**
 * Permission Guard Components
 * ────────────────────────────
 *
 * Component-level RBAC guards. These are in a .tsx file because they
 * use JSX syntax to render children or fallback content.
 *
 * Usage:
 *   import { RequirePermission } from '@/lib/core/PermissionGuards'
 *
 *   <RequirePermission permission="users.manage">
 *     <Button>Add User</Button>
 *   </RequirePermission>
 */

import type { ReactNode } from 'react'
import { usePermissions, type Permission } from '@/lib/core/permissions'

interface RequirePermissionProps {
  permission: Permission
  fallback?: ReactNode
  children: ReactNode
}

/**
 * Component guard that only renders children when the user has the required permission.
 *
 * @example
 *   <RequirePermission permission="users.manage">
 *     <Button>Add User</Button>
 *   </RequirePermission>
 */
export function RequirePermission({ permission, fallback = null, children }: RequirePermissionProps) {
  const { can } = usePermissions()
  if (!can(permission)) return <>{fallback}</>
  return <>{children}</>
}

interface RequireAnyPermissionProps {
  permissions: Permission[]
  fallback?: ReactNode
  children: ReactNode
}

/**
 * Component guard that renders children when the user has any of the required permissions.
 *
 * @example
 *   <RequireAnyPermission permissions={['users.manage', 'settings.manage']}>
 *     <SettingsPanel />
 *   </RequireAnyPermission>
 */
export function RequireAnyPermission({ permissions, fallback = null, children }: RequireAnyPermissionProps) {
  const { hasAny } = usePermissions()
  if (!hasAny(permissions)) return <>{fallback}</>
  return <>{children}</>
}
