/**
 * preload.ts
 * ──────────
 * Preload script that runs before the renderer process.
 *
 * Uses contextBridge to expose a safe `electronAPI` object to the
 * renderer (React app).
 *
 * This is the ONLY bridge between the frontend and Node.js/Electron APIs.
 * No other Node.js APIs are exposed to the renderer.
 *
 * All printing uses native ESC/POS via ZYWELL ZY-Q822.
 */

import { contextBridge, ipcRenderer } from 'electron';

console.log('[PRELOAD] Script executing...');

/**
 * Type definition for the API exposed to the renderer.
 */
export interface ElectronAPI {
  // ── Native ESC/POS Printing ────────────────────
  printSubmitInvoice: (data: any) => Promise<string>;
  printSubmitKot: (data: any, reference: string) => Promise<string>;
  printSubmitTest: (type: 'receipt' | 'kot', paperSize?: string) => Promise<string>;
  printSubmitBillPreview: (reference: string, data: any) => Promise<string>;
  printStatus: () => Promise<{ jobs: any[]; printers: any }>;
  printRetry: (jobId: string) => Promise<boolean>;
  printRetryAll: () => Promise<number>;
  printClear: () => Promise<number>;

  // ── Printer Discovery & Config ─────────────────
  getPrinterStatus: () => Promise<any>;
  discoverUsbPrinters: () => Promise<any[]>;
  checkNetworkPrinter: (ip: string, port: number) => Promise<any>;
  getPrinterConfig: () => Promise<any>;
  setReceiptPrinterConfig: (config: any) => Promise<any>;
  setKitchenPrinterConfig: (config: any) => Promise<any>;

  // ── Updates ───────────────────────────────────
  checkForUpdates: () => Promise<void>;
  installUpdate: () => Promise<void>;
  getUpdateStatus: () => Promise<{ currentVersion: string; isUpdating: boolean }>;

  // ── App ───────────────────────────────────────
  getAppVersion: () => Promise<string>;
  getPlatform: () => Promise<string>;
  setAutoLaunch: (enabled: boolean) => Promise<{ success: boolean; error?: string }>;
  getAutoLaunch: () => Promise<{ enabled: boolean }>;

  // ── Event listeners (push from main process) ──
  onUpdateChecking: (callback: () => void) => () => void;
  onUpdateAvailable: (callback: (info: any) => void) => () => void;
  onUpdateNotAvailable: (callback: () => void) => () => void;
  onUpdateProgress: (callback: (progress: any) => void) => () => void;
  onUpdateDownloaded: (callback: (info: any) => void) => () => void;
  onUpdateError: (callback: (error: any) => void) => () => void;
  onPrintQueueUpdated: (callback: (jobs: any[]) => void) => () => void;
}

// ── Expose the electronAPI bridge to the renderer ────────────
try {
  console.log('[PRELOAD] Calling contextBridge.exposeInMainWorld...');
  contextBridge.exposeInMainWorld('electronAPI', {
  // ── Native ESC/POS Printing ────────────────────
  printSubmitInvoice: (data: any) =>
    ipcRenderer.invoke('print:submit-invoice', data),

  printSubmitKot: (data: any, reference: string) =>
    ipcRenderer.invoke('print:submit-kot', data, reference),

  printSubmitTest: (type: 'receipt' | 'kot', paperSize?: string, testData?: any) =>
    ipcRenderer.invoke('print:submit-test', type, paperSize, testData),

  printSubmitBillPreview: (reference: string, data: any) =>
    ipcRenderer.invoke('print:submit-bill-preview', reference, data),

  printStatus: () => ipcRenderer.invoke('print:status'),

  printRetry: (jobId: string) =>
    ipcRenderer.invoke('print:retry', jobId),

  printRetryAll: () => ipcRenderer.invoke('print:retry-all'),

  printClear: () => ipcRenderer.invoke('print:clear'),

  // ── Printer Discovery & Config ─────────────────
  getPrinterStatus: () => ipcRenderer.invoke('printer:status'),

  discoverUsbPrinters: () => ipcRenderer.invoke('printer:discover-usb'),

  checkNetworkPrinter: (ip: string, port: number) =>
    ipcRenderer.invoke('printer:check-network', ip, port),

  getPrinterConfig: () => ipcRenderer.invoke('printer:config-get'),

  setReceiptPrinterConfig: (config: any) =>
    ipcRenderer.invoke('printer:config-set-receipt', config),

  setKitchenPrinterConfig: (config: any) =>
    ipcRenderer.invoke('printer:config-set-kitchen', config),

  // ── Updates ───────────────────────────────────
  checkForUpdates: () => ipcRenderer.invoke('update:check'),

  installUpdate: () => ipcRenderer.invoke('update:install'),

  getUpdateStatus: () => ipcRenderer.invoke('update:status'),

  // ── App ───────────────────────────────────────
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),

  getPlatform: () => ipcRenderer.invoke('app:get-platform'),

  setAutoLaunch: (enabled: boolean) =>
    ipcRenderer.invoke('app:set-auto-launch', enabled),

  getAutoLaunch: () => ipcRenderer.invoke('app:get-auto-launch'),

  // ── Event listeners ───────────────────────────
  onUpdateChecking: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('update:checking', listener);
    return () => ipcRenderer.removeListener('update:checking', listener);
  },

  onUpdateAvailable: (callback: (info: any) => void) => {
    const listener = (_event: any, info: any) => callback(info);
    ipcRenderer.on('update:available', listener);
    return () => ipcRenderer.removeListener('update:available', listener);
  },

  onUpdateNotAvailable: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('update:not-available', listener);
    return () => ipcRenderer.removeListener('update:not-available', listener);
  },

  onUpdateProgress: (callback: (progress: any) => void) => {
    const listener = (_event: any, progress: any) => callback(progress);
    ipcRenderer.on('update:progress', listener);
    return () => ipcRenderer.removeListener('update:progress', listener);
  },

  onUpdateDownloaded: (callback: (info: any) => void) => {
    const listener = (_event: any, info: any) => callback(info);
    ipcRenderer.on('update:downloaded', listener);
    return () => ipcRenderer.removeListener('update:downloaded', listener);
  },

  onUpdateError: (callback: (error: any) => void) => {
    const listener = (_event: any, error: any) => callback(error);
    ipcRenderer.on('update:error', listener);
    return () => ipcRenderer.removeListener('update:error', listener);
  },

  onPrintQueueUpdated: (callback: (jobs: any[]) => void) => {
    const listener = (_event: any, jobs: any[]) => callback(jobs);
    ipcRenderer.on('print:queue-updated', listener);
    return () => ipcRenderer.removeListener('print:queue-updated', listener);
  },
  } satisfies ElectronAPI);
  console.log('[PRELOAD] ✓ electronAPI bridge exposed successfully');
} catch (err) {
  console.error('[PRELOAD] ✗ Failed to expose electronAPI:', err);
}

console.log('[PRELOAD] ✓ Preload script complete');
