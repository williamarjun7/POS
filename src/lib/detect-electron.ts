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
 */
export function isElectron(): boolean {
  return typeof window !== 'undefined' && !!window.electronAPI;
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
 * Check if running in Electron by inspecting the user agent.
 * More reliable than window.electronAPI for module-level checks.
 */
export function isElectronUA(): boolean {
  return typeof navigator !== 'undefined' &&
    /electron/i.test(navigator.userAgent);
}
