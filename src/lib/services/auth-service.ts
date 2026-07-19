/**
 * InsForge Auth Service
 *
 * Initializes the InsForge client and exposes auth methods
 * used by the AuthContext and page components.
 */
import { createClient, InsForgeError } from '@insforge/sdk'

const baseUrl = import.meta.env.VITE_INSFORGE_URL
const anonKey = import.meta.env.VITE_INSFORGE_ANON_KEY

if (!baseUrl) {
  throw new Error('Missing VITE_INSFORGE_URL environment variable')
}
if (!anonKey) {
  throw new Error('Missing VITE_INSFORGE_ANON_KEY environment variable')
}

export const insforge = createClient({
  baseUrl,
  anonKey,
  // Use the backend proxy path for edge functions instead of the derived
  // subhosting URL (e.g. {appKey}.functions.insforge.app) which returns
  // 404 with no CORS headers, causing "Network request failed" errors.
  functionsUrl: `${baseUrl}/functions`,
})

export type InsForgeUser = Awaited<ReturnType<typeof insforge.auth.getCurrentUser>>['data']

export async function signUp(email: string, password: string, fullName?: string) {
  const result = await insforge.auth.signUp({ email, password })

  if (result.data?.user && fullName) {
    // Set the user's display name as profile
    await insforge.auth.setProfile({ full_name: fullName })
  }

  return result
}

export async function signIn(email: string, password: string) {
  return insforge.auth.signInWithPassword({ email, password })
}

export async function signInWithOAuth(provider: 'google' | 'apple' | 'github' | 'facebook') {
  return insforge.auth.signInWithOAuth({ provider, redirectTo: window.location.origin + '/auth/callback' })
}

export async function signOut() {
  return insforge.auth.signOut()
}

export async function getCurrentUser() {
  return insforge.auth.getCurrentUser()
}

export async function sendPasswordResetEmail(email: string) {
  return insforge.auth.sendResetPasswordEmail({ email })
}

export async function resetPassword(newPassword: string) {
  return insforge.auth.resetPassword({ newPassword, otp: '' })
}

export async function verifyEmail(email: string, code: string) {
  return insforge.auth.verifyEmail({ email, otp: code })
}

export async function resendVerificationEmail(email: string) {
  return insforge.auth.resendVerificationEmail({ email })
}

/**
 * Change password for the currently authenticated user.
 * First verifies the current password, then updates to the new password.
 */
export async function changePassword(
  email: string,
  currentPassword: string,
  newPassword: string
): Promise<{ error: InsForgeError | null }> {
  // Step 1: Verify the current password by re-authenticating
  const { error: verifyError } = await insforge.auth.signInWithPassword({
    email,
    password: currentPassword,
  })

  if (verifyError) {
    // Show a friendly message for invalid credentials, otherwise pass through the real error
    const message =
      verifyError.error === 'INVALID_CREDENTIALS'
        ? 'Current password is incorrect'
        : verifyError.message
    return { error: { ...verifyError, message } }
  }

  // Step 2: Update the password using the SDK's documented resetPassword method.
  // The user has a fresh session after re-authentication.
  const { error: resetError } = await insforge.auth.resetPassword({ newPassword, otp: '' })
  if (resetError) {
    return { error: resetError as unknown as InsForgeError }
  }
  return { error: null }
}
