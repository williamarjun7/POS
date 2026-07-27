import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import {
  signIn,
  signUp as signUpUser,
  signOut,
  getCurrentUser,
  sendPasswordResetEmail,
  signInWithOAuth,
} from '@/lib/services/auth-service'
import { db } from '@/lib/db/insforge'
import type { UserProfileRow } from '@/lib/db/types'
import {
  recordLogin,
  clearSession,
  isSessionValid,
  getSessionUserId,
} from '@/lib/services/session-store'

/** Error message from the InsForge SDK when no persistent session is available */
const ERR_NO_REFRESH_TOKEN = 'No refresh token provided'

export interface User {
  id: string
  name: string
  email: string
  role: string
  avatar?: string
  emailVerified?: boolean
}

interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string, rememberMe?: boolean) => Promise<{ emailVerified: boolean }>
  signup: (email: string, password: string, fullName?: string) => Promise<void>
  loginWithOAuth: (provider: 'google' | 'apple' | 'github' | 'facebook') => Promise<void>
  logout: () => Promise<void>
  sendResetEmail: (email: string) => Promise<void>
  refreshUser: () => Promise<void>
  /** Whether the app is ready to render (auth resolved + session checked) */
  isReady: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

/**
 * Fetch or create the user_profiles record for an authenticated user.
 * Returns the profile data including name, email, role, phone, etc.
 */
