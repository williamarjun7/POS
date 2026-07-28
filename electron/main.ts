/**
 * main.ts
 * ───────
 * Electron Main Process — entry point.
 *
 * Responsibilities:
 *   1. Create the main BrowserWindow with persisted state
 *   2. Load the Vite dev server (dev) or built index.html (prod)
 *   3. Register IPC handlers (printing, updates, app control)
 *   4. Initialize auto-updater
 *   5. Handle app lifecycle (ready, window-all-closed, activate)
 *   6. F11 fullscreen toggle via menu
 *   7. Global error handling (uncaught exceptions, renderer crashes)
 *   8. Window state persistence across restarts
 */

import { app, BrowserWindow, Menu, dialog, screen, type MenuItemConstructorOptions } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import Store from 'electron-store';
import { registerIpcHandlers } from './ipc/handlers.js';
import { initUpdater } from './updater/updater.js';
import { APP_NAME, getRendererPath } from './config/constants.js';

// ─── ESM __dirname polyfill ───────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Startup logging ──────────────────────────────────────
const log = {
  info: (msg: string) => console.log(`[MAIN] ${msg}`),
  warn: (msg: string) => console.warn(`[MAIN] ${msg}`),
  error: (msg: string, err?: unknown) =>
    console.error(`[MAIN] ${msg}`, err instanceof Error ? err.stack ?? err.message : err),
};

log.info(`Starting ${APP_NAME} v${app.getVersion()}`);
log.info(`Platform: ${process.platform} Packaged: ${app.isPackaged}`);
log.info(`App path: ${app.getAppPath()}`);
log.info(`User data: ${app.getPath('userData')}`);

// ─── Global error handlers ────────────────────────────────

process.on('uncaughtException', (error) => {
  log.error('UNCAUGHT EXCEPTION', error);
  if (app.isReady()) {
    showFatalError('Uncaught Exception', error);
  } else {
    app.quit();
  }
});

process.on('unhandledRejection', (reason) => {
  log.error('UNHANDLED REJECTION', reason);
});

// ─── Window state persistence ─────────────────────────────

interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized: boolean;
}

const DEFAULT_WINDOW_STATE: WindowState = {
  width: 1366,
  height: 768,
  maximized: false,
};

const windowStateStore = new Store<{ windowState: WindowState }>({
  name: 'window-state',
  cwd: app.getPath('userData'),
  defaults: { windowState: { ...DEFAULT_WINDOW_STATE } },
});

function loadWindowState(): WindowState {
  try {
    const state = windowStateStore.get('windowState');
    // Sanity-check bounds (avoid off-screen windows)
    try {
      const workArea = screen.getPrimaryDisplay().workAreaSize;
      if (workArea) {
        if (state.x !== undefined && state.x + state.width > workArea.width) {
          state.x = Math.max(0, workArea.width - state.width);
        }
        if (state.y !== undefined && state.y + state.height > workArea.height) {
          state.y = Math.max(0, workArea.height - state.height);
        }
      }
    } catch {
      // screen API not available yet
    }
    return state;
  } catch {
    return { ...DEFAULT_WINDOW_STATE };
  }
}

function saveWindowState(win: BrowserWindow): void {
  try {
    if (win.isDestroyed()) return;
    const maximized = win.isMaximized();
    if (!maximized) {
      const bounds = win.getBounds();
      windowStateStore.set('windowState', {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        maximized: false,
      });
    } else {
      windowStateStore.set('windowState', {
        ...windowStateStore.get('windowState'),
        maximized: true,
      });
    }
  } catch {
    // Silently fail — window state persistence is non-critical
  }
}

// ─── Icon resolution ──────────────────────────────────────

function getAppIconPath(): string | undefined {
  // In packaged app: resources/app/dist/icon.png
  // In dev: dist/icon.png (or public/icon.png)
  const candidates = [
    path.join(__dirname, '../dist/icon.png'),
    path.join(__dirname, '../../dist/icon.png'),
    path.join(__dirname, '../public/icon.png'),
    path.join(__dirname, '../../public/icon.png'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        log.info(`Icon resolved: ${p}`);
        return p;
      }
    } catch { /* ignore */ }
  }
  log.warn('No icon file found, using default');
  return undefined;
}

