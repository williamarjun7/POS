import { useState, useMemo, useEffect, useRef } from 'react';import { ArrowLeft, Banknote, QrCode, CreditCard, Percent, DollarSign,
  Users, Smartphone, Check, AlertCircle, Loader2, Printer,
} from 'lucide-react';

// ─── Dev logging ────────────────────────────────────────────
function log(prefix: string, ...args: unknown[]) {
  if (import.meta.env.DEV) {
    console.log(`[POS:${prefix}]`, ...args)
  }
}

// ─── Print helper (shared across Fonepay handlers) ─────────
function buildPrintData(inv: InvoiceData): PrintInvoiceData {
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
  }
}
import { showSuccess, showError } from '@/components/ui/toast';
import { printService } from '@/lib/services/print-service';
import { getPaymentMethodLabel } from '@/lib/payment-methods';
import type { InvoiceData as PrintInvoiceData } from '@/components/printing/InvoiceTemplate';

import { useRateLimit } from '@/lib/hooks/useRateLimit'
import { FonepayQRDialog } from './FonepayQRDialog';
import { SplitPaymentDialog } from './SplitPaymentDialog';
import { CreditAccountPayment } from './CreditAccountPayment';
import { ReceptionQRDialog } from './ReceptionQRDialog';
import { insforge } from '@/lib/services/auth-service';

// ─── Types ───────────────────────────────────────────────────

type PaymentView = 'review' | 'cash' | 'credit' | 'partial' | 'split'
  | 'fonepay' | 'partial_fonepay' | 'split_fonepay' | 'split_credit'
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
  invoiceNumber?: string;
  paymentMethod?: string;
  paidItemIds: string[];
  grandTotal: number;
  paidAmount: number;
  creditAmount?: number;
  creditCustomerName?: string;
}

interface PosPaymentDialogProps {
  orderId: string;
  unpaidItems: OrderItem[];
  customerName?: string;
  selectedTableId: string;
  isRoomPayment?: boolean;
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

const PARTIAL_METHODS = [
  { value: 'cash' as const, label: getPaymentMethodLabel('cash'), icon: Banknote, color: 'emerald' },
  { value: 'reception_qr' as const, label: getPaymentMethodLabel('reception_qr'), icon: Smartphone, color: 'sky' },
  { value: 'fonepay' as const, label: getPaymentMethodLabel('fonepay'), icon: QrCode, color: 'blue' },
];

const CASH_QUICK_AMOUNTS = [100, 200, 500, 1000, 2000, 5000];

// ─── Helpers ─────────────────────────────────────────────────

const npr = (amount: number) =>
  `Rs. ${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`;

// ─── Component ───────────────────────────────────────────────

export function PosPaymentDialog({
  orderId, unpaidItems, customerName: initialCustomerName,
  selectedTableId, isRoomPayment = false, onClose, onComplete,
}: PosPaymentDialogProps) {
  const { checkLimit } = useRateLimit({ cooldownMs: 2000, maxAttempts: 10 })
  const [view, setView] = useState<PaymentView>('review');
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState(0);
  const [cashReceived, setCashReceived] = useState('');
  const [partialAmount, setPartialAmount] = useState('');
  const [partialMethod, setPartialMethod] = useState<'cash' | 'fonepay' | 'reception_qr'>('cash');
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: string; name: string } | null>(null);
  const [pendingPartialFonepay, setPendingPartialFonepay] = useState<number | null>(null);
  const [pendingSplitFonepay, setPendingSplitFonepay] = useState<{ item_ids: string[]; amount: number } | null>(null);
  const [pendingSplitCredit, setPendingSplitCredit] = useState<{ item_ids: string[]; amount: number } | null>(null);
  const [completedInvoice, setCompletedInvoice] = useState<InvoiceData | null>(null);
  const [showSuccessView, setShowSuccess] = useState(false);
  const [pendingCreditInfo, setPendingCreditInfo] = useState<{ amount: number; customerName: string } | undefined>(undefined);
  const [pendingPartialCredit, setPendingPartialCredit] = useState<{ amount: number; method: string; shouldPrint: boolean } | null>(null);
  const [customersList, setCustomersList] = useState<Array<{id:string;name:string;phone:string|null}>>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const fonepayInvoiceNumberRef = useRef<string | null>(null);

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

