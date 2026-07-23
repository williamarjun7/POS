/**
 * PrintSettings
 * ──────────────
 * Dedicated page for configuring invoice/print settings.
 *
 * Settings are persisted via PrintSettingsProvider → localStorage
 * and consumed by print-service.ts and InvoiceTemplate.tsx.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Printer, Phone, FileText, Ruler, Image, Copy, RefreshCw, Receipt, CheckCircle2, Cloud, AlertCircle } from 'lucide-react';
import { PageTransition } from '@/components/ui/PageTransition';
import { FormToggle } from '@/components/ui/form-field';
import { usePrintSettings, type PaperSize } from '@/lib/services/print-settings';
import { showSuccess, showError } from '@/components/ui/toast';
import { pageTransitionFast, staggerContainer } from "@/lib/animations/presets"

/* ─── Component ─────────────────────────────────────────────── */

export function PrintSettingsPage() {
  const { settings, update, reset, syncNow, isSaving, lastSyncedAt } = usePrintSettings();
  const [syncError, setSyncError] = useState<string | null>(null);

  const handleSave = async () => {
    setSyncError(null);
    try {
      await syncNow();
      showSuccess('Settings synced to cloud');
    } catch {
      setSyncError('Failed to sync. Check your connection and try again.');
      showError('Failed to sync settings to cloud');
    }
  };

  return (
    <PageTransition>
      <motion.div
        className="mx-auto w-full max-w-2xl space-y-6"
        initial="hidden"
        animate="visible"
        variants={staggerContainer}
      >
        {/* Header */}
        <motion.div variants={pageTransitionFast} className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg">
            <Printer className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Print Settings</h1>
            <p className="text-sm text-muted-foreground">
              Configure invoice receipts and thermal printer options
            </p>
          </div>
        </motion.div>

        {/* Business Info Card */}
        <motion.div variants={pageTransitionFast} className="rounded-xl border bg-card p-6 shadow-sm transition-all hover:shadow-md">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
              <Receipt className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <h2 className="text-base font-semibold">Invoice Information</h2>
          </div>
          <p className="mb-4 text-xs text-muted-foreground">
            These details appear on printed customer invoices.
          </p>

          <div className="space-y-4">
            {/* Phone */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                Phone Number
              </label>
              <input
                type="tel"
                value={settings.phone}
                onChange={e => update({ phone: e.target.value })}
                placeholder="+977-XX-XXXXXXX"
                className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition-all focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
              />
            </div>


          </div>
        </motion.div>

        {/* Printer Config Card */}
        <motion.div variants={pageTransitionFast} className="rounded-xl border bg-card p-6 shadow-sm transition-all hover:shadow-md">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-900/30">
              <Printer className="h-5 w-5 text-sky-600 dark:text-sky-400" />
            </div>
            <h2 className="text-base font-semibold">Printer Configuration</h2>
          </div>

          <div className="space-y-4">
            {/* Paper Size */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
                <Ruler className="h-3.5 w-3.5 text-muted-foreground" />
                Paper Size
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['58mm', '80mm', 'A4'] as PaperSize[]).map(size => (
                  <button
                    key={size}
                    onClick={() => update({ paperSize: size })}
                    className={`flex items-center justify-center rounded-xl border-2 px-4 py-3 text-sm font-semibold transition-all ${
                      settings.paperSize === size
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300 shadow-sm'
                        : 'border-border text-muted-foreground hover:border-emerald-300 hover:bg-emerald-50/30 dark:hover:bg-emerald-950/10'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {settings.paperSize === '58mm'
                  ? 'Narrow thermal receipt paper (common for small printers)'
                  : settings.paperSize === '80mm'
                  ? 'Standard thermal receipt paper (recommended)'
                  : 'Full A4 page for PDF or laser printing'}
              </p>
            </div>

            {/* Print Copies */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
                <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                Print Copies
              </label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => update({ printCopies: Math.max(1, settings.printCopies - 1) })}
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-border hover:bg-muted transition-all text-lg font-bold"
                >
                  −
                </button>
                <span className="flex h-11 w-16 items-center justify-center rounded-xl border bg-muted/30 text-sm font-bold tabular-nums">
                  {settings.printCopies}
                </span>
                <button
                  onClick={() => update({ printCopies: Math.min(10, settings.printCopies + 1) })}
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-border hover:bg-muted transition-all text-lg font-bold"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Display Options Card */}
        <motion.div variants={pageTransitionFast} className="rounded-xl border bg-card p-6 shadow-sm transition-all hover:shadow-md">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
              <Image className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <h2 className="text-base font-semibold">Display Options</h2>
          </div>

          <div className="space-y-4">
            {/* Show Logo */}
            <div className="flex items-center justify-between rounded-xl border border-border p-4 transition-all hover:bg-muted/50">
              <div className="flex items-center gap-3">
                <Image className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Show Logo on Receipts</p>
                  <p className="text-xs text-muted-foreground">Display business logo at the top of printed invoices</p>
                </div>
              </div>
              <FormToggle
                label=""
                checked={settings.showLogo}
                onChange={(v) => update({ showLogo: v })}
              />
            </div>

            {/* Auto-print */}
            <div className="flex items-center justify-between rounded-xl border border-border p-4 transition-all hover:bg-muted/50">
              <div className="flex items-center gap-3">
                <Printer className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Auto-print Receipts</p>
                  <p className="text-xs text-muted-foreground">Automatically print invoices after each payment</p>
                </div>
              </div>
              <FormToggle
                label=""
                checked={settings.autoPrint}
                onChange={(v) => update({ autoPrint: v })}
              />
            </div>
          </div>
        </motion.div>

        {/* Actions */}
        <motion.div variants={pageTransitionFast} className="flex items-center justify-between gap-4 pb-8 flex-wrap">
          <button
            onClick={reset}
            className="flex items-center gap-2 rounded-xl border border-border px-5 py-3 text-sm font-medium text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
          >
            <RefreshCw className="h-4 w-4" />
            Reset to Defaults
          </button>

          <div className="flex items-center gap-3">
            {/* Sync status */}
            {lastSyncedAt && !syncError && (
              <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                Synced
              </span>
            )}
            {syncError && (
              <span className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle className="h-3 w-3" />
                Sync failed
              </span>
            )}

            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:from-emerald-400 hover:to-emerald-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Syncing…
                </>
              ) : (
                <>
                  <Cloud className="h-4 w-4" />
                  Sync to Cloud
                </>
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </PageTransition>
  );
}
