import { useState, useMemo, useEffect } from "react"
import { motion } from "framer-motion"
import {
  Shield, Edit, Trash2, Plus, Activity, Clock, Building2,
} from "lucide-react"
import { PageTransition } from "@/components/ui/PageTransition"
import { PageHeader } from "@/components/PageHeader"
import { StatusBadge } from "@/components/StatusBadge"
import { DataTable, type Column } from "@/components/DataTable"
import { Icon } from "@/components/icon-mapper"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { BaseModal } from "@/components/ui/modal"
import { FormInput, FormSelect, FormTextarea, FormActions, FormToggle } from "@/components/ui/form-field"
import { Button } from "@/components/ui/button"
import { StatCard, SectionCard } from "@/components/ui/stat-card"
import { Tabs } from "@/components/Tabs"
import { EmptyState } from "@/components/EmptyState"
import { cn, formatCurrency } from "@/lib/utils"
import { showSuccess, showError } from "@/components/ui/toast"
import { RequirePermission } from "@/lib/core/PermissionGuards"
import { usePrintSettings } from "@/lib/services/print-settings"
import { useBusinessSettings } from "@/lib/services/business-settings"
import { useBranches } from "@/lib/services/branch-service"
import { useUserProfiles } from '@/lib/services/user-profile-service'
import { useActivityLogs, logActivitySafe } from '@/lib/services/activity-log-service'
import { fetchPaymentsFromDb } from '@/lib/services/payment-service'
import type { Branch } from "@/lib/services/branch-service"
import type { User, UserRole } from "@/types"
import { insforge, signUp } from "@/lib/services/auth-service"
import type { FeatureFlagRow } from "@/lib/db/types"
import { pageTransitionFast, staggerContainer } from "@/lib/animations/presets"

// --- Types ---

interface ActivityLog {
  id: string
  timestamp: string
  user: string
  action: string
  details: string
  ip: string
}

interface RoleInfo {
  name: UserRole
  label: string
  permissions: number
}

interface ReceiptSettings {
  header: string
  footer: string
  showTaxBreakdown: boolean
  showCashierName: boolean
}

interface FeatureFlag {
  id: string
  name: string
  description: string
  enabled: boolean
}

// --- Role Definitions ---

const initialRoles: RoleInfo[] = [
  { name: "admin", label: "Admin", permissions: 0 },
  { name: "manager", label: "Manager", permissions: 0 },
  { name: "cashier", label: "Cashier", permissions: 0 },
  { name: "waiter", label: "Waiter", permissions: 0 },
  { name: "housekeeper", label: "Housekeeper", permissions: 0 },
  { name: "receptionist", label: "Receptionist", permissions: 0 },
]

const initialReceiptSettings: ReceiptSettings = {
  header: "Himalayan Restaurant & Suites",
  footer: "Thank you for dining with us!",
  showTaxBreakdown: true,
  showCashierName: true,
}

// --- Variant Maps ---

const roleVariant: Record<UserRole, "default" | "success" | "warning" | "destructive" | "info" | "secondary"> = {
  admin: "destructive", manager: "info", cashier: "success", waiter: "warning", housekeeper: "secondary", receptionist: "default",
}

const allRoles: UserRole[] = ["admin", "manager", "cashier", "waiter", "housekeeper", "receptionist"]

// --- Animation Variants ---

// Using pageTransitionFast, staggerContainer, cardEntry, tableRow from presets

// --- User Form Modal ---