// ─── Fatal error window ───────────────────────────────────

function showFatalError(title: string, error: Error): void {
  try {
    const win = new BrowserWindow({
      width: 600,
      height: 400,
      title: `${APP_NAME} — ${title}`,
      resizable: true,
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    });
    win.setMenu(null);
    const fatalHtml = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + APP_NAME + ' - ' + title + '</title><style>' +
      'body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;background:#1a1a2e;color:#e0e0e0;padding:32px;margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh}' +
      'h1{color:#e94560;font-size:20px;margin-bottom:8px}' +
      'p{color:#a0a0b0;font-size:14px;max-width:480px;text-align:center;line-height:1.5}' +
      'pre{background:#16213e;color:#e94560;padding:16px;border-radius:8px;font-size:11px;max-width:100%;overflow:auto;margin-top:16px;border:1px solid #2a2a4a}' +
      '.btn{margin-top:24px;padding:10px 24px;background:#e94560;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px}' +
      '.btn:hover{background:#d63851}' +
      '</style></head><body>' +
      '<h1>' + title + '</h1>' +
      '<p>The application encountered an unrecoverable error. Please restart the app or reinstall if the issue persists.</p>' +
      '<pre>' + (error.stack || error.message) + '</pre>' +
      '<button class="btn" onclick="window.close()">Close Application</button>' +
      '</body></html>';
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(fatalHtml));
    win.on('closed', () => app.quit());
    win.show();
  } catch {
    // If even the error window fails, just quit
    app.quit();
  }
}

// ─── Menu with F11 Fullscreen ─────────────────────────────

function buildAppMenu(win: BrowserWindow): Menu {
  const isMac = process.platform === 'darwin';

  const template: MenuItemConstructorOptions[] = [
    // macOS app menu
    ...(isMac
      ? [
          {
            label: APP_NAME,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          } as MenuItemConstructorOptions,
        ]
      : []),
    // File
    {
      label: 'File',
      submenu: [
        {
          label: 'Toggle Full Screen',
          accelerator: 'F11',
          click: () => {
            win.setFullScreen(!win.isFullScreen());
          },
        },
        { type: 'separator' },
        { accelerator: 'Alt+Enter', click: () => win.setFullScreen(!win.isFullScreen()) },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    } as MenuItemConstructorOptions,
    // View
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Full Screen',
          accelerator: 'F11',
          click: () => {
            win.setFullScreen(!win.isFullScreen());
          },
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'togglefullscreen' },
      ],
    } as MenuItemConstructorOptions,
    // Window
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [
              { type: 'separator' as const },
              { role: 'front' as const },
              { type: 'separator' as const },
              { role: 'window' as const },
            ]
          : [{ role: 'close' as const }]),
      ],
    } as MenuItemConstructorOptions,
  ];

  return Menu.buildFromTemplate(template);
}

// ─── Single instance lock ─────────────────────────────────

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  log.info('Another instance is running, quitting.');
  app.quit();
} else {
  app.on('second-instance', () => {
    const existing = BrowserWindow.getAllWindows()[0];
    if (existing) {
      if (existing.isMinimized()) existing.restore();
      if (existing.isFullScreen()) existing.setFullScreen(false);
      existing.focus();
    }
  });
}

let mainWindow: BrowserWindow | null = null;

// ─── Create window ────────────────────────────────────────

