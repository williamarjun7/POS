import { useState, useMemo, useEffect, useRef, useCallback } from 'react';import { ArrowLeft, Banknote, QrCode, CreditCard, Percent, DollarSign,
  Users, Smartphone, Check, AlertCircle, Loader2, Printer, User,
} from 'lucide-react';

// ─── Dev logging ────────────────────────────────────────────
function log(prefix: string, ...args: unknown[]) {
  if (import.meta.env.DEV) {
    console.log(`[POS:${prefix}]`, ...args)
  }
}

// ─── Print helper (shared across Fonepay handlers) ─────────
function buildPrintData(
  inv: InvoiceData,
  extraPayments?: Array<{ method: string; amount: number }>,
  creditInfo?: { amount: number; customerName?: string },
): PrintInvoiceData {
  // Build complete payment breakdown from all sources
  const breakdown: PrintInvoiceData['paymentBreakdown'] = []

  if (extraPayments && extraPayments.length > 0) {
    // Multi-method split — show each method individually
    for (const p of extraPayments) {
      breakdown.push({ method: p.method, amount: p.amount })
    }
  } else {
    // Single method
    breakdown.push({
      method: inv.paymentMethod,
      amount: inv.paidAmount,
      discount: inv.discount,
    })
  }

  // Add credit as a line item if applicable
  if (creditInfo && creditInfo.amount > 0) {
    const label = creditInfo.customerName
      ? `Credit (${creditInfo.customerName})`
      : 'Credit Account'
    breakdown.push({ method: label, amount: creditInfo.amount })
  }

  return {
    invoiceNumber: inv.invoiceNumber,
    date: new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }),
    time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
    items: (inv.items ?? []).map(i => ({
      name: i.name ?? 'Item',
      quantity: i.quantity,
      unitPrice: i.unitPrice ?? 0,
    })),
    subtotal: inv.subtotal,
    discount: inv.discount || undefined,
    total: inv.grandTotal,
    paymentBreakdown: breakdown,
  }
}
import { showSuccess, showError } from '@/components/ui/toast';
import { printService } from '@/lib/services/print-service';
import { getPaymentMethodLabel } from '@/lib/payment-methods';
import type { InvoiceData as PrintInvoiceData } from '@/components/printing/InvoiceTemplate';

import { useRateLimit } from '@/lib/hooks/useRateLimit'
import { FonepayQRDialog } from './FonepayQRDialog';
import {
  generateFonepayQR,
  generatePRN,
  isFonepayConfigured,
  generateQRDataURL,
  type PreGeneratedQRData,
} from '@/lib/services/fonepay-service';
import { SplitPaymentDialog } from './SplitPaymentDialog';
import { CreditAccountPayment } from './CreditAccountPayment';
import { ReceptionQRDialog } from './ReceptionQRDialog';
import { PartialPaymentDialog } from './PartialPaymentDialog';
import { insforge } from '@/lib/services/auth-service';

// ─── Types ───────────────────────────────────────────────────

type PaymentView = 'review' | 'cash' | 'credit' | 'partial' | 'split'
  | 'fonepay'
  | 'reception_qr' | 'success' | 'partial_customer';

interface OrderItem {
  id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  payment_status: string;
}

interface InvoiceData {
  invoiceNumber: string;
  /** Customer name carried through from POS state */
  customerName?: string;
  tableNumber: string | null;
  items: Array<{ name?: string; quantity: number; unitPrice?: number }>;
  subtotal: number;
  discount: number;
  grandTotal: number;
  paidAmount: number;
  paymentMethod: string;
  /** Only the item IDs that were actually paid in this transaction (for split/partial) */
  paidItemIds?: string[];
}

export interface PaymentResult {
  /** Customer name (carried through from POS/Dialog to RPC) */
  customerName?: string;
  invoiceNumber?: string;
  paymentMethod?: string;
  paidItemIds: string[];
  grandTotal: number;
  paidAmount: number;
  creditAmount?: number;
  creditCustomerName?: string;
  /** Additional payment methods for split payments (beyond the primary method) */
  splitPayments?: Array<{ method: string; amount: number }>;
  /** The full invoice total (NOT the partial amount).
   *  For partial payments, this is the TOTAL bill amount.
   *  For full payments, same as grandTotal.
   *  For split payments, same as grandTotal (the split amount). */
  invoiceTotal?: number;
  /** The discount applied to THIS transaction (not the full invoice).
   *  For split payments, this is the per-split discount. */
  discount?: number;
  /** The subtotal of items being paid in THIS transaction.
   *  For split payments, this is the selected items' subtotal. */
  paidSubtotal?: number;
}

interface PosPaymentDialogProps {
  orderId: string;
  unpaidItems: OrderItem[];
  customerName?: string;
  selectedTableId: string;
  isRoomPayment?: boolean;
  isCustomerPayment?: boolean;
  onClose: () => void;
  onComplete: (invoiceNumber?: string, paymentResult?: PaymentResult) => void;
}

// ─── Constants ───────────────────────────────────────────────

const PAYMENT_METHOD_BUTTONS = [
  { key: 'cash' as const, label: 'Cash with Change', desc: 'Customer pays with cash, receive change', icon: Banknote, color: 'emerald' },
  { key: 'reception_qr' as const, label: 'Reception QR', desc: 'Customer paid via physical QR at reception', icon: Smartphone, color: 'sky' },
  { key: 'fonepay' as const, label: 'FonePay QR', desc: 'Scan QR & pay via mobile banking app', icon: QrCode, color: 'blue' },
  { key: 'credit' as const, label: 'Credit Account', desc: 'Bill to customer credit account', icon: CreditCard, color: 'purple' },
  { key: 'split' as const, label: 'Split Payment', desc: 'Pay for specific items individually', icon: Users, color: 'teal', dashed: true },
  { key: 'partial' as const, label: 'Partial Payment', desc: 'Accept payment now, collect the rest later', icon: DollarSign, color: 'orange', dashed: true },
];

