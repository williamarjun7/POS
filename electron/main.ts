/**
 * main.ts
 * ───────
 * Electron Main Process — entry point.
 */

import { app, BrowserWindow, dialog, globalShortcut } from 'electron';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { registerIpcHandlers } from './ipc/handlers.js';
import { initUpdater } from './updater/updater.js';
import { APP_NAME, getRendererPath } from './config/constants.js';

// ─── ESM __dirname polyfill ───────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Startup logging ──────────────────────────────────────
console.log(`[MAIN] Starting ${APP_NAME} v${app.getVersion()}`);
console.log(`[MAIN] Platform: ${process.platform} Packaged: ${app.isPackaged}`);
console.log(`[MAIN] App path: ${app.getAppPath()}`);
console.log(`[MAIN] __dirname: ${__dirname}`);
console.log(`[MAIN] Preload path: ${path.join(__dirname, 'preload.js')}`);
console.log(`[MAIN] VITE_DEV_SERVER_URL: ${process.env.VITE_DEV_SERVER_URL || '(not set)'}`);

// ─── Icon path ────────────────────────────────────────────
// In packaged: resources/app/dist/icon.png
// In dev: dist/icon.png
const APP_ICON = path.join(__dirname, '../dist/icon.png');
console.log(`[MAIN] Icon path: ${APP_ICON}`);

// ─── F11 Fullscreen ───────────────────────────────────────
// Uses two redundant mechanisms for reliability:
//
// 1. globalShortcut — fires at the OS input level BEFORE Chromium
//    processes the key. This is the primary mechanism, more reliable
//    in packaged builds because it intercepts the keystroke at the
//    system level. Guarded with win.isFocused() so F11 only toggles
//    when the app window is active.
//
// 2. before-input-event — fires on the focused webContents as a
//    fallback in case globalShortcut doesn't fire (rare edge case).
//    We set event.preventDefault() to prevent Chromium's own
//    fullscreen behavior from conflicting.
//
// Both handlers would toggle for the same F11 press, causing a
// double-toggle (enter → immediately exit → nothing happens).
// The `f11ToggleGuard` flag prevents this: globalShortcut sets
// the flag and toggles, before-input-event checks the flag and
// ONLY fires if the guard is false (meaning globalShortcut didn't
// handle it).
function setupFullscreenShortcut(win: BrowserWindow): void {
  let f11ToggleGuard = false;

  // ── Primary: globalShortcut (OS input level) ────────────────
  globalShortcut.register('F11', () => {
    if (win && !win.isDestroyed() && win.isFocused()) {
      f11ToggleGuard = true;
      win.setFullScreen(!win.isFullScreen());
    }
  });

  // ── Fallback: before-input-event (renderer-process level) ───
  win.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F11' && input.type === 'keyDown') {
      event.preventDefault();
      if (!f11ToggleGuard) {
        win.setFullScreen(!win.isFullScreen());
      }
      f11ToggleGuard = false;
    }
  });
}

// ─── Cleanup global shortcuts on quit ────────────────────
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// ─── Global error handlers ────────────────────────────────

process.on('uncaughtException', (error) => {
  console.error('[MAIN] UNCAUGHT EXCEPTION:', error.stack ?? error.message);
  dialog.showErrorBox('Fatal Error', error.stack ?? error.message);
  app.quit();
});

process.on('unhandledRejection', (reason) => {
  console.error('[MAIN] UNHANDLED REJECTION:', reason);
});

// ─── Single instance lock ─────────────────────────────────

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const existing = BrowserWindow.getAllWindows()[0];
    if (existing) {
      if (existing.isMinimized()) existing.restore();
      existing.focus();
    }
  });
}

let mainWindow: BrowserWindow | null = null;

// ─── Create window ────────────────────────────────────────

async function createWindow(): Promise<void> {
  console.log('[MAIN] ✓ Electron started');

  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 600,
    title: APP_NAME,
    icon: APP_ICON,
    show: false,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  console.log('[MAIN] ✓ BrowserWindow created');
  console.log('[MAIN]   preload:', path.join(__dirname, 'preload.js'));
  console.log('[MAIN]   contextIsolation: true');
  console.log('[MAIN]   nodeIntegration: false');
  console.log('[MAIN]   sandbox: false');

  // ── No application menu ──────────────────────────
  mainWindow.setMenu(null);

  // ── Register F11 fullscreen ──────────────────────
  setupFullscreenShortcut(mainWindow);

  // ── Window events ────────────────────────────────

  mainWindow.on('ready-to-show', () => {
    console.log('[MAIN] Window ready-to-show');
    mainWindow?.show();
    if (!app.isPackaged) {
      mainWindow?.webContents.openDevTools({ mode: 'detach' });
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Renderer crash handling
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[MAIN] Renderer process gone:', details?.reason ?? 'unknown');
    app.quit();
  });

  // Forward ALL renderer console output to main process log
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const prefix = level === 0 ? '[RENDERER log]' :
                   level === 1 ? '[RENDERER warn]' :
                   '[RENDERER error]';
    console.log(prefix, message, `(source: ${sourceId}:${line})`);
  });

  // ── Load content ─────────────────────────────────

  const rendererPath = getRendererPath();
  console.log('[MAIN] Loading renderer:', rendererPath);
  console.log('[MAIN] Renderer type:', process.env.VITE_DEV_SERVER_URL ? 'URL (dev server)' : 'file:// (production)');

  try {
    if (process.env.VITE_DEV_SERVER_URL) {
      await mainWindow.loadURL(rendererPath as string);
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    } else {
      await mainWindow.loadFile(rendererPath);
    }
    console.log('[MAIN] ✓ Renderer loaded');
  } catch (err) {
    console.error('[MAIN] ✗ Failed to load renderer:', err);
  }
}

// ─── App lifecycle ────────────────────────────────────────

app.whenReady().then(async () => {
  console.log('[MAIN] App ready');

  registerIpcHandlers();
  await createWindow();

  if (mainWindow) {
    initUpdater(mainWindow);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});


