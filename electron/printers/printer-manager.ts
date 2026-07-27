/**
 * printer-manager.ts
 * ──────────────────
 * Unified printer management system.
 *
 * Routes print jobs to ZYWELL ZY-Q822 printers via:
 *   - USB transport (receipt printer)
 *   - TCP transport (kitchen printer)
 *
 * Uses the persistent print queue for offline support and automatic recovery.
 * All printing uses native ESC/POS — no browser dialogs.
 *
 * Architecture:
 *   IPC Layer → PrinterManager → PrintQueue (persistent) → ZYWELL Driver → Transport
 */

import { printQueue, type PrintJobType, type PrintJobMeta } from './print-queue';
import { checkKitchenStatus } from './zywell-q822';
import { checkUsbPrinter } from './usb-transport';
import type { EscposPaperSize } from './escpos-builder';
import { buildInvoiceReceipt, buildKitchenKot, buildTestReceipt, buildTestKot } from './escpos-builder';
import type { EscposInvoiceData, EscposKotData } from './escpos-builder';
import { getLocalPrinterConfig } from './local-printer-config';

// Re-export types used by IPC layer
export type { PrintJobType, PrintJobMeta };

export interface PrinterStatus {
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

type StatusChangeCallback = (status: PrinterStatus, jobs: PrintJobMeta[]) => void;

class PrinterManager {
  private listeners: Set<StatusChangeCallback> = new Set();
  private _lastStatus: PrinterStatus = {
    receipt: { connected: false, name: null },
    kitchen: { connected: false, ip: null, port: 9100 },
  };
  private healthInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Register the processing function with the queue
    printQueue.setProcessFunction(() => this.processNextJob());

    // Start health checking
    this.startHealthChecks();

    // Process any leftover queued jobs from previous session on startup
    setTimeout(() => {
      if (printQueue.hasQueuedJobs()) {
        printQueue.setProcessFunction(() => this.processNextJob());
      }
    }, 0);
  }

  // ─── Submit ──────────────────────────────────────

  /**
   * Submit an invoice for ESC/POS receipt printing (USB).
   * Returns the job ID.
   */
  submitInvoice(data: EscposInvoiceData): string {
    const buffer = this.buildInvoiceBuffer(data);
    return this.enqueue('invoice', buffer, data.invoiceNumber);
  }

  /**
   * Submit a KOT for ESC/POS kitchen printing (TCP).
   * Returns the job ID.
   */
  submitKot(
    data: EscposKotData,
    reference: string,
  ): string {
    const buffer = this.buildKotBuffer(data);
    return this.enqueue('kot', buffer, reference);
  }

  /**
   * Submit a bill preview (falls back to receipt printer).
   * Returns the job ID.
   */
  submitBillPreview(reference: string, data: EscposInvoiceData): string {
    const buffer = this.buildInvoiceBuffer(data);
    return this.enqueue('bill_preview', buffer, reference);
  }

  /**
   * Submit a test receipt.
   */
  submitTestReceipt(paperSize: EscposPaperSize = '80mm'): string {
    const buffer = this.buildTestReceiptBuffer(paperSize);
    return this.enqueue('test_receipt', buffer, 'TEST-RECEIPT');
  }

  /**
   * Submit a test KOT.
   */
  submitTestKot(paperSize: EscposPaperSize = '80mm'): string {
    const buffer = this.buildTestKotBuffer(paperSize);
    return this.enqueue('test_kot', buffer, 'TEST-KOT');
  }

  // ─── Queue Management ───────────────────────────

  /** Get all jobs from the persistent queue */
  getJobs(): PrintJobMeta[] {
    return printQueue.getAll();
  }

  /** Get current printer and queue status */
  getStatus(): { jobs: PrintJobMeta[]; printers: PrinterStatus } {
    return { jobs: this.getJobs(), printers: this._lastStatus };
  }

  /** Retry a failed job */
  retry(jobId: string): boolean {
    return printQueue.retry(jobId);
  }

  /** Retry all failed jobs */
  retryAll(): number {
    const count = printQueue.retryAll();
    return count;
  }

  /** Clear completed jobs from the queue */
  clearCompleted(): number {
    return printQueue.clearCompleted();
  }

  // ─── Status Subscription ────────────────────────

  onStatusChange(callback: StatusChangeCallback): () => void {
    this.listeners.add(callback);
    // Immediately fire with current state
    callback(this._lastStatus, printQueue.getAll());
    return () => this.listeners.delete(callback);
  }

  // ─── Private ─────────────────────────────────────

  /**
   * Enqueue a print job with the ESC/POS buffer encoded as base64.
   */
  private enqueue(type: PrintJobType, escposBase64: string, reference: string): string {
    return printQueue.add(type, escposBase64, reference);
  }