  // ─── Items — bail out early if nothing to pay ─────────
  const items = useMemo(() => unpaidItems ?? [], [unpaidItems]);
  // Guard: close dialog immediately if there are no unpaid items
  if (items.length === 0) {
    // Prevents opening an empty payment dialog (Issue #3)
    setTimeout(() => { onClose?.(); }, 50);
    return null;
  }

  const subtotal = useMemo(() => items.reduce((s, i) => s + Number(i.unit_price) * i.quantity, 0), [items]);
  const discountAmount = useMemo(() => {
    if (discountType === 'percentage') return subtotal * (Math.min(discountValue, 100) / 100);
    return Math.min(discountValue, subtotal);
  }, [subtotal, discountType, discountValue]);
  const grandTotal = Math.max(0, subtotal - discountAmount);
  const cashReceivedNum = Number(cashReceived) || 0;
  const isCashSufficient = cashReceivedNum >= grandTotal;
  const changeDue = Math.max(0, cashReceivedNum - grandTotal);
  const availablePaymentMethods = useMemo(() => {
    if (isRoomPayment) {
      return PAYMENT_METHOD_BUTTONS.filter(m => ['cash', 'reception_qr', 'fonepay'].includes(m.key));
    }
    return PAYMENT_METHOD_BUTTONS;
  }, [isRoomPayment]);

  const partialAmountNum = Number(partialAmount) || 0;
  const isPartialValid = partialAmountNum > 0 && partialAmountNum <= grandTotal;
  const partialRemaining = grandTotal - partialAmountNum;