const COLOR_STYLES: Record<string, {
  border: string; hover: string; bg: string; text: string;
  iconBg: string; iconText: string; ring: string;
}> = {
  emerald: { border: 'border-emerald-400', hover: 'hover:border-emerald-400 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/10', bg: 'bg-emerald-50 dark:bg-emerald-950/10', text: 'text-emerald-700 dark:text-emerald-300', iconBg: 'bg-emerald-100 dark:bg-emerald-900/30', iconText: 'text-emerald-600', ring: 'focus:ring-emerald-500/30 focus:border-emerald-500' },
  sky: { border: 'border-sky-400', hover: 'hover:border-sky-400 hover:bg-sky-50/50 dark:hover:bg-sky-950/10', bg: 'bg-sky-50 dark:bg-sky-950/10', text: 'text-sky-700 dark:text-sky-300', iconBg: 'bg-sky-100 dark:bg-sky-900/30', iconText: 'text-sky-600', ring: 'focus:ring-sky-500/30 focus:border-sky-500' },
  blue: { border: 'border-blue-400', hover: 'hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/10', bg: 'bg-blue-50 dark:bg-blue-950/10', text: 'text-blue-700 dark:text-blue-300', iconBg: 'bg-blue-100 dark:bg-blue-900/30', iconText: 'text-blue-600', ring: 'focus:ring-blue-500/30 focus:border-blue-500' },
  purple: { border: 'border-purple-400', hover: 'hover:border-purple-400 hover:bg-purple-50/50 dark:hover:bg-purple-950/10', bg: 'bg-purple-50 dark:bg-purple-950/10', text: 'text-purple-700 dark:text-purple-300', iconBg: 'bg-purple-100 dark:bg-purple-900/30', iconText: 'text-purple-600', ring: 'focus:ring-purple-500/30 focus:border-purple-500' },
  teal: { border: 'border-teal-400', hover: 'hover:border-teal-400 hover:bg-teal-50/50 dark:hover:bg-teal-950/10', bg: 'bg-teal-50 dark:bg-teal-950/10', text: 'text-teal-700 dark:text-teal-300', iconBg: 'bg-teal-100 dark:bg-teal-900/30', iconText: 'text-teal-600', ring: 'focus:ring-teal-500/30 focus:border-teal-500' },
  orange: { border: 'border-orange-400', hover: 'hover:border-orange-400 hover:bg-orange-50/50 dark:hover:bg-orange-950/10', bg: 'bg-orange-50 dark:bg-orange-950/10', text: 'text-orange-700 dark:text-orange-300', iconBg: 'bg-orange-100 dark:bg-orange-900/30', iconText: 'text-orange-600', ring: 'focus:ring-orange-500/30 focus:border-orange-500' },
};



const CASH_QUICK_AMOUNTS = [100, 200, 500, 1000, 2000, 5000];

// ─── Helpers ─────────────────────────────────────────────────

const npr = (amount: number) =>
  `Rs. ${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`;

// ─── Component ───────────────────────────────────────────────

