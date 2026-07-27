/**
 * SessionStore
 * ────────────
 * Client-side session metadata for configurable expiration and screen lock.
 *
 * This stores metadata about the session (login time, expiry, PIN, lock state).
 * The actual auth JWT/refresh tokens are managed by the InsForge SDK
 * via httpOnly cookies.
 *
 * ═══ Persistence ═══
 * All session data is stored in localStorage (survives browser/computer restarts).
 * The session expires based on loginTimestamp + session duration.
 *   - Normal login:  24 hours
 *   - Remember Me:   30 days
 *
 * The screen lock is a UI-only feature — it does NOT invalidate the
 * backend session. The user can unlock with their PIN and continue
 * working without re-authenticating.
 *
 * ═══ Session Expiration Check ═══
 * isSessionValid() checks both localStorage (primary) and sessionStorage
 * (backward compat — legacy data from before the redesign that used
 * sessionStorage for Remember Me OFF). On the next login after this
 * change, data is always written to localStorage.
 */

const STORAGE_KEY = 'pos_session_store'

/** Default session duration: 24 hours */
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000

/** Remember Me session duration: 30 days */
const REMEMBER_DURATION_MS = 30 * 24 * 60 * 60 * 1000

interface SessionData {
  /** ISO timestamp of the most recent login */
  loginTimestamp: string | null
  /** ISO timestamp when this session expires (computed at login time) */
  expiresAt: string | null
  /** Whether Remember Me was enabled for this session */
  rememberMe: boolean
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
  expiresAt: null,
  rememberMe: false,
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

/** Read full session data from localStorage */
function read(): SessionData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULTS }
  }
}

/** Write full session data to localStorage */
function write(data: SessionData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch { /* localStorage full or unavailable */ }
}

// ─── Public API ────────────────────────────────────────────

/**
 * Record a successful login.
 * Always stores in localStorage (survives browser/computer restarts).
 * Expiration is COMPUTED at login time based on rememberMe:
 *   - rememberMe=false: expires in 24 hours
 *   - rememberMe=true:  expires in 30 days
 *
 * @param userId - The authenticated user's ID
 * @param rememberMe - Whether to extend the session lifetime
 */
export function recordLogin(userId: string, rememberMe: boolean): void {
  const now = new Date()
  const duration = rememberMe ? REMEMBER_DURATION_MS : SESSION_DURATION_MS
  const expiresAt = new Date(now.getTime() + duration)

  // Store session metadata + PIN/lock data together in localStorage.
  // PIN/lock state was always in localStorage, now session data joins it.
  const data = read()
  data.loginTimestamp = now.toISOString()
  data.expiresAt = expiresAt.toISOString()
  data.rememberMe = rememberMe
  data.userId = userId
  data.isLocked = false
  write(data)
}

/**
 * Clear the session (logout).
 * Removes from localStorage (primary) and sessionStorage (backward compat).
 */
export function clearSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
    sessionStorage.removeItem(STORAGE_KEY)
  } catch { /* ignore */ }
}

/**
 * Get the session expiry timestamp (ISO string), or null if no session.
 */
export function getSessionExpiry(): string | null {
  const data = read()
  return data.expiresAt
}

/**
 * Check if the current session is still valid.
 * Uses the pre-computed expiresAt timestamp (stored at login time).
 *
 * Also checks sessionStorage (backward compat) for legacy sessions that
 * were stored before the session-store redesign.
 */
export function isSessionValid(): boolean {
  // Primary: check localStorage (all new sessions are stored here)
  const data = read()
  if (data.expiresAt) {
    const now = Date.now()
    const expiry = new Date(data.expiresAt).getTime()
    if (now < expiry && data.userId) {
      return true
    }
  }

  // Fallback: check sessionStorage for legacy sessions (pre-redesign).
  // These were stored when Remember Me was OFF and had a fixed 24h expiry.
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return false
    const parsed = JSON.parse(raw)
    if (parsed.loginTimestamp && parsed.userId) {
      const elapsed = Date.now() - new Date(parsed.loginTimestamp).getTime()
      if (elapsed < SESSION_DURATION_MS) {
        return true
      }
    }
  } catch { /* ignore */ }

  return false
}

/**
 * Get the session's user ID.
 * Checks localStorage first, then sessionStorage (backward compat).
 */
export function getSessionUserId(): string | null {
  // Primary: localStorage
  const data = read()
  if (data.userId) return data.userId

  // Fallback: sessionStorage (legacy pre-redesign data)
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed.userId ?? null
  } catch {
    return null
  }
}

/**
 * Get the remember-me flag for the current session.
 */
export function getRememberMe(): boolean {
  return read().rememberMe
}

/**
 * Get the session duration in milliseconds.
 * Returns the duration that was set at login time based on rememberMe.
 */
export function getSessionDurationMs(): number {
  const data = read()
  return data.rememberMe ? REMEMBER_DURATION_MS : SESSION_DURATION_MS
}

/**
 * Get remaining session time in milliseconds.
 * Returns 0 if no session or session expired.
 */
export function getRemainingMs(): number {
  const data = read()
  if (!data.expiresAt) return 0
  const remaining = new Date(data.expiresAt).getTime() - Date.now()
  return Math.max(0, remaining)
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
