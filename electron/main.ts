/**
 * main.ts
 * ───────
 * Electron Main Process — entry point.
 *
 * Responsibilities:
 *   1. Create the main BrowserWindow
 *   2. Load the Vite dev server (dev) or built index.html (prod)
 *   3. Register IPC handlers (printing, updates, app control)
 *   4. Initialize auto-updater
 *   5. Handle app lifecycle (ready, window-all-closed, activate)
 */

import { app, BrowserWindow, Menu } from 'electron';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { registerIpcHandlers } from './ipc/handlers.js';
import { initUpdater } from './updater/updater.js';
import { APP_NAME, getRendererPath } from './config/constants.js';

// ESM equivalent of __dirname
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Prevent multiple instances (single-instance lock)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Someone tried to run a second instance — focus our window instead
    const existing = BrowserWindow.getAllWindows()[0];
    if (existing) {
      if (existing.isMinimized()) existing.restore();
      existing.focus();
    }
  });
}

let mainWindow: BrowserWindow | null = null;

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 600,
    title: APP_NAME,
    icon: path.join(__dirname, '../public/favicon.png'),
    show: false, // Show after ready-to-show to avoid white flash
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,     // Security: renderer cannot access Node.js
      nodeIntegration: false,     // Security: no require() in renderer
      sandbox: false,             // Required for preload to use Node APIs
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  // ── Menu ──────────────────────────────────────────
  // Remove default menu bar for a cleaner POS experience.
  // In dev mode, keep the menu for DevTools access.
  if (app.isPackaged) {
    Menu.setApplicationMenu(null);
  }

  // ── Window events ─────────────────────────────────

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
    if (!app.isPackaged) {
      mainWindow?.webContents.openDevTools({ mode: 'detach' });
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // ── Load content ──────────────────────────────────

  const rendererPath = getRendererPath();

  if (process.env.VITE_DEV_SERVER_URL) {
    // Development: load from Vite dev server
    await mainWindow.loadURL(rendererPath as string);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    // Production: load built files
    await mainWindow.loadFile(rendererPath);
  }
}

// ─── App lifecycle ─────────────────────────────────────

app.whenReady().then(async () => {
  // Register IPC handlers before creating window
  registerIpcHandlers();

  // Create the main window
  await createWindow();

  // Initialize auto-updater (non-blocking)
  if (mainWindow) {
    initUpdater(mainWindow);
  }

  // macOS: re-create window when dock icon is clicked and no windows exist
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Prevent the app from quitting when print dialogs are open
app.on('before-quit', () => {
  // Cleanup if needed
});
