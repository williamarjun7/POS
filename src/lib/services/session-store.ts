/**
 * SessionStore
 * ────────────
 * Client-side session metadata for 24-hour persistence and screen lock.
 *
 * This stores metadata about the session (login time, PIN, lock state).
 * The actual auth JWT/refresh tokens are managed by the InsForge SDK
 * via httpOnly cookies.
 *
 * Session persistence depends on the storage layer:
 *   - localStorage (Remember Me ON):  persists across browser restarts
 *   - sessionStorage (Remember Me OFF): cleared when the browser closes
 *
 * The 24-hour session is enforced by checking loginTimestamp.
 * The screen lock is a UI-only feature — it does NOT invalidate the
 * backend session. The user can unlock with their PIN and continue
 * working without re-authenticating.
 */

const STORAGE_KEY = 'pos_session_store'
const REMEMBER_KEY = 'pos_remember_me'

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

/** ─── PIN & screen lock always use localStorage (persistent across restarts) ─── */

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

/** ─── Session data (loginTimestamp, userId) uses rememberMe-aware storage ─── */

/** Read session metadata from the correct storage layer based on rememberMe */
function readSessionStorage(): Storage {
  return isRememberMe() ? localStorage : sessionStorage
}

interface SessionMeta {
  loginTimestamp: string | null
  userId: string | null
}

function readSessionMeta(): SessionMeta {
  try {
    const storage = readSessionStorage()
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return { loginTimestamp: null, userId: null }
    const parsed = JSON.parse(raw)
    return {
      loginTimestamp: parsed.loginTimestamp ?? null,
      userId: parsed.userId ?? null,
    }
  } catch {
    return { loginTimestamp: null, userId: null }
  }
}

function writeSessionMeta(meta: SessionMeta): void {
  try {
    const storage = readSessionStorage()
    // Merge with existing data so we don't overwrite PIN/lock
    const raw = storage.getItem(STORAGE_KEY)
    const existing = raw ? JSON.parse(raw) : {}
    storage.setItem(STORAGE_KEY, JSON.stringify({ ...existing, ...meta }))
  } catch { /* storage full or unavailable */ }
}

function removeSessionData(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
    sessionStorage.removeItem(STORAGE_KEY)
  } catch { /* ignore */ }
}

// ─── Remember Me flag ──────────────────────────────────────

/**
 * Store whether the user wants to be remembered.
 * This flag itself is always stored in localStorage so it persists
 * across restarts — we use it to decide which storage layer to read.
 */
export function setRememberMe(enabled: boolean): void {
  try {
    if (enabled) {
      localStorage.setItem(REMEMBER_KEY, 'true')
    } else {
      localStorage.removeItem(REMEMBER_KEY)
    }
  } catch { /* ignore */ }
}

/**
 * Check if the user wants to be remembered.
 */
export function isRememberMe(): boolean {
  try {
    return localStorage.getItem(REMEMBER_KEY) === 'true'
  } catch {
    return false
  }
}

/**
 * Remove the remember-me flag.
 */
export function clearRememberMe(): void {
  try {
    localStorage.removeItem(REMEMBER_KEY)
  } catch { /* ignore */ }
}

// ─── Public API ────────────────────────────────────────────

/**
 * Record a successful login.
 * Sets the login timestamp to now and associates the session with a user.
 *
 * @param userId - The authenticated user's ID
 * @param rememberMe - Whether to persist session across browser restarts
 *   - true:  stores in localStorage (survives browser close)
 *   - false: stores in sessionStorage (cleared on browser close)
 */
export function recordLogin(userId: string, rememberMe: boolean): void {
  setRememberMe(rememberMe)
  writeSessionMeta({
    loginTimestamp: new Date().toISOString(),
    userId,
  })
  // Also unlock the screen on login (PIN/lock data is always in localStorage)
  const data = read()
  data.isLocked = false
  write(data)
}

/**
 * Clear the session (logout).
 */
export function clearSession(): void {
  removeSessionData()
  clearRememberMe()
}

/**
 * Check if the 24-hour session is still valid.
 * Checks both localStorage (remember me) and sessionStorage (no remember me).
 */
export function isSessionValid(): boolean {
  // Check both storage layers — the user may have changed rememberMe
  // between sessions, and we want to find valid data in either
  for (const storage of [localStorage, sessionStorage]) {
    try {
      const raw = storage.getItem(STORAGE_KEY)
      if (!raw) continue
      const parsed = JSON.parse(raw)
      if (parsed.loginTimestamp) {
        const elapsed = Date.now() - new Date(parsed.loginTimestamp).getTime()
        if (elapsed < 24 * 60 * 60 * 1000) {
          return true
        }
      }
    } catch { /* continue */ }
  }
  return false
}

/**
 * Get the session's user ID.
 */
export function getSessionUserId(): string | null {
  // Check rememberMe storage first (the current preference)
  const meta = readSessionMeta()
  if (meta.userId) return meta.userId

  // Fallback: check the other storage layer
  const otherStorage = isRememberMe() ? sessionStorage : localStorage
  try {
    const raw = otherStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed.userId ?? null
  } catch {
    return null
  }
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
