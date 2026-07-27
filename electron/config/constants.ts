import path from 'path';

export const APP_NAME = 'Highlands Cafe & Motel Inn POS';
export const APP_ID = 'com.highlandscafemotelinn.pos';
export const APP_VERSION = process.env.npm_package_version || '1.0.1';

/** URL of the Vite dev server (used in dev mode) */
export const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';

/** Path to the built renderer (used in production) */
export function getRendererPath(): string {
  if (process.env.VITE_DEV_SERVER_URL) return DEV_SERVER_URL;
  return path.join(__dirname, '../../dist/index.html');
}

/** User data directory for persistent settings */
export function getUserDataPath(): string {
  const { app } = require('electron');
  return app.getPath('userData');
}
