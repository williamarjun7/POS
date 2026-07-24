/**
 * Centralized Role-Based Access Control (RBAC)
 * ──────────────────────────────────────────────
 *
 * Single source of truth for all permission checks across the application.
 *
 * Usage:
 *   import { usePermissions } from '@/lib/core/permissions'
 *
 *   const { can, role } = usePermissions()
 *   if (can('users.manage')) { ... }
 *   if (role === 'admin') { ... }
 *
 * Components:
 *   <RequirePermission permission="users.manage">
 *     <AdminPanel />
 *   </RequirePermission>
 */

import { useAuth } from '@/lib/core/auth-context'

// ─── Role Definitions ──────────────────────────────────────────

/**
 * All supported roles in the system.
 * Maps to user_profiles.role in the database.
 *
 * NOTE: Current DB roles are: admin, manager, cashier, waiter, housekeeper, receptionist.
 * The `super_admin` and `viewer` roles are future extensions.
 * For now `super_admin` maps to `admin`, and `viewer` is available for future use.
 */
export type AppRole =
  | 'super_admin'  // Full system access (maps to DB role: admin)
  | 'admin'        // Business administration (users, settings, branches)
  | 'manager'      // Operational management (finance, reports, inventory)
  | 'cashier'      // POS operations (orders, payments, receipts)
  | 'housekeeping' // Housekeeping operations only
  | 'receptionist' // Front desk (bookings, rooms, customers)
  | 'owner'        // Read-only oversight (dashboard, customers, finance)
  | 'viewer'       // Read-only access (future)

// ─── Permission Keys ───────────────────────────────────────────

/**
 * Every permission in the system.
 * Dot-notation keys: <domain>.<action>
 *
 * Domains: users, branches, settings, finance, inventory, orders,
 *          menu, customers, suppliers, reports, operations,
 *          bookings, housekeeping, profile
 *
 * Actions: manage, view, create, edit, delete, approve, export
 */
export type Permission =
  // ── Administration ──
  | 'users.manage'       // Create/edit/delete users + manage roles
  | 'users.view'         // View user list
  | 'branches.manage'    // Create/edit/delete branches
  | 'branches.view'      // View branches
  | 'settings.manage'    // Business settings, tax, print settings, feature flags
  | 'settings.view'      // View settings

  // ── Finance ──
  | 'finance.manage'     // Full finance access (invoices, expenses, reconciliations)
  | 'finance.view'       // View finance overview
  | 'finance.export'     // Export financial reports
  | 'expenses.manage'    // Create/edit/delete expenses
  | 'expenses.create'    // Create expenses only
  | 'reconciliation.create' // Create cash reconciliations

  // ── POS / Orders ──
  | 'orders.create'      // Create orders at POS
  | 'orders.manage'      // Manage all orders (cancel, modify)
  | 'orders.view'        // View order history
  | 'payments.receive'   // Receive payments
  | 'payments.refund'    // Process refunds
  | 'payments.void'      // Void items before payment
  | 'payments.view'      // View payment history

  // ── Inventory ──
  | 'inventory.manage'   // Full inventory CRUD
  | 'inventory.view'     // View inventory
  | 'inventory.adjust'   // Adjust stock levels

  // ── Menu ──
  | 'menu.manage'        // Full menu CRUD
  | 'menu.view'          // View menu (for POS)

  // ── Customers ──
  | 'customers.manage'   // Full customer CRUD
  | 'customers.view'     // View customers
  | 'customers.credit'   // Manage credit accounts

  // ── Suppliers ──
  | 'suppliers.manage'   // Full supplier CRUD
  | 'suppliers.view'     // View suppliers
  | 'purchase_orders.manage' // Full PO CRUD
  | 'purchase_orders.create' // Create POs

  // ── Reports ──
  | 'reports.view'       // View reports
  | 'reports.export'     // Export reports

  // ── Operations ──
  | 'operations.manage'  // Full operations (rooms, tables, housekeeping, maintenance)
  | 'operations.view'    // View operations

  // ── Bookings ──
  | 'bookings.manage'    // Full booking CRUD
  | 'bookings.create'    // Create bookings
  | 'bookings.cancel'    // Cancel bookings

  // ── Housekeeping ──
  | 'housekeeping.manage' // Full housekeeping CRUD
  | 'housekeeping.view'   // View tasks

  // ── Print ──
  | 'print.manage'       // Manage print settings
  | 'print.execute'      // Execute print jobs

  // ── Profile ──
  | 'profile.view'       // View own profile
  | 'profile.edit'       // Edit own profile

