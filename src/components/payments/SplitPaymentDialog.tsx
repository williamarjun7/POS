import { useState, useMemo, useCallback } from 'react';
import { ArrowLeft, Check, Banknote, QrCode, CreditCard, Smartphone, Loader2, Users, Percent, DollarSign } from 'lucide-react';
import { getPaymentMethodLabel } from '@/lib/payment-methods';

const npr = (amount: number) =>
  `Rs. ${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`;

const CASH_QUICK_AMOUNTS = [100, 200, 500, 1000, 2000, 5000];

interface OrderItem { id: string; item_name: string; quantity: number; unit_price: number; payment_status: string; }

interface SplitPaymentDialogProps {
  orderId: string;
  items: OrderItem[];
  customerName?: string;
  onBack: () => void;
  onPay: (params: { item_ids: string[]; amount: number; method: string; cash_received?: number; unit_ids?: string[] }) => void;
  submitting: boolean;
}

interface PayableUnit {
  unitId: string;
  orderItemId: string;
  itemName: string;
  unitPrice: number;
  isPaid: boolean;
}

interface ItemDiscount {
  type: 'percentage' | 'fixed';
  value: number;
}

const PAYMENT_METHODS = [
  { value: 'cash' as const, label: getPaymentMethodLabel('cash'), desc: 'Pay with cash', icon: Banknote, color: 'emerald' },
  { value: 'reception_qr' as const, label: getPaymentMethodLabel('reception_qr'), desc: 'Physical QR', icon: Smartphone, color: 'sky' },
  { value: 'fonepay' as const, label: getPaymentMethodLabel('fonepay'), desc: 'Mobile banking', icon: QrCode, color: 'blue' },
  { value: 'credit_account' as const, label: 'Credit Account', desc: 'Customer account', icon: CreditCard, color: 'purple' },
];

const COLOR_MAPS: Record<string, { border: string; bg: string; text: string; iconBg: string; iconText: string }> = {
  emerald: { border: 'border-emerald-400', bg: 'bg-emerald-50/50 dark:bg-emerald-950/10', text: 'text-emerald-700 dark:text-emerald-300', iconBg: 'bg-emerald-100 dark:bg-emerald-900/30', iconText: 'text-emerald-600' },
  sky: { border: 'border-sky-400', bg: 'bg-sky-50/50 dark:bg-sky-950/10', text: 'text-sky-700 dark:text-sky-300', iconBg: 'bg-sky-100 dark:bg-sky-900/30', iconText: 'text-sky-600' },
  blue: { border: 'border-blue-400', bg: 'bg-blue-50/50 dark:bg-blue-950/10', text: 'text-blue-700 dark:text-blue-300', iconBg: 'bg-blue-100 dark:bg-blue-900/30', iconText: 'text-blue-600' },
  purple: { border: 'border-purple-400', bg: 'bg-purple-50/50 dark:bg-purple-950/10', text: 'text-purple-700 dark:text-purple-300', iconBg: 'bg-purple-100 dark:bg-purple-900/30', iconText: 'text-purple-600' },
};

// ─── Discount helper ────────────────────────────────────────

function applyDiscount(unitPrice: number, discount: ItemDiscount | undefined): number {
  if (!discount || discount.value <= 0) return unitPrice;
  if (discount.type === 'percentage') return unitPrice * (1 - Math.min(discount.value, 100) / 100);
  return Math.max(0, unitPrice - discount.value);
}

