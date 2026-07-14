/**
 * Integration tests for AuthService
 * ───────────────────────────────────
 * Tests:
 * - signIn / signUp call the InsForge SDK correctly
 * - Password reset flow validates properly
 * - changePassword re-authenticates before updating
 *
 * Mocks:
 * - @insforge/sdk createClient (via auth-service mock)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock must be before the import
const mockSignInWithPassword = vi.fn()
const mockSignUp = vi.fn()
const mockSignOut = vi.fn()
const mockGetCurrentUser = vi.fn()
const mockSendResetPasswordEmail = vi.fn()
const mockResetPassword = vi.fn()
const mockVerifyEmail = vi.fn()
const mockResendVerificationEmail = vi.fn()
const mockSetProfile = vi.fn()

vi.mock('@insforge/sdk', () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
      signUp: mockSignUp,
      signOut: mockSignOut,
      getCurrentUser: mockGetCurrentUser,
      sendResetPasswordEmail: mockSendResetPasswordEmail,
      resetPassword: mockResetPassword,
      verifyEmail: mockVerifyEmail,
      resendVerificationEmail: mockResendVerificationEmail,
      setProfile: mockSetProfile,
    },
  }),
  InsForgeError: class InsForgeError extends Error {
    error: string
    status: number
    constructor(msg: string, err?: string, status?: number) {
      super(msg)
      this.error = err ?? 'UNKNOWN'
      this.status = status ?? 400
    }
  },
}))

// Mock env vars before importing the module under test
vi.stubEnv('VITE_INSFORGE_URL', 'https://test.insforge.app')
vi.stubEnv('VITE_INSFORGE_ANON_KEY', 'test-anon-key')

// Dynamic import after mocks are set up
async function getAuthService() {
  return await import('../auth-service')
}

describe('AuthService — signIn', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls signInWithPassword with email and password', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'test@example.com' } },
      error: null,
    })

    const { signIn } = await getAuthService()
    const result = await signIn('test@example.com', 'password123')

    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password123',
    })
    expect(result.data?.user?.email).toBe('test@example.com')
  })

  it('throws on invalid credentials', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: null,
      error: { message: 'Invalid login credentials', error: 'INVALID_CREDENTIALS', status: 400 },
    })

    const { signIn } = await getAuthService()
    const result = await signIn('wrong@example.com', 'bad-password')

    expect(result.error).toBeTruthy()
    expect(result.error!.message).toContain('Invalid')
  })
})

describe('AuthService — signUp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls signUp with email and password', async () => {
    mockSignUp.mockResolvedValue({
      data: { user: { id: 'user-2', email: 'new@example.com' } },
      error: null,
    })

    const { signUp } = await getAuthService()
    const result = await signUp('new@example.com', 'strongPass123!')

    expect(mockSignUp).toHaveBeenCalledWith({
      email: 'new@example.com',
      password: 'strongPass123!',
    })
    expect(result.data?.user?.email).toBe('new@example.com')
  })

  it('sets profile name when fullName provided', async () => {
    mockSignUp.mockResolvedValue({
      data: { user: { id: 'user-2', email: 'new@example.com' } },
      error: null,
    })
    mockSetProfile.mockResolvedValue({ data: null, error: null })

    const { signUp } = await getAuthService()
    await signUp('new@example.com', 'strongPass123!', 'New User')

    expect(mockSetProfile).toHaveBeenCalledWith({ full_name: 'New User' })
  })

  it('throws on duplicate email', async () => {
    mockSignUp.mockResolvedValue({
      data: null,
      error: { message: 'User already registered', error: 'EMAIL_EXISTS', status: 422 },
    })

    const { signUp } = await getAuthService()
    const result = await signUp('existing@example.com', 'strongPass123!')

    expect(result.error).toBeTruthy()
    expect(result.error!.message).toContain('already registered')
  })
})

describe('AuthService — signOut', () => {
  it('calls the SDK signOut method', async () => {
    mockSignOut.mockResolvedValue({ error: null })

    const { signOut } = await getAuthService()
    await signOut()

    expect(mockSignOut).toHaveBeenCalled()
  })
})

describe('AuthService — getCurrentUser', () => {
  it('returns the current session user', async () => {
    mockGetCurrentUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'test@example.com' } },
      error: null,
    })

    const { getCurrentUser } = await getAuthService()
    const result = await getCurrentUser()

    expect(mockGetCurrentUser).toHaveBeenCalled()
    expect(result.data?.user?.id).toBe('user-1')
  })
})

describe('AuthService — password reset', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sendPasswordResetEmail calls SDK with email', async () => {
    mockSendResetPasswordEmail.mockResolvedValue({ data: null, error: null })

    const { sendPasswordResetEmail } = await getAuthService()
    await sendPasswordResetEmail('test@example.com')

    expect(mockSendResetPasswordEmail).toHaveBeenCalledWith({
      email: 'test@example.com',
    })
  })

  it('resetPassword calls SDK with new password', async () => {
    mockResetPassword.mockResolvedValue({ data: { user: null }, error: null })

    const { resetPassword } = await getAuthService()
    await resetPassword('newSecurePass123!')

    expect(mockResetPassword).toHaveBeenCalledWith({
      newPassword: 'newSecurePass123!',
      otp: '',
    })
  })
})

describe('AuthService — verifyEmail', () => {
  it('calls SDK verifyEmail with email and code', async () => {
    mockVerifyEmail.mockResolvedValue({ data: null, error: null })

    const { verifyEmail } = await getAuthService()
    await verifyEmail('test@example.com', '123456')

    expect(mockVerifyEmail).toHaveBeenCalledWith({
      email: 'test@example.com',
      otp: '123456',
    })
  })
})

describe('AuthService — resendVerificationEmail', () => {
  it('calls SDK to resend', async () => {
    mockResendVerificationEmail.mockResolvedValue({ data: null, error: null })

    const { resendVerificationEmail } = await getAuthService()
    await resendVerificationEmail('test@example.com')

    expect(mockResendVerificationEmail).toHaveBeenCalledWith({
      email: 'test@example.com',
    })
  })
})

describe('AuthService — changePassword', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('re-authenticates then resets password on success', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    })
    mockResetPassword.mockResolvedValue({ data: { user: null }, error: null })

    const { changePassword } = await getAuthService()
    const result = await changePassword('test@example.com', 'oldPass123', 'newPass456!')

    // Should first verify current password
    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'oldPass123',
    })

    // Then update password
    expect(mockResetPassword).toHaveBeenCalledWith({
      newPassword: 'newPass456!',
      otp: '',
    })

    expect(result.error).toBeNull()
  })

  it('returns friendly error on wrong current password', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: null,
      error: { message: 'Invalid login credentials', error: 'INVALID_CREDENTIALS', status: 400 },
    })

    const { changePassword } = await getAuthService()
    const result = await changePassword('test@example.com', 'wrongPass', 'newPass456!')

    // Should NOT proceed to reset
    expect(mockResetPassword).not.toHaveBeenCalled()

    // Should return friendly error
    expect(result.error).not.toBeNull()
    expect(result.error!.message).toBe('Current password is incorrect')
  })
})
