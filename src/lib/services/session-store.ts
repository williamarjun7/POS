/**
 * SessionStore
 * ────────────
 * Client-side session metadata for 24-hour persistence and screen lock.
 *
 * This stores metadata about the session (login time, PIN, lock state)
 * in localStorage. The actual auth JWT token is managed by the InsForge SDK.
 *
 * The 24-hour session is enforced by checking loginTimestamp.
 * The screen lock is a UI-only feature — it does NOT invalidate the
 * backend session. The user can unlock with their PIN and continue
 * working without re-authenticating.
 */

const STORAGE_KEY = 'pos_session_store'

interface SessionData {
  /** ISO timestamp of the most recent login */
  loginTimestamp: string | null
  /** SHA-256 hash of the PIN (hex). Null if not set. */
  pinHash: string | null
  /** Inactivity timeout in ms before screen lock activates. Default 10 min. */
  screenLockTimeout: number
  /** Whether the screen is currently locked */
  isLocked: boolean
  /** User ID this session belongs to */
  userId: string | null
}

// ─── Defaults ──────────────────────────────────────────────

const DEFAULTS: SessionData = {
  loginTimestamp: null,
  pinHash: null,
  screenLockTimeout: 10 * 60 * 1000, // 10 minutes
  isLocked: false,
  userId: null,
}

// ─── Helpers ───────────────────────────────────────────────

async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

function read(): SessionData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULTS }
  }
}

function write(data: SessionData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch { /* localStorage full or unavailable */ }
}

// ─── Public API ────────────────────────────────────────────

/**
 * Record a successful login.
 * Sets the login timestamp to now and associates the session with a user.
 */
export function recordLogin(userId: string): void {
  const data = read()
  data.loginTimestamp = new Date().toISOString()
  data.userId = userId
  data.isLocked = false
  write(data)
}

/**
 * Clear the session (logout).
 */
export function clearSession(): void {
  const data = read()
  data.loginTimestamp = null
  data.userId = null
  data.isLocked = false
  // Keep the PIN so the user doesn't need to re-set it
  write(data)
}

/**
 * Check if the 24-hour session is still valid.
 */
export function isSessionValid(): boolean {
  const data = read()
  if (!data.loginTimestamp) return false
  const elapsed = Date.now() - new Date(data.loginTimestamp).getTime()
  return elapsed < 24 * 60 * 60 * 1000 // 24 hours
}

/**
 * Get the session's user ID.
 */
export function getSessionUserId(): string | null {
  return read().userId
}

// ─── PIN management ────────────────────────────────────────

/**
 * Set or update the PIN.
 */
export async function setPin(pin: string): Promise<void> {
  const data = read()
  data.pinHash = await sha256(pin)
  write(data)
}

/**
 * Verify a PIN attempt.
 */
export async function verifyPin(pin: string): Promise<boolean> {
  const data = read()
  if (!data.pinHash) return false
  const hash = await sha256(pin)
  return hash === data.pinHash
}

/**
 * Check if a PIN has been configured.
 */
export function hasPin(): boolean {
  return read().pinHash !== null
}

/**
 * Clear the stored PIN.
 */
export function clearPin(): void {
  const data = read()
  data.pinHash = null
  write(data)
}

// ─── Screen lock state ─────────────────────────────────────

/**
 * Lock the screen.
 */
export function lockScreen(): void {
  const data = read()
  data.isLocked = true
  write(data)
}

/**
 * Unlock the screen.
 */
export function unlockScreen(): void {
  const data = read()
  data.isLocked = false
  write(data)
}

/**
 * Check if the screen is currently locked.
 */
export function isScreenLocked(): boolean {
  return read().isLocked
}

/**
 * Get the screen lock timeout duration in ms.
 */
export function getScreenLockTimeout(): number {
  return read().screenLockTimeout
}

/**
 * Set the screen lock timeout duration in ms.
 */
export function setScreenLockTimeout(ms: number): void {
  const data = read()
  data.screenLockTimeout = ms
  write(data)
}
