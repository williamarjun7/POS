import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
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
  login: (email: string, password: string) => Promise<{ emailVerified: boolean }>
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refreshUser = useCallback(async () => {
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
      console.warn('[Auth] refreshUser failed:', err instanceof Error ? err.message : err)
      setUser(null)
    }
  }, [])

  useEffect(() => {
    ;(async () => {
      // Check if we have a valid 24-hour session stored
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

  // Listen for auth state changes via the SDK's built-in session management
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshUser()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [refreshUser])

  const login = useCallback(async (email: string, password: string) => {
    const { data, error } = await signIn(email, password)
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

      // Record the login time for 24-hour session tracking
      recordLogin(fullUser.id)

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

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
