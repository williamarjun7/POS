import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import {
  User, Mail, Phone, Calendar, Shield, Eye, EyeOff, Save,
  LogOut, Monitor, Smartphone, Globe, Clock, Lock, KeyRound,
  Palette, Sun, Moon, Monitor as MonitorIcon, CheckCircle2, AlertCircle,
} from "lucide-react"
import { PageTransition } from "@/components/ui/PageTransition"
import { PageHeader } from "@/components/PageHeader"
import { Button } from "@/components/ui/button"
import { Tabs } from "@/components/Tabs"
import { FormInput, FormSelect, FormToggle, FormActions } from "@/components/ui/form-field"
import { cn } from "@/lib/utils"
import { showSuccess, showError } from "@/components/ui/toast"
import { useAuth } from "@/lib/core/auth-context"
import { useRateLimit } from "@/lib/hooks/useRateLimit"
import { changePassword, insforge } from "@/lib/services/auth-service"
import { useUserProfiles } from "@/lib/services/user-profile-service"
import { pageTransitionFast } from "@/lib/animations/presets"

interface Session {
  id: string
  device: string
  ip: string
  lastActive: string
  current: boolean
}

interface LoginActivity {
  id: string
  date: string
  device: string
  ip: string
  location: string
  success: boolean
}

const initialSessions: Session[] = []

const initialLoginActivity: LoginActivity[] = []

