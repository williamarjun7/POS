/**
 * local-printer-config.ts
 * ────────────────────────
 * Local printer configuration storage using electron-store.
 *
 * Printer configuration belongs to the physical machine, not the database.
 * Different POS terminals may have different printer setups.
 *
 * Stored in the app's userData directory, surviving updates and restarts.
 * Never synced to PostgreSQL/InsForge.
 */

import Store from 'electron-store';
import { app } from 'electron';

export interface LocalPrinterConfig {
  receipt: {
    type: 'USB' | 'NETWORK';
    deviceName: string | null;
    /** For USB: the vendorId:productId identifier */
    deviceId: string | null;
  };
  kitchen: {
    type: 'NETWORK';
    ip: string;
    port: number;
    deviceName: string | null;
  };
}

const DEFAULT_CONFIG: LocalPrinterConfig = {
  receipt: {
    type: 'USB',
    deviceName: null,
    deviceId: null,
  },
  kitchen: {
    type: 'NETWORK',
    ip: '',
    port: 9100,
    deviceName: null,
  },
};

const store = new Store<{ printerConfig: LocalPrinterConfig }>({
  name: 'printer-config',
  cwd: app.getPath('userData'),
  defaults: { printerConfig: { ...DEFAULT_CONFIG } },
});

/**
 * Get the local printer configuration.
 */
export function getLocalPrinterConfig(): LocalPrinterConfig {
  return store.get('printerConfig');
}

/**
 * Update the receipt printer configuration.
 */
export function setReceiptPrinterConfig(config: Partial<LocalPrinterConfig['receipt']>): void {
  const current = getLocalPrinterConfig();
  store.set('printerConfig', {
    ...current,
    receipt: { ...current.receipt, ...config },
  });
}

/**
 * Update the kitchen printer configuration.
 */
export function setKitchenPrinterConfig(config: Partial<LocalPrinterConfig['kitchen']>): void {
  const current = getLocalPrinterConfig();
  store.set('printerConfig', {
    ...current,
    kitchen: { ...current.kitchen, ...config },
  });
}

/**
 * Reset printer configuration to defaults.
 */
export function resetPrinterConfig(): void {
  store.set('printerConfig', { ...DEFAULT_CONFIG });
}

/**
 * Get a summary of the printer configuration for IPC responses.
 */
export function getPrinterConfigSummary(): {
  receipt: { type: string; deviceName: string | null; configured: boolean };
  kitchen: { type: string; ip: string; port: number; configured: boolean };
} {
  const config = getLocalPrinterConfig();
  return {
    receipt: {
      type: config.receipt.type,
      deviceName: config.receipt.deviceName,
      configured: !!config.receipt.deviceName || config.receipt.type === 'USB',
    },
    kitchen: {
      type: config.kitchen.type,
      ip: config.kitchen.ip,
      port: config.kitchen.port,
      configured: !!config.kitchen.ip,
    },
  };
}