function UserFormModal({ open, user, onSave, onClose }: { open: boolean; user?: User | null; onSave: (data: Partial<User> & { password?: string }) => void; onClose: () => void }) {
  const [name, setName] = useState(user?.name ?? "")
  const [email, setEmail] = useState(user?.email ?? "")
  const [phone, setPhone] = useState(user?.phone ?? "")
  const [role, setRole] = useState<UserRole>(user?.role ?? "waiter")
  const [active, setActive] = useState(user?.active ?? true)
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !email.trim()) return showError("Name and email are required")
    
    // For new users, password is required
    if (!user && !password.trim()) return showError("Password is required for new users")
    if (!user && password !== confirmPassword) return showError("Passwords do not match")
    if (!user && password.length < 6) return showError("Password must be at least 6 characters")
    
    onSave({ name: name.trim(), email: email.trim(), phone: phone.trim(), role, active, password: user ? undefined : password })
  }

  return (
    <BaseModal open={open} onClose={onClose} title={user ? "Edit User" : "Add User"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormInput label="Full Name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="John Doe" />
        <FormInput label="Email" required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="john@pos.com" />
        <FormInput label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+977-9841234567" />
        <FormSelect label="Role" value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
          {allRoles.map((r) => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
        </FormSelect>
        {!user && (
          <>
            <FormInput label="Password" required type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 6 characters" />
            <FormInput label="Confirm Password" required type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter password" />
          </>
        )}
        <FormToggle label="Active" checked={active} onChange={setActive} />
        <FormActions>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit">{user ? "Save Changes" : "Add User"}</Button>
        </FormActions>
      </form>
    </BaseModal>
  )
}

// --- Branch Form Modal ---

function BranchFormModal({ open, branch, onSave, onClose }: { open: boolean; branch?: Branch | null; onSave: (data: Omit<Branch, "id">) => void; onClose: () => void }) {
  const [name, setName] = useState(branch?.name ?? "")
  const [address, setAddress] = useState(branch?.address ?? "")
  const [phone, setPhone] = useState(branch?.phone ?? "")
  const [manager, setManager] = useState(branch?.manager ?? "")
  const [active, setActive] = useState(branch?.active ?? true)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return showError("Branch name is required")
    onSave({ name: name.trim(), address: address.trim(), phone: phone.trim(), manager: manager.trim(), active })
  }

  return (
    <BaseModal open={open} onClose={onClose} title={branch ? "Edit Branch" : "Add Branch"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormInput label="Branch Name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Main Branch" />
        <FormInput label="Address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Thamel, Kathmandu" />
        <FormInput label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+977-1-4445678" />
        <FormInput label="Manager" value={manager} onChange={(e) => setManager(e.target.value)} placeholder="Manager name" />
        <FormToggle label="Active" checked={active} onChange={setActive} />
        <FormActions>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit">{branch ? "Save Changes" : "Add Branch"}</Button>
        </FormActions>
      </form>
    </BaseModal>
  )
}

// --- Main Admin Component ---

export function Admin() {
  const [activeTab, setActiveTab] = useState("overview")

  // User profiles via service hook
  const { profiles, addProfile, updateProfile, deleteProfile, toggleActive } = useUserProfiles()
  const { logs: activityLogRecords } = useActivityLogs(50)

  // Derive users from profiles (map UserProfile → User)
  const users: User[] = useMemo(() => profiles.map(p => ({
    id: p.id,
    name: p.name,
    email: p.email,
    role: p.role,
    phone: p.phone,
    active: p.active,
    lastLogin: p.lastLogin ? formatAdminTimestamp(p.lastLogin) : '-',
  })), [profiles])

  // Derive activity logs from activityLogRecords
  const activityLogs = useMemo(() => activityLogRecords.map(a => ({
    id: a.id,
    timestamp: formatAdminTimestamp(a.createdAt),
    user: a.userName,
    action: a.activityType,
    details: a.details || a.status || '-',
    ip: a.ipAddress || '-',
  })), [activityLogRecords])

  const [userForm, setUserForm] = useState<{ open: boolean; edit?: User | null }>({ open: false })
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null)

  // Branches state
  const { branches, isLoading: isBranchesLoading, loadError: branchesError, isSaving: isBranchSaving, addBranch, editBranch, removeBranch, refresh: refreshBranches } = useBranches()
  const [branchForm, setBranchForm] = useState<{ open: boolean; edit?: Branch | null }>({ open: false })
  const [deleteBranchId, setDeleteBranchId] = useState<string | null>(null)

  // Business settings (DB-backed)
  const {
    settings: bizSettings,
    update: updateBizSettings,
    save: saveBizSettings,
    isSaving: isBizSaving,
    isLoading: isBizLoading,
  } = useBusinessSettings()

  // Local edit form state for business info
  const [editBusiness, setEditBusiness] = useState(false)
  const [editBizData, setEditBizData] = useState({
    name: bizSettings.name,
    address: bizSettings.address,
    phone: bizSettings.phone,
    email: bizSettings.email,
    taxId: bizSettings.taxId,
  })

  // Sync edit form fields when DB data loads
  useEffect(() => {
    setEditBizData({
      name: bizSettings.name,
      address: bizSettings.address,
      phone: bizSettings.phone,
      email: bizSettings.email,
      taxId: bizSettings.taxId,
    })
  }, [bizSettings.name, bizSettings.address, bizSettings.phone, bizSettings.email, bizSettings.taxId])

  // Receipt settings state (Admin-specific fields only; shared print settings come from PrintSettingsProvider)
  const [receiptSettings, setReceiptSettings] = useState<ReceiptSettings>(initialReceiptSettings)
  const { settings: printSettings, update: updatePrintSettings } = usePrintSettings()

  const [logFilter, setLogFilter] = useState("all")

  // Roles state (computed from users)
  const [roles] = useState<RoleInfo[]>(initialRoles)

  // DB-backed states
  const [featureFlags, setFeatureFlags] = useState<FeatureFlag[]>([])
  const [totalInvoices, setTotalInvoices] = useState(0)
  const [totalPayments, setTotalPayments] = useState(0)
  const [totalRevenue, setTotalRevenue] = useState(0)
  const [paymentMethods, setPaymentMethods] = useState<{ id: string; name: string; enabled: boolean; icon: string }[]>([])
  const [dbConnected, setDbConnected] = useState(true)
  const [_adminLoading, setAdminLoading] = useState(true)

  // --- Computed ---

  const activeUsers = useMemo(() => users.filter((u) => u.active).length, [users])

  const roleUserCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    users.forEach((u) => { counts[u.role] = (counts[u.role] || 0) + 1 })
    return counts
  }, [users])

  const uniqueLogActions = useMemo(() => {
    const actions = new Set(activityLogs.map((l) => l.action))
    return Array.from(actions)
  }, [activityLogs])

  const filteredLogs = useMemo(() => {
    if (logFilter === "all") return activityLogs
    return activityLogs.filter((l) => l.action === logFilter)
  }, [activityLogs, logFilter])

  // ─── Helper: format timestamp ───────────────────────────────
  function formatAdminTimestamp(iso: string): string {
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHrs = Math.floor(diffMins / 60)
    if (diffHrs < 24) return `${diffHrs}h ago`
    const diffDays = Math.floor(diffHrs / 24)
    if (diffDays < 7) return `${diffDays}d ago`
    return d.toLocaleDateString()
  }