// ─── Role → Permission Mapping ────────────────────────────────

/**
 * Maps each role to the set of permissions they have.
 * Uses `const` assertion so TypeScript can narrow types.
 */
const ROLE_PERMISSIONS: Record<AppRole, readonly Permission[]> = {
  super_admin: [
    'users.manage', 'users.view', 'branches.manage', 'branches.view',
    'settings.manage', 'settings.view',
    'finance.manage', 'finance.view', 'finance.export',
    'expenses.manage', 'expenses.create', 'reconciliation.create',
    'orders.create', 'orders.manage', 'orders.view',
    'payments.receive', 'payments.refund', 'payments.void', 'payments.view',
    'inventory.manage', 'inventory.view', 'inventory.adjust',
    'menu.manage', 'menu.view',
    'customers.manage', 'customers.view', 'customers.credit',
    'suppliers.manage', 'suppliers.view',
    'purchase_orders.manage', 'purchase_orders.create',
    'reports.view', 'reports.export',
    'operations.manage', 'operations.view',
    'bookings.manage', 'bookings.create', 'bookings.cancel',
    'housekeeping.manage', 'housekeeping.view',    'print.manage', 'print.execute',
    'profile.view', 'profile.edit',
  ],
  admin: [
    'users.manage', 'users.view', 'branches.manage', 'branches.view',
    'settings.manage', 'settings.view',
    'finance.manage', 'finance.view', 'finance.export',
    'expenses.manage', 'expenses.create', 'reconciliation.create',
    'orders.create', 'orders.manage', 'orders.view',
    'payments.receive', 'payments.refund', 'payments.void', 'payments.view',
    'inventory.manage', 'inventory.view', 'inventory.adjust',
    'menu.manage', 'menu.view',
    'customers.manage', 'customers.view', 'customers.credit',
    'suppliers.manage', 'suppliers.view',
    'purchase_orders.manage', 'purchase_orders.create',
    'reports.view', 'reports.export',
    'operations.manage', 'operations.view',
    'bookings.manage', 'bookings.create', 'bookings.cancel',
    'housekeeping.manage', 'housekeeping.view',
    'print.manage', 'print.execute',
    'profile.view', 'profile.edit',
  ],
  manager: [
    'users.view',
    'settings.view',
    'finance.manage', 'finance.view', 'finance.export',
    'expenses.manage', 'expenses.create', 'reconciliation.create',
    'orders.create', 'orders.manage', 'orders.view',
    'payments.receive', 'payments.view',
    'inventory.manage', 'inventory.view', 'inventory.adjust',
    'menu.manage', 'menu.view',
    'customers.manage', 'customers.view', 'customers.credit',
    'suppliers.manage', 'suppliers.view',
    'purchase_orders.manage', 'purchase_orders.create',
    'reports.view', 'reports.export',
    'operations.manage', 'operations.view',
    'bookings.manage', 'bookings.create', 'bookings.cancel',
    'housekeeping.view',
    'print.manage', 'print.execute',
    'profile.view', 'profile.edit',
  ],
  cashier: [
    'orders.create', 'orders.view',
    'payments.receive', 'payments.view',
    'customers.view',
    'menu.view',
    'inventory.view',
    'expenses.create', 'expenses.manage',
    'finance.view',
    'print.execute',
    'profile.view', 'profile.edit',
  ],
  housekeeping: [
    'housekeeping.manage', 'housekeeping.view',
    'operations.view',
    'profile.view', 'profile.edit',
  ],
  receptionist: [
    'bookings.manage', 'bookings.create', 'bookings.cancel',
    'customers.manage', 'customers.view',
    'operations.view',
    'profile.view', 'profile.edit',
    'menu.view',
  ],
  owner: [
    'customers.view',
    'finance.view',
    'menu.view',
    'profile.view', 'profile.edit',
  ],
  viewer: [
    'users.view',
    'settings.view',
    'finance.view',
    'orders.view',
    'inventory.view',
    'menu.view',
    'customers.view',
    'suppliers.view',
    'reports.view',
    'operations.view',
    'housekeeping.view',
    'profile.view',
  ],
}