async function ensureUserProfile(insforgeUser: {
  id: string
  email?: string
  name?: string
  emailVerified?: boolean
}): Promise<{ name: string; email: string; role: string }> {
  try {
    // Try to find existing profile by user ID (which matches the auth user ID)
    const { data: existing } = await db.findById<UserProfileRow>('user_profiles', insforgeUser.id)

    if (existing) {
      return {
        name: existing.name,
        email: existing.email,
        role: existing.role,
      }
    }

    // No profile found — create one using the InsForge auth user's data
    const defaultName = insforgeUser.name ?? insforgeUser.email?.split('@')[0] ?? 'User'
    const defaultEmail = insforgeUser.email ?? ''

    await db.insertOne('user_profiles', {
      id: insforgeUser.id, // Use the InsForge Auth User ID as the primary key
      email: defaultEmail,
      name: defaultName,
      phone: '',
      role: 'admin',
      active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    return {
      name: defaultName,
      email: defaultEmail,
      role: 'admin',
    }
  } catch (err) {
    console.warn('[Auth] ensureUserProfile failed, falling back to auth data:', err instanceof Error ? err.message : err)
    return {
      name: insforgeUser.name ?? insforgeUser.email?.split('@')[0] ?? 'User',
      email: insforgeUser.email ?? '',
      role: 'admin',
    }
  }
}

function mapInsForgeUser(insforgeUser: { id: string; email?: string; name?: string; avatar_url?: string; emailVerified?: boolean }): User {
  return {
    id: insforgeUser.id,
    name: insforgeUser.name ?? insforgeUser.email?.split('@')[0] ?? 'User',
    email: insforgeUser.email ?? '',
    role: 'admin',
    avatar: insforgeUser.avatar_url,
    emailVerified: insforgeUser.emailVerified ?? false,
  }
}

// Module-level promise for Strict Mode double-mount synchronization.
// When React Strict Mode double-mounts AuthProvider, the second mount's
// refreshUser() call is blocked by refreshGuardRef. Instead of returning
// immediately (which would set isLoading=false before the first mount's
// refresh completes), the second mount awaits this promise so it waits
// for the first mount's in-flight refreshUser() to finish first.
// eslint-disable-next-line prefer-const
let s_pendingRefresh: Promise<void> | null = null

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  // Guard against concurrent refreshUser() calls — the visibility change
  // handler and initial mount can fire simultaneously, causing two parallel
  // refresh attempts which both trigger 401s and log warnings.
  const refreshGuardRef = useRef(false)

  const refreshUser = useCallback(async () => {
    // ── Guard: prevent concurrent refresh attempts ────────────
    if (refreshGuardRef.current) {
      // Strict Mode double-mount: another refreshUser() is already running
      // from the first mount. Await it instead of returning immediately so
      // setUser() completes before setIsLoading(false) runs.
      if (s_pendingRefresh) {
        await s_pendingRefresh
      }
      return
    }
    refreshGuardRef.current = true

    const promise = (async () => {
      try {
        const { data, error } = await getCurrentUser()
        if (error) throw error
        if (data?.user) {
          const baseUser = mapInsForgeUser(data.user)
          // Fetch full profile from user_profiles
          const { data: profile } = await db.findById<UserProfileRow>('user_profiles', baseUser.id)
          if (profile) {
            setUser({
              ...baseUser,
              name: profile.name,
              role: profile.role,
            })
          } else {
            setUser(baseUser)
          }
        } else {
          setUser(null)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        // ANY auth error means the server-side session is invalid (expired,
        // revoked, or never existed). Clear the stale local session data so
        // we don't retry on every page load / visibility change and keep
        // logging 401s.
        // Previously only ERR_NO_REFRESH_TOKEN cleared the session, but token
        // expiration errors (also 401) left stale data behind.
        if (message === ERR_NO_REFRESH_TOKEN || message.includes('401') || message.includes('refresh')) {
          clearSession()
        } else {
          // Non-auth errors (network, server 500, etc.) should be visible in DEV
          // but are intentionally suppressed in production to avoid console noise.
          // The stale local session is preserved so the next visibility change
          // retries — if the server has recovered, the session restores silently.
          if (import.meta.env.DEV) console.warn('[Auth] refreshUser failed:', message)
        }
        setUser(null)
      } finally {
        refreshGuardRef.current = false
      }
    })()

    s_pendingRefresh = promise
    await promise
    s_pendingRefresh = null
  }, [])

  useEffect(() => {
    ;(async () => {
      // Check if we have a valid session stored (24h for normal, 30d for remember me)
      const hasValidSession = isSessionValid()
      const storedUserId = getSessionUserId()

      if (hasValidSession && storedUserId) {
        // Try to restore the session from the backend
        await refreshUser()
      } else {
        // No valid session — user will need to log in
        setUser(null)
      }
      setIsLoading(false)
    })()
  }, [refreshUser])

  // ── Continuous session expiry check (runs every 60s) ─────────────
  // Ensures the session expires as soon as its lifetime is reached,
  // even if the application stays open continuously.
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isSessionValid()) {
        // Session has expired — log out and clear state
        clearSession()
        setUser(null)
      }
    }, 60_000) // Every 60 seconds

    return () => clearInterval(interval)
  }, [])

  // Listen for auth state changes via the SDK's built-in session management
  // Uses a 500ms debounce to avoid rapid fire on consecutive tab switches
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Debounce: if the user rapidly switches tabs, only the last
        // visibility-change-to-visible triggers a refresh
        if (debounceTimer) clearTimeout(debounceTimer)
        debounceTimer = setTimeout(() => refreshUser(), 500)
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (debounceTimer) clearTimeout(debounceTimer)
    }
  }, [refreshUser])

  const login = useCallback(async (email: string, password: string, rememberMe?: boolean) => {
    const { data, error } = await signIn(email, password, rememberMe)
    if (error) throw error
    if (data?.user) {
      const baseUser = mapInsForgeUser(data.user)

      // If email is not verified, sign out immediately and return the status
      if (!baseUser.emailVerified) {
        await signOut()
        return { emailVerified: false }
      }

      // Fetch or create the user_profiles record for this user
      const profile = await ensureUserProfile(data.user)
      const fullUser = { ...baseUser, name: profile.name, role: profile.role }
      setUser(fullUser)

      // Record the login time with expiration based on rememberMe
      // - Normal (rememberMe=false): session expires in 24 hours
      // - Remember Me (rememberMe=true): session expires in 30 days
      // All session data is stored in localStorage (survives browser restarts).
      recordLogin(fullUser.id, rememberMe ?? false)

      return { emailVerified: true }
    }
    return { emailVerified: false }
  }, [])

  const signup = useCallback(async (email: string, password: string, fullName?: string) => {
    const { data, error } = await signUpUser(email, password, fullName)
    if (error) throw error

    // Create the user_profiles record immediately after signup
    if (data?.user) {
      try {
        const displayName = fullName ?? email.split('@')[0] ?? 'User'
        await db.insertOne('user_profiles', {
          id: data.user.id,
          email: email,
          name: displayName,
          phone: '',
          role: 'admin',
          active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
      } catch (err) {
        console.warn('[Auth] Profile creation on signup failed:', err instanceof Error ? err.message : err)
      }
    }
  }, [])

  const loginWithOAuth = useCallback(async (provider: 'google' | 'apple' | 'github' | 'facebook') => {
    const { data, error } = await signInWithOAuth(provider)
    if (error) throw error
    // OAuth redirects the browser; the session is restored on return via redirect
    if (data?.url) {
      window.location.href = data.url
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await signOut()
    } catch {
      // Ignore signOut errors — clear local state anyway
    }
    clearSession()
    setUser(null)
  }, [])

  const sendResetEmail = useCallback(async (email: string) => {
    const { error } = await sendPasswordResetEmail(email)
    if (error) throw error
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        isReady: !isLoading,
        login,
        signup,
        loginWithOAuth,
        logout,
        sendResetEmail,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