export function SplitPaymentDialog({ orderId: _orderId, items, customerName: _customerName, onBack, onPay, submitting }: SplitPaymentDialogProps) {
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<string>>(new Set());
  const [method, setMethod] = useState<string>('');
  const [cashReceived, setCashReceived] = useState('');
  const [itemDiscounts, setItemDiscounts] = useState<Record<string, ItemDiscount>>({});
  const [discountEditor, setDiscountEditor] = useState<string | null>(null);

  const { paidUnits, unpaidUnits } = useMemo(() => {
    const paid: PayableUnit[] = [];
    const unpaid: PayableUnit[] = [];
    for (const item of items) {
      for (let i = 0; i < item.quantity; i++) {
        const unit: PayableUnit = { unitId: `${item.id}:${i}`, orderItemId: item.id, itemName: item.item_name, unitPrice: Number(item.unit_price), isPaid: item.payment_status === 'paid' };
        if (unit.isPaid) paid.push(unit); else unpaid.push(unit);
      }
    }
    return { paidUnits: paid, unpaidUnits: unpaid };
  }, [items]);

  const unpaidItemsMap = useMemo(() => {
    const map = new Map<string, { itemName: string; unitPrice: number; unitIds: string[] }>();
    for (const unit of unpaidUnits) {
      if (!map.has(unit.orderItemId)) map.set(unit.orderItemId, { itemName: unit.itemName, unitPrice: unit.unitPrice, unitIds: [] });
      map.get(unit.orderItemId)!.unitIds.push(unit.unitId);
    }
    return map;
  }, [unpaidUnits]);

  const itemSelectionState = useMemo(() => {
    const state = new Map<string, 'none' | 'partial' | 'full'>();
    for (const [itemId, group] of unpaidItemsMap) {
      const selectedCount = group.unitIds.filter(id => selectedUnitIds.has(id)).length;
      if (selectedCount === 0) state.set(itemId, 'none');
      else if (selectedCount === group.unitIds.length) state.set(itemId, 'full');
      else state.set(itemId, 'partial');
    }
    return state;
  }, [unpaidItemsMap, selectedUnitIds]);

  // ─── Discounted amount calculation ────────────────────────
  const selectedAmount = useMemo(() => {
    let total = 0;
    for (const unitId of selectedUnitIds) {
      const unit = unpaidUnits.find(u => u.unitId === unitId);
      if (unit) total += applyDiscount(unit.unitPrice, itemDiscounts[unit.orderItemId]);
    }
    return total;
  }, [selectedUnitIds, unpaidUnits, itemDiscounts]);

  const selectedOriginalAmount = useMemo(() => {
    let total = 0;
    for (const unitId of selectedUnitIds) {
      const unit = unpaidUnits.find(u => u.unitId === unitId);
      if (unit) total += unit.unitPrice;
    }
    return total;
  }, [selectedUnitIds, unpaidUnits]);

  const totalDiscount = selectedOriginalAmount - selectedAmount;

  const hasItemDiscounts = useMemo(() => {
    for (const itemId of Object.keys(itemDiscounts)) {
      const group = unpaidItemsMap.get(itemId);
      if (group && group.unitIds.some(id => selectedUnitIds.has(id))) return true;
    }
    return false;
  }, [itemDiscounts, unpaidItemsMap, selectedUnitIds]);

  // ─── Per-item discount (applied to all units of that item) ─
  const setItemDiscount = (itemId: string, discount: ItemDiscount) => {
    setItemDiscounts(prev => ({ ...prev, [itemId]: discount }));
  };

  const clearItemDiscount = (itemId: string) => {
    setItemDiscounts(prev => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  };

  // ─── ───────────────────────────────────────────────────────

  const cashReceivedNum = Number(cashReceived) || 0;
  const change = Math.max(0, cashReceivedNum - selectedAmount);
  const sufficient = cashReceivedNum >= selectedAmount;
  const hasSelection = selectedUnitIds.size > 0;
  const allUnpaidSelected = unpaidUnits.length > 0 && unpaidUnits.every(u => selectedUnitIds.has(u.unitId));
  const remainingUnpaidCount = unpaidUnits.filter(u => !selectedUnitIds.has(u.unitId)).length;

  const selectItemGroup = useCallback((itemId: string) => {
    const group = unpaidItemsMap.get(itemId);
    if (!group) return;
    const allSelected = group.unitIds.every(id => selectedUnitIds.has(id));
    setSelectedUnitIds(prev => {
      const next = new Set(prev);
      if (allSelected) { for (const id of group.unitIds) next.delete(id); } else { for (const id of group.unitIds) next.add(id); }
      return next;
    });
  }, [unpaidItemsMap, selectedUnitIds]);

  const selectAllUnpaid = useCallback(() => setSelectedUnitIds(new Set(unpaidUnits.map(u => u.unitId))), [unpaidUnits]);
  const deselectAll = useCallback(() => setSelectedUnitIds(new Set()), []);

  const handlePay = () => {
    if (!hasSelection || submitting) return;
    const selectedItemIdsSet = new Set<string>();
    for (const [itemId, state] of itemSelectionState) { if (state === 'full') selectedItemIdsSet.add(itemId); }
    if (selectedItemIdsSet.size === 0) return;
    onPay({ item_ids: Array.from(selectedItemIdsSet), amount: selectedAmount, method, cash_received: method === 'cash' && cashReceivedNum > 0 ? cashReceivedNum : undefined, unit_ids: Array.from(selectedUnitIds) });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-muted transition-colors"><ArrowLeft className="h-5 w-5" /></button>
          <h2 className="text-lg font-semibold">Split Payment</h2>
          <span className="text-xs bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 px-2 py-0.5 rounded-full font-medium">Select Items</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="flex items-center gap-2 rounded-lg bg-teal-50 dark:bg-teal-950/20 px-3 py-2 text-xs text-teal-700 dark:text-teal-300">
          <Users className="h-4 w-4 shrink-0" /><span>Select the units this customer will pay for. Each individual quantity is shown.</span>
        </div>

        {paidUnits.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
              <Check className="h-3 w-3 text-emerald-500" /> Already Paid ({paidUnits.length})
            </p>
            <div className="space-y-1">
              {paidUnits.map(unit => (
                <div key={unit.unitId} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-muted/30 border border-muted opacity-60">
                  <div className="w-7 h-7 rounded-md bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0"><Check className="h-4 w-4 text-emerald-600" /></div>
                  <span className="text-xs text-muted-foreground line-through">{unit.itemName}</span>
                  <span className="text-[10px] font-medium text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded shrink-0 ml-auto">Paid</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Unpaid Items ({unpaidUnits.length} unit{unpaidUnits.length !== 1 ? 's' : ''})</p>
            <div className="flex gap-2">
              {selectedUnitIds.size > 0 && <button onClick={deselectAll} className="text-xs text-muted-foreground hover:text-foreground underline">Clear</button>}
              {!allUnpaidSelected && unpaidUnits.length > 0 && <button onClick={selectAllUnpaid} className="text-xs text-primary hover:underline">Select All</button>}
            </div>
          </div>
          {unpaidUnits.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Check className="h-8 w-8 mx-auto mb-2 text-emerald-500" />
              <p className="text-sm font-medium">All items are paid</p>
              <p className="text-xs mt-1">This order has been fully settled.</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {Array.from(unpaidItemsMap.entries()).map(([itemId, group]) => {
                const selectionState = itemSelectionState.get(itemId) || 'none';
                const isSelected = selectionState === 'full';
                const isPartial = selectionState === 'partial';
                const hasSelectedUnits = group.unitIds.some(id => selectedUnitIds.has(id));
                const discount = itemDiscounts[itemId];
                return (
                  <button key={itemId} onClick={() => selectItemGroup(itemId)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${isSelected ? 'border-teal-400 bg-teal-50/80 dark:bg-teal-950/20 shadow-sm' : isPartial ? 'border-amber-300 bg-amber-50/50 dark:bg-amber-950/10' : 'border-border hover:border-teal-300 hover:bg-teal-50/30 dark:hover:bg-teal-950/10'}`}>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all ${isSelected ? 'bg-teal-500 text-white shadow-sm' : isPartial ? 'bg-amber-200 dark:bg-amber-800 text-amber-700 dark:text-amber-300' : 'bg-muted text-muted-foreground'}`}>
                      {isSelected ? <Check className="h-4 w-4" /> : <span className="text-xs font-bold">{group.unitIds.length > 1 ? `${group.unitIds.length}x` : '1'}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${isSelected ? 'text-teal-800 dark:text-teal-200' : ''}`}>{group.itemName}</p>
                      {group.unitIds.length > 1 && (
                        <p className="text-[10px] text-muted-foreground">{group.unitIds.length} units @ {npr(group.unitPrice)} each</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 relative">
                      {hasSelectedUnits && (
                        <span onClick={(e) => { e.stopPropagation(); setDiscountEditor(discountEditor === itemId ? null : itemId); }}
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${discount ? 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30' : 'text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted'}`}
                          title={discount ? `Discount: ${discount.type === 'percentage' ? `${discount.value}%` : npr(discount.value)}` : 'Add discount'}>
                          <Percent className="h-3.5 w-3.5" />
                        </span>
                      )}
                      {/* Discount popover — inline per-item */}
                      {discountEditor === itemId && (
                        <div className="absolute right-0 top-full mt-2 z-50 w-64 rounded-xl border bg-background shadow-xl p-4 space-y-3" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Item Discount</p>
                            <button onClick={() => { clearItemDiscount(itemId); setDiscountEditor(null); }} className="text-[10px] text-muted-foreground hover:text-destructive">Clear</button>
                          </div>
                          <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5 w-fit">
                            <button onClick={() => setItemDiscount(itemId, { ...discount || { type: 'percentage', value: 0 }, type: 'percentage' })}
                              className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded font-medium transition-colors ${discount?.type === 'percentage' || !discount ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                              <Percent className="h-3 w-3" /> %
                            </button>
                            <button onClick={() => setItemDiscount(itemId, { ...discount || { type: 'percentage', value: 0 }, type: 'fixed' })}
                              className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded font-medium transition-colors ${discount?.type === 'fixed' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                              <DollarSign className="h-3 w-3" /> Amt
                            </button>
                          </div>
                          <input type="number" min="0" max={(discount?.type || 'percentage') === 'percentage' ? 100 : 99999} value={discount?.value || ''}
                            onChange={e => setItemDiscount(itemId, { type: discount?.type || 'percentage', value: Math.max(0, Number(e.target.value)) })}
                            onWheel={e => (e.target as HTMLInputElement).blur()}
                            placeholder={discount?.type === 'fixed' ? 'Rs. 0' : '0%'}
                            className="w-full h-10 rounded-lg border border-border bg-transparent px-3 text-sm outline-none focus:ring-2 focus:ring-teal-500/30" autoFocus
                          />
                          <p className="text-[10px] text-muted-foreground">
                            Applies to all selected units of <strong>{unpaidItemsMap.get(itemId)?.itemName}</strong>
                          </p>
                        </div>
                      )}
                      <span className="text-sm font-semibold tabular-nums">
                        {discount && hasSelectedUnits ? (
                          <span className="flex items-center gap-1">
                            <span className="line-through text-muted-foreground/40 text-xs">{npr(group.unitPrice * group.unitIds.length)}</span>
                            <span className="text-teal-700 dark:text-teal-300">{npr(applyDiscount(group.unitPrice, discount) * group.unitIds.length)}</span>
                          </span>
                        ) : npr(group.unitPrice * group.unitIds.length)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {hasSelection && (
          <div className={`rounded-xl border-2 p-4 ${hasItemDiscounts ? 'border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/20' : 'border-teal-200 dark:border-teal-800 bg-teal-50/80 dark:bg-teal-950/20'}`}>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-muted-foreground">Selected Units</span>
              <span className="text-sm font-medium">{selectedUnitIds.size} of {unpaidUnits.length}</span>
            </div>
            {hasItemDiscounts && totalDiscount > 0 && (
              <>
                <div className="flex justify-between items-center text-xs text-muted-foreground">
                  <span>Original Total</span>
                  <span className="tabular-nums line-through">{npr(selectedOriginalAmount)}</span>
                </div>
                <div className="flex justify-between items-center text-xs text-destructive">
                  <span>Item Discounts</span>
                  <span className="tabular-nums">-{npr(totalDiscount)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between items-center">
              <span className="text-base font-bold">Amount Due</span>
              <span className={`text-2xl font-extrabold tabular-nums ${hasItemDiscounts ? 'text-amber-700 dark:text-amber-300' : 'text-teal-700 dark:text-teal-300'}`}>{npr(selectedAmount)}</span>
            </div>
          </div>
        )}

        {hasSelection && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Payment Method</p>
            <div className="grid grid-cols-2 gap-3">
              {PAYMENT_METHODS.map(m => {
                const Icon = m.icon;
                const isActive = method === m.value;
                const c = COLOR_MAPS[m.color];
                return (
                  <button key={m.value} onClick={() => setMethod(m.value)}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all text-center group ${isActive ? `${c.border} ${c.bg}` : 'border-border hover:border-teal-300 hover:bg-teal-50/30 dark:hover:bg-teal-950/10'}`}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform ${isActive ? c.iconBg : 'bg-muted'}`}>
                      <Icon className={`h-5 w-5 ${isActive ? c.iconText : 'text-muted-foreground'}`} />
                    </div>
                    <div className="min-w-0">
                      <p className={`text-xs font-semibold ${isActive ? c.text : ''}`}>{m.label}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{m.desc}</p>
                    </div>
                    <span className={`text-sm transition-colors ${isActive ? c.text : 'text-muted-foreground/30'}`}>
                      {isActive ? '✓ Selected' : '→'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {hasSelection && !method && (
          <div className="rounded-xl border-2 border-dashed border-muted-foreground/20 p-6 text-center">
            <p className="text-sm font-medium text-muted-foreground">Select a payment method above</p>
          </div>
        )}

        {hasSelection && method === 'cash' && (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cash Received</p>
            <div className="flex flex-wrap gap-2">
              {CASH_QUICK_AMOUNTS.map(amt => (
                <button key={amt} onClick={() => setCashReceived(String(amt))}
                  className={`px-4 py-2 rounded-xl border text-sm font-semibold transition-all ${Number(cashReceived) === amt ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700' : 'border-border hover:border-emerald-300'}`}>
                  {npr(amt)}
                </button>
              ))}
              <button onClick={() => setCashReceived(String(Math.ceil(selectedAmount)))}
                className={`px-4 py-2 rounded-xl border text-sm font-semibold transition-all ${Number(cashReceived) === Math.ceil(selectedAmount) ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700' : 'border-border hover:border-emerald-300'}`}>
                Exact &mdash; {npr(selectedAmount)}
              </button>
            </div>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">Rs.</span>
              <input type="number" min="0" step="1" value={cashReceived} onChange={e => setCashReceived(e.target.value)} placeholder="0"
                onWheel={e => (e.target as HTMLInputElement).blur()}
                className="w-full h-12 text-lg font-bold rounded-xl border border-border bg-transparent pl-10 pr-4 outline-none text-center focus:ring-2 focus:ring-emerald-500/30" />
            </div>
            {cashReceivedNum >= selectedAmount && (
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 p-3 text-center">
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Change due: {npr(change)}</p>
              </div>
            )}
          </div>
        )}

        {hasSelection && method === 'reception_qr' && (
          <div className="rounded-xl border-2 border-sky-200 dark:border-sky-800 bg-sky-50/80 dark:bg-sky-950/20 p-4 text-center">
            <Smartphone className="h-10 w-10 mx-auto mb-2 text-sky-500" />
            <p className="text-sm font-semibold text-sky-700 dark:text-sky-300">Reception QR</p>
            <p className="text-xs text-muted-foreground mt-1">Process payment via Reception QR. Tap Pay to confirm.</p>
          </div>
        )}

        {hasSelection && method === 'fonepay' && (
          <div className="rounded-xl border-2 border-blue-200 dark:border-blue-800 bg-blue-50/80 dark:bg-blue-950/20 p-4 text-center">
            <QrCode className="h-10 w-10 mx-auto mb-2 text-blue-500" />
            <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">FonePay QR</p>
            <p className="text-xs text-muted-foreground mt-1">Tap Pay to generate the FonePay QR code for the customer to scan.</p>
          </div>
        )}

        {hasSelection && method === 'credit_account' && (
          <div className="rounded-xl border-2 border-purple-200 dark:border-purple-800 bg-purple-50/80 dark:bg-purple-950/20 p-4 text-center">
            <CreditCard className="h-10 w-10 mx-auto mb-2 text-purple-500" />
            <p className="text-sm font-semibold text-purple-700 dark:text-purple-300">Credit Account</p>
            <p className="text-xs text-muted-foreground mt-1">Tap Pay to select a customer and charge their account.</p>
          </div>
        )}
      </div>

      <div className="p-4 border-t shrink-0 space-y-2">
        <button onClick={handlePay} disabled={!hasSelection || !method || submitting || (method === 'cash' && cashReceivedNum > 0 && !sufficient)}
          className="w-full h-14 rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:from-teal-400 hover:to-teal-500 transition-all active:scale-[0.99] shadow-sm">
          {submitting ? <><Loader2 className="h-5 w-5 animate-spin" /> Processing...</> : !hasSelection ? <><Users className="h-5 w-5" /> Select Items to Pay</> : !method ? <><Banknote className="h-5 w-5" /> Select a Payment Method</> : <><Check className="h-5 w-5" /> Receive {npr(selectedAmount)} via {PAYMENT_METHODS.find(m => m.value === method)?.label || method}</>}
        </button>
        {hasSelection && hasItemDiscounts && totalDiscount > 0 && (
          <p className="text-center text-xs text-amber-600">Discount applied: -{npr(totalDiscount)}</p>
        )}
        {hasSelection && !allUnpaidSelected && remainingUnpaidCount > 0 && (
          <p className="text-center text-xs text-amber-600 font-medium">
            {remainingUnpaidCount} item{remainingUnpaidCount !== 1 ? 's' : ''} remaining — select more or pay separately
          </p>
        )}
      </div>
    </div>
  );
}