export function PosPaymentDialog({
  orderId, unpaidItems, customerName: initialCustomerName,
  selectedTableId, isRoomPayment = false, isCustomerPayment = false, onClose, onComplete,
}: PosPaymentDialogProps) {
  const { checkLimit } = useRateLimit({ cooldownMs: 2000, maxAttempts: 10 })
  const [view, setView] = useState<PaymentView>('review');
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState(0);
  const [cashReceived, setCashReceived] = useState('');

  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: string; name: string } | null>(null);

  const [splitContext, setSplitContext] = useState<{
    selectedItemIds: string[]
    splitSubtotal: number
  } | null>(null);
  const [completedInvoice, setCompletedInvoice] = useState<InvoiceData | null>(null);
  const [showSuccessView, setShowSuccess] = useState(false);
  const [pendingCreditInfo, setPendingCreditInfo] = useState<{ amount: number; customerName: string } | undefined>(undefined);

  const [customersList, setCustomersList] = useState<Array<{id:string;name:string;phone:string|null}>>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [partialContext, setPartialContext] = useState<{
    partialAmount: number
    remainingAmount: number
    method: string
  } | null>(null);
  const [pendingPartialCredit, setPendingPartialCredit] = useState<{ amount: number; method: string; shouldPrint: boolean } | null>(null);
  const fonepayInvoiceNumberRef = useRef<string | null>(null);
  // ─── Pre-generated FonePay QR (background generation while on review) ──
  const preGeneratedQrRef = useRef<PreGeneratedQRData | null>(null)
  const preGenLoadingRef = useRef(false)

  // ─── Items — SNAPSHOTTED on mount (before early return) ─────
  // NOTE: MUST be declared before any hook/derivation that references it.
  //
  // We snapshot unpaidItems on mount to prevent a race condition where
  // realtime polling updates tableBatches → changes allUnpaidItemsForPayment
  // → changes this prop → re-derives subtotal/grandTotal → causes the
  // zero-amount guard to fire even though the bill had items when opened.
  //
  // The items you see when the dialog opens are the items you pay for.
  const [snapshotItems] = useState(unpaidItems);
  const items = useMemo(() => snapshotItems ?? [], [snapshotItems]);

  const subtotal = useMemo(() => items.reduce((s, i) => s + Number(i.unit_price) * i.quantity, 0), [items]);

  // ─── Split context: effective items / amounts ────────────
  // NOTE: Declared before cash/effective derivations so they can reference them.
  const effectiveItems = useMemo(
    () => splitContext
      ? items.filter(i => splitContext.selectedItemIds.includes(i.id))
      : items,
    [items, splitContext],
  )
  const effectiveSubtotal = useMemo(
    () => effectiveItems.reduce((s, i) => s + Number(i.unit_price) * i.quantity, 0),
    [effectiveItems],
  )
  const isSplitMode = !!splitContext

  // In split mode, discount applies to selected items directly (not proportionally scaled).
  const discountBasis = isSplitMode ? effectiveSubtotal : subtotal;
  const discountAmount = useMemo(() => {
    if (discountType === 'percentage') return discountBasis * (Math.min(discountValue, 100) / 100);
    return Math.min(discountValue, discountBasis);
  }, [discountBasis, discountType, discountValue]);
  const grandTotal = Math.max(0, subtotal - discountAmount);
  const effectiveGrandTotal = Math.max(0, effectiveSubtotal - discountAmount);

  // ─── Fonepay-specific memoized values (declared unconditionally for hooks rules) ──
  // CRITICAL: FonepayQRDialog's useEffect depends on `amount`. If `amount` changes
  // identity between renders (even with same numeric value), the effect re-runs and
  // starts a second QR generation session. These memos prevent that.
  const fonepayEffectiveAmount = useMemo(
    () => partialContext?.partialAmount ?? (isSplitMode ? effectiveGrandTotal : grandTotal),
    [partialContext?.partialAmount, isSplitMode, effectiveGrandTotal, grandTotal],
  )
  const fonepayCancelCallback = useCallback(() => {
    setPartialContext(null)
    setView('review')
  }, []) // No deps — stable identity across renders

  const cashReceivedNum = Number(cashReceived) || 0;
  const effectiveCashTotal = partialContext?.partialAmount ?? (isSplitMode ? effectiveGrandTotal : grandTotal);
  const isCashSufficient = cashReceivedNum >= effectiveCashTotal;
  const changeDue = Math.max(0, cashReceivedNum - effectiveCashTotal);
  const availablePaymentMethods = useMemo(() => {
    let methods = PAYMENT_METHOD_BUTTONS;
    if (isRoomPayment || isCustomerPayment) {
      // Room payments and customer invoice collections: only real-money methods.
      // Credit Account, Split Payment, and Partial Payment are invalid
      // when collecting existing outstanding balances.
      methods = methods.filter(m => ['cash', 'reception_qr', 'fonepay'].includes(m.key));
    }
    if (!!splitContext) {
      // In split mode, hide 'split' (you're already splitting) but show 'partial' for partial payments on selected items
      methods = methods.filter(m => m.key !== 'split');
    }
    return methods;
  }, [isRoomPayment, isCustomerPayment, splitContext]);

  // ─── Payment completion guard — prevents onComplete from being
  //     called more than once, regardless of code path.
  //     This is the single most important guard against duplicate
  //     invoice creation in the POS system.
  const paymentCompletedRef = useRef(false)

  // Helper: safe onComplete that respects the paymentCompletedRef guard.
  // Every code path in this dialog that completes a payment MUST use this
  // helper instead of calling onComplete directly.
  const safeComplete = (invoiceNumber?: string, result?: PaymentResult) => {
    if (paymentCompletedRef.current) {
      log('DUPLICATE_BLOCKED', { invoiceNumber })
      return
    }
    paymentCompletedRef.current = true
    onComplete?.(invoiceNumber, result)
  }

  // ─── Pre-generate FonePay QR in background ─────────────
  // Starts generating the QR code while the user is still on the review screen.
  // By the time they click "FonePay QR", the QR is already ready — no 3s wait.
  // Only pre-generates ONCE per amount change. If discount changes, amount
  // changes, and a new QR is generated for the new amount.
  // ───────────────────────────────────────────────────────────────────────
  useEffect(() => {
    // Guard: only pre-generate when on review and we have a valid amount.
    // Also skip if Fonepay isn't configured at all.
    if (view !== 'review' || !fonepayEffectiveAmount || fonepayEffectiveAmount <= 0) return
    if (!isFonepayConfigured()) return

    // Already have a QR for this exact amount — reuse it.
    if (preGeneratedQrRef.current?.amount === fonepayEffectiveAmount) return

    // Don't start a new generation if one is already in-flight.
    if (preGenLoadingRef.current) return
    preGenLoadingRef.current = true

    let cancelled = false
    const prn = generatePRN()

    ;(async () => {
      try {
        log('PRE_GEN', `Pre-generating FonePay QR for amount ${fonepayEffectiveAmount}`)

        const MAX_ATTEMPTS = 2
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
          if (cancelled) return

          const data = await generateFonepayQR({
            amount: fonepayEffectiveAmount,
            prn,
            remarks1: `Highlands Cafe POS\n${initialCustomerName || 'POS Payment'}`,
          })
          if (cancelled) return

          // Empty QR → retry with same PRN (gateway warmup).
          if (!data.qrMessage || data.qrMessage.trim().length === 0) {
            if (attempt < MAX_ATTEMPTS - 1) continue
            log('PRE_GEN_FAILED', 'QR empty after all attempts — live generation will retry')
            return
          }

          // Generate the SVG QR image (fast, no canvas dependency)
          const qrImage = generateQRDataURL(data.qrMessage, {
            width: 320,
            margin: 2,
            color: { dark: '#000000', light: '#ffffff' },
          })

          // Store in ref so FonepayQRDialog can consume it when opened.
          // Use fonepayEffectiveAmount so we can invalidate on amount change.
          preGeneratedQrRef.current = {
            qrImage,
            paymentRefId: prn,
            wsUrl: data.thirdpartyQrWebSocketUrl,
            amount: fonepayEffectiveAmount,
          }
          log('PRE_GEN_READY', `FonePay QR pre-generated for Rs. ${fonepayEffectiveAmount}`)
          return
        }
      } catch {
        // Silently fail — FonepayQRDialog will generate normally when opened.
        log('PRE_GEN_ERROR', 'Background pre-generation failed — live fallback will handle it')
      } finally {
        preGenLoadingRef.current = false
      }
    })()

    return () => {
      cancelled = true
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fonepayEffectiveAmount, view, initialCustomerName])

  // ─── Fetch real customers for credit assignment ───
  useEffect(() => {
    let cancelled = false;
    setCustomersLoading(true);
    insforge.database
      .from('customers')
      .select('id, name, phone')
      .order('name', { ascending: true })
      .then(({ data, error }: { data: Array<{id:string;name:string;phone:string|null}> | null; error: Error | null }) => {
        if (cancelled) return;
        if (!error && data) {
          setCustomersList(data as Array<{id:string;name:string;phone:string|null}>);
        }
        setCustomersLoading(false);
      });
    return () => { cancelled = true; };
  }, []);
  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return [];
    const q = customerSearch.toLowerCase();
    return customersList.filter(
      c => c.name.toLowerCase().includes(q) || (c.phone ?? '').toLowerCase().includes(q)
    );
  }, [customersList, customerSearch]);


  // ─── Guard: close dialog immediately if there are no unpaid items ───
  // NOTE: This is intentionally AFTER all useMemo/useEffect/useCallback
  // calls so React's Rules of Hooks are never violated.
  if (items.length === 0) {
    setTimeout(() => { onClose?.(); }, 50);
    return null;
  }

  const getPaymentResult = (inv: InvoiceData, extraCredit?: { amount: number; customerName: string }): PaymentResult => {
    // For split payments (when paidItemIds is narrowed), the invoice should
    // reflect only the selected items' grand total, not the full bill total.
    // Use inv.grandTotal (which is splitGrandTotal for splits) rather than
    // inv.paidAmount because paidAmount may be 0 for credit payments.
    const effectiveGrandTotal = inv.paidItemIds ? inv.grandTotal : grandTotal;
    return {
      customerName: inv.customerName ?? selectedCustomer?.name ?? initialCustomerName,
      invoiceNumber: inv.invoiceNumber,
      paymentMethod: inv.paymentMethod,
      // Use the invoice's paidItemIds if provided (for split/partial payments),
      // otherwise mark ALL items as paid (full bill payment)
      paidItemIds: inv.paidItemIds ?? items.map(i => i.id),
      grandTotal: effectiveGrandTotal,
      paidAmount: inv.paidAmount,
      discount: inv.discount,
      paidSubtotal: inv.subtotal,
      creditAmount: extraCredit?.amount ?? (inv.paymentMethod.startsWith('Credit') ? effectiveGrandTotal - inv.paidAmount : undefined),
      creditCustomerName: extraCredit?.customerName ?? (() => {
        // Extract customer name from "Credit (Name)" or "Partial (X) + Credit (Name)"
        const match = inv.paymentMethod.match(/Credit\s*\(([^)]+)\)/);
        return match ? match[1] : undefined;
      })(),
      // ── invoiceTotal: Single Source of Truth ──
      // For partial payments (detected via pendingPartialCredit or extraCredit),
      // invoiceTotal MUST be the FULL bill grandTotal so that POS.tsx correctly
      // computes remainingBalance = invoiceTotal - paidAmount.
      // Example: total=1000, paid=700 → remaining=300 (NOT 0).
      // For split payments, invoiceTotal is the selected items' total.
      // For full payments, invoiceTotal is the full bill grandTotal.
      invoiceTotal: (pendingPartialCredit !== null || extraCredit !== undefined)
        ? grandTotal
        : (inv.paidItemIds ? effectiveGrandTotal : grandTotal),
    };
  };

  const simulatePayment = (method: string, amount?: number, creditInfo?: { amount: number; customerName: string }, splitItemIds?: string[]) => {
    // Rate limit check — prevent rapid duplicate payment submissions
    if (!checkLimit()) return;

    // Guard against zero-amount payments — the database rejects them
    const effectiveAmount = amount ?? grandTotal;
    if (import.meta.env.DEV) {
      console.log('[POS:simulatePayment]', JSON.stringify({
        method, amount, grandTotal, effectiveAmount, subtotal, discountAmount, itemsCount: items.length,
      }));
    }
    if (!effectiveAmount || effectiveAmount <= 0) {
      showError('Cannot process a zero-amount payment. Check the items and discount.');
      return;
    }
    setSubmittingPayment(true);
    // ponytail: no artificial delay — navigate immediately
    const year = new Date().getFullYear();
    const isSplit = !!splitItemIds;
    const selectedItems = isSplit
      ? items.filter(i => splitItemIds.includes(i.id))
      : items;
    const splitSubtotal = isSplit
      ? selectedItems.reduce((s, i) => s + Number(i.unit_price) * i.quantity, 0)
      : subtotal;
    const splitGrandTotal = isSplit
      ? Math.max(0, splitSubtotal - discountAmount)
      : grandTotal;
    const invoiceItems = selectedItems.map(i => ({ name: i.item_name, quantity: i.quantity, unitPrice: Number(i.unit_price) }));
    // Use the pre-generated Fonepay invoice number if available so the
    // remark on the QR matches the actual invoice number.
    const fonepayInvoice = fonepayInvoiceNumberRef.current;
    fonepayInvoiceNumberRef.current = null; // consume
    const inv: InvoiceData = {
      invoiceNumber: fonepayInvoice || `INV-${year}-${String(Date.now()).slice(-6)}`,
      tableNumber: selectedTableId,
      items: invoiceItems,
      subtotal: splitSubtotal,
      discount: isSplit ? discountAmount : discountAmount,
      grandTotal: splitGrandTotal,
      // For credit methods (e.g. 'Credit (John)'), no cash was actually received —
      // paidAmount is 0 and the full amount is tracked via creditAmount.
      // For cash-based methods, paidAmount equals what the customer handed over.
      paidAmount: method.startsWith('Credit') ? 0 : (amount ?? splitGrandTotal),
      paymentMethod: creditInfo ? `Partial (${method}) + Credit (${creditInfo.customerName})` : method,
      paidItemIds: splitItemIds,
    };
    setCompletedInvoice(inv);
    setPendingCreditInfo(creditInfo);
    setPendingPartialCredit(null); // safety net: clear any stale partial state
    setSubmittingPayment(false);
    setShowSuccess(true);
  };

  const handleCashPay = () => {
    if (submittingPayment) return
    if (partialContext) {
      // Partial payment — create invoice for partial amount, auto-credit remaining
      const inv = buildPartialInvoice(partialContext.partialAmount, 'cash')
      setCompletedInvoice(inv)

      if (partialContext.remainingAmount > 0 && initialCustomerName && initialCustomerName.trim()) {
        setPendingCreditInfo({ amount: partialContext.remainingAmount, customerName: initialCustomerName })
      } else {
        setPendingCreditInfo(undefined)
      }

      setPartialContext(null)
      setSubmittingPayment(false)
      setShowSuccess(true)
      return
    }
    if (splitContext) {
      simulatePayment('cash', undefined, undefined, splitContext.selectedItemIds)
      setSplitContext(null)
      return
    }
    simulatePayment('cash')
  }
  const handleReceptionQRPay = () => {
    if (submittingPayment) return
    if (partialContext) {
      // Partial payment — create invoice for partial amount, auto-credit remaining
      const inv = buildPartialInvoice(partialContext.partialAmount, 'reception_qr')
      setCompletedInvoice(inv)

      if (partialContext.remainingAmount > 0 && initialCustomerName && initialCustomerName.trim()) {
        setPendingCreditInfo({ amount: partialContext.remainingAmount, customerName: initialCustomerName })
      } else {
        setPendingCreditInfo(undefined)
      }

      setPartialContext(null)
      setSubmittingPayment(false)
      setShowSuccess(true)
      return
    }
    if (splitContext) {
      simulatePayment('reception_qr', undefined, undefined, splitContext.selectedItemIds)
      setSplitContext(null)
      return
    }
    simulatePayment('reception_qr')
  };
  const handleCreditPay = (_: string, name: string) => {
    if (submittingPayment) return
    if (splitContext) {
      simulatePayment(`Credit (${name})`, undefined, undefined, splitContext.selectedItemIds)
      setSplitContext(null)
      return
    }
    simulatePayment(`Credit (${name})`)
  };
  const handleFonepaySuccess = () => {
    if (!checkLimit()) return;

    if (splitContext) {
      // Split payment via Fonepay — pay only selected items.
      // Go through the success view (like split-Cash does via simulatePayment)
      // so the cashier can review and choose to print before finalizing.
      log('FONEPAY_SPLIT_SUCCESS', 'Split Fonepay payment confirmed');
      const ids = splitContext.selectedItemIds
      setSplitContext(null)

      const year = new Date().getFullYear();
      const fonepayInvoice = fonepayInvoiceNumberRef.current;
      fonepayInvoiceNumberRef.current = null;
      const invNum = fonepayInvoice || `INV-${year}-${String(Date.now()).slice(-6)}`;

      const selectedItems = items.filter(i => ids.includes(i.id));
      const splitSubtotal = selectedItems.reduce((s, i) => s + Number(i.unit_price) * i.quantity, 0);
      const splitGrandTotalAmount = Math.max(0, splitSubtotal - discountAmount)

      const inv: InvoiceData = {
        invoiceNumber: invNum,
        tableNumber: selectedTableId,
        items: selectedItems.map(i => ({ name: i.item_name, quantity: i.quantity, unitPrice: Number(i.unit_price) })),
        subtotal: splitSubtotal,
        discount: discountAmount,
        grandTotal: splitGrandTotalAmount,
        paidAmount: splitGrandTotalAmount,
        paymentMethod: 'fonepay',
        paidItemIds: ids,
      }

      setCompletedInvoice(inv)
      setPendingCreditInfo(undefined)
      setPendingPartialCredit(null)
      setSubmittingPayment(false)
      setShowSuccess(true)
      return
    }

    if (partialContext) {
      // Partial payment via Fonepay — create partial invoice, auto-credit remaining
      log('FONEPAY_PARTIAL_SUCCESS', 'Partial Fonepay payment confirmed');
      const inv = buildPartialInvoice(partialContext.partialAmount, 'fonepay')
      setCompletedInvoice(inv)

      if (partialContext.remainingAmount > 0 && initialCustomerName && initialCustomerName.trim()) {
        setPendingCreditInfo({ amount: partialContext.remainingAmount, customerName: initialCustomerName })
      } else {
        setPendingCreditInfo(undefined)
      }

      setPartialContext(null)
      setSubmittingPayment(false)
      setShowSuccess(true)
      return
    }

    // Full payment via Fonepay — show the success review screen (like Cash does)
    // instead of auto-finalizing. The cashier sees the invoice summary with
    // Print/Skip buttons before the payment is committed.
    log('FONEPAY_SUCCESS', 'Showing success review');

    const year = new Date().getFullYear();
    const fonepayInvoice = fonepayInvoiceNumberRef.current;
    fonepayInvoiceNumberRef.current = null;
    const invNum = fonepayInvoice || `INV-${year}-${String(Date.now()).slice(-6)}`;

    const inv: InvoiceData = {
      invoiceNumber: invNum,
      tableNumber: selectedTableId,
      items: items.map(i => ({
        name: i.item_name,
        quantity: i.quantity,
        unitPrice: Number(i.unit_price),
      })),
      subtotal,
      discount: discountAmount,
      grandTotal,
      paidAmount: grandTotal,
      paymentMethod: 'fonepay',
      paidItemIds: items.map(i => i.id),
    };

    setCompletedInvoice(inv)
    setPendingCreditInfo(undefined)
    setPendingPartialCredit(null)
    setSubmittingPayment(false)
    setShowSuccess(true)
  };

  /**
   * Partial payment handler.
   * PartialPaymentDialog only asks amount + method. This handler
   * stores the partial context and navigates to the EXISTING payment
   * modal for the chosen method. After the modal reports success,
   * the remaining amount auto-converts to customer credit.
   *
   * Customer assignment is DEFERRED to after payment succeeds
   * (handled in handleSuccessComplete / partial_customer view).
   */
  const handleNewPartialPay = (params: {
    amount: number
    method: 'cash' | 'fonepay' | 'reception_qr'
    remainingAmount: number
  }) => {
    if (params.amount <= 0) return

    // Store partial context for the existing payment modals
    setPartialContext({
      partialAmount: params.amount,
      remainingAmount: params.remainingAmount,
      method: params.method,
    })

    // Store remaining amount for customer assignment after payment
    setPendingPartialCredit({
      amount: params.remainingAmount,
      method: params.method,
      shouldPrint: false,
    })

    // Navigate to the EXISTING global payment modal for the chosen method.
    // The modal handles its own payment flow — we just pass the partial amount.
    if (params.method === 'cash') {
      setCashReceived(String(params.amount))
      setView('cash')
    } else if (params.method === 'reception_qr') {
      setView('reception_qr')
    } else if (params.method === 'fonepay') {
      setView('fonepay')
    }
  }

  // ─── Partial payment helper: build partial invoice from amount ───
  const buildPartialInvoice = (amt: number, method: string): InvoiceData => {
    const year = new Date().getFullYear()
    // Consume the pre-generated Fonepay invoice number if available (for QR remark consistency)
    const fonepayInvoice = fonepayInvoiceNumberRef.current;
    fonepayInvoiceNumberRef.current = null;
    const invNum = fonepayInvoice || `INV-${year}-${String(Date.now()).slice(-6)}`

    const paidItems: Array<{ id: string; name: string; quantity: number; unitPrice: number }> = []
    let remainingToAssign = amt
    for (const item of items) {
      if (remainingToAssign <= 0) break
      const itemTotal = Number(item.unit_price) * item.quantity
      paidItems.push({
        id: item.id,
        name: item.item_name,
        quantity: item.quantity,
        unitPrice: Number(item.unit_price),
      })
      remainingToAssign -= itemTotal
    }

    return {
      invoiceNumber: invNum,
      tableNumber: selectedTableId,
      items: paidItems.map(i => ({ name: i.name, quantity: i.quantity, unitPrice: i.unitPrice })),
      subtotal: amt,
      discount: discountAmount * (amt / grandTotal || 0),
      grandTotal: amt,
      paidAmount: amt,
      paymentMethod: method,
      // When the remaining balance is automatically converted to customer credit
      // (pendingPartialCredit != null), ALL items are settled — some by the partial
      // cash payment, the rest by the credit account. Include ALL item IDs so the
      // process_payment RPC marks every item as 'paid', leading to all batches
      // being marked 'paid', which triggers the auto_close_table_session trigger
      // and releases the table for the next customer.
      // Without this, only the cash-covered items would be marked 'paid', leaving
      // the batch in 'partial' status, the session active, and the table occupied.
      paidItemIds: pendingPartialCredit !== null
      ? items.map(i => i.id)
      : paidItems.map(i => i.id),
    }
  }

  const handleSplitContinue = (params: { item_ids: string[]; amount: number }) => {
    setSplitContext({
      selectedItemIds: params.item_ids,
      splitSubtotal: params.amount,
    })
    // Route back to the review view where they can pick a payment method
    setView('review')
  };

  const handlePaymentMethodClick = (key: string) => {
    // Room payments & customer invoice collections: only cash, reception QR, and FonePay are allowed
    const RESTRICTED_METHODS = ['credit', 'split', 'partial'];
    if ((isRoomPayment || isCustomerPayment) && RESTRICTED_METHODS.includes(key)) return;

    // Show brief selected state before navigating
    setSelectedMethod(key);
    setTimeout(() => {
      setSelectedMethod(null);
      if (key === 'cash') { setCashReceived(''); setPartialContext(null); setPendingPartialCredit(null); setView('cash'); }
      else if (key === 'reception_qr') { setPartialContext(null); setPendingPartialCredit(null); setView('reception_qr'); }
      else if (key === 'fonepay') { setPartialContext(null); setPendingPartialCredit(null); setView('fonepay'); }
      else if (key === 'credit') setView('credit');
      else if (key === 'split') setView('split');
      else if (key === 'partial') { setView('partial'); }
    }, 200);
  };

  const handleSuccessComplete = (shouldPrint: boolean) => {
    setShowSuccess(false);

    if (!completedInvoice) {
      safeComplete();
      onClose?.();
      return
    }

    // If this was a partial payment with remaining credit but NO customer assigned yet,
    // show the customer prompt for deferred assignment.
    const remaining = pendingPartialCredit?.amount ?? 0
    const hasCustomer = !!(pendingCreditInfo?.customerName || initialCustomerName)

    if (remaining > 0 && !hasCustomer) {
      // Deferred customer assignment — show customer selection
      setView('partial_customer')
      return
    }

    // Otherwise, complete normally with optional credit info
    const result = getPaymentResult(completedInvoice, pendingCreditInfo)
    safeComplete(completedInvoice.invoiceNumber, result)

    if (shouldPrint) {
      printService.printInvoice(buildPrintData(
        completedInvoice,
        undefined,
        pendingCreditInfo ?? undefined,
      ))
      showSuccess('Invoice sent to printer')
    }

    onClose?.()
  };

  // ─── Assign customer for partial credit via CreditAccountPayment UI ───
  // Reuses the global CreditAccountPayment component so the UX is identical
  // to a standard Credit Account payment. Dispatches safeComplete when customer
  // is selected and the credit is assigned.
  const handlePartialCreditPay = (_customerId: string, customerName: string) => {
    if (!completedInvoice || !pendingPartialCredit) return;
    const creditInfo = { amount: pendingPartialCredit.amount, customerName };
    const result = getPaymentResult(completedInvoice, creditInfo);
    safeComplete(completedInvoice.invoiceNumber, result);

    if (pendingPartialCredit.shouldPrint) {
      printService.printInvoice(buildPrintData(
        completedInvoice,
        undefined,
        creditInfo,
      ));
      showSuccess('Invoice sent to printer');
    }
    setPendingPartialCredit(null);
    onClose?.();
  };

  const renderDiscountSection = () => (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Discount</p>
      <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5 w-fit">
        <button onClick={() => { if (discountType === 'fixed' && discountValue > 0) setDiscountValue(Math.round((discountValue / subtotal) * 100)); setDiscountType('percentage'); }}
          className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded font-medium transition-colors ${discountType === 'percentage' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
          <Percent className="h-3 w-3" /> %
        </button>
        <button onClick={() => { if (discountType === 'percentage' && discountValue > 0) setDiscountValue(Math.round(subtotal * (discountValue / 100))); setDiscountType('fixed'); }}
          className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded font-medium transition-colors ${discountType === 'fixed' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
          <DollarSign className="h-3 w-3" /> Amount
        </button>
      </div>
      <div className="flex items-center gap-2">          <input type="number" min="0" max={discountType === 'percentage' ? 100 : discountBasis} value={discountValue || ''}
            onChange={e => setDiscountValue(Math.max(0, Number(e.target.value)))}
            onWheel={e => (e.target as HTMLInputElement).blur()}
            placeholder={discountType === 'percentage' ? '0%' : 'Rs. 0'}
            className="flex-1 h-10 rounded-lg border border-border bg-transparent px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
        {discountAmount > 0 && <button onClick={() => setDiscountValue(0)} className="text-xs text-destructive hover:underline shrink-0">Clear</button>}
      </div>
    </div>
  );

  const renderItemList = () => {
    const displayItems = isSplitMode ? effectiveItems : items
    return (
      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {isSplitMode ? `Selected Items (${displayItems.length})` : 'Items'}
        </p>
        {displayItems.map(item => (
          <div key={item.id} className="flex items-center justify-between text-sm py-1.5">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="text-muted-foreground shrink-0 w-6 text-right tabular-nums">{item.quantity}×</span>
              <span className="truncate">{item.item_name}</span>
            </div>
            <span className="tabular-nums shrink-0 ml-2">{npr(Number(item.unit_price) * item.quantity)}</span>
          </div>
        ))}
      </div>
    )
  };

  const renderTotals = () => {
    const displayTotal = isSplitMode ? effectiveGrandTotal : grandTotal
    const displaySub = isSplitMode ? effectiveSubtotal : subtotal
    return (
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{isSplitMode ? 'Split Subtotal' : 'Subtotal'}</span>
          <span className="tabular-nums">{npr(displaySub)}</span>
        </div>
        {discountAmount > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Discount{isSplitMode ? ' (split)' : ''}</span>
            <span className="text-destructive tabular-nums">-{npr(discountAmount)}</span>
          </div>
        )}
        <hr className="border-border" />
        <div className="flex justify-between items-center">
          <span className="text-base font-bold">Grand Total</span>
          <span className="text-xl font-bold text-primary tabular-nums">{npr(displayTotal)}</span>
        </div>
        {isSplitMode && (
          <div className="flex justify-between text-xs text-muted-foreground pt-1">
            <span>Original bill total</span>
            <span className="tabular-nums">{npr(grandTotal)}</span>
          </div>
        )}
      </div>
    )
  };

  const renderPaymentMethods = () => (
    <div className="pt-2">
      {isSplitMode && (
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-teal-50 dark:bg-teal-950/20 px-3 py-2 text-xs text-teal-700 dark:text-teal-300">
          <Users className="h-4 w-4 shrink-0" />
          <span>Split Payment — {items.filter(i => splitContext?.selectedItemIds.includes(i.id)).length} items selected. Choose a method below.</span>
        </div>
      )}
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Payment Method</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {availablePaymentMethods.map(method => {
          const Icon = method.icon;
          const styles = COLOR_STYLES[method.color];
          const isSelected = selectedMethod === method.key;
          const isRestricted = isRoomPayment && ['credit', 'split', 'partial'].includes(method.key);
          return (
            <button
              key={method.key}
              onClick={() => { if (!isRestricted) handlePaymentMethodClick(method.key); }}
              disabled={isRestricted}
              className={`group relative flex flex-col items-start gap-2 p-4 rounded-xl border transition-all text-left cursor-pointer
                ${method.dashed ? 'border-2 border-dashed border-muted-foreground/30 dark:border-muted-foreground/20' : 'border-border'}
                ${isSelected ? 'border-emerald-500 bg-emerald-50/80 dark:bg-emerald-950/20 shadow-md shadow-emerald-500/10' : styles.hover}
                hover:shadow-sm hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99]
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:border-emerald-500
                ${isRestricted ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''}`}
            >
              <div className="flex items-center gap-3 w-full">
                <div className={`relative w-11 h-11 rounded-xl ${isSelected ? 'bg-emerald-100 dark:bg-emerald-900/40' : styles.iconBg} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-200`}>
                  <Icon className={`h-5 w-5 ${isSelected ? 'text-emerald-600' : styles.iconText}`} />
                  {isSelected && (
                    <span className="absolute -top-1 -right-1 flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500 text-white shadow-sm">
                      <Check className="h-2.5 w-2.5" />
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold truncate ${isSelected ? 'text-emerald-700 dark:text-emerald-300' : ''}`}>{method.label}</p>
                  <p className="text-[11px] text-muted-foreground/70 leading-tight mt-0.5">{method.desc}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  // ─── View: Success (takes priority over all view checks) ───
  if (showSuccessView) {
    const inv = completedInvoice;
    const isCashPayment = inv?.paymentMethod === 'cash';
    const changeForCash = isCashPayment ? Math.max(0, cashReceivedNum - (inv?.grandTotal ?? grandTotal)) : 0;
    const remaining = inv ? Math.max(0, (inv?.grandTotal ?? grandTotal) - inv.paidAmount) : 0;
    // A payment is "partial without credit" only if:
    //   1. There's a remaining balance after this payment (remaining > 0)
    //   2. No pending credit info was passed in (no auto-credit transfer)
    //   3. No pending partial credit to be assigned later
    //   4. The payment method isn't credit itself (e.g. full credit via Credit Account)
    //      — for credit payments, paidAmount=0 so remaining would be misleading.
    const isPartialWithoutCredit = inv && remaining > 0 && !pendingCreditInfo && !pendingPartialCredit
      && !completedInvoice?.paymentMethod.startsWith('Credit');

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
        <div className="w-full max-w-[min(24rem,calc(100vw-2rem))] rounded-2xl border bg-background shadow-2xl overflow-hidden">
          {/* Success Header */}
          <div className={`px-6 py-8 text-center text-white ${isPartialWithoutCredit ? 'bg-gradient-to-br from-amber-500 to-orange-600' : 'bg-gradient-to-br from-emerald-500 to-emerald-600'}`}>
            <div className="mx-auto w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mb-3">
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-bold">{isPartialWithoutCredit ? 'Partial Payment' : 'Payment Successful'}</h2>
            {inv && <p className={`text-sm mt-1 ${isPartialWithoutCredit ? 'text-amber-100' : 'text-emerald-100'}`}>Invoice: {inv.invoiceNumber}</p>}
          </div>

          {/* Invoice Summary */}
          {inv && (
            <div className="px-6 pt-4 pb-2 space-y-2">
              <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2.5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Payment Method</span>
                  <span className="font-medium">{getPaymentMethodLabel(inv.paymentMethod) || inv.paymentMethod}</span>
                </div>
                <hr className="border-border" />
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Amount Received</span>
                  <span className="font-semibold text-emerald-600 tabular-nums">{npr(inv.paidAmount)}</span>
                </div>
                {isPartialWithoutCredit && (
                  <>
                    <hr className="border-border" />
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Remaining</span>
                      <span className="font-semibold text-amber-600 tabular-nums">{npr(remaining)}</span>
                    </div>
                  </>
                )}
                {isCashPayment && cashReceivedNum > (inv?.grandTotal ?? grandTotal) && (
                  <>
                    <hr className="border-border" />
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Change Due</span>
                      <span className="font-semibold text-amber-600 tabular-nums">{npr(changeForCash)}</span>
                    </div>
                  </>
                )}
                {inv.tableNumber && (
                  <>
                    <hr className="border-border" />
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Table / Room</span>
                      <span className="font-medium">{inv.tableNumber}</span>
                    </div>
                  </>
                )}
                {(completedInvoice?.paymentMethod.startsWith('Credit') || pendingCreditInfo) && (
                  <>
                    <hr className="border-border" />
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Outstanding Credit</span>
                      <span className="font-semibold text-purple-600 tabular-nums">
                        {npr(pendingCreditInfo?.amount ?? (inv?.grandTotal ?? grandTotal) - inv.paidAmount)}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {isPartialWithoutCredit ? (
            <>
              <p className="text-center text-sm text-muted-foreground px-6">
                What would you like to do with the remaining <strong>{npr(remaining)}</strong>?
              </p>
              <div className="flex flex-col gap-2 p-6 pt-4">
                <button
                  onClick={() => {
                    setShowSuccess(false);
                    if (completedInvoice) {
                      const result = getPaymentResult(completedInvoice, undefined);
                      safeComplete(completedInvoice.invoiceNumber, result);
                    }
                    onClose?.();
                  }}
                  className="w-full h-14 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600 transition-all active:scale-[0.98] shadow-sm flex items-center justify-center gap-2"
                >
                  <DollarSign className="h-4 w-4" />
                  Continue Payment
                </button>
                <button
                  onClick={() => {
                    setShowSuccess(false);
                    setView('partial_customer');
                  }}
                  className="w-full h-14 rounded-xl border-2 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 font-semibold hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  <CreditCard className="h-4 w-4" />
                  Add Remaining to Customer Credit
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-center text-sm text-muted-foreground px-6">
                Would you like to print the invoice?
              </p>
              <div className="flex gap-3 p-6 pt-4">
                <button
                  onClick={() => handleSuccessComplete(true)}
                  className="flex-1 h-14 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600 transition-all active:scale-[0.98] shadow-sm flex items-center justify-center gap-2"
                >
                  <Printer className="h-4 w-4" />
                  Print Invoice
                </button>
                <button
                  onClick={() => handleSuccessComplete(false)}
                  className="flex-1 h-14 rounded-xl border-2 border-border font-semibold hover:bg-muted transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  Skip
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ─── View: Review ───
  if (view === 'review') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-[min(32rem,calc(100vw-2rem))] max-h-[90vh] overflow-y-auto rounded-xl border bg-background shadow-2xl flex flex-col">
          <div className="flex items-center justify-between p-4 border-b shrink-0">
            <div className="flex items-center gap-2">
              <button onClick={() => {
                if (isSplitMode) { setSplitContext(null); return }
                onClose()
              }} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-muted transition-colors"><ArrowLeft className="h-5 w-5" /></button>
              <h2 className="text-lg font-semibold">{isSplitMode ? 'Split Payment' : 'Bill Review'}</h2>
              {isSplitMode && (
                <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-teal-100 dark:bg-teal-900/30 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-300">
                  Selected Items
                </span>
              )}
              {isRoomPayment && (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/30 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                  Room Payment
                </span>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-4">
            {renderItemList()} <hr className="border-border" /> {renderDiscountSection()} <hr className="border-border" /> {renderTotals()} {renderPaymentMethods()}
            {isSplitMode && (
              <div className="flex items-center gap-2 rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50/80 dark:bg-teal-950/20 px-4 py-3 text-xs text-teal-700 dark:text-teal-300">
                <Users className="h-4 w-4 shrink-0" />
                <span>Only selected items will be marked as paid. Unselected items remain for future payment.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── View: Cash ───
  if (view === 'cash') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-[min(28rem,calc(100vw-2rem))] rounded-xl border bg-background shadow-lg max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between p-4 border-b shrink-0">
            <div className="flex items-center gap-2">
              <button onClick={() => setView('review')} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-muted transition-colors"><ArrowLeft className="h-5 w-5" /></button>
              <h2 className="text-lg font-semibold">Cash Payment</h2>
            </div>
          </div>
          <div className="p-4 space-y-4">              <div className="rounded-xl border bg-muted/30 p-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Bill Total{isSplitMode ? ' (split)' : ''}</span>
                <span className="text-2xl font-bold tabular-nums">{npr(effectiveGrandTotal)}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {CASH_QUICK_AMOUNTS.map(amt => (
                <button key={amt} onClick={() => setCashReceived(String(amt))}
                  className={`flex-1 min-w-[80px] px-4 py-3 rounded-xl border text-sm font-semibold transition-all ${Number(cashReceived) === amt ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300' : 'border-border hover:border-emerald-300'}`}>
                  {npr(amt)}
                </button>
              ))}
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Cash Received</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-muted-foreground">Rs.</span>
                <input type="number" step="1" min="0" value={cashReceived} onChange={e => setCashReceived(e.target.value)}
                  onWheel={e => (e.target as HTMLInputElement).blur()}
                  className="w-full h-14 text-xl font-bold rounded-xl border border-border bg-transparent pl-12 pr-4 outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 text-center" placeholder="0" />
              </div>
            </div>
            {cashReceivedNum > 0 && (
              <div className="rounded-xl border bg-card p-4 space-y-2">
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Amount Due</span><span className="font-semibold">{npr(effectiveCashTotal)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Cash Received</span><span className="font-semibold">{npr(cashReceivedNum)}</span></div>
                <hr className="border-border" />
                {isCashSufficient ? (
                  <div className="flex justify-between text-base font-bold text-emerald-600"><span>Change Due</span><span>{npr(changeDue)}</span></div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 dark:bg-amber-950/20 rounded-lg p-2">
                    <AlertCircle className="h-4 w-4 shrink-0" /><span>Short by {npr(effectiveCashTotal - cashReceivedNum)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="p-4 border-t space-y-2 shrink-0">
            <button onClick={() => setCashReceived(String(effectiveCashTotal))}
              className="w-full h-12 rounded-xl border-2 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-semibold hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition-all">
              {partialContext ? `Pay ${npr(effectiveCashTotal)}` : `Exact Amount — ${npr(effectiveCashTotal)}`}
            </button>
            <button onClick={handleCashPay} disabled={submittingPayment || cashReceivedNum <= 0 || !isCashSufficient}
              className="w-full h-14 rounded-xl bg-emerald-500 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-emerald-600 transition-all active:scale-[0.99] shadow-sm">
              {submittingPayment ? <><Loader2 className="h-5 w-5 animate-spin" /> Processing...</> : <><Check className="h-5 w-5" /> {partialContext ? `Receive ${npr(cashReceivedNum || effectiveCashTotal)}` : `Receive Payment — ${npr(cashReceivedNum || effectiveCashTotal)}`}</>}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── View: Credit ───
  if (view === 'credit') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-[min(28rem,calc(100vw-2rem))] rounded-xl border bg-background shadow-lg max-h-[90vh] overflow-y-auto">
          <CreditAccountPayment grandTotal={isSplitMode ? effectiveGrandTotal : grandTotal} onBack={() => setView('review')} onPay={handleCreditPay} submitting={submittingPayment} />
        </div>
      </div>
    );
  }

  // ─── View: Partial (Redesigned) ───
  if (view === 'partial') {
    return (
      <PartialPaymentDialog
        invoiceTotal={isSplitMode ? effectiveGrandTotal : grandTotal}
        invoiceNumber={undefined}
        onConfirm={handleNewPartialPay}
        onCancel={() => setView('review')}
        submitting={submittingPayment}
      />
    );
  }

  // ─── View: Deferred Customer Assignment ───
  // Shown after a partial payment succeeds when credit is needed but no customer was set.
  // Reuses the global CreditAccountPayment component for a consistent UX.
  if (view === 'partial_customer') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-[min(28rem,calc(100vw-2rem))] rounded-xl border bg-background shadow-lg max-h-[90vh] overflow-y-auto">
          <CreditAccountPayment
            grandTotal={pendingPartialCredit?.amount ?? 0}
            onBack={() => setView('review')}
            onPay={handlePartialCreditPay}
            submitting={false}
          />
        </div>
      </div>
    );
  }

  // ─── View: Reception QR ───
  if (view === 'reception_qr') {
    const effectiveAmount = partialContext?.partialAmount ?? (isSplitMode ? effectiveGrandTotal : grandTotal)
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-[min(28rem,calc(100vw-2rem))] rounded-xl border bg-background shadow-lg max-h-[90vh] overflow-y-auto">
          <ReceptionQRDialog
            amount={effectiveAmount}
            orderId={orderId}
            customerName={initialCustomerName}
            onConfirm={handleReceptionQRPay}
            onCancel={() => { setPartialContext(null); setView('review'); }}
            submitting={submittingPayment}
          />
        </div>
      </div>
    );
  }

  // ─── View: Fonepay ───
  if (view === 'fonepay') {
    const year = new Date().getFullYear();
    const invNum = `INV-${year}-${String(Date.now()).slice(-6)}`;
    if (!fonepayInvoiceNumberRef.current) fonepayInvoiceNumberRef.current = invNum;
    return (
      <FonepayQRDialog
        orderId={orderId}
        amount={fonepayEffectiveAmount}
        onSuccess={handleFonepaySuccess}
        onCancel={fonepayCancelCallback}
        customerName={initialCustomerName}
        invoiceNumber={invNum}
        preGeneratedData={preGeneratedQrRef.current}
      />
    );
  }

  // ─── View: Split ───
  if (view === 'split') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-[min(28rem,calc(100vw-2rem))] rounded-xl border bg-background shadow-lg max-h-[90vh] overflow-y-auto">
          <SplitPaymentDialog items={items} onBack={() => setView('review')} onContinue={handleSplitContinue} />
        </div>
      </div>
    );
  }

  return null;
}