// ─── Load DB data on mount ──────────────────────────────────
  useEffect(() => {
    const loadAdminData = async () => {
      try {
        const [flagsRes, invoicesRes, payments] = await Promise.all([
          insforge.database.from('feature_flags').select('*'),
          insforge.database.from('invoices').select('id, status, total'),
          fetchPaymentsFromDb(),
        ])

        if (flagsRes.data) {
          setFeatureFlags(flagsRes.data.map((f: FeatureFlagRow) => ({ id: f.id, name: f.name, description: f.description, enabled: f.enabled })))
        }

        if (invoicesRes.data) {
          setTotalInvoices(invoicesRes.data.length)
        }

        if (payments) {
          setTotalPayments(payments.length)
          setTotalRevenue(payments.reduce((sum: number, p) => sum + p.amount, 0))
          // Derive payment methods from actual payment data
          const methods: string[] = [...new Set(payments.map(p => p.paymentMethod))]
          setPaymentMethods(methods.map((m: string, i: number) => ({
            id: `pm-${i}`,
            name: m.charAt(0).toUpperCase() + m.slice(1).replace(/_/g, ' '),
            enabled: true,
            icon: 'CreditCard',
          })))
        }

        setDbConnected(true)
      } catch {
        setDbConnected(false)
      } finally {
        setAdminLoading(false)
      }
    }
    loadAdminData()
  }, [])

  // --- User CRUD (auth + user_profiles) ---

  const handleSaveUser = async (data: Partial<User> & { password?: string }) => {
    try {
      if (userForm.edit) {
        // Update existing user profile only (auth credentials handled via reset)
        await updateProfile(userForm.edit.id, {
          name: data.name,
          email: data.email,
          phone: data.phone,
          role: data.role,
          active: data.active,
        })
        showSuccess("User updated successfully")
      } else {
        // Step 1: Create auth account via InsForge Auth
        const password = data.password
        if (!password) return showError("Password is required")

        const authResult = await signUp(data.email!, password, data.name)
        if (authResult.error) {
          showError(authResult.error.message || 'Failed to create auth account')
          return
        }

        // Step 2: Create user profile in database
        const newProfile = await addProfile({
          name: data.name!,
          email: data.email!,
          phone: data.phone,
          role: data.role || 'waiter',
          active: data.active ?? true,
        })

        // Step 3: Log activity (non-critical)
        logActivitySafe({
          activityType: 'user_created',
          entityId: newProfile.id,
          entityLabel: `User ${data.name}`,
          details: `Created ${data.role} account for ${data.name} (${data.email})`,
        })

        showSuccess("User account created successfully")
      }
      setUserForm({ open: false })
    } catch {
      showError("Failed to save user. Check your connection.")
    }
  }

  const handleDeleteUser = async () => {
    if (!deleteUserId) return
    try {
      await deleteProfile(deleteUserId)
      showSuccess("User deleted")
    } catch {
      showError("Failed to delete user. Check your connection.")
    } finally {
      setDeleteUserId(null)
    }
  }

  const toggleUserActive = async (id: string) => {
    try {
      await toggleActive(id)
    } catch {
      showError('Failed to update user status')
    }
  }

  // --- Branch CRUD ---

  const handleSaveBranch = async (data: Omit<Branch, "id">) => {
    try {
      if (branchForm.edit) {
        await editBranch(branchForm.edit.id, data)
        showSuccess("Branch updated")
      } else {
        await addBranch(data)
        showSuccess("Branch added")
      }
      setBranchForm({ open: false })
    } catch {
      showError("Failed to save branch. Check your connection.")
    }
  }

  const handleDeleteBranch = async () => {
    if (!deleteBranchId) return
    try {
      await removeBranch(deleteBranchId)
      showSuccess("Branch deleted")
    } catch {
      showError("Failed to delete branch. Check your connection.")
    } finally {
      setDeleteBranchId(null)
    }
  }

  // --- Settings ---

  const handleSaveBusiness = async () => {
    updateBizSettings(editBizData)
    setEditBusiness(false)
    try {
      await saveBizSettings()
      showSuccess("Business settings saved")
    } catch {
      showError("Failed to save business settings")
    }
  }

  const handleSaveTax = async () => {
    try {
      await saveBizSettings()
      showSuccess("Tax settings saved")
    } catch {
      showError("Failed to save tax settings")
    }
  }



  const toggleFeatureFlag = async (id: string) => {
    const flag = featureFlags.find(f => f.id === id)
    if (!flag) return
    const newEnabled = !flag.enabled
    // Optimistic update
    setFeatureFlags((prev) => prev.map((f) => (f.id === id ? { ...f, enabled: newEnabled } : f)))
    const { error } = await insforge.database
      .from('feature_flags')
      .update({ enabled: newEnabled })
      .eq('id', id)
    if (error) {
      // Revert on failure
      setFeatureFlags((prev) => prev.map((f) => (f.id === id ? { ...f, enabled: !newEnabled } : f)))
      showError('Failed to update feature flag')
    } else {
      showSuccess(`${flag.name} ${newEnabled ? 'enabled' : 'disabled'}`)
    }
  }

  // --- Tabs ---

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "users", label: "Users", count: users.length },
    { id: "roles", label: "Roles" },
    { id: "branches", label: "Branches", count: branches.length },
    { id: "settings", label: "Settings" },
    { id: "audit", label: "Audit Logs" },
    { id: "health", label: "System Health" },
  ]

  // --- User Columns ---

  const userColumns: Column<User>[] = [
    { key: "name", header: "Name", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "email", header: "Email" },
    { key: "role", header: "Role", render: (r) => <StatusBadge label={r.role} variant={roleVariant[r.role]} /> },
    { key: "phone", header: "Phone" },
    { key: "active", header: "Status", render: (r) => (
      <button onClick={() => toggleUserActive(r.id)} className="transition-opacity hover:opacity-80">
        {r.active ? <StatusBadge label="Active" variant="success" /> : <StatusBadge label="Inactive" variant="default" />}
      </button>
    )},
    { key: "lastLogin", header: "Last Login" },
    { key: "actions", header: "", render: (r) => (
      <div className="flex gap-1">
        <RequirePermission permission="users.manage">
          <button onClick={() => setUserForm({ open: true, edit: r })} className="rounded-lg p-1.5 hover:bg-muted"><Edit className="h-4 w-4 text-muted-foreground" /></button>
        </RequirePermission>
        <RequirePermission permission="users.manage">
          <button onClick={() => setDeleteUserId(r.id)} className="rounded-lg p-1.5 hover:bg-muted"><Trash2 className="h-4 w-4 text-destructive" /></button>
        </RequirePermission>
      </div>
    )},
  ]

  // --- Activity Log Columns ---

  const logColumns: Column<ActivityLog>[] = [
    { key: "timestamp", header: "Time", render: (r) => <span className="font-mono text-xs">{r.timestamp}</span> },
    { key: "user", header: "User", render: (r) => <span className="font-medium">{r.user}</span> },
    { key: "action", header: "Action", render: (r) => <StatusBadge label={r.action.replace(/_/g, " ")} variant="secondary" /> },
    { key: "details", header: "Details" },
    { key: "ip", header: "IP Address", render: (r) => <span className="font-mono text-xs">{r.ip}</span> },
  ]

  // --- Render ---

  return (
    <PageTransition>
      <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="space-y-4">
        <motion.div variants={pageTransitionFast}>
          <PageHeader icon="Settings" title="Administration" description="Manage users, branches, settings, and system configuration" />
        </motion.div>

        <motion.div variants={pageTransitionFast}>
          <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
        </motion.div>

        {/* ===== OVERVIEW TAB ===== */}
        {activeTab === "overview" && (
          <motion.div variants={pageTransitionFast} className="space-y-4">
            <motion.div 
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
              initial="hidden"
              animate="show"
              variants={{ show: { transition: { staggerChildren: 0.08 } } }}
            >
              <motion.div variants={pageTransitionFast} whileHover={{ y: -3, scale: 1.02 }}>
                <StatCard label="Total Users" value={users.length} icon="Users" color="text-blue-500" index={0} />
              </motion.div>
              <motion.div variants={pageTransitionFast} whileHover={{ y: -3, scale: 1.02 }}>
                <StatCard label="Active Users" value={activeUsers} icon="CheckCircle" color="text-green-500" index={1} />
              </motion.div>
              <motion.div variants={pageTransitionFast} whileHover={{ y: -3, scale: 1.02 }}>
                <StatCard label="Branches" value={branches.length} icon="Building2" color="text-purple-500" index={2} />
              </motion.div>
              <motion.div variants={pageTransitionFast} whileHover={{ y: -3, scale: 1.02 }}>
                <StatCard
                  label="System Status"
                  value={dbConnected ? "Healthy" : "Issues"}
                  icon="Server"
                  color={dbConnected ? "text-green-500" : "text-red-500"}
                  index={3}
                />
              </motion.div>
            </motion.div>

            <div className="grid gap-6 lg:grid-cols-2">
              <SectionCard title="Recent Activity" icon="Activity" index={4}>
                <div className="space-y-3">
                  {activityLogs.slice(0, 5).map((log, idx) => (
                    <motion.div 
                      key={log.id} 
                      className="flex items-start gap-3 rounded-lg border border-border p-3 backdrop-blur-sm"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      whileHover={{ x: 3 }}
                    >
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <motion.div
                          animate={{ rotate: [0, 10, -10, 0] }}
                          transition={{ duration: 2, repeat: Infinity, delay: idx * 0.2 }}
                        >
                          <Activity className="h-4 w-4 text-muted-foreground" />
                        </motion.div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{log.user}</span>
                          <StatusBadge label={log.action.replace(/_/g, " ")} variant="secondary" />
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">{log.details}</p>
                        <p className="mt-0.5 font-mono text-xs text-muted-foreground/70">{log.timestamp}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </SectionCard>

              <SectionCard title="Quick Status" icon="CheckCircle" index={5}>
                <div className="space-y-3">
                  {[
                    { label: "Database", value: dbConnected ? "Connected" : "Error", detail: dbConnected ? "Query successful" : "Connection failed", ok: dbConnected },
                    { label: "Total Invoices", value: String(totalInvoices), detail: `Across all statuses`, ok: true },
                    { label: "Total Payments", value: String(totalPayments), detail: `${formatCurrency(totalRevenue)} total revenue`, ok: true },
                    { label: "Feature Flags", value: String(featureFlags.length), detail: `${featureFlags.filter(f => f.enabled).length} enabled`, ok: true },
                    { label: "Activity Logs", value: String(activityLogs.length), detail: "Recent entries", ok: true },
                  ].map((item, idx) => (
                    <motion.div 
                      key={item.label} 
                      className="flex items-center justify-between rounded-lg border border-border p-3 backdrop-blur-sm"
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      whileHover={{ x: -3 }}
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">{item.label}</p>
                        <p className="text-xs text-muted-foreground">{item.detail}</p>
                      </div>
                      <StatusBadge label={item.value} variant={item.ok ? "success" : "destructive"} />
                    </motion.div>
                  ))}
                </div>
              </SectionCard>
            </div>
          </motion.div>
        )}

        {/* ===== USERS TAB ===== */}
        {activeTab === "users" && (
          <motion.div variants={pageTransitionFast}>
            <div className="mb-4 flex justify-end">
              <RequirePermission permission="users.manage">
                <button onClick={() => setUserForm({ open: true })} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                  <Plus className="h-4 w-4" /> Add User
                </button>
              </RequirePermission>
            </div>
            {users.length === 0 ? (
              <EmptyState icon="Users" title="No users" description="Add your first user to get started" />
            ) : (
              <DataTable columns={userColumns} data={users} searchable searchKey="name" />
            )}
          </motion.div>
        )}

        {/* ===== ROLES TAB ===== */}
        {activeTab === "roles" && (
          <motion.div variants={pageTransitionFast} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {roles.map((role, idx) => (
              <motion.div 
                key={role.name} 
                custom={idx} 
                variants={pageTransitionFast} 
                className="rounded-xl border border-border bg-card/70 backdrop-blur-sm p-5"
                whileHover={{ y: -3, transition: { duration: 0.15 } }}
              >
                <div className="mb-3 flex items-center gap-3">
                  <motion.div 
                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10"
                    animate={{ rotate: [0, 5, -5, 0] }}
                    transition={{ duration: 3, repeat: Infinity, delay: idx * 0.2 }}
                  >
                    <Shield className="h-5 w-5 text-primary" />
                  </motion.div>
                  <div>
                    <StatusBadge label={role.label} variant={roleVariant[role.name]} />
                    <p className="text-xs text-muted-foreground mt-1">{roleUserCounts[role.name] ?? 0} user{(roleUserCounts[role.name] ?? 0) !== 1 ? "s" : ""}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2">
                  <span className="text-xs text-muted-foreground">Permissions</span>
                  <span className="text-sm font-semibold text-foreground">{role.permissions}</span>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* ===== BRANCHES TAB ===== */}
        {activeTab === "branches" && (
          <motion.div variants={pageTransitionFast}>
            <div className="mb-4 flex justify-end">
              <button onClick={() => setBranchForm({ open: true })} disabled={isBranchSaving} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                <Plus className="h-4 w-4" /> Add Branch
              </button>
            </div>
            {isBranchesLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            ) : branchesError ? (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <p className="text-muted-foreground">{branchesError}</p>
                <button onClick={refreshBranches} className="rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">Retry</button>
              </div>
            ) : branches.length === 0 ? (
              <EmptyState icon="Building2" title="No branches" description="Add your first branch to get started" />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {branches.map((branch, idx) => (
                  <motion.div key={branch.id} custom={idx} variants={pageTransitionFast} className="rounded-xl border border-border bg-card p-5">
                    <div className="mb-3 flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                          <Building2 className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-foreground">{branch.name}</h4>
                          <p className="text-xs text-muted-foreground">{branch.address}</p>
                        </div>
                      </div>
                      <StatusBadge label={branch.active ? "Active" : "Inactive"} variant={branch.active ? "success" : "default"} />
                    </div>
                    <div className="mb-3 space-y-1">
                      <p className="text-xs text-muted-foreground">Phone: <span className="text-foreground">{branch.phone || "—"}</span></p>
                      <p className="text-xs text-muted-foreground">Manager: <span className="text-foreground">{branch.manager || "—"}</span></p>
                    </div>
                    <div className="flex gap-2">
                      <RequirePermission permission="branches.manage">
                        <button onClick={() => setBranchForm({ open: true, edit: branch })} disabled={isBranchSaving} className="flex-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50">Edit</button>
                      </RequirePermission>
                      <RequirePermission permission="branches.manage">
                        <button onClick={() => setDeleteBranchId(branch.id)} disabled={isBranchSaving} className="rounded-lg border border-destructive/30 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50">Delete</button>
                      </RequirePermission>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* ===== SETTINGS TAB ===== */}
        {activeTab === "settings" && (
          <motion.div variants={pageTransitionFast} className="space-y-6">
            {/* Business Information */}
            <SectionCard title="Business Information" icon="Building2" index={0}>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-muted-foreground">Manage your business details</p>
                <button onClick={() => { setEditBizData({ name: bizSettings.name, address: bizSettings.address, phone: bizSettings.phone, email: bizSettings.email, taxId: bizSettings.taxId }); setEditBusiness(!editBusiness) }} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">
                  {editBusiness ? "Cancel" : "Edit"}
                </button>
              </div>
              {isBizLoading ? (
                <div className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Loading settings…
                </div>
              ) : editBusiness ? (
                <div className="space-y-4 max-w-lg">
                  {Object.entries(editBizData).map(([key, val]) => (
                    <FormInput
                      key={key}
                      label={key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())}
                      value={val}
                      onChange={(e) => setEditBizData((prev) => ({ ...prev, [key]: e.target.value }))}
                    />
                  ))}
                  <button onClick={handleSaveBusiness} disabled={isBizSaving} className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                    {isBizSaving ? "Saving…" : "Save Changes"}
                  </button>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Business Name</p>
                    <p className="text-sm font-medium text-foreground">{bizSettings.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Address</p>
                    <p className="text-sm font-medium text-foreground">{bizSettings.address}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Phone</p>
                    <p className="text-sm font-medium text-foreground">{bizSettings.phone}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="text-sm font-medium text-foreground">{bizSettings.email}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Tax ID</p>
                    <p className="text-sm font-medium text-foreground">{bizSettings.taxId}</p>
                  </div>
                </div>
              )}
            </SectionCard>

            {/* Tax Settings */}
            <SectionCard title="Tax Settings" icon="FileText" index={1}>
              <div className="max-w-lg space-y-4">
                {isBizLoading ? (
                  <div className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Loading settings…
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <FormInput label="VAT Rate (%)" type="number" value={String(bizSettings.vatRate)} onChange={(e) => updateBizSettings({ vatRate: Number(e.target.value) })} />
                      <FormInput label="Service Charge (%)" type="number" value={String(bizSettings.serviceCharge)} onChange={(e) => updateBizSettings({ serviceCharge: Number(e.target.value) })} />
                    </div>
                    <FormToggle label="Tax Inclusive Pricing" description="Include tax in displayed prices" checked={bizSettings.taxInclusive} onChange={(v) => updateBizSettings({ taxInclusive: v })} />
                    <FormToggle label="Apply VAT on Room Service" checked={bizSettings.applyVatRoomService} onChange={(v) => updateBizSettings({ applyVatRoomService: v })} />
                    <FormSelect label="Apply Service Charge" value={bizSettings.applyServiceCharge} onChange={(e) => updateBizSettings({ applyServiceCharge: e.target.value as any })}>
                      <option value="all">All orders</option>
                      <option value="dine-in only">Dine-in only</option>
                      <option value="disabled">Disabled</option>
                    </FormSelect>
                    <button onClick={handleSaveTax} disabled={isBizSaving} className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                      {isBizSaving ? "Saving…" : "Save Tax Settings"}
                    </button>
                  </>
                )}
              </div>
            </SectionCard>

            {/* Payment Methods */}
            <SectionCard title="Payment Methods" icon="CreditCard" index={2}>
              <div className="space-y-3">
                {paymentMethods.map((method) => (
                  <div key={method.id} className="flex items-center justify-between rounded-xl border border-border p-4">
                    <div className="flex items-center gap-3">
                      <Icon name={method.icon} className="h-5 w-5 text-muted-foreground" />
                      <span className="text-sm font-medium text-foreground">{method.name}</span>
                    </div>
                    <StatusBadge label="Active" variant="success" />
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* Receipt Settings */}
            <SectionCard title="Receipt Settings" icon="FileText" index={3}>
              <div className="max-w-lg space-y-4">
                <FormInput label="Header Text" value={receiptSettings.header} onChange={(e) => setReceiptSettings((prev) => ({ ...prev, header: e.target.value }))} />
                <FormTextarea label="Footer Text" value={receiptSettings.footer} onChange={(e) => setReceiptSettings((prev) => ({ ...prev, footer: e.target.value }))} rows={2} />
                <FormSelect label="Paper Size" value={printSettings.paperSize} onChange={(e) => updatePrintSettings({ paperSize: e.target.value as any })}>
                  <option value="58mm">58mm (Thermal)</option>
                  <option value="80mm">80mm (Thermal)</option>
                  <option value="A4">A4</option>
                </FormSelect>
                <FormInput label="Print Copies" type="number" value={String(printSettings.printCopies)} onChange={(e) => updatePrintSettings({ printCopies: Number(e.target.value) })} />
                <FormToggle label="Show Logo" checked={printSettings.showLogo} onChange={(v) => updatePrintSettings({ showLogo: v })} />
                <FormToggle label="Show Tax Breakdown" checked={receiptSettings.showTaxBreakdown} onChange={(v) => setReceiptSettings((prev) => ({ ...prev, showTaxBreakdown: v }))} />
                <FormToggle label="Show Cashier Name" checked={receiptSettings.showCashierName} onChange={(v) => setReceiptSettings((prev) => ({ ...prev, showCashierName: v }))} />
                <FormToggle label="Auto-print Receipts" checked={printSettings.autoPrint} onChange={(v) => updatePrintSettings({ autoPrint: v })} />
                <button onClick={() => showSuccess("Receipt settings saved")} className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Save Receipt Settings</button>
              </div>
            </SectionCard>
          </motion.div>
        )}

        {/* ===== AUDIT LOGS TAB ===== */}
        {activeTab === "audit" && (
          <motion.div variants={pageTransitionFast} className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{filteredLogs.length} log entries</span>
              </div>
              <FormSelect
                label=""
                value={logFilter}
                onChange={(e) => setLogFilter(e.target.value)}
                className="w-48 h-9"
              >
                <option value="all">All Actions</option>
                {uniqueLogActions.map((action) => (
                  <option key={action} value={action}>{action.replace(/_/g, " ")}</option>
                ))}
              </FormSelect>
            </div>
            {filteredLogs.length === 0 ? (
              <EmptyState icon="Activity" title="No logs" description="No activity logs match your filter" />
            ) : (
              <DataTable columns={logColumns} data={filteredLogs} />
            )}
          </motion.div>
        )}

        {/* ===== SYSTEM HEALTH TAB ===== */}
        {activeTab === "health" && (
          <motion.div variants={pageTransitionFast} className="space-y-6">
            <motion.div 
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
              initial="hidden"
              animate="show"
              variants={{ show: { transition: { staggerChildren: 0.08 } } }}
            >
              <motion.div variants={pageTransitionFast} whileHover={{ y: -3, scale: 1.02 }} className="backdrop-blur-sm">
                <StatCard
                  label="Database"
                  value={dbConnected ? "Connected" : "Error"}
                  icon="Database"
                  color={dbConnected ? "text-green-500" : "text-red-500"}
                  index={0}
                />
              </motion.div>
              <motion.div variants={pageTransitionFast} whileHover={{ y: -3, scale: 1.02 }} className="backdrop-blur-sm">
                <StatCard label="Invoices" value={String(totalInvoices)} icon="Receipt" color="text-blue-500" index={1} />
              </motion.div>
              <motion.div variants={pageTransitionFast} whileHover={{ y: -3, scale: 1.02 }} className="backdrop-blur-sm">
                <StatCard label="Payments" value={String(totalPayments)} icon="DollarSign" color="text-purple-500" index={2} />
              </motion.div>
              <motion.div variants={pageTransitionFast} whileHover={{ y: -3, scale: 1.02 }} className="backdrop-blur-sm">
                <StatCard label="Flags Active" value={`${featureFlags.filter(f => f.enabled).length}/${featureFlags.length}`} icon="Settings" color="text-orange-500" index={3} />
              </motion.div>
            </motion.div>

            <div className="grid gap-6 lg:grid-cols-2">
              <SectionCard title="Feature Flags" icon="Settings" index={4}>
                <div className="space-y-3">
                  {featureFlags.map((flag, idx) => (
                    <motion.div
                      key={flag.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      whileHover={{ x: 3 }}
                    >
                      <FormToggle
                        label={flag.name}
                        description={flag.description}
                        checked={flag.enabled}
                        onChange={() => toggleFeatureFlag(flag.id)}
                      />
                    </motion.div>
                  ))}
                </div>
              </SectionCard>

              <SectionCard title="System Metrics" icon="BarChart3" index={5}>
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <motion.div 
                      className="rounded-xl border border-border p-4 backdrop-blur-sm"
                      whileHover={{ scale: 1.02 }}
                    >
                      <p className="text-xs text-muted-foreground">Total Revenue</p>
                      <p className="mt-1 text-sm font-bold text-foreground">{formatCurrency(totalRevenue)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">From {totalPayments} payments</p>
                    </motion.div>
                    <motion.div 
                      className="rounded-xl border border-border p-4 backdrop-blur-sm"
                      whileHover={{ scale: 1.02 }}
                    >
                      <p className="text-xs text-muted-foreground">Total Invoices</p>
                      <p className="mt-1 text-sm font-bold text-foreground">{totalInvoices}</p>
                      <div className="mt-1">
                        <StatusBadge label={dbConnected ? "DB Connected" : "DB Error"} variant={dbConnected ? "success" : "destructive"} />
                      </div>
                    </motion.div>
                  </div>
                  <motion.div 
                    className="rounded-xl border border-border p-4 backdrop-blur-sm"
                    whileHover={{ scale: 1.01 }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-foreground">Active Feature Flags</span>
                      <span className="text-sm text-muted-foreground">{featureFlags.filter(f => f.enabled).length} / {featureFlags.length}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <motion.div
                        className={cn("h-full rounded-full shadow-sm", "bg-primary")}
                        initial={{ width: 0 }}
                        animate={{ width: featureFlags.length > 0 ? `${(featureFlags.filter(f => f.enabled).length / featureFlags.length) * 100}%` : '0%' }}
                        transition={{ duration: 1, ease: 'easeOut' }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">Feature flag adoption rate</p>
                  </motion.div>
                </div>
              </SectionCard>
            </div>
          </motion.div>
        )}

        {/* ===== Modals & Dialogs ===== */}
        <UserFormModal open={userForm.open} user={userForm.edit} onSave={handleSaveUser} onClose={() => setUserForm({ open: false })} />
        <BranchFormModal open={branchForm.open} branch={branchForm.edit} onSave={handleSaveBranch} onClose={() => setBranchForm({ open: false })} />
        <ConfirmDialog open={!!deleteUserId} onConfirm={handleDeleteUser} onCancel={() => setDeleteUserId(null)} title="Delete User" message="Are you sure you want to delete this user? This action cannot be undone." confirmLabel="Delete" variant="danger" />
        <ConfirmDialog open={!!deleteBranchId} onConfirm={handleDeleteBranch} onCancel={() => setDeleteBranchId(null)} title="Delete Branch" message="Are you sure you want to delete this branch? This action cannot be undone." confirmLabel="Delete" variant="danger" />
      </motion.div>
    </PageTransition>
  )
}
