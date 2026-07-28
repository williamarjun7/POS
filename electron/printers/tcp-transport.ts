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
  console.log(`[TCP] Attempting connection to ${config.ip}:${config.port}`);

  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const startTime = Date.now();

    const settle = (result: TcpPrintResult) => {
      if (settled) return;
      settled = true;
      const elapsed = Date.now() - startTime;
      clearTimeout(connectTimeout);
      socket.destroy();
      if (result.success) {
        console.log(`[TCP] ✓ Print succeeded (${elapsed}ms)`);
      } else {
        console.warn(`[TCP] ✗ Print failed (${elapsed}ms):`, result.error);
      }
      resolve(result);
    };

    const connectTimeout = setTimeout(() => {
      settle({ success: false, error: `Connection timed out (${config.ip}:${config.port})` });
    }, 5000);

    // Disable Nagle's algorithm so small writes are sent immediately
    socket.setNoDelay(true);
    socket.setTimeout(8000);

    socket.on('connect', () => {
      clearTimeout(connectTimeout);
      const connectTime = Date.now() - startTime;
      console.log(`[TCP] ✓ Connected to ${config.ip}:${config.port} (${connectTime}ms)`);
      console.log(`[TCP] Sending ${buffer.length} bytes of ESC/POS data...`);
      socket.setTimeout(10000);

      // Send the full ESC/POS buffer
      socket.write(buffer, (err) => {
        if (err) {
          console.error(`[TCP] Write error after ${buffer.length} bytes:`, err.message);
          settle({ success: false, error: `Write error: ${err.message}` });
          return;
        }
        const writeTime = Date.now() - startTime;
        console.log(`[TCP] ✓ ${buffer.length} bytes written to kernel buffer (${writeTime}ms), waiting for drain...`);

        // ── Wait for all data to be transmitted before closing ──
        // The write() callback only confirms data reached the kernel buffer.
        // Calling socket.end() immediately can cause the printer to receive
        // a partial buffer, resulting in "half cutted" prints.
        // We wait for the drain event (all buffered data flushed to wire)
        // plus a small delay for the printer to process the data.
        const closeAfterDrain = () => {
          const drainTime = Date.now() - startTime;
          console.log(`[TCP] Buffer drained (${drainTime}ms), waiting 500ms for printer to process...`);
          setTimeout(() => {
            const closeTime = Date.now() - startTime;
            console.log(`[TCP] Closing connection (${closeTime}ms total)`);
            socket.end();
          }, 500);
        };

        if (socket.writableLength === 0) {
          // Already drained, proceed to close after delay
          closeAfterDrain();
        } else {
          // Wait for drain event (emitted when all buffered data is flushed)
          socket.once('drain', closeAfterDrain);
        }
      });
    });

    socket.on('data', (_data: Buffer) => {
      // Printer may send back ACK/NAK status bytes.
      // We ignore them for now since the close event confirms delivery.
    });

    socket.on('close', () => {
      const totalTime = Date.now() - startTime;
      console.log(`[TCP] Socket closed (${totalTime}ms total)`);
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
      const elapsed = Date.now() - startTime;
      console.warn(`[TCP] Socket timed out after ${elapsed}ms`);
      settle({ success: false, error: 'Socket timed out during transmission' });
    });

    console.log(`[TCP] Initiating connection to ${config.ip}:${config.port}...`);
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