  /**
   * Process the next queued job.
   * Called by the print queue when a job needs processing.
   */
  private processNextJob = async (): Promise<void> => {
    if (printQueue.isProcessing()) return;
    printQueue.setProcessing(true);

    while (printQueue.hasQueuedJobs()) {
      const job = printQueue.getNextQueued();
      if (!job) break;

      printQueue.updateStatus(job.id, 'printing');
      this.notify();

      const result = await this.printJob(job);

      if (result.success) {
        printQueue.updateStatus(job.id, 'completed');
      } else {
        if (job.retryCount < job.maxRetries) {
          // Retry with backoff
          printQueue.updateStatus(job.id, 'queued', result.error);
          await new Promise(r => setTimeout(r, 1500 * (job.retryCount + 1)));
        } else {
          printQueue.updateStatus(job.id, 'failed', result.error);
        }
      }

      this.notify();
    }

    printQueue.setProcessing(false);
  };

  /**
   * Execute a print job using the appropriate transport.
   */
  private async printJob(job: PrintJobMeta): Promise<{ success: boolean; error?: string }> {
    const buffer = Buffer.from(job.escposBase64, 'base64');
    const config = getLocalPrinterConfig();

    try {
      if (job.type === 'kot' || job.type === 'test_kot') {
        // Kitchen printer: TCP/IP
        if (!config.kitchen.ip) {
          return { success: false, error: 'Kitchen printer IP not configured' };
        }
        const { printTcp } = await import('./tcp-transport');
        return await printTcp(buffer, { ip: config.kitchen.ip, port: config.kitchen.port });
      } else {
        // Receipt / invoice / bill_preview / test_receipt: USB
        const { printUsb } = await import('./usb-transport');
        return await printUsb(buffer);
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Print execution failed',
      };
    }
  }

  /**
   * Build ESC/POS buffer for an invoice receipt.
   */
  private buildInvoiceBuffer(data: EscposInvoiceData): string {
    const buffer = buildInvoiceReceipt(data);
    return buffer.toString('base64');
  }

  /**
   * Build ESC/POS buffer for a KOT.
   */
  private buildKotBuffer(data: EscposKotData): string {
    const buffer = buildKitchenKot(data);
    return buffer.toString('base64');
  }

  /**
   * Build ESC/POS buffer for a test receipt.
   */
  private buildTestReceiptBuffer(paperSize: EscposPaperSize): string {
    const buffer = buildTestReceipt(paperSize);
    return buffer.toString('base64');
  }

  /**
   * Build ESC/POS buffer for a test KOT.
   */
  private buildTestKotBuffer(paperSize: EscposPaperSize): string {
    const buffer = buildTestKot(paperSize);
    return buffer.toString('base64');
  }

  /**
   * Refresh printer status and notify listeners.
   */
  private async refreshStatus(): Promise<void> {
    const config = getLocalPrinterConfig();
    const [receipt, kitchen] = await Promise.all([
      checkUsbPrinter(),
      config.kitchen.ip
        ? checkKitchenStatus(config.kitchen.ip, config.kitchen.port)
        : Promise.resolve({ connected: false, error: 'Not configured' }),
    ]);

    this._lastStatus = {
      receipt: {
        connected: receipt.connected,
        name: receipt.name || null,
        error: receipt.error,
      },
      kitchen: {
        connected: kitchen.connected,
        ip: config.kitchen.ip || null,
        port: config.kitchen.port,
        error: kitchen.error,
      },
    };

    this.notify();
  }

  /**
   * Start periodic health checks (every 30s).
   * When printers come back online, queued/failed jobs are retried.
   */
  private startHealthChecks(): void {
    // Initial status check
    this.refreshStatus();

    this.healthInterval = setInterval(async () => {
      await this.refreshStatus();

      // If there are queued or failed jobs and printer appears online, retry
      const hasWork = printQueue.hasQueuedJobs() || printQueue.hasFailedJobs();
      if (hasWork && !printQueue.isProcessing()) {
        const config = getLocalPrinterConfig();

        // Check if at least one printer is available
        const kitchenOnline = config.kitchen.ip
          ? (await checkKitchenStatus(config.kitchen.ip, config.kitchen.port)).connected
          : false;

        const receiptOnline = (await checkUsbPrinter()).connected;

        if (kitchenOnline || receiptOnline) {
          // Retry failed jobs and process queued ones
          printQueue.retryAll();
          printQueue.setProcessFunction(() => this.processNextJob());
        }
      }
    }, 30_000);
  }

  private notify(): void {
    const jobs = printQueue.getAll();
    this.listeners.forEach(cb => cb(this._lastStatus, jobs));
  }
}

// Singleton
export const printerManager = new PrinterManager();