// ─── Map DB role to AppRole ────────────────────────────────────

/**
 * Maps database role values to AppRole values.
 * This handles the difference between DB roles and application roles.
 */
const DB_ROLE_TO_APP_ROLE: Record<string, AppRole> = {
  admin: 'admin',
  manager: 'manager',
  cashier: 'cashier',
  waiter: 'cashier',       // Waiters have cashier-level access
  housekeeper: 'housekeeping',
  receptionist: 'receptionist',
  owner: 'owner',
}

/**
 * Convert a database role string to an AppRole.
 * Falls back to 'viewer' for unknown roles.
 */
export function dbRoleToAppRole(dbRole: string): AppRole {
  return DB_ROLE_TO_APP_ROLE[dbRole] ?? 'viewer'
}

// ─── Permission Check Functions ───────────────────────────────

/**
 * Check if a role has a specific permission.
 * Pure function — no React dependency.
 */
export function roleHasPermission(role: AppRole, permission: Permission): boolean {
  const permissions = ROLE_PERMISSIONS[role]
  if (!permissions) return false
  return permissions.includes(permission)
}

/**
 * Check if a role has any of the given permissions.
 */
export function roleHasAnyPermission(role: AppRole, permissions: Permission[]): boolean {
  return permissions.some((p) => roleHasPermission(role, p))
}

/**
 * Check if a role has all of the given permissions.
 */
export function roleHasAllPermissions(role: AppRole, permissions: Permission[]): boolean {
  return permissions.every((p) => roleHasPermission(role, p))
}

/**
 * Get all permissions for a role.
 */
export function getRolePermissions(role: AppRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? []
}

/**
 * Get the app role from the auth context with graceful fallback.
 */
export function resolveAppRole(dbRole?: string | null): AppRole {
  if (!dbRole) return 'viewer'
  return dbRoleToAppRole(dbRole)
}

// ─── Permission Levels ────────────────────────────────────────

/**
 * Permission level for a specific domain.
 * Useful for conditionally rendering UI based on access level.
 */
export type PermissionLevel = 'none' | 'view' | 'manage'

/**
 * Get the permission level for a domain.
 * This is helpful for features that span multiple permissions.
 */
export function getDomainLevel(
  role: AppRole,
  viewPermission: Permission,
  managePermission: Permission,
): PermissionLevel {
  if (roleHasPermission(role, managePermission)) return 'manage'
  if (roleHasPermission(role, viewPermission)) return 'view'
  return 'none'
}

// ─── React Hooks ──────────────────────────────────────────────

/**
 * React hook that provides permission checking for the current user.
 *
 * @example
 *   const { can, role, level, hasAny, hasAll } = usePermissions()
 *   if (can('users.manage')) return <AdminPanel />
 *   if (level('finance') === 'manage') return <FinanceSettings />
 */
export function usePermissions() {
  const { user } = useAuth()
  const role: AppRole = resolveAppRole(user?.role)

  return {
    /** Current user's application role */
    role,
    /** Current user's raw DB role */
    dbRole: user?.role ?? 'viewer',
    /** Check if the user has a specific permission */
    can: (permission: Permission): boolean => roleHasPermission(role, permission),
    /** Check if the user has any of the given permissions */
    hasAny: (permissions: Permission[]): boolean => roleHasAnyPermission(role, permissions),
    /** Check if the user has all of the given permissions */
    hasAll: (permissions: Permission[]): boolean => roleHasAllPermissions(role, permissions),
    /** Get permission level for a domain */
    level: (viewPermission: Permission, managePermission: Permission): PermissionLevel =>
      getDomainLevel(role, viewPermission, managePermission),
    /** Whether the user is authenticated */
    isAuthenticated: !!user,
  }
}

// Component guards (RequirePermission, RequireAnyPermission) are
// exported from '@/lib/core/PermissionGuards' (separate .tsx file)
// to avoid JSX syntax in a .ts file.
