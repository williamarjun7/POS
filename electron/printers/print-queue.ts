/**
 * print-queue.ts
 * ───────────────
 * Persistent print queue for offline support and automatic recovery.
 *
 * Features:
 *   - Persists jobs to disk (survives app restarts)
 *   - Automatic retry when printer comes back online
 *   - Never loses print jobs
 *   - Never duplicates print jobs
 *   - Non-blocking — never blocks business operations
 *
 * The queue is stored in the app's userData directory using electron-store.
 * Jobs persist across app restarts and are re-processed on startup.
 */

import Store from 'electron-store';
import { app } from 'electron';
import * as crypto from 'crypto';

export type PrintJobType = 'invoice' | 'kot' | 'bill_preview' | 'test_receipt' | 'test_kot';

export interface PrintJobMeta {
  id: string;
  type: PrintJobType;
  status: 'queued' | 'printing' | 'completed' | 'failed';
  error?: string;
  createdAt: string;
  completedAt?: string;
  retryCount: number;
  maxRetries: number;
  /** For kitchen: the raw ESC/POS buffer stored as base64 */
  escposBase64: string;
  /** Reference info for display */
  reference: string;
}

export interface QueueStore {
  jobs: PrintJobMeta[];
}

type QueueChangeCallback = (jobs: PrintJobMeta[]) => void;

class PrintQueue {
  private store: Store<QueueStore>;
  private processingJobs = false;
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  private listeners: Set<QueueChangeCallback> = new Set();
  private processFunction: (() => Promise<void>) | null = null;

  constructor() {
    this.store = new Store<QueueStore>({
      name: 'print-queue',
      cwd: app.getPath('userData'),
      defaults: { jobs: [] },
    });
  }

  /**
   * Register the function that processes print jobs.
   * Called once by printer-manager.ts.
   */
  setProcessFunction(fn: () => Promise<void>): void {
    this.processFunction = fn;
  }

  // ─── Job management ──────────────────────────────

  /**
   * Add a job to the queue.
   * Persisted immediately to disk.
   */
  add(type: PrintJobType, escposBase64: string, reference: string, maxRetries = 3): string {
    const id = crypto.randomUUID();
    const job: PrintJobMeta = {
      id,
      type,
      status: 'queued',
      createdAt: new Date().toISOString(),
      retryCount: 0,
      maxRetries,
      escposBase64,
      reference,
    };

    const jobs = this.store.get('jobs');
    jobs.push(job);
    this.store.set('jobs', jobs);
    this.notify();

    // Start processing if not already running
    if (!this.processingJobs && this.processFunction) {
      this.processFunction();
    }

    return id;
  }

  /**
   * Get all jobs in the queue.
   */
  getAll(): PrintJobMeta[] {
    return this.store.get('jobs');
  }

  /**
   * Get jobs by status.
   */
  getByStatus(status: PrintJobMeta['status']): PrintJobMeta[] {
    return this.getAll().filter(j => j.status === status);
  }

  /**
   * Get the next queued job.
   */
  getNextQueued(): PrintJobMeta | undefined {
    return this.getAll().find(j => j.status === 'queued');
  }

  /**
   * Update a job's status.
   * Persisted immediately to disk.
   */
  updateStatus(id: string, status: PrintJobMeta['status'], error?: string): void {
    const jobs = this.store.get('jobs');
    const job = jobs.find(j => j.id === id);
    if (!job) return;

    job.status = status;
    if (error) job.error = error;
    if (status === 'completed') job.completedAt = new Date().toISOString();
    if (status === 'failed') job.retryCount = job.retryCount + 1;

    this.store.set('jobs', jobs);
    this.notify();
  }

  /**
   * Retry a failed job.
   */
  retry(id: string): boolean {
    const jobs = this.store.get('jobs');
    const job = jobs.find(j => j.id === id && j.status === 'failed');
    if (!job) return false;

    job.status = 'queued';
    job.error = undefined;
    job.retryCount = 0;
    this.store.set('jobs', jobs);
    this.notify();

    if (!this.processingJobs && this.processFunction) {
      this.processFunction();
    }

    return true;
  }

  /**
   * Retry all failed jobs.
   */
  retryAll(): number {
    const jobs = this.store.get('jobs');
    let count = 0;
    for (const job of jobs) {
      if (job.status === 'failed') {
        job.status = 'queued';
        job.error = undefined;
        job.retryCount = 0;
        count++;
      }
    }
    this.store.set('jobs', jobs);
    if (count > 0) this.notify();
    return count;
  }

  /**
   * Clear completed jobs from the queue.
   */
  clearCompleted(): number {
    const jobs = this.store.get('jobs');
    const before = jobs.length;
    const remaining = jobs.filter(j => j.status !== 'completed');
    this.store.set('jobs', remaining);
    if (remaining.length !== before) this.notify();
    return before - remaining.length;
  }

  /**
   * Clear all jobs (for testing / admin).
   */
  clearAll(): void {
    this.store.set('jobs', []);
    this.notify();
  }

  // ─── Processing ──────────────────────────────────

  /**
   * Mark the queue as being processed.
   */
  setProcessing(processing: boolean): void {
    this.processingJobs = processing;
  }

  isProcessing(): boolean {
    return this.processingJobs;
  }

  /**
   * Check if there are any queued jobs.
   */
  hasQueuedJobs(): boolean {
    return this.getAll().some(j => j.status === 'queued');
  }

  /**
   * Check if there are any failed jobs.
   */
  hasFailedJobs(): boolean {
    return this.getAll().some(j => j.status === 'failed');
  }

  // ─── Health Check ────────────────────────────────

  /**
   * Start periodic health checking.
   * When a printer comes back online, queued/failed jobs are retried.
   */
  startHealthCheck(checkFn: () => Promise<boolean>, intervalMs = 30_000): void {
    if (this.healthCheckInterval) return;

    this.healthCheckInterval = setInterval(async () => {
      const hasWork = this.hasQueuedJobs() || this.hasFailedJobs();
      if (!hasWork) return;

      const printerOnline = await checkFn();
      if (printerOnline && this.processFunction && !this.processingJobs) {
        this.processFunction();
      }
    }, intervalMs);
  }

  stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  // ─── Subscriptions ───────────────────────────────

  onChange(callback: QueueChangeCallback): () => void {
    this.listeners.add(callback);
    // Immediately call with current state
    callback(this.getAll());
    return () => this.listeners.delete(callback);
  }

  private notify(): void {
    const jobs = this.getAll();
    this.listeners.forEach(cb => cb(jobs));
  }

  /**
   * Get queue statistics.
   */
  getStats(): {
    queued: number;
    printing: number;
    completed: number;
    failed: number;
    total: number;
  } {
    const jobs = this.getAll();
    return {
      queued: jobs.filter(j => j.status === 'queued').length,
      printing: jobs.filter(j => j.status === 'printing').length,
      completed: jobs.filter(j => j.status === 'completed').length,
      failed: jobs.filter(j => j.status === 'failed').length,
      total: jobs.length,
    };
  }
}

// Singleton — shared across the application
export const printQueue = new PrintQueue();