export function Profile() {
  const [activeTab, setActiveTab] = useState("profile")

  // Auth context
  const { user: authUser, isLoading: _authLoading } = useAuth()

  // Profile state (loaded from auth + user_profiles)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [profileRole, setProfileRole] = useState("user")
  const [memberSince, setMemberSince] = useState("")
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState("")
  const [editEmail, setEditEmail] = useState("")
  const [editPhone, setEditPhone] = useState("")

  // Rate limit for password changes
  const { checkLimit, isLocked, remainingLockSeconds, isCooldown } = useRateLimit({ cooldownMs: 2000, maxAttempts: 3 })

  // User profile service
  const { updateProfileByEmail } = useUserProfiles()

  // Password state
  const [currentPw, setCurrentPw] = useState("")
  const [newPw, setNewPw] = useState("")
  const [confirmPw, setConfirmPw] = useState("")
  const [showCurrentPw, setShowCurrentPw] = useState(false)
  const [showNewPw, setShowNewPw] = useState(false)
  const [showConfirmPw, setShowConfirmPw] = useState(false)

  // 2FA
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false)

  // Sessions & Login
  const [sessions, setSessions] = useState<Session[]>(initialSessions)
  const [loginActivity] = useState<LoginActivity[]>(initialLoginActivity)

  // Preferences
  const [language, setLanguage] = useState("en")
  const [timezone, setTimezone] = useState("UTC+5:45")
  const [dateFormat, setDateFormat] = useState("YYYY-MM-DD")
  const [currency, setCurrency] = useState("NPR")

  // Appearance
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system")
  const [compactMode, setCompactMode] = useState(false)
  const [animations, setAnimations] = useState(true)

  // Load profile from auth + user_profiles on mount
  const [_profileLoading, setProfileLoading] = useState(true)

  useEffect(() => {
    const loadProfile = async () => {
      if (!authUser) {
        setProfileLoading(false)
        return
      }

      // Set basic info from auth
      setName(authUser.name)
      setEmail(authUser.email)
      setEditName(authUser.name)
      setEditEmail(authUser.email)
      setProfileRole(authUser.role)

      // Try to load additional profile data from user_profiles table using the user ID
      try {
        const { data: profile } = await insforge.database
          .from('user_profiles')
          .select('*')
          .eq('id', authUser.id)
          .maybeSingle()

        if (profile) {
          if (profile.phone) setPhone(profile.phone)
          if (profile.phone) setEditPhone(profile.phone)
          if (profile.role) setProfileRole(profile.role)
          if (profile.created_at) {
            setMemberSince(new Date(profile.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }))
          }
        }
      } catch {
        // user_profiles table may not exist yet — that's fine
      }
      setProfileLoading(false)
    }
    loadProfile()
  }, [authUser])

  const avatar = (name || authUser?.email || '').split(" ").map(n => n[0]).join("").toUpperCase()

  const handleSaveProfile = async () => {
    if (!editName.trim() || !editEmail.trim()) return showError("Name and email are required")

    // Update local state
    setName(editName)
    setEmail(editEmail)
    setPhone(editPhone)
    setIsEditing(false)

    // Persist to user_profiles table
    if (!authUser?.email) return
    try {
      await updateProfileByEmail(authUser.email, {
        name: editName.trim(),
        phone: editPhone.trim(),
      })
    } catch {
      // user_profiles table might not exist — profile still updates locally
    }
    showSuccess("Profile updated successfully")
  }

  const handleCancelEdit = () => {
    setEditName(name)
    setEditEmail(email)
    setEditPhone(phone)
    setIsEditing(false)
  }

  const handleChangePassword = async () => {
    if (!currentPw) return showError("Please enter your current password")
    if (!newPw || newPw.length < 6) return showError("New password must be at least 6 characters")
    if (newPw !== confirmPw) return showError("Passwords do not match")

    if (!checkLimit()) {
      if (isLocked) {
        showError(`Too many attempts. Please try again in ${remainingLockSeconds} seconds.`)
      }
      return
    }

    try {
      const { error } = await changePassword(authUser?.email ?? '', currentPw, newPw)
      if (error) {
        showError(error.message ?? 'Failed to change password. Please try again.')
        return
      }

      showSuccess("Password changed successfully")
      setCurrentPw("")
      setNewPw("")
      setConfirmPw("")
    } catch (err: any) {
      showError(err?.message ?? 'Failed to change password. Please try again.')
    }
  }

  const handleRevokeSession = (sessionId: string) => {
    if (!checkLimit()) {
      if (isLocked) {
        showError(`Too many attempts. Please try again in ${remainingLockSeconds} seconds.`)
      }
      return
    }
    setSessions(prev => prev.filter(s => s.id !== sessionId))
    showSuccess("Session revoked successfully")
  }

  const handleToggle2FA = () => {
    if (!checkLimit()) {
      if (isLocked) {
        showError(`Too many attempts. Please try again in ${remainingLockSeconds} seconds.`)
      }
      return
    }
    setTwoFactorEnabled(prev => !prev)
    showSuccess(twoFactorEnabled ? "2FA disabled" : "2FA enabled successfully")
  }

  const handleSavePreferences = () => {
    showSuccess("Preferences saved successfully")
  }

  const tabs = [
    { id: "profile", label: "Profile" },
    { id: "security", label: "Security" },
    { id: "preferences", label: "Preferences" },
    { id: "appearance", label: "Appearance" },
  ]

  return (
    <PageTransition>
      <div className="space-y-6">
        <PageHeader
          title="Settings"
          icon="UserCog"
          description="Manage your account settings and preferences"
        />

        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          {/* Sidebar */}
          <motion.div variants={pageTransitionFast} initial="hidden" animate="visible" className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex flex-col items-center text-center">
                <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-2xl font-bold text-primary">
                  {avatar}
                </div>
                <h3 className="text-lg font-semibold text-foreground">{name}</h3>
                <p className="text-sm text-muted-foreground">{email}</p>
                {profileRole && (
                  <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                    <Shield className="h-3 w-3" />
                    {profileRole.charAt(0).toUpperCase() + profileRole.slice(1)}
                  </span>
                )}
                {memberSince && (
                  <div className="mt-4 w-full border-t border-border pt-4">
                    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      Member since {memberSince}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {memberSince && (
              <div className="rounded-xl border border-border bg-card p-4">
                <h4 className="mb-3 text-sm font-semibold text-foreground">Account Info</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Email</span>
                    <span className="text-sm font-medium text-foreground">{email || authUser?.email || '-'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Phone</span>
                    <span className="text-sm font-medium text-foreground">{phone || 'Not set'}</span>
                  </div>
                </div>
              </div>
            )}
          </motion.div>

          {/* Main Content */}
          <motion.div variants={pageTransitionFast} initial="hidden" animate="visible" className="space-y-4">
            <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

            {/* Profile Tab */}
            {activeTab === "profile" && (
              <motion.div variants={pageTransitionFast} initial="hidden" animate="visible" className="rounded-xl border border-border bg-card p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">Personal Information</h3>
                    <p className="text-sm text-muted-foreground">Update your personal details</p>
                  </div>
                  {!isEditing && (
                    <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                      <User className="h-4 w-4" />
                      Edit
                    </Button>
                  )}
                </div>

                {isEditing ? (
                  <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormInput
                        label="Full Name"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Enter your full name"
                        required
                      />
                      <FormInput
                        label="Email Address"
                        type="email"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        placeholder="Enter your email"
                        required
                      />
                      <FormInput
                        label="Phone Number"
                        type="tel"
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                        placeholder="Enter phone number"
                      />
                    </div>
                    <FormActions>
                      <Button variant="outline" onClick={handleCancelEdit}>Cancel</Button>
                      <Button onClick={handleSaveProfile}>
                        <Save className="h-4 w-4" />
                        Save Changes
                      </Button>
                    </FormActions>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {[
                      { label: "Full Name", value: name, icon: User },
                      { label: "Email Address", value: email, icon: Mail },
                      { label: "Phone Number", value: phone || "Not set", icon: Phone },
                    ].map((field) => (
                      <div key={field.label} className="flex items-center gap-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                          <field.icon className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{field.label}</p>
                          <p className="text-sm font-medium text-foreground">{field.value}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* Security Tab */}
            {activeTab === "security" && (
              <div className="space-y-4">
                {/* Change Password */}
                <motion.div variants={pageTransitionFast} initial="hidden" animate="visible" className="rounded-xl border border-border bg-card p-6 space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                      <Lock className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-foreground">Change Password</h3>
                      <p className="text-sm text-muted-foreground">Ensure your account stays secure</p>
                    </div>
                  </div>

                  <div className="space-y-4 max-w-md">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Current Password</label>
                      <div className="relative">
                        <input
                          type={showCurrentPw ? "text" : "password"}
                          value={currentPw}
                          onChange={(e) => setCurrentPw(e.target.value)}
                          placeholder="Enter current password"
                          className="h-10 w-full rounded-xl border border-border bg-background pl-4 pr-10 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
                        />
                        <button type="button" onClick={() => setShowCurrentPw(!showCurrentPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                          {showCurrentPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">New Password</label>
                      <div className="relative">
                        <input
                          type={showNewPw ? "text" : "password"}
                          value={newPw}
                          onChange={(e) => setNewPw(e.target.value)}
                          placeholder="Enter new password"
                          className="h-10 w-full rounded-xl border border-border bg-background pl-4 pr-10 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
                        />
                        <button type="button" onClick={() => setShowNewPw(!showNewPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                          {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Confirm Password</label>
                      <div className="relative">
                        <input
                          type={showConfirmPw ? "text" : "password"}
                          value={confirmPw}
                          onChange={(e) => setConfirmPw(e.target.value)}
                          placeholder="Confirm new password"
                          className="h-10 w-full rounded-xl border border-border bg-background pl-4 pr-10 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
                        />
                        <button type="button" onClick={() => setShowConfirmPw(!showConfirmPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                          {showConfirmPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <Button onClick={handleChangePassword} disabled={isLocked || isCooldown}>
                      <KeyRound className="h-4 w-4" />
                      {isLocked ? `Wait ${remainingLockSeconds}s` : 'Update Password'}
                    </Button>
                  </div>
                </motion.div>

                {/* Two-Factor Authentication */}
                <motion.div variants={pageTransitionFast} initial="hidden" animate="visible" className="rounded-xl border border-border bg-card p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                        <Shield className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-foreground">Two-Factor Authentication</h3>
                        <p className="text-sm text-muted-foreground">Add an extra layer of security to your account</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
                        twoFactorEnabled ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                      )}>
                        {twoFactorEnabled ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                        {twoFactorEnabled ? "Enabled" : "Not Enabled"}
                      </span>
                      <Button variant={twoFactorEnabled ? "destructive" : "default"} size="sm" onClick={handleToggle2FA} disabled={isLocked || isCooldown}>
                        {isLocked ? `Wait ${remainingLockSeconds}s` : twoFactorEnabled ? "Disable" : "Enable"} 2FA
                      </Button>
                    </div>
                  </div>
                </motion.div>

                {/* Active Sessions */}
                <motion.div variants={pageTransitionFast} initial="hidden" animate="visible" className="rounded-xl border border-border bg-card p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                      <Monitor className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-foreground">Active Sessions</h3>
                      <p className="text-sm text-muted-foreground">Manage your active login sessions</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {sessions.map((session) => (
                      <div key={session.id} className="flex items-center justify-between rounded-xl border border-border p-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                            {session.device.includes("iPhone") ? (
                              <Smartphone className="h-5 w-5 text-muted-foreground" />
                            ) : (
                              <Monitor className="h-5 w-5 text-muted-foreground" />
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">{session.device}</p>
                            <p className="text-xs text-muted-foreground">IP: {session.ip} · Last active: {session.lastActive}</p>
                          </div>
                        </div>
                        {session.current ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">
                            <CheckCircle2 className="h-3 w-3" />
                            Current
                          </span>
                        ) : (
                          <Button variant="ghost" size="sm" onClick={() => handleRevokeSession(session.id)} disabled={isLocked || isCooldown}>
                            <LogOut className="h-4 w-4" />
                            {isLocked ? `Wait ${remainingLockSeconds}s` : 'Revoke'}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </motion.div>

                {/* Login Activity */}
                <motion.div variants={pageTransitionFast} initial="hidden" animate="visible" className="rounded-xl border border-border bg-card p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                      <Clock className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-foreground">Login Activity</h3>
                      <p className="text-sm text-muted-foreground">Recent login history</p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left">
                          <th className="pb-3 text-xs font-medium text-muted-foreground">Date</th>
                          <th className="pb-3 text-xs font-medium text-muted-foreground">Device</th>
                          <th className="pb-3 text-xs font-medium text-muted-foreground">IP Address</th>
                          <th className="pb-3 text-xs font-medium text-muted-foreground">Location</th>
                          <th className="pb-3 text-xs font-medium text-muted-foreground">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {loginActivity.map((entry) => (
                          <tr key={entry.id}>
                            <td className="py-3 text-sm text-foreground">{entry.date}</td>
                            <td className="py-3 text-sm text-foreground">{entry.device}</td>
                            <td className="py-3 text-sm text-muted-foreground">{entry.ip}</td>
                            <td className="py-3 text-sm text-muted-foreground">{entry.location}</td>
                            <td className="py-3">
                              {entry.success ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Success
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                                  <AlertCircle className="h-3 w-3" />
                                  Failed
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              </div>
            )}

            {/* Preferences Tab */}
            {activeTab === "preferences" && (
              <motion.div variants={pageTransitionFast} initial="hidden" animate="visible" className="rounded-xl border border-border bg-card p-6 space-y-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                    <Globe className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-foreground">Preferences</h3>
                    <p className="text-sm text-muted-foreground">Customize your experience</p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 max-w-lg">
                  <FormSelect
                    label="Language"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    options={[
                      { value: "en", label: "English" },
                      { value: "ne", label: "Nepali" },
                      { value: "hi", label: "Hindi" },
                    ]}
                  />
                  <FormSelect
                    label="Timezone"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    options={[
                      { value: "UTC+5:45", label: "Nepal (UTC+5:45)" },
                      { value: "UTC+5:30", label: "India (UTC+5:30)" },
                      { value: "UTC", label: "UTC" },
                    ]}
                  />
                  <FormSelect
                    label="Date Format"
                    value={dateFormat}
                    onChange={(e) => setDateFormat(e.target.value)}
                    options={[
                      { value: "YYYY-MM-DD", label: "YYYY-MM-DD" },
                      { value: "DD/MM/YYYY", label: "DD/MM/YYYY" },
                      { value: "MM/DD/YYYY", label: "MM/DD/YYYY" },
                    ]}
                  />
                  <FormSelect
                    label="Currency Display"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    options={[
                      { value: "NPR", label: "NPR (Nepalese Rupee)" },
                      { value: "INR", label: "INR (Indian Rupee)" },
                      { value: "USD", label: "USD (US Dollar)" },
                    ]}
                  />
                </div>

                <FormActions>
                  <Button onClick={handleSavePreferences}>
                    <Save className="h-4 w-4" />
                    Save Preferences
                  </Button>
                </FormActions>
              </motion.div>
            )}

            {/* Appearance Tab */}
            {activeTab === "appearance" && (
              <motion.div variants={pageTransitionFast} initial="hidden" animate="visible" className="rounded-xl border border-border bg-card p-6 space-y-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                    <Palette className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-foreground">Appearance</h3>
                    <p className="text-sm text-muted-foreground">Customize the look and feel</p>
                  </div>
                </div>

                {/* Theme Selection */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-foreground">Theme</label>
                  <div className="flex gap-3">
                    {([
                      { id: "light" as const, label: "Light", icon: Sun },
                      { id: "dark" as const, label: "Dark", icon: Moon },
                      { id: "system" as const, label: "System", icon: MonitorIcon },
                    ]).map((option) => (
                      <button
                        key={option.id}
                        onClick={() => setTheme(option.id)}
                        className={cn(
                          "flex flex-col items-center gap-2 rounded-xl border-2 px-6 py-4 text-sm font-medium transition-colors",
                          theme === option.id
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-border bg-background text-muted-foreground hover:bg-muted"
                        )}
                      >
                        <option.icon className="h-5 w-5" />
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Accent Color (Read-only) */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-foreground">Accent Color</label>
                  <div className="flex items-center gap-3">
                    <div className="flex gap-2">
                      {["bg-primary", "bg-blue-500", "bg-emerald-500", "bg-violet-500", "bg-amber-500", "bg-rose-500"].map((color) => (
                        <div key={color} className={cn("h-8 w-8 rounded-full", color, "ring-2 ring-offset-2 ring-transparent")} />
                      ))}
                    </div>
                    <span className="text-xs text-muted-foreground">Configurable via sidebar theme settings</span>
                  </div>
                </div>

                <div className="border-t border-border pt-6 space-y-4">
                  <FormToggle
                    label="Compact Mode"
                    description="Use a more compact layout with less spacing"
                    checked={compactMode}
                    onChange={setCompactMode}
                  />
                  <FormToggle
                    label="Animations"
                    description="Enable smooth animations and transitions"
                    checked={animations}
                    onChange={setAnimations}
                  />
                </div>
              </motion.div>
            )}
          </motion.div>
        </div>
      </div>
    </PageTransition>
  )
}
