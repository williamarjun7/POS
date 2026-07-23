import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from "framer-motion"
import { ArrowLeft, Receipt, Banknote, Smartphone, CreditCard, QrCode, CheckCircle2, Printer, SplitSquareVertical, Loader2, AlertCircle, X, Wifi, WifiOff, Clock } from "lucide-react"
import QRCode from "qrcode"
import { PageTransition } from "@/components/ui/PageTransition"
import { PageHeader } from "@/components/PageHeader"
import { AnimatedContainer } from "@/components/AnimatedComponents"
import { formatCurrency } from "@/lib/utils"
import {
  countVoidedItems,
  voidedItemsTotal,
} from '@/lib/services/order-calculation-service'
import type { OrderBatchItemRow } from '@/lib/db/types'
import { showSuccess, showError } from "@/components/ui/toast"
import { printService } from '@/lib/services/print-service'
import { useInvoice } from '@/lib/services/invoice-service'
import { useInvoicePayments, recordPaymentSafe } from '@/lib/services/payment-service'
import { fetchInvoiceItems } from "@/lib/services/invoice-items-service"
import { logActivitySafe } from '@/lib/services/activity-log-service'
import { useAuth } from "@/lib/core/auth-context"
import { idempotencyGuard } from "@/lib/services/idempotency-guard"
import { insforge } from '@/lib/services/auth-service'
import { invoiceKeys } from '@/lib/core/query-keys'
import {
  generateFonepayQR,
  checkQRStatus,
  connectFonepayWebSocket,
  generatePRN,
  type FonepayWSStatus,
} from "@/lib/services/fonepay-service"
import { getPaymentMethodLabel, toPaymentMethodKey } from "@/lib/payment-methods"
import { PaymentMethodBadge } from "@/components/PaymentMethodBadge"
import { PaymentBreakdown } from "@/components/payments/PaymentBreakdown"
import type { PaymentMethod } from "@/types"

interface InvoiceItemDisplay {
  id: string
  name: string
  quantity: number
  unitPrice: number
  totalPrice: number
}

interface PaymentRecord {
  id: string
  amount: number
  discount?: number
  method: string
  date: string
  time: string
}

type FonepayFlowStep = "idle" | "generating" | "waiting_scan" | "verified" | "processing" | "success" | "failed"

