/**
 * zywell-q822.ts
 * ───────────────
 * ZYWELL ZY-Q822 printer driver.
 *
 * Combines the ESC/POS builder with the appropriate transport layer.
 * Both the receipt printer (USB) and kitchen printer (TCP/IP) use the
 * same printer model — only the transport differs.
 *
 * Architecture:
 *   ZYWELL ZY-Q822 Driver
 *        │
 *        ├── USB Transport  → Receipt Printer
 *        └── TCP Transport  → Kitchen Printer
 */

import { EscposBuilder, buildInvoiceReceipt, buildKitchenKot, buildTestReceipt, buildTestKot } from './escpos-builder.js';
import type { EscposInvoiceData, EscposKotData, EscposPaperSize } from './escpos-builder.js';
import { printUsb, checkUsbPrinter } from './usb-transport.js';
import { printTcp, checkTcpPrinter } from './tcp-transport.js';

export interface PrintResult {
  success: boolean;
  error?: string;
}

export interface ZywellPrinterStatus {
  receipt: {
    connected: boolean;
    name: string | null;
    error?: string;
  };
  kitchen: {
    connected: boolean;
    ip: string | null;
    port: number;
    error?: string;
  };
}

// ─── Receipt Printer (USB) ───────────────────────────

/**
 * Print an invoice receipt to the USB ZYWELL ZY-Q822.
 * Uses native ESC/POS — no browser dialog.
 */
export async function printReceiptEscpos(data: EscposInvoiceData): Promise<PrintResult> {
  try {
    const buffer = buildInvoiceReceipt(data);
    return await printUsb(buffer);
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'ESC/POS receipt build failed',
    };
  }
}

/**
 * Print a test receipt to verify the USB printer.
 */
export async function printTestReceiptEscpos(
  paperSize: EscposPaperSize = '80mm',
): Promise<PrintResult> {
  try {
    const buffer = buildTestReceipt(paperSize);
    return await printUsb(buffer);
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Test receipt failed',
    };
  }
}

// ─── Kitchen Printer (TCP/IP) ────────────────────────

/**
 * Print a KOT to the network ZYWELL ZY-Q822.
 * Uses native ESC/POS over TCP socket — no browser dialog.
 */
export async function printKitchenEscpos(
  data: EscposKotData,
  ip: string,
  port: number,
): Promise<PrintResult> {
  if (!ip) {
    return { success: false, error: 'Kitchen printer IP not configured' };
  }

  try {
    const buffer = buildKitchenKot(data);
    return await printTcp(buffer, { ip, port });
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'ESC/POS KOT build failed',
    };
  }
}

/**
 * Print a test KOT to verify the network printer.
 */
export async function printTestKotEscpos(
  ip: string,
  port: number,
  paperSize: EscposPaperSize = '80mm',
): Promise<PrintResult> {
  if (!ip) {
    return { success: false, error: 'Kitchen printer IP not configured' };
  }

  try {
    const buffer = buildTestKot(paperSize);
    return await printTcp(buffer, { ip, port });
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Test KOT failed',
    };
  }
}

// ─── Status ──────────────────────────────────────────

/**
 * Check the status of both printers.
 */
export async function getZywellStatus(): Promise<ZywellPrinterStatus> {
  const [receipt, _kitchen] = await Promise.all([
    checkUsbPrinter(),
    // Kitchen status is fetched separately with actual IP/port
    Promise.resolve({} as any),
  ]);

  return {
    receipt,
    kitchen: {
      connected: false,
      ip: null,
      port: 9100,
      error: 'IP not provided — call separately',
    },
  };
}

/**
 * Check kitchen printer status with specific IP/port.
 */
export async function checkKitchenStatus(
  ip: string,
  port: number,
): Promise<{ connected: boolean; error?: string }> {
  if (!ip) {
    return { connected: false, error: 'No IP configured' };
  }
  return checkTcpPrinter({ ip, port });
}
