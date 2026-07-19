import { useState, useMemo, useCallback } from 'react';
import { ArrowLeft, Check, Users } from 'lucide-react';

const npr = (amount: number) =>
  `Rs. ${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`;

interface OrderItem { id: string; item_name: string; quantity: number; unit_price: number; payment_status: string; }

interface SplitPaymentDialogProps {
  items: OrderItem[];
  onBack: () => void;
  onContinue: (params: { item_ids: string[]; amount: number }) => void;
}

interface PayableUnit {
  unitId: string;
  orderItemId: string;
  itemName: string;
  unitPrice: number;
  isPaid: boolean;
}

export function SplitPaymentDialog({ items, onBack, onContinue }: SplitPaymentDialogProps) {
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<string>>(new Set());

  const { paidUnits, unpaidUnits } = useMemo(() => {
    const paid: PayableUnit[] = [];
    const unpaid: PayableUnit[] = [];
    for (const item of items) {
      for (let i = 0; i < item.quantity; i++) {
        const unit: PayableUnit = {
          unitId: `${item.id}:${i}`,
          orderItemId: item.id,
          itemName: item.item_name,
          unitPrice: Number(item.unit_price),
          isPaid: item.payment_status === 'paid',
        };
        if (unit.isPaid) paid.push(unit); else unpaid.push(unit);
      }
    }
    return { paidUnits: paid, unpaidUnits: unpaid };
  }, [items]);

  const unpaidItemsMap = useMemo(() => {
    const map = new Map<string, { itemName: string; unitPrice: number; unitIds: string[] }>();
    for (const unit of unpaidUnits) {
      if (!map.has(unit.orderItemId))
        map.set(unit.orderItemId, { itemName: unit.itemName, unitPrice: unit.unitPrice, unitIds: [] });
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

  const selectedAmount = useMemo(() => {
    let total = 0;
    for (const unitId of selectedUnitIds) {
      const unit = unpaidUnits.find(u => u.unitId === unitId);
      if (unit) total += unit.unitPrice;
    }
    return total;
  }, [selectedUnitIds, unpaidUnits]);

  const hasSelection = selectedUnitIds.size > 0;
  const allUnpaidSelected = unpaidUnits.length > 0 && unpaidUnits.every(u => selectedUnitIds.has(u.unitId));
  const remainingUnpaidCount = unpaidUnits.filter(u => !selectedUnitIds.has(u.unitId)).length;

  const selectItemGroup = useCallback((itemId: string) => {
    const group = unpaidItemsMap.get(itemId);
    if (!group) return;
    const allSelected = group.unitIds.every(id => selectedUnitIds.has(id));
    setSelectedUnitIds(prev => {
      const next = new Set(prev);
      if (allSelected) { for (const id of group.unitIds) next.delete(id); }
      else { for (const id of group.unitIds) next.add(id); }
      return next;
    });
  }, [unpaidItemsMap, selectedUnitIds]);

  const selectAllUnpaid = useCallback(
    () => setSelectedUnitIds(new Set(unpaidUnits.map(u => u.unitId))),
    [unpaidUnits],
  );
  const deselectAll = useCallback(() => setSelectedUnitIds(new Set()), []);

  const handleContinue = () => {
    if (!hasSelection) return;
    // Only include FULLY selected items (all units of that item selected)
    const selectedItemIdsSet = new Set<string>();
    for (const [itemId, state] of itemSelectionState) {
      if (state === 'full') selectedItemIdsSet.add(itemId);
    }
    if (selectedItemIdsSet.size === 0) return;
    onContinue({ item_ids: Array.from(selectedItemIdsSet), amount: selectedAmount });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={onBack}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h2 className="text-lg font-semibold">Split Payment</h2>
          <span className="text-xs bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 px-2 py-0.5 rounded-full font-medium">
            Select Items
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="flex items-center gap-2 rounded-lg bg-teal-50 dark:bg-teal-950/20 px-3 py-2 text-xs text-teal-700 dark:text-teal-300">
          <Users className="h-4 w-4 shrink-0" />
          <span>Select the items this customer will pay for. Tap an item to toggle it.</span>
        </div>

        {paidUnits.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
              <Check className="h-3 w-3 text-emerald-500" /> Already Paid ({paidUnits.length})
            </p>
            <div className="space-y-1">
              {paidUnits.map(unit => (
                <div key={unit.unitId}
                  className="flex items-center gap-3 px-3 py-2 rounded-xl bg-muted/30 border border-muted opacity-60">
                  <div className="w-7 h-7 rounded-md bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                    <Check className="h-4 w-4 text-emerald-600" />
                  </div>
                  <span className="text-xs text-muted-foreground line-through">{unit.itemName}</span>
                  <span className="text-[10px] font-medium text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded shrink-0 ml-auto">Paid</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Unpaid Items ({unpaidUnits.length} unit{unpaidUnits.length !== 1 ? 's' : ''})
            </p>
            <div className="flex gap-2">
              {selectedUnitIds.size > 0 && (
                <button onClick={deselectAll} className="text-xs text-muted-foreground hover:text-foreground underline">Clear</button>
              )}
              {!allUnpaidSelected && unpaidUnits.length > 0 && (
                <button onClick={selectAllUnpaid} className="text-xs text-primary hover:underline">Select All</button>
              )}
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
                return (
                  <button key={itemId} onClick={() => selectItemGroup(itemId)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left
                      ${isSelected
                        ? 'border-teal-400 bg-teal-50/80 dark:bg-teal-950/20 shadow-sm'
                        : isPartial
                          ? 'border-amber-300 bg-amber-50/50 dark:bg-amber-950/10'
                          : 'border-border hover:border-teal-300 hover:bg-teal-50/30 dark:hover:bg-teal-950/10'
                      }`}>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all
                      ${isSelected
                        ? 'bg-teal-500 text-white shadow-sm'
                        : isPartial
                          ? 'bg-amber-200 dark:bg-amber-800 text-amber-700 dark:text-amber-300'
                          : 'bg-muted text-muted-foreground'
                      }`}>
                      {isSelected
                        ? <Check className="h-4 w-4" />
                        : <span className="text-xs font-bold">{group.unitIds.length > 1 ? `${group.unitIds.length}x` : '1'}</span>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${isSelected ? 'text-teal-800 dark:text-teal-200' : ''}`}>
                        {group.itemName}
                      </p>
                      {group.unitIds.length > 1 && (
                        <p className="text-[10px] text-muted-foreground">{group.unitIds.length} units @ {npr(group.unitPrice)} each</p>
                      )}
                    </div>
                    <span className="text-sm font-semibold tabular-nums shrink-0">
                      {npr(group.unitPrice * group.unitIds.length)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {hasSelection && (
          <div className="rounded-xl border-2 border-teal-200 dark:border-teal-800 bg-teal-50/80 dark:bg-teal-950/20 p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-muted-foreground">Selected Units</span>
              <span className="text-sm font-medium">{selectedUnitIds.size} of {unpaidUnits.length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-base font-bold">Amount Due</span>
              <span className="text-2xl font-extrabold text-teal-700 dark:text-teal-300 tabular-nums">{npr(selectedAmount)}</span>
            </div>
          </div>
        )}

        {!hasSelection && unpaidUnits.length > 0 && (
          <div className="rounded-xl border-2 border-dashed border-muted-foreground/20 p-6 text-center">
            <p className="text-sm font-medium text-muted-foreground">Select items above to continue</p>
          </div>
        )}

        {!allUnpaidSelected && remainingUnpaidCount > 0 && (
          <p className="text-center text-xs text-muted-foreground">
            {remainingUnpaidCount} item{remainingUnpaidCount !== 1 ? 's' : ''} remaining — can be paid separately
          </p>
        )}
      </div>

      <div className="p-4 border-t shrink-0">
        <button onClick={handleContinue} disabled={!hasSelection}
          className="w-full h-14 rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 text-white font-bold flex items-center justify-center gap-2
            disabled:opacity-50 disabled:cursor-not-allowed hover:from-teal-400 hover:to-teal-500 transition-all active:scale-[0.99] shadow-sm">
          <Check className="h-5 w-5" />
          {hasSelection ? `Continue to Payment — ${npr(selectedAmount)}` : 'Select Items to Pay'}
        </button>
      </div>
    </div>
  );
}