export function Billing() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const queryClient = useQueryClient()

  // ─── React Query data fetching ─────────────────────────
  const { data: invoice, isLoading: invoiceLoading, error: invoiceError } = useInvoice(id)
  const { data: paymentsData = [] } = useInvoicePayments(id)

  // Invoice items are fetched separately (no Query hook yet)
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItemDisplay[]>([])

  // ─── Voided items tracking from linked order batches ───
  const [voidedState, setVoidedState] = useState<{ count: number; amount: number }>({ count: 0, amount: 0 })

  // Fetch invoice items when invoice loads
  useEffect(() => {
    if (!id) return
    fetchInvoiceItems(id)
      .then(items => {
        if (items.length > 0) {
          setInvoiceItems(items.map(i => ({
            id: i.id,
            name: i.name,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            totalPrice: i.totalPrice,
          })))
        } else if (invoice) {
          setInvoiceItems([{
            id: 'summary',
            name: `Invoice ${invoice.invoice_number}`,
            quantity: 1,
            unitPrice: invoice.total,
            totalPrice: invoice.total,
          }])
        }
      })
      .catch(() => {})
  }, [id, invoice?.invoice_number, invoice?.total])

  // Fetch order batch items for this invoice to calculate voided items
  useEffect(() => {
    if (!invoice?.order_batch_ids || invoice.order_batch_ids.length === 0) {
      setVoidedState({ count: 0, amount: 0 })
      return
    }

    insforge.database
      .from('order_batch_items')
      .select('*')
      .in('batch_id', invoice.order_batch_ids)
      .then(({ data, error }: { data: unknown; error: unknown }) => {
        if (error) return
        const items = (data as OrderBatchItemRow[]) ?? []
        setVoidedState({
          count: countVoidedItems(items),
          amount: voidedItemsTotal(items),
        })
      })
      .catch(() => {/* non-critical */})
  }, [invoice?.order_batch_ids])

  // Payment records mapped for display
  const payments = useMemo<PaymentRecord[]>(
    () => paymentsData.map(p => ({
      id: p.id,
      amount: p.amount,
      discount: p.discount,
      method: p.paymentMethod,
      date: p.createdAt.split('T')[0],
      time: p.createdAt.split('T')[1]?.slice(0, 5) ?? '',
    })),
    [paymentsData]
  )

  // Payment state (local UI state only)
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null)
  const [processing, setProcessing] = useState(false)
  const [paid, setPaid] = useState(false)
  const [splitMode, setSplitMode] = useState(false)
  const [cashReceived, setCashReceived] = useState("")
  const [cashStep, setCashStep] = useState<"select" | "enter">("select")

  // Fonepay QR state
  const [fonepayStep, setFonepayStep] = useState<FonepayFlowStep>("idle")
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [_qrPayload, setQrPayload] = useState<string | null>(null)
  const [wsStatus, setWsStatus] = useState<FonepayWSStatus>("disconnected")
  const [fonepayError, setFonepayError] = useState<string | null>(null)
  const [_currentPRN, setCurrentPRN] = useState<string | null>(null)
  const wsCleanupRef = useRef<(() => void) | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ─── Prevent duplicate payment recording from WS + polling race ──
  const paymentRecordedRef = useRef(false)

  // Cleanup WebSocket and polling on unmount
  useEffect(() => {
    return () => {
      wsCleanupRef.current?.()
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    }
  }, [])

  // ─── Loading state ────────────────────────────────────
  const loading = invoiceLoading

  // ─── Error message for display ────────────────────────
  const errorMessage = invoiceError instanceof Error ? invoiceError.message : (invoiceError ? String(invoiceError) : 'Invoice not found')

  // ─── Computed values ───────────────────────────────────
  // ═══ CREDIT IS NOT PAYMENT ═══
  // Credit entries in the payments table represent outstanding debt,
  // NOT money received. They must be excluded from the paid total
  // and outstanding calculation. Separate tracking keeps them visible.
  const subtotal = useMemo(() => invoiceItems.reduce((s, i) => s + i.totalPrice, 0), [invoiceItems])
  const discountAmount = invoice?.discount ?? 0
  const total = invoice?.total ?? subtotal
  const realPayments = useMemo(() => payments.filter(p => p.method !== 'credit'), [payments])
  const totalPaid = useMemo(() => realPayments.reduce((s, p) => s + p.amount, 0), [realPayments])
  const totalCredit = useMemo(() => payments.filter(p => p.method === 'credit').reduce((s, p) => s + p.amount, 0), [payments])
  const outstanding = Math.max(0, total - totalPaid)
  const isFullyPaid = totalPaid >= total
  const splitAmount = useMemo(() => Math.round(outstanding / 2 * 100) / 100, [outstanding])

  // ─── Invalidate caches after successful payment ───────
  const invalidatePaymentCaches = useCallback(() => {
    if (!id) return
    queryClient.invalidateQueries({ queryKey: invoiceKeys.detail(id) })
    queryClient.invalidateQueries({ queryKey: invoiceKeys.payments(id) })
    queryClient.invalidateQueries({ queryKey: ['dashboard', 'tables'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard', 'report'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard', 'pendingInvoices'] })
    queryClient.invalidateQueries({ queryKey: ['batches'] })
    queryClient.invalidateQueries({ queryKey: ['analytics'] })
    queryClient.invalidateQueries({ queryKey: ['finance'] })
  }, [id, queryClient])

  // ─── Record payment to DB (shared by cash and fonepay) ───
  const recordPaymentToDB = useCallback(async (payAmount: number, method: PaymentMethod, reference?: string) => {
    if (!invoice || !id) throw new Error("No invoice")

    const { isDuplicate, proceed, idempotencyKey } = await idempotencyGuard.check({
      entityType: 'invoice',
      entityId: id,
      amount: payAmount,
      discriminator: method,
    })

    if (!proceed) {
      if (isDuplicate) {
        showSuccess('Payment already processed')
        setPaid(true)
      }
      return null
    }

    const createdPayment = await recordPaymentSafe({
      invoiceId: id,
      amount: payAmount,
      discount: 0, // discount is already on the invoice; billing payments just settle the balance
      paymentMethod: method,
      reference: reference ?? idempotencyKey,
      notes: `Payment via ${method}`,
      userId: user?.id ?? undefined,
    })

    if (!createdPayment) throw new Error('Failed to create payment')

    // ═══ Status: only REAL MONEY counts toward 'paid' ═══
    // Credit is accounts receivable, not payment. The outstanding balance
    // is computed from (total - realPaid), so credit does not reduce it.
    // If the invoice has credit_on credit, its status stays 'credit_invoice'
    // even after a real-money payment — the credit must be settled separately.
    const newPaidTotal = totalPaid + payAmount
    const hasRemainingCredit = totalCredit > 0
    const newStatus = hasRemainingCredit
      ? 'credit_invoice'
      : newPaidTotal >= total
        ? 'paid'
        : 'partial'
    const { error: updateError } = await insforge.database
      .from('invoices')
      .update({ status: newStatus, payment_method: method })
      .eq('id', id)

    if (updateError) {
      try { await insforge.database.from('payments').delete().eq('id', createdPayment.id) } catch { /* ignore */ }
      throw updateError
    }

    logActivitySafe({
      activityType: 'payment_received',
      entityId: id,
      entityLabel: `Invoice ${invoice.invoice_number}`,
      status: newStatus === 'paid' ? 'completed' : 'partial',
      amount: payAmount,
      details: `Payment of ${formatCurrency(payAmount)} via ${method}. Invoice ${newStatus === 'paid' ? 'fully paid' : 'partially paid'}.`,
      userId: user?.id ?? undefined,
      userName: user?.name ?? 'System',
    })

    // Invalidate all affected caches so Dashboard and other pages update immediately
    invalidatePaymentCaches()

    return createdPayment
  }, [invoice, id, totalPaid, total, user, invalidatePaymentCaches])

  // ─── Fonepay QR flow ──────────────────────────────────────
  const startFonepayPayment = useCallback(async () => {
    if (!invoice) return

    const payAmount = splitMode ? splitAmount : outstanding
    const prn = generatePRN()
    setCurrentPRN(prn)
    setFonepayStep("generating")
    setFonepayError(null)
    setQrDataUrl(null)
    setQrPayload(null)

    try {
      const response = await generateFonepayQR({
        amount: payAmount,
        prn,
        remarks1: `INV-${invoice.invoice_number}`,
        remarks2: `POS Payment`,
      })

      if (!response.success) {
        throw new Error(response.message || "Failed to generate QR")
      }

      // Render the QR message as a QR code image
      const dataUrl = await QRCode.toDataURL(response.qrMessage, {
        width: 280,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      })

      setQrDataUrl(dataUrl)
      setQrPayload(response.qrMessage)
      setFonepayStep("waiting_scan")

      // Connect to WebSocket for real-time notifications
      if (response.thirdpartyQrWebSocketUrl) {
        wsCleanupRef.current = connectFonepayWebSocket(
          response.thirdpartyQrWebSocketUrl,
          {
            onQRVerified: (_status) => {
              setFonepayStep("verified")
              showSuccess("QR verified by customer")
            },
            onPaymentSuccess: async (_status) => {
              // ═══ Single-flight lock: prevent WS + polling race ═══
              if (paymentRecordedRef.current) {
                if (import.meta.env.DEV) console.log('[FonePay:DUPLICATE_BLOCKED]', 'WS success handler, payment already recorded')
                return
              }
              paymentRecordedRef.current = true

              setFonepayStep("processing")
              // Clean up all other handlers immediately
              wsCleanupRef.current?.()
              if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null }
              try {
                await recordPaymentToDB(payAmount, "fonepay", `FP-${prn}`)
                setFonepayStep("success")
                setPaid(true)
                showSuccess(`Payment of ${formatCurrency(payAmount)} via Fonepay successful!`)
              } catch (err) {
                setFonepayStep("failed")
                setFonepayError(err instanceof Error ? err.message : "Failed to record payment")
              }
            },
            onPaymentFailed: (_status) => {
              // Never record a failed payment — just update UI state
              setFonepayStep("failed")
              setFonepayError(_status.message || "Payment failed or cancelled by user")
              wsCleanupRef.current?.()
              if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null }
            },
            onStatusChange: (status) => setWsStatus(status),
          },
        )
      }

      // Fallback: poll QR status every 5s if WebSocket doesn't deliver
      pollTimerRef.current = setInterval(async () => {
        // ═══ Single-flight lock: if WS already recorded the payment, skip ═══
        if (paymentRecordedRef.current) return

        try {
          const result = await checkQRStatus(prn)
          if (result.paymentStatus === 'success') {
            // Double-check lock after async await — WS may have fired while we were polling
            if (paymentRecordedRef.current) {
              if (import.meta.env.DEV) console.log('[FonePay:DUPLICATE_BLOCKED]', 'Poll success handler, payment already recorded')
              return
            }
            paymentRecordedRef.current = true

            if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null }
            wsCleanupRef.current?.()
            setFonepayStep("processing")
            try {
              await recordPaymentToDB(payAmount, "fonepay", `FP-${prn}`)
              setFonepayStep("success")
              setPaid(true)
              showSuccess(`Payment of ${formatCurrency(payAmount)} via Fonepay successful!`)
            } catch (err) {
              setFonepayStep("failed")
              setFonepayError(err instanceof Error ? err.message : "Failed to record payment")
            }
          } else if (result.paymentStatus === 'failed') {
            if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null }
            wsCleanupRef.current?.()
            setFonepayStep("failed")
            setFonepayError("Payment failed")
          }
        } catch {
          // Ignore polling errors — keep trying
        }
      }, 5000)

    } catch (err) {
      setFonepayStep("failed")
      setFonepayError(err instanceof Error ? err.message : "Failed to generate QR code")
    }
  }, [invoice, splitMode, splitAmount, outstanding, recordPaymentToDB])

  const cancelFonepay = useCallback(() => {
    wsCleanupRef.current?.()
    if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null }
    setFonepayStep("idle")
    setQrDataUrl(null)
    setQrPayload(null)
    setFonepayError(null)
    setCurrentPRN(null)
    setWsStatus("disconnected")
  }, [])

  // ─── Cash payment ─────────────────────────────────────────
  const handleCashPayment = async () => {
    if (!invoice || !id) return
    const payAmount = splitMode ? splitAmount : outstanding

    const received = parseFloat(cashReceived)
    if (isNaN(received) || received < payAmount) {
      return showError(`Amount received must be at least ${formatCurrency(payAmount)}`)
    }

    setProcessing(true)
    try {
      const result = await recordPaymentToDB(payAmount, "cash")
      if (result) {
        setPaid(true)
        showSuccess(`Payment of ${formatCurrency(payAmount)} via cash successful!`)
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Payment failed')
    } finally {
      setProcessing(false)
    }
  }

  // ─── Generic (non-fonepay) payment ────────────────────────
  const handleGenericPayment = async () => {
    if (!selectedMethod || !invoice || !id) return
    const payAmount = splitMode ? splitAmount : outstanding

    setProcessing(true)
    try {
      const result = await recordPaymentToDB(payAmount, toPaymentMethodKey(selectedMethod) as PaymentMethod)
      if (result) {
        setPaid(true)
        showSuccess(`Payment of ${formatCurrency(payAmount)} via ${selectedMethod} successful!`)
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Payment failed')
    } finally {
      setProcessing(false)
    }
  }

  const handlePay = () => {
    if (!selectedMethod) { showError("Please select a payment method"); return }
    if (selectedMethod === "fonepay") {
      startFonepayPayment()
    } else if (selectedMethod === "cash") {
      handleCashPayment()
    } else {
      handleGenericPayment()
    }
  }

  const handlePrintReceipt = () => {
    // Print via thermal printer template with payment breakdown
    const printData: import('@/components/printing/InvoiceTemplate').InvoiceData = {
      invoiceNumber: invoice.invoice_number ?? `INV-${id?.slice(0, 8)}`,
      date: invoice.created_at?.split('T')[0] ?? new Date().toLocaleDateString(),
      time: invoice.created_at?.split('T')[1]?.slice(0, 5) ?? new Date().toLocaleTimeString(),
      items: invoiceItems.map(item => ({
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
      subtotal,
      discount: discountAmount,
      total,
      paymentBreakdown: payments.map(p => ({ method: p.method, amount: p.amount, discount: p.discount })),
    }
    printService.printInvoice(printData)
    showSuccess("Receipt sent to printer")
  }

  // Loading state
  if (loading) {
    return (
      <PageTransition className="mx-auto w-full max-w-4xl space-y-6">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </PageTransition>
    )
  }

  // Error state
  if (invoiceError || !invoice) {
    return (
      <PageTransition className="mx-auto w-full max-w-4xl space-y-6">
        <div className="flex flex-col items-center justify-center py-20">
          <AlertCircle className="h-12 w-12 text-destructive mb-4" />
          <p className="text-lg font-semibold text-foreground">{errorMessage}</p>
          <button onClick={() => navigate('/dashboard')} className="mt-4 inline-flex items-center justify-center rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted transition-colors whitespace-nowrap min-h-[44px]">
            Back to Dashboard
          </button>
        </div>
      </PageTransition>
    )
  }

  // Paid success view
  if (paid) {
    return (
      <div className="mx-auto flex w-full max-w-md items-center justify-center min-h-[60vh]">
        <AnimatedContainer>
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="rounded-xl border border-border bg-card p-8 text-center">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", delay: 0.2 }} className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
              <CheckCircle2 className="h-8 w-8 text-success" />
            </motion.div>
            <h2 className="text-xl font-bold text-foreground mb-1">Payment Successful</h2>
            <p className="text-sm text-muted-foreground mb-6">
              {formatCurrency(splitMode ? splitAmount : outstanding)} paid via {selectedMethod}
              {splitMode && <span className="block text-xs mt-1">{formatCurrency(Math.max(0, outstanding - splitAmount))} remaining</span>}
            </p>
            <div className="flex flex-col gap-3">
              <button onClick={handlePrintReceipt} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 whitespace-nowrap min-h-[44px]">
                <Printer className="h-4 w-4" /> Print Receipt
              </button>
              <button onClick={() => navigate('/dashboard')} className="inline-flex items-center justify-center rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted transition-colors whitespace-nowrap min-h-[44px]">
                Back to Dashboard
              </button>
            </div>
          </motion.div>
        </AnimatedContainer>
      </div>
    )
  }

  const fonepayQrActive = selectedMethod === "fonepay" && fonepayStep !== "idle"

  return (
    <PageTransition className="mx-auto w-full max-w-4xl space-y-6">
      <AnimatedContainer>
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <PageHeader title="Billing" icon="Receipt" description={`Invoice #${invoice.invoice_number}`} />
        </div>
      </AnimatedContainer>

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
        {/* Invoice Details */}
        <div className="lg:col-span-2 space-y-6">
          <AnimatedContainer>
            <div className="rounded-xl border bg-card p-6 border-t-4 border-t-amber-500">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-amber-500" />
                  Invoice Items
                </h3>
                <div className="flex items-center gap-2">
                  {!isFullyPaid && (
                    <button onClick={() => setSplitMode(!splitMode)}
                      className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${splitMode ? "bg-primary/10 text-primary" : "border border-border text-muted-foreground hover:text-foreground"}`}>
                      <SplitSquareVertical className="h-3.5 w-3.5" /> Split
                    </button>
                  )}
                  <span className="text-xs text-muted-foreground">{invoice.customer_name}</span>
                </div>
              </div>                <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/30 px-3 py-2 text-sm">
                <span className="font-medium text-foreground text-truncate max-w-[200px]">{invoice.customer_name}</span>
                <span className="text-muted-foreground shrink-0">@{invoice.created_at.split('T')[0]}</span>
                <span className={`ml-auto inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                  isFullyPaid ? 'bg-success/10 text-success' :
                  invoice.status === 'partial' ? 'bg-warning/10 text-warning' :
                  invoice.status === 'overdue' ? 'bg-destructive/10 text-destructive' :
                  'bg-muted text-muted-foreground'
                }`}>
                  {isFullyPaid ? 'Paid' : invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">Item</th>
                      <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase">Qty</th>
                      <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase">Price</th>
                      <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoiceItems.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-sm text-muted-foreground">
                          No items found for this invoice
                        </td>
                      </tr>
                    ) : (
                      invoiceItems.map((item) => (
                        <tr key={item.id} className="border-b border-border">
                          <td className="px-3 py-2.5 font-medium text-foreground">{item.name}</td>
                          <td className="px-3 py-2.5 text-right text-muted-foreground">{item.quantity}</td>
                          <td className="px-3 py-2.5 text-right text-muted-foreground">{formatCurrency(item.unitPrice)}</td>
                          <td className="px-3 py-2.5 text-right font-semibold text-foreground">{formatCurrency(item.totalPrice)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3} className="px-3 py-2.5 text-right text-sm font-medium text-muted-foreground">Subtotal</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-foreground">{formatCurrency(subtotal)}</td>
                    </tr>

                    {discountAmount > 0 && (
                      <tr className="text-muted-foreground">
                        <td colSpan={3} className="px-3 py-2.5 text-right text-sm">Discount</td>
                        <td className="px-3 py-2.5 text-right text-destructive">-{formatCurrency(discountAmount)}</td>
                      </tr>
                    )}
                    {totalPaid > 0 && (
                      <tr className="text-muted-foreground">
                        <td colSpan={3} className="px-3 py-2.5 text-right text-sm">Already Paid</td>
                        <td className="px-3 py-2.5 text-right text-success">{formatCurrency(totalPaid)}</td>
                      </tr>
                    )}
                    {totalCredit > 0 && (
                      <tr className="text-muted-foreground">
                        <td colSpan={3} className="px-3 py-2.5 text-right text-sm">Outstanding Credit</td>
                        <td className="px-3 py-2.5 text-right text-purple-600 dark:text-purple-400">{formatCurrency(totalCredit)}</td>
                      </tr>
                    )}
                    {voidedState.count > 0 && (
                      <tr className="text-muted-foreground/60">
                        <td colSpan={3} className="px-3 py-2.5 text-right text-sm text-red-500/60 dark:text-red-400/60">Voided Items: {voidedState.count}</td>
                        <td className="px-3 py-2.5 text-right line-through text-red-500/60 dark:text-red-400/60">{formatCurrency(voidedState.amount)}</td>
                      </tr>
                    )}
                    {splitMode && !isFullyPaid && (
                      <tr className="text-muted-foreground">
                        <td colSpan={3} className="px-3 py-2.5 text-right text-sm">Remaining After Payment</td>
                        <td className="px-3 py-2.5 text-right">{formatCurrency(Math.max(0, outstanding - splitAmount))}</td>
                      </tr>
                    )}
                    <tr className="border-t-2 border-border">
                      <td colSpan={3} className="px-3 py-2.5 text-right text-base font-bold text-foreground">
                        {isFullyPaid ? 'Total Paid' : splitMode ? 'Amount Due Now' : 'Total Due'}
                      </td>
                      <td className={`px-3 py-2.5 text-right text-base font-bold ${isFullyPaid ? 'text-success' : 'text-amber-600 dark:text-amber-400'}`}>
                        {formatCurrency(isFullyPaid ? totalPaid : (splitMode ? splitAmount : outstanding))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {splitMode && !isFullyPaid && (                  <div className="flex flex-wrap items-center gap-3 rounded-xl bg-muted/50 p-4">
                  <label className="text-sm font-medium text-foreground whitespace-nowrap">Split Amount:</label>
                  <div className="flex items-center gap-2">
                    <input type="number" step="0.01" min="0" max={outstanding} value={splitAmount} readOnly
                      className="h-10 w-28 sm:w-32 rounded-xl border border-border bg-background px-3 text-sm text-center" />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">of {formatCurrency(outstanding)}</span>
                  </div>
                </div>
              )}

              {payments.length > 0 && (
                <div className="mt-6 pt-4 border-t border-border">
                  <h4 className="text-sm font-semibold text-foreground mb-3">Payment History</h4>
                  <PaymentBreakdown
                    payments={payments.map(p => ({
                      id: p.id,
                      method: p.method,
                      amount: p.amount,
                      discount: p.discount,
                      createdAt: `${p.date}T${p.time}:00`,
                      reference: '',
                    }))}
                    total={total}
                    variant="detailed"
                    showTimestamps
                  />
                </div>
              )}
            </div>
          </AnimatedContainer>
        </div>

        {/* Payment Methods + Fonepay QR Panel */}
        {!isFullyPaid && (
          <div className="space-y-4">
            {/* Fonepay QR Display */}
            <AnimatePresence>
              {fonepayQrActive && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="rounded-xl border bg-card p-6"
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <Smartphone className="h-4 w-4 text-blue-500" />
                      Fonepay QR Payment
                    </h3>
                    {fonepayStep !== "processing" && fonepayStep !== "success" && (
                      <button onClick={cancelFonepay} className="text-muted-foreground hover:text-foreground">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {/* QR Code */}
                  {fonepayStep === "generating" && (
                    <div className="flex flex-col items-center py-8">
                      <Loader2 className="h-10 w-10 animate-spin text-primary mb-3" />
                      <p className="text-sm text-muted-foreground">Generating QR code...</p>
                    </div>
                  )}

                  {qrDataUrl && (fonepayStep === "waiting_scan" || fonepayStep === "verified") && (
                    <div className="flex flex-col items-center">
                      <div className="relative">
                        <img src={qrDataUrl} alt="Fonepay QR Code" className="rounded-xl border border-border" />
                        {fonepayStep === "verified" && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="absolute inset-0 flex items-center justify-center rounded-xl bg-success/10 backdrop-blur-sm"
                          >
                            <CheckCircle2 className="h-16 w-16 text-success" />
                          </motion.div>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-3 text-center">
                        {fonepayStep === "verified" ? "QR Verified — Processing payment..." : "Scan this QR with Fonepay app"}
                      </p>
                      <p className="text-lg font-bold text-foreground mt-2">{formatCurrency(splitMode ? splitAmount : outstanding)}</p>
                    </div>
                  )}

                  {fonepayStep === "processing" && (
                    <div className="flex flex-col items-center py-8">
                      <Loader2 className="h-10 w-10 animate-spin text-primary mb-3" />
                      <p className="text-sm text-muted-foreground">Recording payment...</p>
                    </div>
                  )}

                  {fonepayStep === "success" && (
                    <div className="flex flex-col items-center py-8">
                      <CheckCircle2 className="h-12 w-12 text-success mb-3" />
                      <p className="text-sm font-semibold text-foreground">Payment Successful!</p>
                    </div>
                  )}

                  {fonepayStep === "failed" && (
                    <div className="flex flex-col items-center py-6">
                      <AlertCircle className="h-10 w-10 text-destructive mb-3" />
                      <p className="text-sm font-medium text-foreground mb-1">Payment Failed</p>
                      <p className="text-xs text-muted-foreground text-center mb-4">{fonepayError || "Unknown error"}</p>
                      <button onClick={cancelFonepay} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">
                        Try Again
                      </button>
                    </div>
                  )}

                  {/* WebSocket status indicator */}
                  {fonepayStep === "waiting_scan" && (
                    <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                      {wsStatus === "connected" ? (
                        <><Wifi className="h-3 w-3 text-success" /> Live updates active</>
                      ) : wsStatus === "connecting" ? (
                        <><Clock className="h-3 w-3 text-amber-500" /> Connecting...</>
                      ) : (
                        <><WifiOff className="h-3 w-3 text-muted-foreground" /> Polling for status</>
                      )}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Payment Method Buttons (hidden when QR is active) */}
            {!fonepayQrActive && (
              <AnimatedContainer>
                <div className="rounded-xl border bg-card p-6">
                  <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-emerald-500" />
                    Payment Methods
                  </h3>
                  <div className="space-y-2">
                    {[                    {id: "cash" as PaymentMethod, label: getPaymentMethodLabel('cash'), icon: Banknote, color: "text-emerald-500", desc: "Pay in cash at counter" },
                      { id: "fonepay" as PaymentMethod, label: getPaymentMethodLabel('fonepay'), icon: Smartphone, color: "text-blue-500", desc: "Scan QR to pay via Fonepay" },
                      { id: "reception_qr" as PaymentMethod, label: getPaymentMethodLabel('reception_qr'), icon: QrCode, color: "text-cyan-500", desc: "Customer pays via QR at reception" },
                    ].map((method) => {
                      const IconComp = method.icon
                      const isSelected = selectedMethod === method.id
                      return (
                        <button
                          key={method.id}
                          onClick={() => { setSelectedMethod(method.id); setCashStep("select") }}
                          className={`flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-sm font-medium transition-all text-left ${isSelected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-accent hover:border-primary/30"}`}
                        >
                          <div className={method.color}>
                            <IconComp className="h-5 w-5" />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium">{method.label}</p>
                            <p className="text-[10px] text-muted-foreground">{method.desc}</p>
                          </div>
                          {isSelected && <CheckCircle2 className="h-4 w-4 text-primary" />}
                        </button>
                      )
                    })}
                  </div>

                  {selectedMethod === "cash" && (
                    <div className="mt-4">
                      {cashStep === "select" ? (
                        <button onClick={() => setCashStep("enter")} className="w-full rounded-lg bg-muted px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
                          Enter cash received amount
                        </button>
                      ) : (
                        <div className="space-y-3 mt-2">
                          <input type="number" value={cashReceived} onChange={(e) => setCashReceived(e.target.value)} placeholder="Enter cash received"
                            onWheel={e => (e.target as HTMLInputElement).blur()}
                            className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm" autoFocus />
                          {cashReceived && parseFloat(cashReceived) >= (splitMode ? splitAmount : outstanding) && (
                            <p className="text-xs text-success">Change due: {formatCurrency(parseFloat(cashReceived) - (splitMode ? splitAmount : outstanding))}</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </AnimatedContainer>
            )}

            <AnimatedContainer delay={0.1}>
              <div className="rounded-xl border bg-card p-6">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Amount Due</p>
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{formatCurrency(splitMode ? splitAmount : outstanding)}</p>

                {selectedMethod && !fonepayQrActive && (
                  <button onClick={handlePay} disabled={processing || (selectedMethod === "cash" && cashStep === "enter" && !cashReceived)}
                    className="w-full mt-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold h-10 hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                    {processing ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Processing...</>
                    ) : (
                      <>Pay {formatCurrency(splitMode ? splitAmount : outstanding)}</>
                    )}
                  </button>
                )}
                {selectedMethod === "fonepay" && fonepayStep === "idle" && (
                  <button onClick={startFonepayPayment}
                    className="w-full mt-4 rounded-lg bg-blue-600 text-white text-sm font-semibold h-10 hover:bg-blue-700 transition-colors flex items-center justify-center gap-2">
                    <QrCode className="h-4 w-4" /> Generate QR Code
                  </button>
                )}
                {!selectedMethod && (
                  <p className="text-xs text-muted-foreground mt-3 text-center">Select a payment method above</p>
                )}
              </div>
            </AnimatedContainer>
          </div>
        )}

        {isFullyPaid && (
          <div className="space-y-4">
            <AnimatedContainer>
              <div className="rounded-xl border bg-card p-6 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-success/10">
                  <CheckCircle2 className="h-6 w-6 text-success" />
                </div>
                <h3 className="text-base font-semibold text-foreground mb-1">Fully Paid</h3>
                <p className="text-sm text-muted-foreground mb-2">
                  {formatCurrency(totalPaid)} received
                </p>
                <div className="mb-3">
                  <PaymentBreakdown
                    payments={payments.map(p => ({
                      id: p.id,
                      method: p.method,
                      amount: p.amount,
                      discount: p.discount,
                      createdAt: `${p.date}T${p.time}:00`,
                    }))}
                    total={total}
                    variant="compact"
                    showTotal={false}
                  />
                </div>
                <div className="rounded-lg bg-muted/30 px-3 py-2 text-sm mb-4">
                  <div className="flex justify-between"><span className="text-muted-foreground">Invoice Total</span><span className="font-semibold text-foreground">{formatCurrency(total)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Total Paid</span><span className="font-semibold text-success">{formatCurrency(totalPaid)}</span></div>
                </div>
                <button onClick={handlePrintReceipt} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 w-full whitespace-nowrap min-h-[44px]">
                  <Printer className="h-4 w-4" /> Print Receipt
                </button>
              </div>
            </AnimatedContainer>
          </div>
        )}
      </div>
    </PageTransition>
  )
}
