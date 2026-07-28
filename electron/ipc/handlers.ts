/**
 * handlers.ts
 * ────────────
 * IPC (Inter-Process Communication) handlers.
 *
 * The renderer process calls these via contextBridge (preload.ts).
 *
 * All printing uses native ESC/POS via the ZYWELL ZY-Q822 driver.
 * No browser print dialogs. No iframes. No HTML printing.
 *
 * Channels:
 *   print:submit-invoice   → Submit invoice for ESC/POS receipt printing
 *   print:submit-kot       → Submit KOT for ESC/POS kitchen printing
 *   print:submit-test      → Submit test receipt or KOT
 *   print:status           → Get printer and queue status
 *   print:retry            → Retry a failed print job
 *   print:retry-all        → Retry all failed jobs
 *   print:clear            → Clear completed jobs
 *   printer:status         → Get real-time printer connection status
 *   printer:config         → Get/set local printer configuration
 *   update:check           → Check for updates manually
 *   update:install         → Install downloaded update
 *   update:status          → Get current update status
 *   app:get-version        → Get app version
 *   app:get-platform       → Get the platform
 *   app:set-auto-launch    → Enable/disable auto-launch
 *   app:get-auto-launch    → Get current auto-launch setting
 */

import { ipcMain, app, BrowserWindow } from 'electron';
import { printerManager } from '../printers/printer-manager.js';
import { checkForUpdates, installUpdate, getUpdateStatus } from '../updater/updater.js';
import {
  getLocalPrinterConfig,
  setReceiptPrinterConfig,
  setKitchenPrinterConfig,
  getPrinterConfigSummary,
} from '../printers/local-printer-config.js';
import { getUsbPrinters } from '../printers/usb-transport.js';
import { checkTcpPrinter } from '../printers/tcp-transport.js';

/**
 * Register all IPC handlers.
 * Called once during app startup (after app.whenReady()).
 */
export function registerIpcHandlers(): void {
  // ─── Print — ESC/POS Native ────────────────────────

  ipcMain.handle('print:submit-invoice', (_event, data: any): string => {
    return printerManager.submitInvoice(data);
  });

  ipcMain.handle('print:submit-kot', (_event, data: any, reference: string): string => {
    return printerManager.submitKot(data, reference);
  });

  ipcMain.handle('print:submit-test', (_event, type: 'receipt' | 'kot', paperSize?: string): string => {
    if (type === 'receipt') {
      return printerManager.submitTestReceipt((paperSize as any) || '80mm');
    }
    return printerManager.submitTestKot((paperSize as any) || '80mm');
  });

  ipcMain.handle('print:submit-bill-preview', (_event, reference: string, data: any): string => {
    return printerManager.submitBillPreview(reference, data);
  });

  ipcMain.handle('print:status', () => {
    return printerManager.getStatus();
  });

  ipcMain.handle('print:retry', (_event, jobId: string): boolean => {
    return printerManager.retry(jobId);
  });

  ipcMain.handle('print:retry-all', (): number => {
    return printerManager.retryAll();
  });

  ipcMain.handle('print:clear', () => {
    printerManager.clearCompleted();
  });

  // ─── Printer Discovery & Status ────────────────────

  ipcMain.handle('printer:status', async () => {
    return printerManager.getStatus().printers;
  });

  ipcMain.handle('printer:discover-usb', async () => {
    return getUsbPrinters();
  });

  ipcMain.handle('printer:check-network', async (_event, ip: string, port: number) => {
    return checkTcpPrinter({ ip, port });
  });

  // ─── Local Printer Configuration ───────────────────

  ipcMain.handle('printer:config-get', () => {
    return getPrinterConfigSummary();
  });

  ipcMain.handle('printer:config-set-receipt', (_event, config: any) => {
    setReceiptPrinterConfig(config);
    return { success: true };
  });

  ipcMain.handle('printer:config-set-kitchen', (_event, config: any) => {
    setKitchenPrinterConfig(config);
    return { success: true };
  });

  // ─── Updates ────────────────────────────────────────

  ipcMain.handle('update:check', () => {
    checkForUpdates();
  });

  ipcMain.handle('update:install', () => {
    installUpdate();
  });

  ipcMain.handle('update:status', () => {
    return getUpdateStatus();
  });

  // ─── App info ───────────────────────────────────────

  ipcMain.handle('app:get-version', () => {
    return app.getVersion();
  });

  ipcMain.handle('app:get-platform', () => {
    return process.platform;
  });

  // ─── Auto-launch ────────────────────────────────────

  ipcMain.handle('app:set-auto-launch', async (_event, enabled: boolean) => {
    try {
      const AutoLauncher = (await import('auto-launch')).default;
      const autoLaunch = new AutoLauncher({
        name: 'Highlands Cafe & Motel Inn POS',
        path: app.getPath('exe'),
      });

      if (enabled) {
        await autoLaunch.enable();
      } else {
        await autoLaunch.disable();
      }

      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Auto-launch toggle failed',
      };
    }
  });

  ipcMain.handle('app:get-auto-launch', async () => {
    try {
      const AutoLauncher = (await import('auto-launch')).default;
      const autoLaunch = new AutoLauncher({
        name: 'Highlands Cafe & Motel Inn POS',
        path: app.getPath('exe'),
      });

      const isEnabled = await autoLaunch.isEnabled();
      return { enabled: isEnabled };
    } catch {
      return { enabled: false };
    }
  });

  // ─── Print queue push notifications ─────────────────

  printerManager.onStatusChange((_status: any, jobs: any[]) => {
    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send('print:queue-updated', jobs);
      }
    });
  });
}
