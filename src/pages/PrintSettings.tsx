/**
 * PrintSettings
 * ──────────────
 * Dedicated page for configuring invoice/print settings.
 *
 * Settings are persisted via PrintSettingsProvider → localStorage
 * and consumed by print-service.ts and InvoiceTemplate.tsx.
 */

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Printer, Phone, Ruler, Image, Copy, RefreshCw, Receipt,
  CheckCircle2, Cloud, AlertCircle, QrCode, Globe, CookingPot,
  TestTube, Wifi, WifiOff,
  Camera, Music2, Scan, Monitor, Zap,
} from 'lucide-react';
import { PageTransition } from '@/components/ui/PageTransition';
import { FormToggle } from '@/components/ui/form-field';
import { usePrintSettings, type PaperSize } from '@/lib/services/print-settings';
import { printService } from '@/lib/services/print-service';
import { showSuccess, showError } from '@/components/ui/toast';
import { pageTransitionFast, staggerContainer } from "@/lib/animations/presets"
import { isElectron, getElectronAPI } from '@/lib/detect-electron';

/* ─── Component ─────────────────────────────────────────────── */

export function PrintSettingsPage() {
  const { settings, update, reset, syncNow, isSaving, lastSyncedAt } = usePrintSettings();
  const [syncError, setSyncError] = useState<string | null>(null);
  const [testPrinting, setTestPrinting] = useState<'receipt' | 'kot' | null>(null);
  const [printerStatus, setPrinterStatus] = useState<{
    receipt: { connected: boolean; name: string | null; error?: string };
    kitchen: { connected: boolean; ip: string | null; port: number; error?: string };
  } | null>(null);
  const [autoLaunch, setAutoLaunch] = useState(false);
  const [autoLaunchLoading, setAutoLaunchLoading] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{
    currentVersion: string;
    isUpdating: boolean;
  } | null>(null);

  // ── Electron-only: printer detection + auto-launch + update status ──
  const isDesktop = isElectron();

  useEffect(() => {
    if (!isDesktop) return;

    const api = getElectronAPI();

    // Check printer status on mount
    api.getPrinterStatus().then(setPrinterStatus).catch(() => {});

    // Get auto-launch setting
    api.getAutoLaunch().then(r => setAutoLaunch(r.enabled)).catch(() => {});

    // Get update status
    api.getUpdateStatus().then(setUpdateInfo).catch(() => {});

    // Refresh printer status every 30s
    const interval = setInterval(() => {
      api.getPrinterStatus().then(setPrinterStatus).catch(() => {});
    }, 30_000);

    return () => clearInterval(interval);
  }, [isDesktop]);

  const handleToggleAutoLaunch = useCallback(async () => {
    if (!isDesktop) return;
    setAutoLaunchLoading(true);
    try {
      const result = await getElectronAPI().setAutoLaunch(!autoLaunch);
      if (result.success) {
        setAutoLaunch(!autoLaunch);
        showSuccess(`Auto-launch ${!autoLaunch ? 'enabled' : 'disabled'}`);
      } else {
        showError(result.error || 'Failed to toggle auto-launch');
      }
    } catch {
      showError('Failed to toggle auto-launch');
    } finally {
      setAutoLaunchLoading(false);
    }
  }, [autoLaunch, isDesktop]);

  const handleCheckUpdates = useCallback(async () => {
    if (!isDesktop) return;
    try {
      await getElectronAPI().checkForUpdates();
      showSuccess('Checking for updates...');
    } catch {
      showError('Failed to check for updates');
    }
  }, [isDesktop]);

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

  const handleTestPrint = async (type: 'receipt' | 'kot') => {
    setTestPrinting(type);
    try {
      if (type === 'receipt') {
        await printService.printTestReceipt();
      } else {
        await printService.printTestKot();
      }
      showSuccess(`Test ${type === 'receipt' ? 'receipt' : 'KOT'} sent to printer`);
    } catch {
      showError(`Failed to print test ${type === 'receipt' ? 'receipt' : 'KOT'}`);
    } finally {
      setTestPrinting(null);
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
              Configure invoice receipts, thermal printer, and kitchen order ticket options
            </p>
          </div>
        </motion.div>

        {/* Invoice Information Card */}
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

            {/* PAN */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
                <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
                PAN / VAT Number
              </label>
              <input
                type="text"
                value={settings.pan}
                onChange={e => update({ pan: e.target.value })}
                placeholder="XXXXXXXXX"
                className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition-all focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
              />
            </div>
          </div>
        </motion.div>

        {/* Receipt Printer Card */}
        <motion.div variants={pageTransitionFast} className="rounded-xl border bg-card p-6 shadow-sm transition-all hover:shadow-md">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/30">
              <Printer className="h-5 w-5 text-teal-600 dark:text-teal-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold">Receipt Printer</h2>
              <p className="text-xs text-muted-foreground">
                Restaurant receipts, room bills, checkout receipts, and payment receipts
              </p>
            </div>
            {/* Desktop-only: printer status indicator */}
            {isDesktop && printerStatus && (
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold ${
                printerStatus.receipt.connected
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                  : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
              }`}>
                {printerStatus.receipt.connected ? (
                  <><Wifi className="h-3 w-3" /> Online</>
                ) : (
                  <><WifiOff className="h-3 w-3" /> Offline</>
                )}
              </div>
            )}
          </div>
          {isDesktop && printerStatus?.receipt.name && (
            <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
              <Monitor className="h-3 w-3" />
              <span className="font-mono">{printerStatus.receipt.name}</span>
            </div>
          )}

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

            {/* Test Print */}
            <div className="flex items-center justify-between rounded-xl border border-border p-4 transition-all hover:bg-muted/50">
              <div className="flex items-center gap-3">
                <TestTube className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Test Receipt Print</p>
                  <p className="text-xs text-muted-foreground">Print a sample receipt to verify printer configuration</p>
                </div>
              </div>
              <button
                onClick={() => handleTestPrint('receipt')}
                disabled={testPrinting === 'receipt'}
                className="flex items-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-teal-400 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {testPrinting === 'receipt' ? (
                  <>
                    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Printing...
                  </>
                ) : (
                  <>
                    <Printer className="h-3.5 w-3.5" />
                    Test Print
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>

        {/* Kitchen Printer Card */}
        <motion.div variants={pageTransitionFast} className="rounded-xl border bg-card p-6 shadow-sm transition-all hover:shadow-md">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/30">
              <CookingPot className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold">Kitchen Printer</h2>
              <p className="text-xs text-muted-foreground">
                Kitchen Order Tickets for new, updated, and modified orders
              </p>
            </div>
            {/* Desktop-only: printer status indicator */}
            {isDesktop && printerStatus && (
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold ${
                printerStatus.kitchen.connected
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                  : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
              }`}>
                {printerStatus.kitchen.connected ? (
                  <><Wifi className="h-3 w-3" /> Online</>
                ) : (
                  <><WifiOff className="h-3 w-3" /> Offline</>
                )}
              </div>
            )}
          </div>
          {isDesktop && printerStatus?.kitchen.ip && (
            <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
              <Monitor className="h-3 w-3" />
              <span className="font-mono">{printerStatus.kitchen.ip}:{printerStatus.kitchen.port}</span>
            </div>
          )}

          <div className="space-y-4">
            {/* Kitchen Printer Network Configuration */}
            <div className="rounded-xl border border-orange-200 dark:border-orange-800/30 bg-orange-50/50 dark:bg-orange-950/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-orange-700 dark:text-orange-400 mb-3">
                Network Configuration
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Printer className="h-3 w-3" />
                    Printer IP Address
                  </label>
                  <input
                    type="text"
                    value={settings.kitchenPrinterIp}
                    onChange={e => update({ kitchenPrinterIp: e.target.value })}
                    placeholder="e.g. 192.168.1.100"
                    className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm font-mono outline-none transition-all focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
                  />
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Static IP address of the network kitchen printer
                  </p>
                </div>
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Printer className="h-3 w-3" />
                    Printer Port
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={settings.kitchenPrinterPort}
                    onChange={e => update({ kitchenPrinterPort: parseInt(e.target.value) || 0 })}
                    placeholder="e.g. 9100"
                    className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm font-mono outline-none transition-all focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
                  />
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    TCP port (default 9100 for ESC/POS network printers)
                  </p>
                </div>
              </div>
            </div>

            {/* KOT Auto-print Toggle */}
            <div className="flex items-center justify-between rounded-xl border border-border p-4 transition-all hover:bg-muted/50">
              <div className="flex items-center gap-3">
                <CookingPot className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Auto-print KOT on Order</p>
                  <p className="text-xs text-muted-foreground">
                    Automatically print a kitchen order ticket when a waiter places an order in POS
                  </p>
                </div>
              </div>
              <FormToggle
                label=""
                checked={settings.kotEnabled}
                onChange={(v) => update({ kotEnabled: v })}
              />
            </div>

            {/* Show Customer Name on KOT */}
            <div className="flex items-center justify-between rounded-xl border border-border p-4 transition-all hover:bg-muted/50">
              <div className="flex items-center gap-3">
                <Printer className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Show Customer Name on KOT</p>
                  <p className="text-xs text-muted-foreground">
                    Print the customer/guest name on kitchen order tickets (hidden by default)
                  </p>
                </div>
              </div>
              <FormToggle
                label=""
                checked={settings.showCustomerOnKot}
                onChange={(v) => update({ showCustomerOnKot: v })}
              />
            </div>

            {/* Show Staff Name on KOT */}
            <div className="flex items-center justify-between rounded-xl border border-border p-4 transition-all hover:bg-muted/50">
              <div className="flex items-center gap-3">
                <Printer className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Show Staff Name on KOT</p>
                  <p className="text-xs text-muted-foreground">
                    Print the waiter/staff name on kitchen order tickets (hidden by default)
                  </p>
                </div>
              </div>
              <FormToggle
                label=""
                checked={settings.showStaffOnKot}
                onChange={(v) => update({ showStaffOnKot: v })}
              />
            </div>

            {/* KOT Print Copies */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
                <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                KOT Copies
              </label>
              <p className="mb-2 text-xs text-muted-foreground">
                Number of KOT copies to print (e.g. 1 for kitchen, 2 for kitchen + bar)
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => update({ kotPrintCopies: Math.max(1, settings.kotPrintCopies - 1) })}
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-border hover:bg-muted transition-all text-lg font-bold"
                >
                  −
                </button>
                <span className="flex h-11 w-16 items-center justify-center rounded-xl border bg-muted/30 text-sm font-bold tabular-nums">
                  {settings.kotPrintCopies}
                </span>
                <button
                  onClick={() => update({ kotPrintCopies: Math.min(10, settings.kotPrintCopies + 1) })}
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-border hover:bg-muted transition-all text-lg font-bold"
                >
                  +
                </button>
              </div>
            </div>

            {/* Test KOT Print */}
            <div className="flex items-center justify-between rounded-xl border border-border p-4 transition-all hover:bg-muted/50">
              <div className="flex items-center gap-3">
                <TestTube className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Test KOT Print</p>
                  <p className="text-xs text-muted-foreground">Print a sample kitchen order ticket to verify printer</p>
                </div>
              </div>
              <button
                onClick={() => handleTestPrint('kot')}
                disabled={testPrinting === 'kot'}
                className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-orange-400 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {testPrinting === 'kot' ? (
                  <>
                    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Printing...
                  </>
                ) : (
                  <>
                    <Printer className="h-3.5 w-3.5" />
                    Test KOT
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>

        {/* Customer Engagement QR Codes Card */}
        <motion.div variants={pageTransitionFast} className="rounded-xl border bg-card p-6 shadow-sm transition-all hover:shadow-md">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/30">
              <Scan className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </div>
            <h2 className="text-base font-semibold">Customer Engagement QR Codes</h2>
          </div>
          <p className="mb-4 text-xs text-muted-foreground">
            QR codes linking to your business profiles appear on printed receipts. All QR codes are generated locally at print time.
          </p>

          <div className="space-y-6">
            {/* ── Google Review ── */}
            <div className="rounded-xl border border-border p-4 transition-all hover:bg-muted/50">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                    <QrCode className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Google Review</p>
                    <p className="text-xs text-muted-foreground">Show Google Review QR code in the footer of printed receipts</p>
                  </div>
                </div>
                <FormToggle
                  label=""
                  checked={settings.enableGoogleReviewQr}
                  onChange={(v) => update({ enableGoogleReviewQr: v })}
                />
              </div>
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Globe className="h-3 w-3" />
                  Google Review URL
                </label>
                <input
                  type="url"
                  value={settings.googleReviewUrl}
                  onChange={e => update({ googleReviewUrl: e.target.value })}
                  placeholder="https://g.page/r/CYSJDIQPF_uwEAE/review"
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-xs outline-none transition-all focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 font-mono"
                />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  The QR code encodes this URL. Update if your Google Business Profile review link changes.
                </p>
              </div>
            </div>

            {/* ── Instagram ── */}
            <div className="rounded-xl border border-border p-4 transition-all hover:bg-muted/50">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-pink-100 dark:bg-pink-900/30">
                    <Camera className="h-4 w-4 text-pink-600 dark:text-pink-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Instagram</p>
                    <p className="text-xs text-muted-foreground">Show Instagram QR code in the footer of printed receipts</p>
                  </div>
                </div>
                <FormToggle
                  label=""
                  checked={settings.enableInstagramQr}
                  onChange={(v) => update({ enableInstagramQr: v })}
                />
              </div>
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Camera className="h-3 w-3" />
                  Instagram URL
                </label>
                <input
                  type="url"
                  value={settings.instagramUrl}
                  onChange={e => update({ instagramUrl: e.target.value })}
                  placeholder="https://www.instagram.com/yourprofile"
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-xs outline-none transition-all focus:ring-2 focus:ring-pink-500/30 focus:border-pink-500 font-mono"
                />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  QR code links to your Instagram profile. Default: highlandscafemotel
                </p>
              </div>
            </div>

            {/* ── TikTok ── */}
            <div className="rounded-xl border border-border p-4 transition-all hover:bg-muted/50">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-200 dark:bg-slate-700">
                    <Music2 className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">TikTok</p>
                    <p className="text-xs text-muted-foreground">Show TikTok QR code in the footer of printed receipts</p>
                  </div>
                </div>
                <FormToggle
                  label=""
                  checked={settings.enableTiktokQr}
                  onChange={(v) => update({ enableTiktokQr: v })}
                />
              </div>
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Music2 className="h-3 w-3" />
                  TikTok URL
                </label>
                <input
                  type="url"
                  value={settings.tiktokUrl}
                  onChange={e => update({ tiktokUrl: e.target.value })}
                  placeholder="https://www.tiktok.com/@yourprofile"
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-xs outline-none transition-all focus:ring-2 focus:ring-slate-500/30 focus:border-slate-500 font-mono"
                />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  QR code links to your TikTok profile. Default: highlandscafe1
                </p>
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

            {/* Desktop-only: Auto-launch on Windows startup */}
            {isDesktop && (
              <div className="flex items-center justify-between rounded-xl border border-border p-4 transition-all hover:bg-muted/50">
                <div className="flex items-center gap-3">
                  <Zap className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Start with Windows</p>
                    <p className="text-xs text-muted-foreground">Automatically launch Highlands POS when Windows starts</p>
                  </div>
                </div>
                <FormToggle
                  label=""
                  checked={autoLaunch}
                  onChange={handleToggleAutoLaunch}
                  disabled={autoLaunchLoading}
                />
              </div>
            )}
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
                  Syncing...
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
