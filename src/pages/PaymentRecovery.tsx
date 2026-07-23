/**
 * Payment Recovery Page
 * ─────────────────────
 * Administrator interface for payment reconciliation and recovery.
 *
 * Provides:
 *   - Dashboard summary of pending/failed payments
 *   - List of pending payments with retry capability
 *   - Full reconciliation scan
 *   - Manual retry of failed payments
 *   - Inspection of gateway transaction details
 *
 * Never requires manual database edits.
 */

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  Shield, RefreshCw, AlertTriangle, CheckCircle, Clock,
  ExternalLink, Loader2, Search, X, ArrowLeft, FileWarning,
  Ban, Trash2, Info, Activity,
} from 'lucide-react'
import { PageTransition } from '@/components/ui/PageTransition'
import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { showSuccess, showError } from '@/components/ui/toast'
import { formatCurrency } from '@/lib/utils'
import { useAuth } from '@/lib/core/auth-context'
import { RequirePermission } from '@/lib/core/PermissionGuards'
import {
  loadPendingPayments,
  loadFailedPayments,
  retryPendingPayment,
  completePendingPayment,
  countPendingPayments,
  type PendingPaymentRecord,
} from '@/lib/services/pending-payment-store'
import { runPaymentRecovery, retryFailedPayment, type RecoveryResult } from '@/lib/services/payment-recovery'
import {
  runReconciliation,
  getReconciliationSummary,
  type ReconciliationReport,
} from '@/lib/services/reconciliation-service'

// ─── Types ───────────────────────────────────────────────────

type TabId = 'overview' | 'pending' | 'failed' | 'reconciliation'

interface Counts {
  pending: number
  processing: number
  failed: number
  completed: number
}

// ─── Helpers ─────────────────────────────────────────────────

