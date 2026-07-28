/**
 * detect-electron.ts
 * ───────────────────
 * Utilities to detect whether the app is running inside Electron
 * and to access the electronAPI bridge.
 *
 * Usage:
 *   import { isElectron, getElectronAPI } from '@/lib/detect-electron';
 *
 *   if (isElectron()) {
 *     const api = getElectronAPI();
 *     await api.printSubmitInvoice(invoiceData);
 *     await api.printSubmitKot(kotData, 'Order #002');
 *     await api.printRetry('job-123');
 *   }
 */

import type { ElectronAPI } from '../../electron/preload';

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

/**
 * Returns true if the app is running inside Electron.
 * Detects via the preload bridge (contextBridge), which is the
 * most reliable method since it only exists when the preload
 * script has successfully executed and exposed the electronAPI.
 */
export function isElectron(): boolean {
  const detected = typeof window !== 'undefined' && !!window.electronAPI;
  if (import.meta.env.DEV) {
    console.log('[ELECTRON] isElectron():', detected);
  }
  return detected;
}

/**
 * Safely access the electronAPI bridge.
 * Throws if not running in Electron.
 */
export function getElectronAPI(): ElectronAPI {
  const api = window.electronAPI;
  if (!api) {
    throw new Error('electronAPI not available — not running in Electron');
  }
  return api;
}

/**
 * Check if running in Electron using MULTIPLE detection methods.
 *
 * Method 1: window.electronAPI bridge (most reliable — set by preload)
 * Method 2: navigator.userAgent check (fallback for module-level init)
 *
 * Modern Electron (v28+, including v43) no longer includes 'Electron' in
 * the user-agent string by default, so this function always prefers the
 * bridge check when available.
 *
 * Used at module-scope (e.g. App.tsx) where window.electronAPI may
 * already be available since the preload runs before the DOM loads.
 */
export function isElectronUA(): boolean {
  // Method 1: check the preload bridge (most reliable)
  const hasBridge = typeof window !== 'undefined' && !!window.electronAPI;
  if (hasBridge) {
    console.log('[ELECTRON] isElectronUA(): true (via bridge)');
    return true;
  }

  // Method 2: user-agent fallback (some Electron versions include 'Electron/')
  const uaMatch = typeof navigator !== 'undefined' &&
    /electron/i.test(navigator.userAgent);
  if (uaMatch) {
    console.log('[ELECTRON] isElectronUA(): true (via userAgent:', navigator.userAgent, ')');
    return true;
  }

  console.log('[ELECTRON] isElectronUA(): false (no bridge, no UA match)');
  return false;
}
