/**
 * tcp-transport.ts
 * ─────────────────
 * TCP/IP network printer communication.
 *
 * Connects to ZYWELL ZY-Q822 printers on port 9100 (standard ESC/POS
 * raw socket / AppSocket / JetDirect protocol).
 *
 * Sends raw ESC/POS buffers and receives status.
 * Fully silent — no browser dialogs.
 */

import * as net from 'net';

export interface NetworkPrinterConfig {
  ip: string;
  port: number;
}

export interface TcpPrintResult {
  success: boolean;
  error?: string;
}

// ─── Print ─────────────────────────────────────────────

/**
 * Send a raw ESC/POS buffer to a network printer via TCP socket.
 * Connection timeout: 5s, data timeout: 3s.
 */
export function printTcp(
  buffer: Buffer,
  config: NetworkPrinterConfig,
): Promise<TcpPrintResult> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const settle = (result: TcpPrintResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(connectTimeout);
      socket.destroy();
      resolve(result);
    };

    const connectTimeout = setTimeout(() => {
      settle({ success: false, error: `Connection timed out (${config.ip}:${config.port})` });
    }, 5000);

    socket.setTimeout(8000);

    socket.on('connect', () => {
      clearTimeout(connectTimeout);
      socket.setTimeout(10000);

      // Send the full ESC/POS buffer
      socket.write(buffer, (err) => {
        if (err) {
          settle({ success: false, error: `Write error: ${err.message}` });
          return;
        }
        // Close the write side
        socket.end();
      });
    });

    socket.on('data', (_data: Buffer) => {
      // Printer may send back ACK/NAK status bytes.
      // We ignore them for now since the close event confirms delivery.
    });

    socket.on('close', () => {
      settle({ success: true });
    });

    socket.on('error', (err) => {
      const message = err.message.toLowerCase();
      if (message.includes('refused') || message.includes('econnrefused')) {
        settle({ success: false, error: 'Connection refused — printer may be offline' });
      } else if (message.includes('enotfound') || message.includes('ehostunreach')) {
        settle({ success: false, error: 'Printer unreachable — check IP address' });
      } else {
        settle({ success: false, error: `TCP error: ${err.message}` });
      }
    });

    socket.on('timeout', () => {
      settle({ success: false, error: 'Socket timed out during transmission' });
    });

    socket.connect(config.port, config.ip);
  });
}

// ─── Health Check ─────────────────────────────────────

/**
 * Check if a network printer is reachable.
 * Attempts TCP connection with 3s timeout.
 */
export function checkTcpPrinter(
  config: NetworkPrinterConfig,
): Promise<{ connected: boolean; error?: string }> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const settle = (connected: boolean, error?: string) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ connected, error });
    };

    socket.setTimeout(3000);

    socket.on('connect', () => {
      settle(true);
    });

    socket.on('error', (err) => {
      settle(false, err.message);
    });

    socket.on('timeout', () => {
      settle(false, 'Timed out');
    });

    socket.connect(config.port, config.ip);
  });
}

/**
 * Check multiple network printer configs in parallel.
 */
export async function checkMultipleTcpPrinters(
  configs: NetworkPrinterConfig[],
): Promise<Array<{ config: NetworkPrinterConfig; connected: boolean; error?: string }>> {
  const results = await Promise.all(
    configs.map(async (config) => {
      const status = await checkTcpPrinter(config);
      return { config, ...status };
    }),
  );
  return results;
}