async function createWindow(): Promise<void> {
  const savedState = loadWindowState();
  log.info('Creating window: ' + savedState.width + 'x' + savedState.height + ' max=' + savedState.maximized);

  const iconPath = getAppIconPath();

  mainWindow = new BrowserWindow({
    x: savedState.x,
    y: savedState.y,
    width: savedState.width,
    height: savedState.height,
    minWidth: 1024,
    minHeight: 600,
    title: APP_NAME,
    icon: iconPath,
    show: false, // Show after ready-to-show to avoid white flash
    backgroundColor: '#1a1a2e', // Match the app's theme color to avoid white flash
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  // Restore maximized state
  if (savedState.maximized) {
    mainWindow.maximize();
  }

  // ── Window events ─────────────────────────────────

  mainWindow.on('ready-to-show', () => {
    log.info('Window ready-to-show');
    mainWindow?.show();
    if (!app.isPackaged) {
      mainWindow?.webContents.openDevTools({ mode: 'detach' });
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Save window state on resize end (debounced to avoid disk thrash)
  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  mainWindow.on('resize', () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (mainWindow) saveWindowState(mainWindow);
    }, 500);
  });

  let moveTimer: ReturnType<typeof setTimeout> | null = null;
  mainWindow.on('move', () => {
    if (moveTimer) clearTimeout(moveTimer);
    moveTimer = setTimeout(() => {
      if (mainWindow) saveWindowState(mainWindow);
    }, 500);
  });

  // Renderer crash handling (Electron 43+ uses render-process-gone)
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    log.error('Renderer process gone: ' + (details ? details.reason : 'unknown'));
    dialog
      .showMessageBox(mainWindow!, {
        type: 'error',
        title: 'Renderer Crashed',
        message: 'The application window has encountered an error and needs to reload.',
        detail: 'The renderer process exited: ' + (details ? details.reason : 'unknown') + '. The app will attempt to recover.',
        buttons: ['Reload', 'Close'],
        defaultId: 0,
      })
      .then(({ response }) => {
        if (response === 0) {
          mainWindow?.reload();
        } else {
          app.quit();
        }
      });
  });

  // Console error forwarding for debugging
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const levelStr = ['verbose', 'info', 'warning', 'error'][level] ?? 'unknown';
    if (level >= 2) {
      // warning or error
      log.warn(`[RENDERER:${levelStr}] ${message} (${sourceId}:${line})`);
    }
  });

  // ── Load content ──────────────────────────────────

  const rendererPath = getRendererPath();
  log.info('Loading renderer: ' + rendererPath);

  try {
    if (process.env.VITE_DEV_SERVER_URL) {
      await mainWindow.loadURL(rendererPath as string);
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    } else {
      await mainWindow.loadFile(rendererPath);
    }
    log.info('Renderer loaded successfully');
  } catch (err) {
    log.error('Failed to load renderer', err);
    // Show error page
    const errorMsg = err instanceof Error ? err.message : String(err);
    const loadErrorHtml = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + APP_NAME + ' - Load Error' + '</title><style>' +
      'body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;background:#1a1a2e;color:#e0e0e0;padding:32px;margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh}' +
      'h1{color:#e94560;font-size:20px;margin-bottom:8px}' +
      'p{color:#a0a0b0;font-size:14px;max-width:480px;text-align:center;line-height:1.5}' +
      'pre{background:#16213e;color:#e94560;padding:16px;border-radius:8px;font-size:11px;max-width:100%;overflow:auto;margin-top:16px;border:1px solid #2a2a4a}' +
      '</style></head><body>' +
      '<h1>Failed to Load Application</h1>' +
      '<p>The application could not load the user interface. This may be due to a missing or corrupted installation.</p>' +
      '<pre>' + errorMsg + '</pre>' +
      '<p style="margin-top:24px;font-size:12px;color:#666">Please reinstall the application or contact support.</p>' +
      '</body></html>';
    mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(loadErrorHtml));
    mainWindow.show();
  }
}

// ─── App lifecycle ────────────────────────────────────────

app.whenReady().then(async () => {
  log.info('App ready');

  // Register IPC handlers before creating window
  registerIpcHandlers();

  // Create the main window
  await createWindow();

  // Set application menu (with F11 fullscreen)
  if (mainWindow) {
    const menu = buildAppMenu(mainWindow);
    Menu.setApplicationMenu(menu);
  }

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

// Save window state before quitting
app.on('before-quit', () => {
  log.info('Before-quit: saving window state');
  if (mainWindow && !mainWindow.isDestroyed()) {
    saveWindowState(mainWindow);
  }
});