function npr(amount: number) {
  return formatCurrency(amount)
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function statusColor(status: string): 'success' | 'warning' | 'destructive' | 'default' | 'info' | 'secondary' {
  switch (status) {
    case 'pending': return 'warning'
    case 'processing': return 'info'
    case 'completed': return 'success'
    case 'failed': return 'destructive'
    case 'expired': return 'default'
    default: return 'secondary'
  }
}

// ─── Component ───────────────────────────────────────────────

export function PaymentRecovery() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<TabId>('overview')

  // Data states
  const [counts, setCounts] = useState<Counts>({ pending: 0, processing: 0, failed: 0, completed: 0 })
  const [pendingRecords, setPendingRecords] = useState<PendingPaymentRecord[]>([])
  const [failedRecords, setFailedRecords] = useState<PendingPaymentRecord[]>([])
  const [reconciliationReport, setReconciliationReport] = useState<ReconciliationReport | null>(null)
  const [reconciliationSummary, setReconciliationSummary] = useState<{
    pendingCount: number
    failedCount: number
    invoicesWithoutPayments: number
  }>({ pendingCount: 0, failedCount: 0, invoicesWithoutPayments: 0 })

  // UI states
  const [loading, setLoading] = useState(true)
  const [recovering, setRecovering] = useState(false)
  const [reconciling, setReconciling] = useState(false)
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedRecord, setSelectedRecord] = useState<PendingPaymentRecord | null>(null)

  // ─── Load data ────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [cnts, pendings, faileds, summary] = await Promise.all([
        countPendingPayments(),
        loadPendingPayments(),
        loadFailedPayments(),
        getReconciliationSummary(),
      ])

      setCounts(cnts)
      setPendingRecords(pendings.dbRecords)
      setFailedRecords(faileds)
      setReconciliationSummary(summary)
    } catch (err) {
      if (import.meta.env.DEV) console.error('[RECOVERY] Failed to load data:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ─── Run Recovery ─────────────────────────────────────────
  const handleRunRecovery = async () => {
    setRecovering(true)
    try {
      const result = await runPaymentRecovery()
      showSuccess(result.summary)

      if (result.recovered.length > 0) {
        result.recovered.forEach(r => {
          if (import.meta.env.DEV) console.log('[RECOVERY] Recovered:', r.detail)
        })
      }
      if (result.failed.length > 0) {
        result.failed.forEach(r => {
          showError(`Recovery failed: ${r.detail}`)
        })
      }

      await loadData()
    } catch (err) {
      showError('Recovery process failed')
    } finally {
      setRecovering(false)
    }
  }

  // ─── Run Reconciliation ───────────────────────────────────
  const handleRunReconciliation = async (autoRepair: boolean = false) => {
    setReconciling(true)
    try {
      const report = await runReconciliation(autoRepair)
      setReconciliationReport(report)
      showSuccess(`Reconciliation complete: ${report.summary.totalScanned} items scanned${autoRepair ? `, ${report.summary.repairsSucceeded} repaired` : ''}`)
      await loadData()
    } catch (err) {
      showError('Reconciliation process failed')
    } finally {
      setReconciling(false)
    }
  }

  // ─── Retry a failed payment ───────────────────────────────
  const handleRetry = async (record: PendingPaymentRecord) => {
    setRetryingId(record.id)
    try {
      const result = await retryFailedPayment(record.paymentReference)
      if (result.outcome === 'recovered' || result.outcome === 'already_exists') {
        showSuccess(`Payment recovered: ${result.detail}`)
      } else {
        showError(`Retry failed: ${result.detail}`)
      }
      await loadData()
    } catch (err) {
      showError('Retry failed')
    } finally {
      setRetryingId(null)
    }
  }

  // ─── Dismiss a failed payment ─────────────────────────────
  const handleDismiss = async (record: PendingPaymentRecord) => {
    try {
      await completePendingPayment(record.paymentReference)
      showSuccess('Payment record dismissed')
      await loadData()
    } catch (err) {
      showError('Failed to dismiss record')
    }
  }

  // ─── Filtered lists ───────────────────────────────────────
  const q = searchQuery.toLowerCase()
  const filteredPending = pendingRecords.filter(r =>
    r.paymentReference.toLowerCase().includes(q) ||
    (r.gatewayReference ?? '').toLowerCase().includes(q) ||
    (r.customerName ?? '').toLowerCase().includes(q)
  )
  const filteredFailed = failedRecords.filter(r =>
    r.paymentReference.toLowerCase().includes(q) ||
    (r.gatewayReference ?? '').toLowerCase().includes(q) ||
    (r.customerName ?? '').toLowerCase().includes(q)
  )

  // ─── Tabs ─────────────────────────────────────────────────
  const tabs = [
    { id: 'overview' as TabId, label: 'Overview' },
    { id: 'pending' as TabId, label: 'Pending', count: counts.pending + counts.processing },
    { id: 'failed' as TabId, label: 'Failed', count: counts.failed },
    { id: 'reconciliation' as TabId, label: 'Reconciliation' },
  ]

  // ─── Render ───────────────────────────────────────────────
  return (
    <PageTransition>
      <div className="space-y-6 p-3 sm:p-6">
        <PageHeader
          icon="Shield"
          title="Payment Recovery"
          description="Monitor and recover interrupted payments. Ensures no confirmed payment is ever lost."
        />

        {/* ─── Tabs ─── */}
        <div className="flex border-b border-border gap-1 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap
                ${activeTab === tab.id
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-muted-foreground hover:text-foreground'
                }`}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className={`ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold
                  ${activeTab === tab.id
                    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                    : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {tab.count}
                </span>
              )}
              {activeTab === tab.id && (
                <motion.div
                  layoutId="recovery-tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500"
                />
              )}
            </button>
          ))}
        </div>

        {/* ════════════════════════════════════════════════════════
            OVERVIEW TAB
            ════════════════════════════════════════════════════════ */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Stats Grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-amber-200 dark:border-amber-800 bg-gradient-to-br from-amber-50/80 to-white dark:from-amber-950/20 dark:to-background p-5"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{counts.pending + counts.processing}</p>
                    <p className="text-xs text-amber-600/70 dark:text-amber-400/70">Pending Recovery</p>
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="rounded-xl border border-red-200 dark:border-red-800 bg-gradient-to-br from-red-50/80 to-white dark:from-red-950/20 dark:to-background p-5"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                    <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-red-700 dark:text-red-300">{counts.failed}</p>
                    <p className="text-xs text-red-600/70 dark:text-red-400/70">Failed Payments</p>
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-gradient-to-br from-emerald-50/80 to-white dark:from-emerald-950/20 dark:to-background p-5"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                    <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{reconciliationSummary.pendingCount === 0 ? 'Clear' : counts.completed}</p>
                    <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70">System Health</p>
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="rounded-xl border border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50/80 to-white dark:from-blue-950/20 dark:to-background p-5"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <FileWarning className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{reconciliationSummary.invoicesWithoutPayments}</p>
                    <p className="text-xs text-blue-600/70 dark:text-blue-400/70">Orphaned Invoices</p>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-3">
              <RequirePermission permission="finance.manage">
                <Button
                  onClick={handleRunRecovery}
                  disabled={recovering}
                  className="flex items-center gap-2"
                >
                  {recovering ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  {recovering ? 'Running Recovery...' : 'Run Payment Recovery'}
                </Button>
              </RequirePermission>

              <RequirePermission permission="finance.manage">
                <Button
                  onClick={() => handleRunReconciliation(false)}
                  disabled={reconciling}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  {reconciling ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  {reconciling ? 'Scanning...' : 'Full Reconciliation Scan'}
                </Button>
              </RequirePermission>

              <RequirePermission permission="finance.manage">
                <Button
                  onClick={() => handleRunReconciliation(true)}
                  disabled={reconciling}
                  variant="outline"
                  className="flex items-center gap-2 text-amber-600 border-amber-300 hover:bg-amber-50"
                >
                  {reconciling ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Activity className="h-4 w-4" />
                  )}
                  {reconciling ? 'Repairing...' : 'Scan & Auto-Repair'}
                </Button>
              </RequirePermission>
            </div>

            {/* Recent Reconciliation Results */}
            {reconciliationReport && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-border bg-card p-5"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold">Last Reconciliation Results</h3>
                  <span className="text-xs text-muted-foreground">
                    {new Date(reconciliationReport.timestamp).toLocaleString()}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="text-center p-3 rounded-lg bg-muted/50">
                    <p className="text-lg font-bold">{reconciliationReport.summary.totalScanned}</p>
                    <p className="text-[10px] text-muted-foreground">Scanned</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20">
                    <p className="text-lg font-bold text-amber-600">{reconciliationReport.summary.invoicesWithoutPayments}</p>
                    <p className="text-[10px] text-amber-600/70">Missing Payments</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-red-50 dark:bg-red-950/20">
                    <p className="text-lg font-bold text-red-600">{reconciliationReport.summary.duplicatesFound}</p>
                    <p className="text-[10px] text-red-600/70">Duplicates</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20">
                    <p className="text-lg font-bold text-emerald-600">{reconciliationReport.summary.repairsSucceeded}</p>
                    <p className="text-[10px] text-emerald-600/70">Repaired</p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Health Check */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="rounded-xl border border-border bg-card p-5"
            >
              <h3 className="text-sm font-semibold mb-3">System Health</h3>
              <div className="space-y-3">
                {[
                  {
                    label: 'Pending Payment Recovery',
                    status: counts.pending + counts.processing === 0 ? 'healthy' : 'attention',
                    detail: counts.pending + counts.processing === 0
                      ? 'No payments waiting for recovery'
                      : `${counts.pending + counts.processing} payment(s) awaiting processing`,
                  },
                  {
                    label: 'Failed Payments',
                    status: counts.failed === 0 ? 'healthy' : 'warning',
                    detail: counts.failed === 0
                      ? 'No failed payments'
                      : `${counts.failed} payment(s) failed — may require admin attention`,
                  },
                  {
                    label: 'Invoice-Payment Consistency',
                    status: reconciliationSummary.invoicesWithoutPayments === 0 ? 'healthy' : 'warning',
                    detail: reconciliationSummary.invoicesWithoutPayments === 0
                      ? 'All invoices have payments'
                      : `${reconciliationSummary.invoicesWithoutPayments} invoice(s) without payments`,
                  },
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${
                        item.status === 'healthy' ? 'bg-emerald-500' :
                        item.status === 'attention' ? 'bg-amber-500' : 'bg-red-500'
                      }`} />
                      <div>
                        <p className="text-sm font-medium">{item.label}</p>
                        <p className="text-xs text-muted-foreground">{item.detail}</p>
                      </div>
                    </div>
                    <StatusBadge
                      label={item.status === 'healthy' ? 'OK' : item.status === 'attention' ? 'Pending' : 'Issues'}
                      variant={item.status === 'healthy' ? 'success' : item.status === 'attention' ? 'warning' : 'destructive'}
                    />
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════
            PENDING TAB
            ════════════════════════════════════════════════════════ */}
        {activeTab === 'pending' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search by reference, customer..."
                  className="w-full h-10 pl-10 pr-4 rounded-xl border border-border bg-card text-sm outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
                />
              </div>
              <span className="text-xs text-muted-foreground shrink-0">{filteredPending.length} records</span>
            </div>

            <div className="space-y-2">
              {filteredPending.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mb-3 text-emerald-500/50" />
                  <p className="font-medium">No Pending Payments</p>
                  <p className="text-sm">All payments have been successfully processed.</p>
                </div>
              ) : (
                filteredPending.map(record => (
                  <motion.div
                    key={record.id}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border border-border bg-card p-4 hover:border-amber-300 dark:hover:border-amber-700 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <StatusBadge label={record.status} variant={statusColor(record.status)} />
                          <span className="text-sm font-mono font-medium">{record.paymentReference}</span>
                          {record.gatewayReference && (
                            <span className="text-xs text-muted-foreground font-mono">
                              PRN: {record.gatewayReference.slice(0, 12)}...
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>Amount: <strong className="text-foreground">{npr(record.invoiceAmount)}</strong></span>
                          <span>Method: <strong className="text-foreground">{record.paymentMethod}</strong></span>
                          {record.customerName && <span>Customer: <strong className="text-foreground">{record.customerName}</strong></span>}
                          <span>Age: <strong className="text-foreground">{timeAgo(record.createdAt)}</strong></span>
                          {record.retryCount > 0 && <span>Retries: <strong className="text-amber-600">{record.retryCount}/{record.maxRetries}</strong></span>}
                        </div>
                        {record.lastError && (
                          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-red-600 bg-red-50 dark:bg-red-950/20 rounded-lg px-2 py-1">
                            <AlertTriangle className="h-3 w-3 shrink-0" />
                            <span className="truncate">{record.lastError}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleRetry(record)}
                          disabled={retryingId === record.id}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 transition-colors disabled:opacity-50 flex items-center gap-1"
                        >
                          {retryingId === record.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3 w-3" />
                          )}
                          Retry
                        </button>
                        <button
                          onClick={() => setSelectedRecord(record)}
                          className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors"
                        >
                          <Info className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════
            FAILED TAB
            ════════════════════════════════════════════════════════ */}
        {activeTab === 'failed' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search failed payments..."
                    className="w-full h-10 pl-10 pr-4 rounded-xl border border-border bg-card text-sm outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
                  />
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{filteredFailed.length} records</span>
              </div>
            </div>

            <div className="space-y-2">
              {filteredFailed.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mb-3 text-emerald-500/50" />
                  <p className="font-medium">No Failed Payments</p>
                  <p className="text-sm">All payment records are healthy.</p>
                </div>
              ) : (
                filteredFailed.map(record => (
                  <motion.div
                    key={record.id}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border border-red-200 dark:border-red-800 bg-card p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <StatusBadge label="Failed" variant="destructive" />
                          <span className="text-sm font-mono font-medium">{record.paymentReference}</span>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>Amount: <strong className="text-foreground">{npr(record.invoiceAmount)}</strong></span>
                          <span>Method: <strong className="text-foreground">{record.paymentMethod}</strong></span>
                          {record.customerName && <span>Customer: <strong className="text-foreground">{record.customerName}</strong></span>}
                          <span>Retries: <strong className="text-red-600">{record.retryCount}/{record.maxRetries}</strong></span>
                          <span>Created: <strong className="text-foreground">{timeAgo(record.createdAt)}</strong></span>
                        </div>
                        {record.lastError && (
                          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-red-600 bg-red-50 dark:bg-red-950/20 rounded-lg px-2 py-1">
                            <AlertTriangle className="h-3 w-3 shrink-0" />
                            <span>{record.lastError}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleRetry(record)}
                          disabled={retryingId === record.id}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 transition-colors disabled:opacity-50 flex items-center gap-1"
                        >
                          {retryingId === record.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3 w-3" />
                          )}
                          Retry
                        </button>
                        <button
                          onClick={() => handleDismiss(record)}
                          className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted transition-colors flex items-center gap-1"
                        >
                          <Ban className="h-3 w-3" />
                          Dismiss
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════
            RECONCILIATION TAB
            ════════════════════════════════════════════════════════ */}
        {activeTab === 'reconciliation' && (
          <div className="space-y-6">
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-sm font-semibold mb-3">Run Reconciliation</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Scans invoices, payments, and pending records for inconsistencies.
                Finds orphaned payments, invoices without payments, duplicates, and stale pending records.
              </p>
              <div className="flex flex-wrap gap-3">
                <RequirePermission permission="finance.manage">
                  <Button
                    onClick={() => handleRunReconciliation(false)}
                    disabled={reconciling}
                    className="flex items-center gap-2"
                  >
                    {reconciling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    {reconciling ? 'Scanning...' : 'Run Scan'}
                  </Button>
                </RequirePermission>
                <RequirePermission permission="finance.manage">
                  <Button
                    onClick={() => handleRunReconciliation(true)}
                    disabled={reconciling}
                    variant="outline"
                    className="flex items-center gap-2"
                  >
                    {reconciling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
                    {reconciling ? 'Repairing...' : 'Scan & Auto-Repair'}
                  </Button>
                </RequirePermission>
              </div>
            </div>

            {/* Findings */}
            {reconciliationReport && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold">Findings</h3>
                {reconciliationReport.findings.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <CheckCircle className="h-12 w-12 mb-3 text-emerald-500/50" />
                    <p className="font-medium">Clean Bill of Health</p>
                    <p className="text-sm">No inconsistencies found.</p>
                  </div>
                ) : (
                  reconciliationReport.findings.map((finding, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.03 }}
                      className={`rounded-xl border p-4 ${
                        finding.severity === 'critical'
                          ? 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/10'
                          : finding.severity === 'warning'
                            ? 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/10'
                            : 'border-border bg-card'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {finding.severity === 'critical' ? (
                          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                        ) : finding.severity === 'warning' ? (
                          <FileWarning className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                        ) : (
                          <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <StatusBadge
                              label={finding.type.replace(/_/g, ' ')}
                              variant={finding.resolved ? 'success' : 'secondary'}
                            />
                            <span className="text-sm font-medium">{finding.entityLabel}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">{finding.detail}</p>
                          <p className="text-xs font-semibold mt-1">Amount: {npr(finding.amount)}</p>
                        </div>
                        <StatusBadge
                          label={finding.resolved ? 'Resolved' : 'Open'}
                          variant={finding.resolved ? 'success' : 'warning'}
                        />
                      </div>
                    </motion.div>
                  ))
                )}

                {/* Actions Log */}
                {reconciliationReport.actions.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-sm font-semibold mb-3">Actions Taken</h3>
                    <div className="space-y-2">
                      {reconciliationReport.actions.map((action, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between rounded-lg border border-border p-3"
                        >
                          <div className="flex items-center gap-2">
                            <StatusBadge
                              label={action.type}
                              variant={action.outcome === 'success' ? 'success' : action.outcome === 'failed' ? 'destructive' : 'secondary'}
                            />
                            <span className="text-sm">{action.entityLabel}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">{action.detail}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ─── Detail Modal ─────────────────────────────────── */}
        <AnimatePresence>
          {selectedRecord && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
              onClick={() => setSelectedRecord(null)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="w-full max-w-lg rounded-xl border bg-background shadow-2xl overflow-hidden"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between p-4 border-b">
                  <h3 className="font-semibold">Payment Details</h3>
                  <button
                    onClick={() => setSelectedRecord(null)}
                    className="p-1 rounded-lg hover:bg-muted transition-colors"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Payment Reference</p>
                      <p className="font-mono font-medium">{selectedRecord.paymentReference}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Gateway Reference</p>
                      <p className="font-mono">{selectedRecord.gatewayReference || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Invoice Amount</p>
                      <p className="font-semibold">{npr(selectedRecord.invoiceAmount)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Payment Method</p>
                      <p>{selectedRecord.paymentMethod}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Status</p>
                      <StatusBadge label={selectedRecord.status} variant={statusColor(selectedRecord.status)} />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Retries</p>
                      <p>{selectedRecord.retryCount}/{selectedRecord.maxRetries}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Customer</p>
                      <p>{selectedRecord.customerName || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Source</p>
                      <p>{selectedRecord.sourcePage}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground">Created</p>
                      <p>{new Date(selectedRecord.createdAt).toLocaleString()}</p>
                    </div>
                    {selectedRecord.lastError && (
                      <div className="col-span-2">
                        <p className="text-xs text-muted-foreground">Last Error</p>
                        <p className="text-red-600 bg-red-50 dark:bg-red-950/20 rounded-lg p-2 mt-1 text-sm">{selectedRecord.lastError}</p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="p-4 border-t flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setSelectedRecord(null)}
                  >
                    Close
                  </Button>
                  <Button
                    onClick={() => {
                      handleRetry(selectedRecord)
                      setSelectedRecord(null)
                    }}
                    disabled={retryingId === selectedRecord.id}
                    className="flex items-center gap-1"
                  >
                    {retryingId === selectedRecord.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    Retry Payment
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </PageTransition>
  )
}