  const getPaymentResult = (inv: InvoiceData, extraCredit?: { amount: number; customerName: string }): PaymentResult => {
    // For split payments (when paidItemIds is narrowed), the invoice should
    // reflect only the selected items' grand total, not the full bill total.
    // Use inv.grandTotal (which is splitGrandTotal for splits) rather than
    // inv.paidAmount because paidAmount may be 0 for credit payments.
    const effectiveGrandTotal = inv.paidItemIds ? inv.grandTotal : grandTotal;
    return {
      invoiceNumber: inv.invoiceNumber,
      paymentMethod: inv.paymentMethod,
      // Use the invoice's paidItemIds if provided (for split/partial payments),
      // otherwise mark ALL items as paid (full bill payment)
      paidItemIds: inv.paidItemIds ?? items.map(i => i.id),
      grandTotal: effectiveGrandTotal,
      paidAmount: inv.paidAmount,
      creditAmount: extraCredit?.amount ?? (inv.paymentMethod.startsWith('Credit') ? effectiveGrandTotal - inv.paidAmount : undefined),
      creditCustomerName: extraCredit?.customerName ?? (() => {
        // Extract customer name from "Credit (Name)" or "Partial (X) + Credit (Name)"
        const match = inv.paymentMethod.match(/Credit\s*\(([^)]+)\)/);
        return match ? match[1] : undefined;
      })(),
    };
  };

  const simulatePayment = (method: string, amount?: number, creditInfo?: { amount: number; customerName: string }, splitItemIds?: string[]) => {
    // Rate limit check — prevent rapid duplicate payment submissions
    if (!checkLimit()) return;

    // Guard against zero-amount payments — the database rejects them
    const effectiveAmount = amount ?? grandTotal;
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
      ? Math.max(0, splitSubtotal - discountAmount * (splitSubtotal / subtotal || 0))
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
      discount: isSplit ? Math.round(discountAmount * (splitSubtotal / subtotal || 0)) : discountAmount,
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
    setSubmittingPayment(false);
    setShowSuccess(true);
  };

  const handleCashPay = () => { if (!submittingPayment) simulatePayment('cash'); };
  const handleReceptionQRPay = () => { if (!submittingPayment) simulatePayment('reception_qr'); };
  const handleCreditPay = (_: string, name: string) => { if (!submittingPayment) simulatePayment(`Credit (${name})`); };
  const handleFonepaySuccess = () => {
    if (!checkLimit()) return;
    log('FONEPAY_SUCCESS', 'Auto-finalizing payment');

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

    const result = getPaymentResult(inv);

    // Print + close in sequence (print before onComplete to ensure
    // the dialog stays mounted for the iframe-based print)
    printService.printInvoice(buildPrintData(inv))
    showSuccess('Invoice sent to printer')
    onComplete?.(inv.invoiceNumber, result)
    onClose?.()
  };

  const handlePartialPay = (amount: number, method: string) => {
    if (amount <= 0) return;
    if (method === 'fonepay') { setPendingPartialFonepay(amount); setView('partial_fonepay'); return; }
    const remaining = grandTotal - amount;
    if (remaining > 0 && initialCustomerName && initialCustomerName.trim()) {
      // Auto-transfer remaining to customer's credit account
      const creditInfo = { amount: remaining, customerName: initialCustomerName };
      simulatePayment(method, amount, creditInfo);
    } else if (remaining > 0) {
      // Process payment without credit — prompt for customer after success
      simulatePayment(method, amount);
    } else {
      simulatePayment(method, amount);
    }
  };

  const handlePartialFonepaySuccess = () => {
    if (!checkLimit()) return;
    const amt = pendingPartialFonepay ?? 0;
    const remaining = grandTotal - amt;
    setPendingPartialFonepay(null);

    const year = new Date().getFullYear();
    const fonepayInvoice = fonepayInvoiceNumberRef.current;
    fonepayInvoiceNumberRef.current = null;
    const invNum = fonepayInvoice || `INV-${year}-${String(Date.now()).slice(-6)}`;

    // Calculate which items to mark paid based on the partial amount
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

    const inv: InvoiceData = {
      invoiceNumber: invNum,
      tableNumber: selectedTableId,
      items: paidItems.map(i => ({ name: i.name, quantity: i.quantity, unitPrice: i.unitPrice })),
      subtotal: amt,
      discount: discountAmount * (amt / grandTotal || 0),
      grandTotal: amt,
      paidAmount: amt,
      paymentMethod: 'fonepay',
      paidItemIds: paidItems.map(i => i.id),
    };

    // Build result and credit info first (before any side-effects)
    let result: PaymentResult
    if (remaining > 0 && initialCustomerName && initialCustomerName.trim()) {
      const creditInfo = { amount: remaining, customerName: initialCustomerName };
      result = getPaymentResult(inv, creditInfo);
    } else if (remaining > 0) {
      result = getPaymentResult(inv);
      setPendingPartialCredit({ amount: remaining, method: 'fonepay', shouldPrint: false });
    } else {
      result = getPaymentResult(inv);
    }

    // Print before onComplete (ensures dialog stays mounted for iframe print),
    // then complete + close
    printService.printInvoice(buildPrintData(inv))
    showSuccess('Invoice sent to printer')
    onComplete?.(inv.invoiceNumber, result)
    onClose?.()
  };

  const handleSplitPay = (params: { item_ids: string[]; amount: number; method: string }) => {
    if (params.method === 'fonepay') { setPendingSplitFonepay({ item_ids: params.item_ids, amount: params.amount }); setView('split_fonepay'); return; }
    if (params.method === 'credit_account') { setPendingSplitCredit({ item_ids: params.item_ids, amount: params.amount }); setView('split_credit'); return; }
    // Pass the selected item IDs so only those items are marked as paid
    simulatePayment(params.method, params.amount, undefined, params.item_ids);
  };

  const handleSplitFonepaySuccess = () => {
    if (!checkLimit()) return;
    const ids = pendingSplitFonepay?.item_ids ?? [];
    const amt = pendingSplitFonepay?.amount ?? 0;
    setPendingSplitFonepay(null);

    const year = new Date().getFullYear();
    const fonepayInvoice = fonepayInvoiceNumberRef.current;
    fonepayInvoiceNumberRef.current = null;
    const invNum = fonepayInvoice || `INV-${year}-${String(Date.now()).slice(-6)}`;

    const selectedItems = items.filter(i => ids.includes(i.id));
    const splitSubtotal = selectedItems.reduce((s, i) => s + Number(i.unit_price) * i.quantity, 0);

    const inv: InvoiceData = {
      invoiceNumber: invNum,
      tableNumber: selectedTableId,
      items: selectedItems.map(i => ({ name: i.item_name, quantity: i.quantity, unitPrice: Number(i.unit_price) })),
      subtotal: splitSubtotal,
      discount: Math.round(discountAmount * (splitSubtotal / subtotal || 0)),
      grandTotal: amt,
      paidAmount: amt,
      paymentMethod: 'fonepay',
      paidItemIds: ids,
    };

    const result = getPaymentResult(inv);

    // Print before onComplete (ensures dialog stays mounted for iframe print),
    // then complete + close
    printService.printInvoice(buildPrintData(inv))
    showSuccess('Invoice sent to printer')
    onComplete?.(inv.invoiceNumber, result)
    onClose?.()
  };

  const handleSplitCreditPay = (_: string, name: string) => {
    const ids = pendingSplitCredit?.item_ids ?? [];
    const amt = pendingSplitCredit?.amount ?? 0;
    setPendingSplitCredit(null);
    simulatePayment(`Credit (${name})`, amt, undefined, ids);
  };

  const handlePaymentMethodClick = (key: string) => {
    // Room payments: only cash, reception QR, and FonePay are allowed
    const RESTRICTED_METHODS = ['credit', 'split', 'partial'];
    if (isRoomPayment && RESTRICTED_METHODS.includes(key)) return;

    // Show brief selected state before navigating
    setSelectedMethod(key);
    setTimeout(() => {
      setSelectedMethod(null);
      if (key === 'cash') { setCashReceived(''); setView('cash'); }
      else if (key === 'reception_qr') setView('reception_qr');
      else if (key === 'fonepay') setView('fonepay');
      else if (key === 'credit') setView('credit');
      else if (key === 'split') setView('split');
      else if (key === 'partial') { setPartialAmount(''); setPartialMethod('cash'); setView('partial'); }
    }, 200);
  };

  const handleSuccessComplete = (shouldPrint: boolean) => {
    setShowSuccess(false);

    // If this was a partial payment without a customer, show customer prompt
    if (completedInvoice && !pendingCreditInfo && pendingPartialCredit) {
      setPendingPartialCredit(prev => prev ? { ...prev, shouldPrint } : null);
      setView('partial_customer');
      return;
    }

    if (completedInvoice) {
      const result = getPaymentResult(completedInvoice, pendingCreditInfo);
      onComplete?.(completedInvoice.invoiceNumber, result);

      if (shouldPrint) {
        const printData: PrintInvoiceData = {
          invoiceNumber: completedInvoice.invoiceNumber,
          date: new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }),
          time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
          items: (completedInvoice.items ?? []).map(i => ({
            name: i.name ?? 'Item',
            quantity: i.quantity,
            unitPrice: i.unitPrice ?? 0,
          })),
          subtotal: completedInvoice.subtotal,
          discount: completedInvoice.discount || undefined,
          total: completedInvoice.grandTotal,
        };
        printService.printInvoice(printData);
        showSuccess('Invoice sent to printer');
      }
    } else {
      onComplete?.();
    }
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
      <div className="flex items-center gap-2">          <input type="number" min="0" max={discountType === 'percentage' ? 100 : subtotal} value={discountValue || ''}
            onChange={e => setDiscountValue(Math.max(0, Number(e.target.value)))}
            onWheel={e => (e.target as HTMLInputElement).blur()}
            placeholder={discountType === 'percentage' ? '0%' : 'Rs. 0'}
            className="flex-1 h-10 rounded-lg border border-border bg-transparent px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
        {discountAmount > 0 && <button onClick={() => setDiscountValue(0)} className="text-xs text-destructive hover:underline shrink-0">Clear</button>}
      </div>
    </div>
  );

  const renderItemList = () => (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Items</p>
      {items.map(item => (
        <div key={item.id} className="flex items-center justify-between text-sm py-1.5">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-muted-foreground shrink-0 w-6 text-right tabular-nums">{item.quantity}×</span>
            <span className="truncate">{item.item_name}</span>
          </div>
          <span className="tabular-nums shrink-0 ml-2">{npr(Number(item.unit_price) * item.quantity)}</span>
        </div>
      ))}
    </div>
  );

  const renderTotals = () => (
    <div className="space-y-1.5 text-sm">
      <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{npr(subtotal)}</span></div>
      {discountAmount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="text-destructive tabular-nums">-{npr(discountAmount)}</span></div>}
      <hr className="border-border" />
      <div className="flex justify-between items-center">
        <span className="text-base font-bold">Grand Total</span>
        <span className="text-xl font-bold text-primary tabular-nums">{npr(grandTotal)}</span>
      </div>
    </div>
  );

  const renderPaymentMethods = () => (
    <div className="pt-2">
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
    const changeForCash = isCashPayment ? Math.max(0, cashReceivedNum - grandTotal) : 0;
    const remaining = inv ? Math.max(0, grandTotal - inv.paidAmount) : 0;
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
        <div className="w-full max-w-sm rounded-2xl border bg-background shadow-2xl overflow-hidden">
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
                      <span className="text-muted-foreground">Remaining Balance</span>
                      <span className="font-semibold text-amber-600 tabular-nums">{npr(remaining)}</span>
                    </div>
                  </>
                )}
                {isCashPayment && cashReceivedNum > grandTotal && (
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
                      <span className="text-muted-foreground">Credit Balance</span>
                      <span className="font-semibold text-purple-600 tabular-nums">
                        {npr(pendingCreditInfo?.amount ?? grandTotal - inv.paidAmount)}
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
                      onComplete?.(completedInvoice.invoiceNumber, result);
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
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border bg-background shadow-2xl flex flex-col">
          <div className="flex items-center justify-between p-4 border-b shrink-0">
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-muted transition-colors"><ArrowLeft className="h-5 w-5" /></button>
              <h2 className="text-lg font-semibold">Bill Review</h2>
              {isRoomPayment && (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/30 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                  Room Payment
                </span>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-4">
            {renderItemList()} <hr className="border-border" /> {renderDiscountSection()} <hr className="border-border" /> {renderTotals()} {renderPaymentMethods()}
          </div>
        </div>
      </div>
    );
  }

  // ─── View: Cash ───
  if (view === 'cash') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="w-full max-w-md rounded-xl border bg-background shadow-lg max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between p-4 border-b shrink-0">
            <div className="flex items-center gap-2">
              <button onClick={() => setView('review')} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-muted transition-colors"><ArrowLeft className="h-5 w-5" /></button>
              <h2 className="text-lg font-semibold">Cash Payment</h2>
            </div>
          </div>
          <div className="p-4 space-y-4">
            <div className="rounded-xl border bg-muted/30 p-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Bill Total</span>
                <span className="text-2xl font-bold tabular-nums">{npr(grandTotal)}</span>
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
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Amount Due</span><span className="font-semibold">{npr(grandTotal)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Cash Received</span><span className="font-semibold">{npr(cashReceivedNum)}</span></div>
                <hr className="border-border" />
                {isCashSufficient ? (
                  <div className="flex justify-between text-base font-bold text-emerald-600"><span>Change Due</span><span>{npr(changeDue)}</span></div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 dark:bg-amber-950/20 rounded-lg p-2">
                    <AlertCircle className="h-4 w-4 shrink-0" /><span>Short by {npr(grandTotal - cashReceivedNum)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="p-4 border-t space-y-2 shrink-0">
            <button onClick={() => setCashReceived(String(grandTotal))}
              className="w-full h-12 rounded-xl border-2 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-semibold hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition-all">
              Exact Amount &mdash; {npr(grandTotal)}
            </button>
            <button onClick={handleCashPay} disabled={submittingPayment || cashReceivedNum <= 0 || !isCashSufficient}
              className="w-full h-14 rounded-xl bg-emerald-500 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-emerald-600 transition-all active:scale-[0.99] shadow-sm">
              {submittingPayment ? <><Loader2 className="h-5 w-5 animate-spin" /> Processing...</> : <><Check className="h-5 w-5" /> Receive Payment &mdash; {npr(cashReceivedNum || grandTotal)}</>}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── View: Credit ───
  if (view === 'credit') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="w-full max-w-md rounded-xl border bg-background shadow-lg max-h-[90vh] overflow-y-auto">
          <CreditAccountPayment grandTotal={grandTotal} onBack={() => setView('review')} onPay={handleCreditPay} submitting={submittingPayment} />
        </div>
      </div>
    );
  }

  // ─── View: Partial ───
  if (view === 'partial') {
    const activeColor = PARTIAL_METHODS.find(m => m.value === partialMethod)?.color || 'emerald';
    const cs = COLOR_STYLES[activeColor];
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="w-full max-w-md rounded-xl border bg-background shadow-lg max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between p-4 border-b shrink-0">
            <div className="flex items-center gap-2">
              <button onClick={() => setView('review')} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-muted transition-colors"><ArrowLeft className="h-5 w-5" /></button>
              <h2 className="text-lg font-semibold">Partial Payment</h2>
            </div>
          </div>
          <div className="p-4 space-y-4">
            <div className="rounded-xl border bg-muted/30 p-4">
              <div className="flex justify-between items-center mb-3">
                <span className="text-sm text-muted-foreground">Bill Total</span>
                <span className="text-2xl font-bold tabular-nums">{npr(grandTotal)}</span>
              </div>
              {partialAmountNum > 0 && (
                <>
                  <div className="flex justify-between py-1.5 text-sm"><span className="text-muted-foreground">Paying Now</span><span className="font-semibold text-emerald-600">{npr(partialAmountNum)}</span></div>
                  <hr className="border-border my-1" />
                  <div className="flex justify-between pt-1.5">
                    <span className="text-sm font-medium">Remaining</span>
                    <span className={`text-lg font-bold ${partialRemaining > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{npr(partialRemaining)}</span>
                  </div>
                  {partialRemaining > 0 && (
                    <div className="flex items-center gap-2 mt-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" /><span>Customer still owes <strong>{npr(partialRemaining)}</strong></span>
                    </div>
                  )}
                </>
              )}
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Payment Amount</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-muted-foreground">Rs.</span>
                <input type="number" step="0.01" min="0.01" max={grandTotal} value={partialAmount} onChange={e => setPartialAmount(e.target.value)}
                  onWheel={e => (e.target as HTMLInputElement).blur()}
                  className={`w-full h-14 text-xl font-bold rounded-xl border border-border bg-transparent pl-12 pr-4 outline-none text-center ${cs.ring}`} placeholder="0.00" />
              </div>
              {partialAmountNum > grandTotal && <p className="text-xs text-destructive mt-1">Amount cannot exceed {npr(grandTotal)}</p>}
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">Quick Select</label>
              <div className="flex flex-wrap gap-2">
                {CASH_QUICK_AMOUNTS.filter(a => a <= grandTotal).map(amt => (
                  <button key={amt} onClick={() => setPartialAmount(String(amt))}
                    className={`px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all ${Number(partialAmount) === amt ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300' : 'border-border hover:border-emerald-300'}`}>
                    {npr(amt)}
                  </button>
                ))}
                <button onClick={() => setPartialAmount(String(Math.floor(grandTotal / 2)))}
                  className={`px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all ${Number(partialAmount) === Math.floor(grandTotal / 2) ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300' : 'border-border hover:border-emerald-300'}`}>
                  Half &mdash; {npr(Math.floor(grandTotal / 2))}
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 block">Method</label>
              <div className="grid grid-cols-2 gap-3">
                {PARTIAL_METHODS.map(m => {
                  const Icon = m.icon;
                  const isActive = partialMethod === m.value;
                  const c = COLOR_STYLES[m.color];
                  return (
                    <button key={m.value} onClick={() => setPartialMethod(m.value)}
                      className={`group relative flex flex-col items-center gap-2 p-4 rounded-xl border transition-all text-center ${isActive ? `${c.border} ${c.bg} shadow-sm` : 'border-border hover:border-emerald-300 hover:bg-emerald-50/30 dark:hover:bg-emerald-950/10 hover:shadow-sm'}`}>
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform ${isActive ? c.iconBg : 'bg-muted'}`}>
                        <Icon className={`h-5 w-5 ${isActive ? c.iconText : 'text-muted-foreground'}`} />
                      </div>
                      <div className="flex items-center gap-1">
                        <p className={`text-xs font-semibold ${isActive ? c.text : ''}`}>{m.label}</p>
                        {isActive && <span className={`text-xs font-bold ${c.text}`}>&#10003;</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>


          </div>
          <div className="p-4 border-t space-y-2">
            <button onClick={() => setPartialAmount(String(grandTotal))}
              className="w-full h-12 rounded-xl border-2 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-semibold hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition-all">
              Full Amount &mdash; {npr(grandTotal)}
            </button>
            <button onClick={() => handlePartialPay(partialAmountNum, partialMethod)} disabled={!isPartialValid || submittingPayment}
              className="w-full h-14 rounded-xl bg-emerald-500 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-emerald-600 transition-all active:scale-[0.99] shadow-sm">
              {submittingPayment ? <><Loader2 className="h-5 w-5 animate-spin" /> Processing...</> : <><Check className="h-5 w-5" /> Receive {npr(partialAmountNum || 0)}</>}
            </button>
            {partialAmountNum > 0 && partialRemaining > 0 && initialCustomerName && initialCustomerName.trim() && (
              <p className="text-center text-xs text-emerald-600">Remaining {npr(partialRemaining)} will be credited to {initialCustomerName}.</p>
            )}
            {partialAmountNum > 0 && partialRemaining > 0 && (!initialCustomerName || !initialCustomerName.trim()) && (
              <p className="text-center text-xs text-amber-600">Remaining {npr(partialRemaining)} — customer selection required after payment.</p>
            )}
            {partialAmountNum > 0 && partialRemaining === 0 && <p className="text-center text-xs text-muted-foreground">Bill will be fully settled.</p>}
          </div>
        </div>
      </div>
    );
  }

  // ─── View: Partial Customer Selection ───
  // ─── View: Partial Customer Selection ───
  if (view === 'partial_customer') {
    const handleAssignCredit = () => {
      if (!selectedCustomer || !completedInvoice || !pendingPartialCredit) return;
      const creditInfo = { amount: pendingPartialCredit.amount, customerName: selectedCustomer.name };
      const result = getPaymentResult(completedInvoice, creditInfo);
      onComplete?.(completedInvoice.invoiceNumber, result);

      if (pendingPartialCredit.shouldPrint) {
        const printData: PrintInvoiceData = {
          invoiceNumber: completedInvoice.invoiceNumber,
          date: new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }),
          time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
          items: (completedInvoice.items ?? []).map(i => ({
            name: i.name ?? 'Item',
            quantity: i.quantity,
            unitPrice: i.unitPrice ?? 0,
          })),
          subtotal: completedInvoice.subtotal,
          discount: completedInvoice.discount || undefined,
          total: completedInvoice.grandTotal,
        };
        printService.printInvoice(printData);
        showSuccess('Invoice sent to printer');
      }
      setPendingPartialCredit(null);
      onClose?.();
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
        <div className="w-full max-w-md rounded-xl border bg-background shadow-lg overflow-hidden">
          <div className="bg-gradient-to-br from-amber-500 to-orange-600 px-6 py-6 text-center text-white">
            <div className="mx-auto w-14 h-14 rounded-full bg-white/20 flex items-center justify-center mb-3">
              <DollarSign className="h-7 w-7" />
            </div>
            <h2 className="text-lg font-bold">Remaining Balance</h2>
            <p className="text-3xl font-bold text-white mt-1">{npr(pendingPartialCredit?.amount ?? 0)}</p>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1">
                The payment was successful. Assign the remaining balance to a customer's credit account.
              </p>
              <div className="flex items-center gap-2 mt-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>Rs. {pendingPartialCredit?.amount ?? 0} remaining will be billed to credit.</span>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">
                Search Customer <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={customerSearch}
                onChange={e => { setCustomerSearch(e.target.value); setSelectedCustomer(null); }}
                placeholder="Type name or phone..."
                className="w-full h-11 rounded-xl border border-border bg-transparent px-3 text-sm outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
                autoFocus
              />
              {customersLoading && (
                <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading customers...
                </div>
              )}
              {!customersLoading && customerSearch && filteredCustomers.length > 0 && !selectedCustomer && (
                <div className="mt-1.5 border border-border rounded-xl bg-card overflow-hidden max-h-40 overflow-y-auto shadow-sm">
                  {filteredCustomers.map(c => (
                    <button
                      key={c.id}
                      onClick={() => { setSelectedCustomer(c); setCustomerSearch(c.name); }}
                      className="w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-muted transition-colors text-left border-b border-border last:border-0"
                    >
                      <span className="font-medium">{c.name}</span>
                      {c.phone && <span className="text-xs text-muted-foreground">{c.phone}</span>}
                    </button>
                  ))}
                </div>
              )}
              {!customersLoading && customerSearch && filteredCustomers.length === 0 && !selectedCustomer && (
                <div>
                  <p className="text-xs text-muted-foreground mt-1">No customers found.</p>
                  <button
                    onClick={() => setSelectedCustomer({ id: customerSearch, name: customerSearch })}
                    className="mt-1.5 w-full rounded-lg border-2 border-dashed border-amber-300 dark:border-amber-700 px-3 py-2 text-sm font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-colors"
                  >
                    + Use &ldquo;{customerSearch}&rdquo; as new customer
                  </button>
                </div>
              )}
              {selectedCustomer && (
                <div className="mt-1.5 flex items-center justify-between rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/30 px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-500" />
                    <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">{selectedCustomer.name}</span>
                  </div>
                  <button
                    onClick={() => { setSelectedCustomer(null); setCustomerSearch(''); }}
                    className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                  >
                    Change
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="p-4 border-t space-y-2">
            <div className="rounded-xl bg-muted/30 p-3 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Paid Amount</span><span className="font-semibold">{npr(completedInvoice?.paidAmount ?? 0)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Remaining (Credit)</span><span className="font-semibold text-amber-600">{npr(pendingPartialCredit?.amount ?? 0)}</span></div>
              <hr className="border-border" />
              <div className="flex justify-between font-bold"><span>Total Settled</span><span>{npr((completedInvoice?.paidAmount ?? 0) + (pendingPartialCredit?.amount ?? 0))}</span></div>
            </div>
            <button
              onClick={handleAssignCredit}
              disabled={!selectedCustomer}
              className="w-full h-14 rounded-xl bg-emerald-500 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-emerald-600 transition-all active:scale-[0.99] shadow-sm"
            >
              <Check className="h-5 w-5" /> Assign & Complete
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── View: Reception QR ───
  if (view === 'reception_qr') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="w-full max-w-md rounded-xl border bg-background shadow-lg max-h-[90vh] overflow-y-auto">
          <ReceptionQRDialog
            amount={grandTotal}
            orderId={orderId}
            customerName={initialCustomerName}
            onConfirm={handleReceptionQRPay}
            onCancel={() => setView('review')}
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
    return <FonepayQRDialog orderId={orderId} amount={grandTotal} onSuccess={handleFonepaySuccess} onCancel={() => setView('review')} customerName={initialCustomerName} invoiceNumber={invNum} />;
  }

  if (view === 'partial_fonepay' && pendingPartialFonepay !== null) {
    const year = new Date().getFullYear();
    const invNum = `INV-${year}-${String(Date.now()).slice(-6)}`;
    if (!fonepayInvoiceNumberRef.current) fonepayInvoiceNumberRef.current = invNum;
    return <FonepayQRDialog orderId={orderId} amount={pendingPartialFonepay} onSuccess={handlePartialFonepaySuccess} onCancel={() => { setPendingPartialFonepay(null); setView('partial'); }} customerName={initialCustomerName} invoiceNumber={invNum} />;
  }

  // ─── View: Split ───
  if (view === 'split') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="w-full max-w-md rounded-xl border bg-background shadow-lg max-h-[90vh] overflow-y-auto">
          <SplitPaymentDialog orderId={orderId} items={items} customerName={initialCustomerName} onBack={() => setView('review')} onPay={handleSplitPay} submitting={submittingPayment} />
        </div>
      </div>
    );
  }

  if (view === 'split_fonepay' && pendingSplitFonepay) {
    const year = new Date().getFullYear();
    const invNum = `INV-${year}-${String(Date.now()).slice(-6)}`;
    if (!fonepayInvoiceNumberRef.current) fonepayInvoiceNumberRef.current = invNum;
    return <FonepayQRDialog orderId={orderId} amount={pendingSplitFonepay.amount} onSuccess={handleSplitFonepaySuccess} onCancel={() => { setPendingSplitFonepay(null); setView('split'); }} customerName={initialCustomerName} invoiceNumber={invNum} />;
  }

  if (view === 'split_credit' && pendingSplitCredit) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="w-full max-w-md rounded-xl border bg-background shadow-lg max-h-[90vh] overflow-y-auto">
          <CreditAccountPayment grandTotal={pendingSplitCredit.amount} onBack={() => { setPendingSplitCredit(null); setView('split'); }} onPay={handleSplitCreditPay} submitting={submittingPayment} />
        </div>
      </div>
    );
  }

  return null;
}
