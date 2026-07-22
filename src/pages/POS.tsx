import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Coffee, Egg, UtensilsCrossed, Wine, Search, X, Plus, Minus,
  User as UserIcon, Table2, ChevronLeft, ChevronRight, ShoppingCart,
  Grid3X3, ArrowLeft, Receipt, Trash2, Keyboard, Zap, Lock, ChevronDown, BedDouble,
  MoreVertical, Ban,
} from 'lucide-react';
import { PageTransition } from '@/components/ui/PageTransition';
import { PosPaymentDialog, type PaymentResult } from '@/components/payments';
import { showSuccess, showError } from '@/components/ui/toast';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { RequirePermission } from '@/lib/core/PermissionGuards';
import { recordCreditCharge, updateCustomerAfterInvoice } from '@/lib/services/customer-ledger';
import { useMenuCategories, useMenuItems } from '@/lib/api/menu.hooks';
import { useDashboardTables, useRooms, useTableBatches } from '@/lib/hooks';

import { useSearchParams, useNavigate } from 'react-router-dom';
import { useRateLimit } from '@/lib/hooks/useRateLimit'
import { toPaymentMethodKey, getPaymentMethodLabel } from '@/lib/payment-methods';
import { useAuth } from '@/lib/core/auth-context';
import { logActivitySafe } from '@/lib/services/activity-log-service';
import { insforge } from '@/lib/services/auth-service';
import { insertInvoiceItems } from '@/lib/services/invoice-items-service';
import { deductStockForSoldItems } from '@/lib/services/inventory-service';
import { processPaymentWithRecovery } from '@/lib/services/unified-payment-service';
import { db } from '@/lib/db/insforge';
import { formatCurrency } from '@/lib/utils';
import { TABLE_STATUS_LABELS, TABLE_STATUS_COLORS } from '@/lib/constants';
import {
  calculateTotalWithCart,
  collectBillableItems,
  hasBillableItems,
  getBillableBatches,
  isBatchBillable,
  isItemBillable,
  billableItemsTotal,
  getVoidedSummary,
} from '@/lib/services/order-calculation-service';

import type { OrderBatch, OrderBatchItem, CartItemStatus } from '@/types';
import type { MenuItem } from '@/types';

// ─── Types ───────────────────────────────────────────────────

interface CartLine {
  menu_item_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  notes: string;
  status: 'pending' | 'voided';
}

// ─── Helpers ─────────────────────────────────────────────────

const npr = (amount: number) => formatCurrency(amount, 2);

const categoryIcons: Record<string, React.ElementType> = {
  coffee: Coffee, breakfast: Egg, lunch: UtensilsCrossed, bar: Wine,
  alcohol: Wine, beer: Wine, wine: Wine, liquor: Wine, whiskey: Wine,
  tobacco: Coffee, cigarette: Coffee, smoke: Coffee,
  hookah: Coffee, sheesha: Coffee, shisha: Coffee,
  juice: Coffee, smoothie: Coffee, shake: Coffee, soda: Coffee,
  dessert: Coffee, ice: Coffee, cake: Coffee, pastry: Coffee,
  tea: Coffee, green: Coffee, milk: Coffee,
  soup: UtensilsCrossed, salad: UtensilsCrossed, sandwich: UtensilsCrossed, pizza: UtensilsCrossed,
  noodle: UtensilsCrossed, rice: UtensilsCrossed, curry: UtensilsCrossed,
  starter: UtensilsCrossed, appetizer: UtensilsCrossed, snack: UtensilsCrossed,
  main: UtensilsCrossed, special: UtensilsCrossed, combo: UtensilsCrossed,
};

function getIconForCategory(name: string): React.ElementType {
  const key = Object.keys(categoryIcons).find((k) => name.toLowerCase().includes(k));
  return key ? categoryIcons[key] : UtensilsCrossed;
}

// Table status mappings — imported from shared constants
// (see src/lib/constants/index.ts)

// ─── Animation Variants ─────────────────────────────────────
// Apple-inspired smooth easing: natural deceleration curve
// Shared across the app — see also RouteTransition.tsx
const easeApple = [0.22, 1, 0.36, 1] as const

// Orchestrated entrance — wraps the entire flex container so sections
// appear in sequence: header → toolbar → sidebar → grid → cart
const pageReveal = {
  hidden: { opacity: 1 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.07, delayChildren: 0.08 },
  },
}

// Section-level entrance — each major section slides & fades in
const sectionReveal = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: easeApple },
  },
}

// Item-level stagger within grids / lists
const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 12, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, ease: easeApple } },
};

const slideIn = {
  hidden: { x: '100%', opacity: 0 },
  show: { x: 0, opacity: 1, transition: { type: 'spring' as const, stiffness: 300, damping: 30 } },
  exit: { x: '100%', opacity: 0, transition: { duration: 0.2 } },
};

const scaleIn = {
  hidden: { scale: 0.8, opacity: 0 },
  show: { scale: 1, opacity: 1, transition: { type: 'spring' as const, stiffness: 500, damping: 25 } },
};



// ─── Search highlight helper ────────────────────────────────

function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query || !text) return <>{text}</>;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let idx = lower.indexOf(q, lastIndex);
  while (idx !== -1) {
    if (idx > lastIndex) parts.push(text.slice(lastIndex, idx));
    parts.push(
      <mark key={idx} className="bg-emerald-200 dark:bg-emerald-800/60 text-emerald-900 dark:text-emerald-200 rounded-sm px-0.5">
        {text.slice(idx, idx + q.length)}
      </mark>
    );
    lastIndex = idx + q.length;
    idx = lower.indexOf(q, lastIndex);
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return <>{parts}</>;
}

// ─── Component ───────────────────────────────────────────────

export function POS() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [selectedCat, setSelectedCat] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [cartPanelOpen, setCartPanelOpen] = useState(true);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [newCartItems, setNewCartItems] = useState<CartLine[]>([]);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const [contextMenuItem, setContextMenuItem] = useState<string | null>(null);
  const [voidConfirm, setVoidConfirm] = useState<{ type: 'batch'; batchId: string; itemId: string; itemName: string } | { type: 'cart'; menuItemId: string; itemName: string } | null>(null);
  const [orderBatches, setOrderBatches] = useState<Record<string, OrderBatch[]>>({});

  const [posMode, setPosMode] = useState<'tables' | 'rooms'>('tables');
  const [entityDropdownOpen, setEntityDropdownOpen] = useState(false);
  const [entitySearchQuery, setEntitySearchQuery] = useState('');
  const entityDropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // ─── Auth ─────────────────────────────────────────
  const { user } = useAuth();

  // ─── Live data from database ──────────────────────
  const { data: categories, isLoading: categoriesLoading } = useMenuCategories();
  const { data: menuItemsData, isLoading: menuItemsLoading } = useMenuItems({ available: true });
  const { data: allTables = [] } = useDashboardTables();
  const { data: allRooms = [] } = useRooms();
  const isMenuLoading = categoriesLoading || menuItemsLoading;

  // ─── Derived state ────────────────────────────────
  const tables = useMemo(() => allTables.filter((t: any) => t.status !== 'disabled'), [allTables]);
  const rooms = useMemo(() => allRooms.filter((r: any) => r.status !== 'out_of_order'), [allRooms]);
  const categoriesList = useMemo(() => categories ?? [], [categories]);
  const catNameToId = useMemo(() => {
    const map = new Map<string, string>();
    categoriesList.forEach(c => map.set(c.name, c.id));
    return map;
  }, [categoriesList]);
  const menuItemsList = useMemo(() =>
    (menuItemsData?.data ?? []).map(item => ({
      id: item.id,
      name: item.name,
      price: item.price,
      category_id: catNameToId.get(item.category) ?? item.category,
      is_available: item.available,
      image: item.image,
    })),
    [menuItemsData, catNameToId]
  );

  // ─── Keyboard Shortcuts ────────────────────────────
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    
    const isSearchFocused = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    
    switch (e.key) {
      case '/':
        if (!isSearchFocused) {
          e.preventDefault();
          searchRef.current?.focus();
        }
        break;
      case '1': if (!isSearchFocused) setSelectedCat('all'); break;
      case 'c': if (!e.ctrlKey && !e.metaKey && !isSearchFocused) setCartPanelOpen(prev => !prev); break;
      case 'Escape':
        setEntityDropdownOpen(false);
        setEntitySearchQuery('');
        setSearchQuery('');
        setMobileCartOpen(false);
        setShowShortcuts(false);
        break;
      case '?':
        if (e.shiftKey) setShowShortcuts(prev => !prev);
        break;
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // ─── Entity dropdown click-outside ────────────────
  useEffect(() => {
    if (!entityDropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (entityDropdownRef.current && !entityDropdownRef.current.contains(e.target as Node)) {
        setEntityDropdownOpen(false);
        setEntitySearchQuery('');
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [entityDropdownOpen]);

  // ─── Read table/room from URL query params (navigated from Dashboard) ─
  useEffect(() => {
    const tableId = searchParams.get('table');
    const roomId = searchParams.get('room');
    const targetId = tableId || roomId;
    if (targetId) {
      setSelectedTableId(targetId);
      // Keep the URL params so a page refresh still restores the table selection.
      // Only clean up if there's no table/room in the URL (fresh page load with
      // leftover localStorage state or manual navigation).
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Filtered items ────────────────────────────────
  const filteredByCategory = selectedCat === 'all'
    ? menuItemsList
    : menuItemsList.filter(i => i.category_id === selectedCat);

  const q = searchQuery.toLowerCase();
  // Total available items in the selected category (without search filter) — used in count badge
  const totalAvailableCount = useMemo(
    () => filteredByCategory.filter(i => i.is_available).length,
    [filteredByCategory]
  );
  const filteredItems = q
    ? filteredByCategory.filter(i =>
        i.name.toLowerCase().includes(q) || i.price.toString().includes(q)
      )
    : filteredByCategory;

  const availableItems = filteredItems.filter(i => i.is_available).sort((a, b) => a.name.localeCompare(b.name));

  // ─── Cart computations ─────────────────────────────
  const cartItemIds = useMemo(() => new Set(newCartItems.map(c => c.menu_item_id)), [newCartItems]);
  const cartCountByItem = useMemo(() => 
    newCartItems.reduce((acc, c) => { if (c.status !== 'voided') acc[c.menu_item_id] = (acc[c.menu_item_id] ?? 0) + c.quantity; return acc; }, {} as Record<string, number>),
    [newCartItems]
  );
  const cartCountByCategory = useMemo(() =>
    categoriesList.reduce((acc, cat) => {
      const catItems = menuItemsList.filter(i => i.category_id === cat.id);
      acc[cat.id] = catItems.reduce((sum, i) => sum + (cartCountByItem[i.id] ?? 0), 0);
      return acc;
    }, {} as Record<string, number>),
    [cartCountByItem, categoriesList, menuItemsList]
  );
  const totalNewCartItems = useMemo(() => newCartItems.reduce((s, l) => l.status === 'voided' ? s : s + l.quantity, 0), [newCartItems]);
  const newSubtotal = useMemo(() => newCartItems.reduce((s, l) => l.status === 'voided' ? s : s + l.unit_price * l.quantity, 0), [newCartItems]);

  const selectedEntity = posMode === 'tables' ? tables : rooms;
  const selectedTableInfo = selectedEntity.find((t: any) => t.id === selectedTableId);
  const filteredEntities = useMemo(() => {
    const q = entitySearchQuery.toLowerCase();
    if (!q) return selectedEntity;
    return selectedEntity.filter((entity: any) => {
      const number = posMode === 'tables'
        ? `Table ${entity.table_number}`
        : `Room ${entity.room_number || entity.number || ''}`;
      const status = posMode === 'tables'
        ? (TABLE_STATUS_LABELS[entity.status] || entity.status)
        : entity.status;
      return number.toLowerCase().includes(q) || status.toLowerCase().includes(q);
    });
  }, [selectedEntity, entitySearchQuery, posMode]);

  // ─── Context menu click-outside ────────────────
  useEffect(() => {
    if (!contextMenuItem) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Check if the click is inside any visible context menu (data attribute on the dropdown wrapper)
      if (!target.closest('[data-context-menu="true"]')) {
        setContextMenuItem(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [contextMenuItem]);

  // ─── Void item from batch (already submitted to DB) ───
  async function voidBatchItem(batchId: string, itemId: string) {
    try {
      await insforge.database
        .from('order_batch_items')
        .update({
          status: 'voided',
          voided_at: new Date().toISOString(),
          voided_by: user?.id ?? null,
        })
        .eq('id', itemId);

      // Update local state — mark item as voided AND recalculate batch subtotal
      // Uses centralized billableItemsTotal for single source of truth
      setOrderBatches(prev => {
        const batches = prev[selectedTableId];
        if (!batches) return prev;
        const updatedBatches = batches.map(batch => {
          if (batch.id !== batchId) return batch
          const updatedItems = batch.items.map(item =>
            item.id === itemId
              ? { ...item, status: 'voided' as CartItemStatus }
              : item
          )
          // Use centralized calculation service
          const newSubtotal = billableItemsTotal(updatedItems)
          return { ...batch, items: updatedItems, subtotal: newSubtotal }
        });
        return { ...prev, [selectedTableId]: updatedBatches };
      });

      logActivitySafe({
        activityType: 'order_created',
        entityId: batchId,
        entityLabel: `Item voided`,
        status: 'completed',
        details: `Voided item ${itemId.slice(0, 8)} in batch ${batchId.slice(0, 8)}`,
      });

      // Invalidate related caches — use wildcard prefix to invalidate
      // all dashboard-* and finance-related keys in one call each
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      queryClient.invalidateQueries({ queryKey: ['finance'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });

      showSuccess('Item voided successfully');
    } catch (err) {
      showError('Failed to void item');
    }
  }

  // ─── Void item from cart (not yet submitted to DB) ───
  function voidCartItem(menuItemId: string) {
    setNewCartItems(prev => prev.map(l =>
      l.menu_item_id === menuItemId ? { ...l, status: 'voided' as const } : l
    ));
    logActivitySafe({
      activityType: 'order_created',
      entityId: menuItemId,
      entityLabel: `Cart item voided`,
      status: 'completed',
      details: `Voided cart item ${menuItemId.slice(0, 8)}`,
    });
    showSuccess('Item voided');
  }

  // ─── Cart functions ────────────────────────────────
  function addToCart(item: MenuItem) {
    setCartPanelOpen(true);
    setLastAdded(item.id);
    setTimeout(() => setLastAdded(null), 600);
    setNewCartItems(prev => {
      const existing = prev.find(l => l.menu_item_id === item.id);
      if (existing) return prev.map(l => l.menu_item_id === item.id ? { ...l, quantity: l.quantity + 1 } : l);
      return [...prev, { menu_item_id: item.id, name: item.name, quantity: 1, unit_price: item.price, notes: '', status: 'pending' as const }];
    });
  }

  function removeItem(menuItemId: string) {
    setNewCartItems(prev => prev.filter(l => l.menu_item_id !== menuItemId))
  }

  function clearCart() {
    setNewCartItems([]);
  }

  function updateQty(menuItemId: string, delta: number) {
    setNewCartItems(prev =>
      prev.map(l => {
        if (l.menu_item_id !== menuItemId) return l
        return { ...l, quantity: Math.max(0, l.quantity + delta) }
      })
        .filter(l => l.quantity > 0)
    );
  }

  function updateNotes(menuItemId: string, notes: string) {
    setNewCartItems(prev => prev.map(l => l.menu_item_id === menuItemId ? { ...l, notes } : l));
  }

  // ─── Session state persistence (sessionStorage) ────
  // Only persists business-critical state: the last-used table and customer name.
  // ⚠️ Temporary UI state (cart items, menu selections, search/filter, etc.)
  //    is NEVER persisted. The cart ALWAYS starts empty.
  //    Only after an order is placed does the database track the session.
  // sessionStorage is scoped per tab, so concurrent POS sessions don't interfere.
  const CART_STORAGE_KEY = 'pos_cart_state';

  // Restore session state on mount
  // ⚠️ IMPORTANT: URL params (Dashboard navigation) take precedence.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(CART_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // NEVER restore newCartItems — cart is always temporary UI state.
        // Only active orders in the database (order_batches) are restored.
        // URL params always win — they represent an explicit user action
        // (e.g., navigating from Dashboard).
        const hasUrlTable = !!searchParams.get('table') || !!searchParams.get('room');
        if (!hasUrlTable && parsed.selectedTableId) {
          setSelectedTableId(parsed.selectedTableId);
        }
        if (parsed.customerName) {
          setCustomerName(parsed.customerName);
        }
      }
    } catch { /* ignore corrupt sessionStorage */ }
  }, []);

  // Save session state on changes (debounced 500ms)
  const cartSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (cartSaveTimerRef.current) clearTimeout(cartSaveTimerRef.current);
    cartSaveTimerRef.current = setTimeout(() => {
      try {
        sessionStorage.setItem(CART_STORAGE_KEY, JSON.stringify({
          // newCartItems intentionally excluded — temporary UI state
          selectedTableId,
          customerName,
        }));
      } catch { /* sessionStorage full or unavailable */ }
    }, 500);
    return () => {
      if (cartSaveTimerRef.current) clearTimeout(cartSaveTimerRef.current);
    };
  }, [selectedTableId, customerName]); // newCartItems removed — it's temporary UI

  // ─── Load batches from DB when table is selected ─
  // Always fetch batches whenever a table/room is selected — the hook handles
  // null internally.  We no longer gate on selectedTableInfo?.status to avoid
  // a race where useDashboardTables() hasn't loaded yet on first mount.
  const { data: fetchedBatches } = useTableBatches(selectedTableId || null);

  // Track initial mount so we don't unnecessarily clear on first load
  const isFirstTableSelection = useRef(true);

  // Clear local batches when the user explicitly switches to a different table
  // (but NOT on the very first selection from URL params / localStorage restore).
  // The !selectedTableId guard prevents the empty-string mount from consuming
  // the one-time pass — only a real non-empty table ID can trigger the clear.
  useEffect(() => {
    if (!selectedTableId) return; // No table selected yet — nothing to clear
    if (isFirstTableSelection.current) {
      isFirstTableSelection.current = false;
      return; // First real selection — don't clear
    }
    // User switched to a different table
    setOrderBatches({});
    setNewCartItems([]);
  }, [selectedTableId]);

  // Populate local state from DB when batches finish loading.
  // Also restore the customer name from the batch if it was cleared
  // by handlePlaceOrder / handlePaymentComplete and the user re-enters
  // the table from the Dashboard or after a page refresh.
  useEffect(() => {
    if (fetchedBatches) {
      setOrderBatches(prev => ({
        ...prev,
        [selectedTableId]: fetchedBatches,
      }));

      // Restore customer name from the first batch that has one,
      // but ONLY if the current customerName is empty (e.g. after
      // returning from Dashboard or page refresh).
      // This prevents the customer from being overwritten if the
      // user manually cleared it in the current session.
      if (!customerName) {
        const batchWithCustomer = (fetchedBatches as OrderBatch[]).find(
          b => b.customer_name && b.customer_name.trim() !== ''
        )
        if (batchWithCustomer) {
          setCustomerName(batchWithCustomer.customer_name)
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchedBatches, selectedTableId]);

  // ─── Previous batches for selected table ─────────
  const tableBatches = selectedTableId ? (orderBatches[selectedTableId] || []) : [];
  // ─── Filter for display: only show billable batches ───
  // This ensures that after full payment, the Previous Batches section
  // disappears and the table looks like a fresh start.
  const activePreviousBatches = useMemo(
    () => getBillableBatches(tableBatches).filter(b => hasBillableItems([b])),
    [tableBatches]
  );

  // ─── Running totals ────────────────────────────────────────────
  // There are TWO distinct running totals with different meanings:
  //
  //   1. originalPreviousTotal — Sum of ALL batch subtotals (original amounts).
  //      NEVER changes after payment. Represents the total value of every batch.
  //      Displayed as "Previous batches" in the cart.
  //
  //   2. unpaidRunningTotal — Sum of only UNPAID billable items.
  //      Decreases as items are paid. Represents what's still owed.
  //      Displayed as "Running Total" in the cart.
  //
  // This separation ensures that partial payments don't erase the historical
  // order total. The original batch amounts are immutable once created.
  // ─── Original batch totals (IMMUTABLE — never recalculated after creation) ─
  // Uses each item's original unit_price * quantity directly, NOT batch.subtotal
  // which can be modified by voidBatchItem. This ensures the "Previous batches"
  // line always shows the original order value regardless of voids or payments.
  const originalPreviousTotal = useMemo(
    () => tableBatches.reduce((sum, b) =>
      sum + b.items.reduce((itemSum, item) => itemSum + item.unit_price * item.quantity, 0), 0
    ),
    [tableBatches],
  )
  const totalRunning = calculateTotalWithCart(tableBatches, newSubtotal);

  // ─── Voided items summary for reporting ───
  const voidedSummary = useMemo(
    () => getVoidedSummary(tableBatches),
    [tableBatches],
  );

  // ─── Compute all unpaid items across batches + cart ─
  const allUnpaidItemsForPayment = useMemo(() => {
    const items: Array<{
      id: string;
      item_name: string;
      quantity: number;
      unit_price: number;
      payment_status: string;
      batch_id?: string;
    }> = [];

    const billableBatches = getBillableBatches(tableBatches);
    for (const batch of billableBatches) {
      for (const bi of batch.items) {
        if (isItemBillable(bi)) {
          items.push({
            id: bi.id,
            item_name: bi.name,
            quantity: bi.quantity,
            unit_price: bi.unit_price,
            payment_status: 'pending',
            batch_id: batch.id,
          });
        }
      }
    }

    for (const ci of newCartItems) {
      if (ci.status === 'voided') continue;
      const key = `cart-${ci.menu_item_id}`;
      items.push({
        id: key,
        item_name: ci.name,
        quantity: ci.quantity,
        unit_price: ci.unit_price,
        payment_status: 'pending',
      });
    }

    return items;
  }, [tableBatches, newCartItems]);

  // ─── Payment completion guard — prevents handlePaymentComplete
  //     from executing more than once, regardless of code path.
  //     This is the second line of defense after PosPaymentDialog's
  //     safeComplete guard. Handles edge cases like React Strict Mode
  //     double-mounting and rapid user interactions.
  const paymentProcessingRef = useRef(false)

  // ─── Rate limit for order placement ──────────────────
  const { checkLimit: checkOrderLimit } = useRateLimit({ cooldownMs: 2000, maxAttempts: 10 })

  // ─── Dev-only payment logging helper ────────────────
  // Logs are stripped in production to prevent sensitive payment data
  // from leaking to browser consoles on shared terminals.
  const logPayment = (event: string, details: Record<string, unknown>) => {
    if (import.meta.env.DEV) {
      const entry = {
        event: `payment.${event}`,
        timestamp: new Date().toISOString(),
        tableId: selectedTableId,
        ...details,
      };
      console.log('[PAYMENT]', JSON.stringify(entry));
    }
  };

  // ─── Handle payment complete ──────────────────────
  // ═══════════════════════════════════════════════════════════════
  // SINGLE SOURCE OF TRUTH FOR INVOICE & PAYMENT CREATION
  // ═══════════════════════════════════════════════════════════════
  // This function is the ONLY place in the entire application where
  // invoices are created and payments are recorded. Every payment
  // method (Cash, QR, Fonepay, Credit, Split, Partial) flows through
  // this one function via the PosPaymentDialog's onComplete callback.
  //
  // GUARD: paymentProcessingRef ensures at most one execution at a time.
  //   - Set to true on entry, reset to false on completion or error.
  //   - Prevents duplicate invoice creation from:
  //     * React Strict Mode double-mounting
  //     * Rapid user interactions
  //     * Accidental double-fires from child components
  // ═══════════════════════════════════════════════════════════════
  const handlePaymentComplete = useCallback(async (paymentResult?: PaymentResult) => {
    // ═══════════════════════════════════════════════════════════════
    // GUARD: Prevent concurrent execution
    // ═══════════════════════════════════════════════════════════════
    // This ref is set to true BEFORE any async operations. It prevents
    // a second call from slipping past while the first call is awaiting
    // async operations (idempotency check, DB writes, etc.).
    // ═══════════════════════════════════════════════════════════════
    if (paymentProcessingRef.current) {
      logPayment('duplicate_blocked', {})
      return
    }
    paymentProcessingRef.current = true

    if (!selectedTableId) {
      paymentProcessingRef.current = false
      return;
    }

    // ── Guard: paymentResult must exist ──
    if (!paymentResult) {
      showError('Payment error: no payment result was received. Please try again.');
      setShowPayment(false);
      paymentProcessingRef.current = false;
      return;
    }

    // ── Guard: there must be something to pay ──
    if (allUnpaidItemsForPayment.length === 0) {
      showError('Nothing to pay — all items are already settled or the cart is empty.');
      setShowPayment(false);
      paymentProcessingRef.current = false;
      return;
    }

    // ── Core calculation: invoice total is ALWAYS the full bill amount ──
    // invoiceTotal = the FULL invoice total (e.g. 390 for partial payments)
    // paidAmount = actual real money received (e.g. 90 cash)
    // creditAmount = outstanding credit created (e.g. 300)
    // remainingBalance = actual outstanding after this transaction (invoiceTotal - paidAmount)
    // Credit is NOT subtracted from remaining — it IS the remaining.
    const invoiceTotal = paymentResult.invoiceTotal ?? paymentResult.grandTotal ?? 0;
    const actualPaid = paymentResult.paidAmount ?? 0;
    const creditAmount = paymentResult.creditAmount ?? 0;
    const remainingBalance = Math.max(0, invoiceTotal - actualPaid);
    const hasOutstandingCredit = creditAmount > 0;

    // ── Guard: zero-amount invoices must NEVER be created ──
    if (invoiceTotal <= 0) {
      if (import.meta.env.DEV) {
        console.log('[PAYMENT:ZERO_GUARD]', JSON.stringify({
          invoiceTotal,
          actualPaid,
          grandTotal: paymentResult.grandTotal,
          paidAmount: paymentResult.paidAmount,
          hasInvoiceTotal: 'invoiceTotal' in paymentResult,
          hasGrandTotal: 'grandTotal' in paymentResult,
          paymentResultKeys: Object.keys(paymentResult),
        }));
      }
      showError('Cannot process a zero-amount payment [POS]. Check the items and amounts.');
      setShowPayment(false);
      paymentProcessingRef.current = false;
      return;
    }

    setShowPayment(false);
    // IMPORTANT: cart is NOT cleared here — clearing before DB persistence
    //     would destroy the user's items if the payment transaction fails.
    //     Cart reset happens only AFTER the DB transaction succeeds (below).

    logPayment('start', {
      method: paymentResult.paymentMethod,
      amount: paymentResult.grandTotal,
      creditAmount: paymentResult.creditAmount,
      creditCustomer: paymentResult.creditCustomerName,
      paidItemCount: paymentResult.paidItemIds?.length,
      batchIds: tableBatches.map(b => b.id),
      customerName,
    });

    const paidItemIds = new Set(paymentResult.paidItemIds || []);
    const isCreditPayment = paymentResult.paymentMethod?.startsWith('Credit');
    const hasSplitCredit = (paymentResult.creditAmount ?? 0) > 0;
    let creditRemaining = paymentResult.creditAmount ?? 0;
    let newUnpaidTotal = 0;

    const subtotal = tableBatches.reduce((s, b) => s + b.subtotal, 0) + newSubtotal;
    const discount = paymentResult.discount ?? 0;
    const paidSubtotal = paymentResult.paidSubtotal ?? subtotal;

    // Detect split payment: only a subset of billable items are being paid.
    // Split payments create separate invoices — they don't merge into existing ones.
    const totalUnpaidCount = tableBatches.reduce((count, b) => {
      if (!isBatchBillable(b)) return count;
      return count + b.items.filter(bi => isItemBillable(bi)).length;
    }, 0) + newCartItems.filter(ci => ci.status !== 'voided').length;
    const isSplitPayment = paidItemIds.size > 0 && paidItemIds.size < totalUnpaidCount;

    // 1. Build invoice items from cart and previous batches
    const invoiceItemsList = [
      ...(newCartItems.filter(item => item.status !== 'voided').map(item => ({
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unit_price,
      }))),
      ...(getBillableBatches(tableBatches).flatMap(b =>
        b.items
          .filter(isItemBillable)
          .map(bi => ({
            name: bi.name,
            quantity: bi.quantity,
            unitPrice: bi.unit_price,
          }))
      )),
    ];

    // 2. Determine invoice status based on ACTUAL REAL MONEY received vs total.
    //    CREDIT is NOT payment — it is Accounts Receivable.
    //    An invoice is only 'paid' when real money covers the total.
    //    If credit was created, status is 'credit_invoice'.
    //    If only partial real money was received (no credit), status is 'partial'.
    let invoiceStatus: string;
    if (isCreditPayment) {
      invoiceStatus = 'credit_invoice';
    } else if (hasOutstandingCredit) {
      // Partial real money + credit for the rest — invoice has outstanding credit
      invoiceStatus = 'credit_invoice';
    } else if (remainingBalance <= 0) {
      invoiceStatus = 'paid';
    } else {
      invoiceStatus = 'partial';
    }

    // ═══ Call unified payment service (with recovery persistence) ═══
    // processPaymentWithRecovery handles:
    //   1. Persisting payment context BEFORE the RPC (for crash/refresh recovery)
    //   2. Calling process_payment RPC (atomic idempotent DB transaction)
    //   3. On success: cleaning up persisted state
    //   4. On failure: keeping persisted state for automatic startup recovery
    //
    // The payment reference serves as the idempotency key — reused on retries.
    const paymentReference = `PAY-${crypto.randomUUID()}`

    // Declare before try-block so they're accessible in post-RPC closures and showSuccess
    let invoiceId: string | undefined
    let invNumber: string | undefined

    try {
      const rpcResult = await processPaymentWithRecovery({
        tableId: selectedTableId,
        customerName: paymentResult.customerName || paymentResult.creditCustomerName || customerName || 'Walk-in',
        subtotal: isSplitPayment ? paidSubtotal : subtotal,
        tax: 0,
        discount,
        total: invoiceTotal,
        invoiceStatus,
        paymentMethod: toPaymentMethodKey(paymentResult.paymentMethod ?? 'cash'),
        paidAmount: (!isCreditPayment || hasSplitCredit) ? actualPaid : 0,
        userId: user?.id ?? null,
        paidItemIds: Array.from(paidItemIds),
        itemPaidStatus: isCreditPayment ? 'credit' : 'paid',
        batchIds: tableBatches.map(b => b.id),
        orderBatchIds: isSplitPayment ? [] : tableBatches.map(b => b.id),
        notes: `Payment via ${toPaymentMethodKey(paymentResult.paymentMethod ?? 'cash')}`,
        sourcePage: 'pos',
        creditAmount: paymentResult.creditAmount,
        creditCustomerName: paymentResult.creditCustomerName,
        gatewayReference: undefined,
        paymentReference,
      })

      if (!rpcResult.success) {
        throw new Error(rpcResult.error || 'Payment processing failed')
      }

      if (rpcResult.isDuplicate) {
        logPayment('duplicate_detected_by_rpc', { paymentReference })
        showSuccess('Payment already processed')
        paymentProcessingRef.current = false
        navigate('/dashboard')
        return
      }

      invoiceId = rpcResult.invoiceId!
      invNumber = rpcResult.invoiceNumber!

      logPayment('rpc_completed', {
        invoiceId,
        invoiceNumber: invNumber,
        isNewInvoice: rpcResult.isNewInvoice,
        paymentId: rpcResult.paymentId,
        batchUpdateCount: rpcResult.batchUpdateCount,
        timingMs: rpcResult.timingMs,
      })

      // ── Invoice items insertion (CRITICAL for Finance display) ──
      // This must happen BEFORE navigation so the Finance page sees invoice_items.
      // The RPC creates the invoice with totals but does NOT insert line items.
      // We do it here synchronously (no fire-and-forget) so it's guaranteed.
      if (invoiceItemsList.length > 0) {
        try {
          const insertedItems = await insertInvoiceItems(invoiceId, invoiceItemsList)
          logPayment('invoice_items_inserted', { invoiceId, itemCount: insertedItems.length })
        } catch (iiErr) {
          // Non-critical for payment integrity — invoice totals are already correct.
          // Log and continue; the invoice still shows the correct total in Finance.
          if (import.meta.env.DEV) {
            console.error('[PAYMENT] Failed to insert invoice items:', iiErr instanceof Error ? iiErr.message : iiErr)
          }
        }
      }

      // 3. Log activity (non-critical, fire-and-forget)
      logActivitySafe({
        activityType: 'payment_received',
        entityId: invoiceId,
        entityLabel: `Invoice ${invNumber}`,
        status: isCreditPayment ? 'pending' : 'completed',
        amount: paymentResult.grandTotal,
        userName: customerName || 'System',
        location: selectedTableId
          ? posMode === 'tables'
            ? `Table ${(selectedTableInfo as any)?.table_number ?? selectedTableId}`
            : `Room ${(selectedTableInfo as any)?.room_number || (selectedTableInfo as any)?.number || selectedTableId}`
          : 'POS',
        details: `Payment of ${npr(paymentResult.grandTotal)} via ${toPaymentMethodKey(paymentResult.paymentMethod ?? 'cash')}. Items: ${invoiceItemsList.length}`,
      })
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : typeof err === 'object' && err !== null ? JSON.stringify(err) : 'Unknown error'
      if (import.meta.env.DEV) console.error('[PAYMENT] RPC failed:', errMessage)
      showError(`Payment failed: ${errMessage}. Please try again.`)
      paymentProcessingRef.current = false
      return
    }

    // ═══════════════════════════════════════════════════════════════
    // CODE AFTER THIS POINT ONLY RUNS IF DB PERSISTENCE SUCCEEDED
    // ═══════════════════════════════════════════════════════════════

    setOrderBatches(prev => {
      const batches = prev[selectedTableId];
      if (!batches) return prev;
      const updatedBatches = batches.map(batch => {
        const creditItemIds = new Set<string>();
        if (hasSplitCredit) {
          const sortedItems = [...batch.items].filter(bi => paidItemIds.has(bi.id)).sort((a, b) => (b.unit_price * b.quantity) - (a.unit_price * a.quantity));
          for (const item of sortedItems) {
            const itemValue = item.unit_price * item.quantity;
            if (creditRemaining >= itemValue) { creditItemIds.add(item.id); creditRemaining -= itemValue; }
            else if (creditRemaining > 0) { creditItemIds.add(item.id); creditRemaining = 0; }
          }
        }
        const updatedItems = batch.items.map(bi => {
          if (paidItemIds.has(bi.id)) {
            if (hasSplitCredit && creditItemIds.has(bi.id)) return { ...bi, status: 'credit' as CartItemStatus };
            return { ...bi, status: (isCreditPayment ? 'credit' : 'paid') as CartItemStatus };
          }
          return bi;
        });
        const settledStatuses: CartItemStatus[] = ['paid', 'credit', 'cancelled', 'voided'];
        const allSettled = updatedItems.every(i => settledStatuses.includes(i.status));
        const somePaid = updatedItems.some(i => i.status === 'paid' || i.status === 'credit');
        const paidAmount = updatedItems.filter(i => i.status === 'paid' || i.status === 'credit').reduce((sum, i) => sum + i.unit_price * i.quantity, 0);
        for (const bi of updatedItems) { if (bi.status !== 'paid' && bi.status !== 'credit' && bi.status !== 'cancelled') { newUnpaidTotal += bi.unit_price * bi.quantity; } }
        return { ...batch, items: updatedItems, status: allSettled ? 'paid' : somePaid ? 'partial' : batch.status, paid_amount: paidAmount };
      });
      return { ...prev, [selectedTableId]: updatedBatches };
    });

    // ── Post-navigation operations (fire-and-forget — Phases 2 & 3) ──
    // These are moved out of the blocking payment path. All are non-critical
    // for payment integrity — they handle display history, customer linking,
    // inventory tracking, and invoice line items. Failures are logged and
    // retried with exponential backoff to ensure eventual consistency.
    const customerOpsPromise = (async () => {
      const MAX_RETRIES = 3;
      const BASE_DELAY_MS = 500;

      const retry = async <T,>(fn: () => Promise<T>, label: string): Promise<T | undefined> => {
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
          try {
            return await fn();
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : 'Unknown error';
            console.error(`[PAYMENT] ${label} failed (attempt ${attempt}/${MAX_RETRIES}):`, errMsg);
            if (attempt < MAX_RETRIES) {
              const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
              await new Promise(resolve => setTimeout(resolve, delay));
            }
          }
        }
        return undefined;
      };

      // Phase 2: Customer record updates
      const invoiceCustomerName = paymentResult.creditCustomerName || customerName || ''
      if (invoiceCustomerName && invoiceCustomerName !== 'Walk-in' && invoiceCustomerName.trim()) {
        await retry(
          () => updateCustomerAfterInvoice(invoiceCustomerName, invoiceTotal, invoiceId ?? undefined),
          'updateCustomerAfterInvoice'
        )
      }

      if (paymentResult.creditCustomerName) {
        if (paymentResult.creditAmount && paymentResult.creditAmount > 0) {
          await retry(
            () => recordCreditCharge(paymentResult.creditCustomerName!, paymentResult.creditAmount!, invNumber, `Credit from ${paymentResult.paymentMethod || 'partial payment'}`, invoiceId ?? undefined),
            'recordCreditCharge'
          )
          logPayment('credit_charge_recorded', { customerName: paymentResult.creditCustomerName, amount: paymentResult.creditAmount, invoiceNumber: invNumber })
        } else if (isCreditPayment && !hasSplitCredit) {
          await retry(
            () => recordCreditCharge(paymentResult.creditCustomerName!, paymentResult.grandTotal, invNumber, 'Full credit charge', invoiceId ?? undefined),
            'recordCreditCharge'
          )
          logPayment('credit_charge_recorded', { customerName: paymentResult.creditCustomerName, amount: paymentResult.grandTotal, invoiceNumber: invNumber, type: 'full' })
        }
      }

      // Phase 3: Inventory deduction (non-critical — never throws, clamps to available stock)
      if (invoiceItemsList.length > 0 && !isCreditPayment) {
        await retry(
          () => deductStockForSoldItems(invoiceItemsList),
          'deductStockForSoldItems'
        )
        logPayment('inventory_deducted', { itemCount: invoiceItemsList.length })
      }
    })()
    logPayment('completed', { invoiceNumber: invNumber, invoiceId, totalAmount: paymentResult.grandTotal, method: paymentResult.paymentMethod, unpaidItems: newUnpaidTotal });

    // ═══════════════════════════════════════════════════════════════
    // CLOSE TABLE SESSION
    // ═══════════════════════════════════════════════════════════════
    // The dining session is ALWAYS finished after checkout,
    // regardless of whether the bill was fully paid or partially
    // paid with credit. Outstanding credit is tracked on the
    // invoice and customer account, NOT on the table.
    // ═══════════════════════════════════════════════════════════════
    // ── Close table session — the dining session is ALWAYS finished after checkout,
    //     regardless of whether the bill was fully paid or partially paid with credit.
    //     Outstanding credit is tracked on the invoice, not the table.
    //     Fire-and-forget — errors are non-critical (DB triggers also handle this).
    if (selectedTableId) {
      db.rpc('close_table_session', { p_table_id: selectedTableId })
        .then(({ data, error }: { data: any; error: any }) => {
          if (error) {
            logPayment('close_session_rpc_failed', { error: error.message || error });
          } else if (data && typeof data === 'object' && 'success' in data && data.success) {
            logPayment('close_session_rpc_ok', { session_id: (data as any).session_id });
          }
        });
    }

    // ═══════════════════════════════════════════════════════════════
    // CLEAR POS SESSION — runs only after all DB writes succeeded
    // ═══════════════════════════════════════════════════════════════
    clearCart();
    setCustomerName('');
    try { sessionStorage.removeItem(CART_STORAGE_KEY); } catch { /* ignore */ }

    // Reset guard after successful completion
    paymentProcessingRef.current = false

    // ALWAYS reset table selection — the dining session is finished.
    // Outstanding credit is tracked on the invoice, not on the table.
    setSelectedTableId('');
    setOrderBatches(prev => {
      const updated = { ...prev };
      delete updated[selectedTableId];
      return updated;
    });

    // Invalidations are fire-and-forget — single wildcard covers all dashboard-* keys
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['batches'] });

    // ── Navigation & success messages ──
    // Credit is NOT "remaining" — it's "outstanding".
    // Only real-money remaining counts as "remaining".
    if (hasOutstandingCredit) {
      showSuccess(`Invoice #${invNumber}: ${npr(actualPaid)} received via ${getPaymentMethodLabel(paymentResult.paymentMethod)}. Outstanding credit: ${npr(creditAmount)} assigned to ${paymentResult.creditCustomerName || 'customer'}.`);
    } else if (remainingBalance > 0) {
      showSuccess(`Partial payment of ${npr(actualPaid)} received. ${npr(remainingBalance)} remaining.`);
    } else {
      showSuccess(`Payment of ${npr(actualPaid)} received${paymentResult.paymentMethod ? ` via ${getPaymentMethodLabel(paymentResult.paymentMethod)}` : ''}!`);
    }
    // Always navigate to dashboard after checkout
    navigate('/dashboard');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTableId, orderBatches, newCartItems, newSubtotal, customerName, queryClient, navigate]);

  async function handlePlaceOrder() {
    if (newCartItems.length === 0 || !selectedTableId) return;
    const activeCartItems = newCartItems.filter(l => l.status !== 'voided');
    if (activeCartItems.length === 0) { showError('No active items to place - all items have been voided.'); return; }
    // Rate limit — prevent rapid duplicate order submissions
    if (!checkOrderLimit()) return;

    const batchId = crypto.randomUUID();
    const batchItems: OrderBatchItem[] = activeCartItems.map((item) => ({
      id: crypto.randomUUID(), menu_item_id: item.menu_item_id, name: item.name, quantity: item.quantity, unit_price: item.unit_price, notes: item.notes, status: 'pending' as CartItemStatus, batch_id: batchId,
    }));
    const newSubtotalForThisBatch = activeCartItems.reduce((s, l) => s + l.unit_price * l.quantity, 0);
    const batch: OrderBatch = { id: batchId, table_id: selectedTableId, customer_name: customerName || undefined, items: batchItems, status: 'pending', created_at: new Date().toISOString(), is_locked: true, subtotal: newSubtotalForThisBatch, paid_amount: 0 };

    try {
      // 1. Persist to database — insert batch and items
      await db.insertOne('order_batches', {
        id: batchId,
        table_id: selectedTableId,
        customer_name: customerName || null,
        status: 'pending',
        is_locked: true,
        subtotal: newSubtotalForThisBatch,
        discount: 0,
        paid_amount: 0,
      });

      if (batchItems.length > 0) {
        await db.insertMany('order_batch_items', batchItems.map(item => ({
          id: item.id,
          batch_id: batchId,
          menu_item_id: item.menu_item_id,
          name: item.name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          notes: item.notes,
          status: 'pending',
        })));
      }

      // Table status is now derived from batch existence — no manual status update needed

      // 2. Update local state
      setOrderBatches(prev => ({
        ...prev,
        [selectedTableId]: [...(prev[selectedTableId] || []), batch],
      }));

      const currentBatches = [...(orderBatches[selectedTableId] || [])];
      const orderNum = currentBatches.length + 1;
      const displayOrderNumber = `Order #${orderNum}`;
      const entityLabel = posMode === 'tables'          ? `T${(selectedTableInfo as any)?.table_number ?? selectedTableId}`
        : `R${(selectedTableInfo as any)?.room_number || (selectedTableInfo as any)?.number || selectedTableId}`;

      // 3. Non-critical activity log
      logActivitySafe({
        activityType: 'order_created',
        entityId: batchId,
        entityLabel: displayOrderNumber,
        status: 'pending',
        amount: newSubtotal,
        userName: customerName || 'System',
        location: entityLabel,
        details: `${displayOrderNumber} (${totalNewCartItems} items) placed. Customer: ${customerName || 'Walk-in'}. Items: ${batchItems.map(i => `${i.name}×${i.quantity}`).join(', ')}`,
      });

      showSuccess(`${displayOrderNumber} (${totalNewCartItems} items) placed!`);
      // Clear the cart — submitted items are now persisted in the database and
      // displayed in the Previous Batches section. The editable cart starts
      // fresh for the next batch.
      // NOTE: customerName is NOT cleared — the customer belongs to the table,
      // not to a single order. It will be restored from the order_batch when
      // the user re-enters this table, even after a page refresh or navigation.
      clearCart();
      try { sessionStorage.removeItem(CART_STORAGE_KEY); } catch { /* ignore */ }

      // Fire-and-forget — single wildcard covers all dashboard-* keys
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['batches'] });

      // Navigate to dashboard
      navigate('/dashboard');
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to place order:', err);
      showError('Failed to place order. The cart has been preserved — please try again.');
    }
  }

  // ─── RENDER ───────────────────────────────────────

  return (
    <PageTransition className="flex flex-col h-[calc(100vh-8rem)] lg:h-[calc(100vh-9rem)] bg-background border-t-4 border-t-emerald-500">
      <motion.div className="flex items-center gap-2 px-4 h-12 border-b border-emerald-200 dark:border-emerald-800 shrink-0 lg:hidden"
        style={{ background: 'linear-gradient(135deg, #059669 0%, #10b981 50%, #34d399 100%)' }}
        animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}>
        <button className="flex items-center gap-1 text-sm font-medium text-emerald-50 hover:text-white"><ArrowLeft className="h-4 w-4" /><span>Home</span></button>
        <span className="text-xs font-semibold text-emerald-50 ml-auto tracking-widest">POS</span>
        <button onClick={() => setShowShortcuts(true)} className="p-1 rounded-lg hover:bg-white/20 transition-colors"><Keyboard className="h-4 w-4 text-emerald-100" /></button>
      </motion.div>

      <motion.div
        className="flex flex-col lg:flex-row flex-1 min-h-0"
        variants={pageReveal}
        initial="hidden"
        animate="show"
      >
        {/* ─── Category Sidebar (Desktop) ─── */}
        <motion.div variants={sectionReveal} className="hidden lg:flex flex-col shrink-0">
          <motion.div
            className="flex flex-col items-center gap-1 py-4 h-full overflow-y-auto no-scrollbar border-r border-border bg-card/70 backdrop-blur-xl"
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1, width: sidebarOpen ? 180 : 64 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          >
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="mb-2 p-1.5 rounded-lg hover:bg-muted/80 transition-all duration-200 shrink-0 active:scale-95">
              {sidebarOpen ? <ChevronLeft className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </button>
            <motion.div className="flex flex-col items-center gap-1 w-full" variants={stagger} initial="hidden" animate="show">
              <motion.button variants={fadeUp} onClick={() => setSelectedCat('all')}
                className={`flex flex-col items-center gap-1 w-full px-2 shrink-0 ${selectedCat === 'all' ? 'opacity-100' : 'opacity-60 hover:opacity-100'} transition-all duration-200 relative group`}
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <div className={`w-12 h-12 lg:w-14 lg:h-14 rounded-xl flex items-center justify-center transition-all duration-300 ${selectedCat === 'all' ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/30' : 'bg-muted text-foreground group-hover:bg-muted/80'}`}>
                  <Grid3X3 className="h-5 w-5 lg:h-6 lg:w-6" />
                </div>
                {sidebarOpen && (
                  <motion.span className="text-[11px] font-medium text-center leading-tight" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    All
                  </motion.span>
                )}
              </motion.button>
              {categoriesList.map((cat, idx) => {
                const Icon = getIconForCategory(cat.name);
                const catCount = cartCountByCategory[cat.id] ?? 0;
                return (
                  <motion.button key={cat.id} variants={fadeUp} onClick={() => setSelectedCat(cat.id)}
                    className={`flex flex-col items-center gap-1 w-full px-2 shrink-0 ${selectedCat === cat.id ? 'opacity-100' : 'opacity-60 hover:opacity-100'} transition-all duration-200 relative group`}
                    whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <div className={`relative w-12 h-12 lg:w-14 lg:h-14 rounded-xl flex items-center justify-center transition-all duration-300 ${selectedCat === cat.id ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/30' : 'bg-muted text-foreground group-hover:bg-muted/80'}`}>
                      <Icon className="h-5 w-5 lg:h-6 lg:w-6" />
                      <AnimatePresence>{catCount > 0 && (<motion.span className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-emerald-500 text-[11px] font-bold text-white shadow-sm" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} key={catCount}>{catCount}</motion.span>)}</AnimatePresence>
                    </div>
                    {sidebarOpen && (
                      <motion.span className="text-[11px] font-medium text-center leading-tight" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        {cat.name}
                      </motion.span>
                    )}
                    {sidebarOpen && (
                      <span className="text-[9px] text-muted-foreground/50 font-mono">[{idx + 1}]</span>
                    )}
                  </motion.button>
                );
              })}
            </motion.div>
          </motion.div>
        </motion.div>

        {/* ─── Category Sidebar (Mobile) ─── */}
        <motion.div variants={sectionReveal} className="flex lg:hidden items-center gap-2 p-2 overflow-x-auto no-scrollbar border-b border-border bg-card/70">
          <button onClick={() => { setSelectedCat('all'); }}
            className={`flex flex-col items-center gap-1 shrink-0 px-2 ${selectedCat === 'all' ? 'opacity-100' : 'opacity-60 hover:opacity-100'} transition-all duration-200`}>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${selectedCat === 'all' ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/30' : 'bg-muted text-foreground'}`}>
              <Grid3X3 className="h-5 w-5" />
            </div>
            <span className="text-[11px] font-medium text-center leading-tight">All</span>
          </button>
          {categoriesList.map((cat) => {
            const Icon = getIconForCategory(cat.name);
            const catCount = cartCountByCategory[cat.id] ?? 0;
            return (
              <button key={cat.id} onClick={() => setSelectedCat(cat.id)}
                className={`flex flex-col items-center gap-1 shrink-0 px-2 ${selectedCat === cat.id ? 'opacity-100' : 'opacity-60 hover:opacity-100'} transition-all duration-200`}>
                <div className={`relative w-12 h-12 rounded-xl flex items-center justify-center ${selectedCat === cat.id ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/30' : 'bg-muted text-foreground'}`}>
                  <Icon className="h-5 w-5" />
                  {catCount > 0 && (
                    <span                          className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-emerald-500 text-[11px] font-bold text-white shadow-sm"
                      >
                        {catCount}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-medium text-center leading-tight whitespace-nowrap">{cat.name}</span>
                </button>
              );
            })}
          </motion.div>

        {/* ─── Mobile floating action bar ─── */}
        <div className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around gap-2 border-t border-border bg-background/95 backdrop-blur-lg px-3 py-2 lg:hidden safe-area-bottom">
          <button onClick={() => setMobileCartOpen(true)}
            className="relative flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 min-h-[44px] text-sm font-bold text-white shadow-sm active:scale-95 transition-transform">
            <ShoppingCart className="h-4 w-4" />
            <span>Cart</span>
            {totalNewCartItems > 0 && (
              <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[20px] h-[20px] rounded-full bg-amber-500 text-[10px] font-bold text-white shadow-sm">
                {totalNewCartItems}
              </span>
            )}
          </button>
          <button onClick={() => { if (!selectedTableId) { showError('Select a table first'); return; } setShowPayment(true); }}
            disabled={!selectedTableId || allUnpaidItemsForPayment.length === 0}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 min-h-[44px] text-sm font-bold text-white shadow-sm disabled:opacity-50 active:scale-95 transition-transform">
            <Receipt className="h-4 w-4" />
            Pay
          </button>
        </div>

        {/* ─── Menu Grid ─── */}
        <motion.div variants={sectionReveal} className="flex-1 p-4 lg:p-5 overflow-y-auto no-scrollbar">
          {/* ─── Header ─── */}
          <div className="mb-4 space-y-3">
            {/* Title row */}
            <div className="flex items-center justify-between">
              <motion.h1
                className="text-base font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-2"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
              >
                <motion.span
                  className="w-1.5 h-4 rounded-full bg-emerald-500 inline-block shrink-0"
                  animate={{ scaleY: [1, 1.3, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                Point of Sale
              </motion.h1>
              {/* Item count badge */}
              <motion.div
                className="flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-800/30 px-3 py-1"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2, type: 'spring' as const, stiffness: 400, damping: 25 }}
              >
                <Grid3X3 className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {searchQuery ? `${availableItems.length}/${totalAvailableCount}` : availableItems.length}
                </span>
                <span className="text-xs text-emerald-500/70 dark:text-emerald-400/70">
                  {searchQuery ? 'found' : 'items'}
                </span>
              </motion.div>
            </div>

            {/* Toolbar row */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
              {/* Search - primary action */}
              <motion.div
                className="relative flex-1 min-w-0 sm:max-w-md"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, type: 'spring' as const, stiffness: 400, damping: 28 }}
              >
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60 pointer-events-none" />
                <input
                  ref={searchRef}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search menu items..."
                  className="w-full h-10 rounded-xl border border-border bg-card/50 pl-10 pr-12 text-sm outline-none
                             transition-all duration-200
                             placeholder:text-muted-foreground/40
                             focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 focus:bg-card focus:shadow-sm focus:shadow-emerald-500/5
                             hover:border-emerald-300 dark:hover:border-emerald-700              "/>

                {searchQuery ? (
                  <button
                    onClick={() => { setSearchQuery(''); searchRef.current?.focus(); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center w-7 h-7 rounded-lg hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-all active:scale-90"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:flex items-center gap-1 rounded-md border border-border/60 bg-muted/80 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground/60 pointer-events-none">
                    <Keyboard className="h-2.5 w-2.5" />
                    <span>/</span>
                  </div>
                )}
              </motion.div>

              {/* Tables / Rooms mode toggle */}
              <motion.div
                className="flex shrink-0 rounded-xl border border-border bg-card/50 p-0.5"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, type: 'spring' as const, stiffness: 400, damping: 28 }}
              >
                <button
                  onClick={() => { setPosMode('tables'); setSelectedTableId(''); setEntityDropdownOpen(false); setEntitySearchQuery(''); }}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all duration-200 ${
                    posMode === 'tables'
                      ? 'bg-emerald-500 text-white shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Table2 className="h-3.5 w-3.5" />
                  <span>Tables</span>
                </button>
                <button
                  onClick={() => { setPosMode('rooms'); setSelectedTableId(''); setEntityDropdownOpen(false); setEntitySearchQuery(''); }}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all duration-200 ${
                    posMode === 'rooms'
                      ? 'bg-violet-500 text-white shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <BedDouble className="h-3.5 w-3.5" />
                  <span>Rooms</span>
                </button>
              </motion.div>

              {/* Entity selector dropdown (tables or rooms) */}
              <motion.div
                ref={entityDropdownRef}
                className="relative shrink-0"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12, type: 'spring' as const, stiffness: 400, damping: 28 }}
              >
                {/* Trigger chip */}
                <button
                  onClick={() => setEntityDropdownOpen(prev => !prev)}
                  className={`flex items-center gap-2 h-10 rounded-xl border px-3.5 min-w-[160px]
                              transition-all duration-200 select-none
                              ${
                                entityDropdownOpen
                                  ? posMode === 'tables'
                                    ? 'border-emerald-400 ring-2 ring-emerald-500/30 bg-card shadow-sm'
                                    : 'border-violet-400 ring-2 ring-violet-500/30 bg-card shadow-sm'
                                  : posMode === 'tables'
                                    ? 'border-border bg-card/50 hover:border-emerald-300 dark:hover:border-emerald-700'
                                    : 'border-border bg-card/50 hover:border-violet-300 dark:hover:border-violet-700'
                              }`}
                  aria-haspopup="listbox"
                  aria-expanded={entityDropdownOpen}
                  aria-label={posMode === 'tables' ? 'Select table' : 'Select room'}
                >
                  {posMode === 'tables' ? (
                    <Table2 className={`h-4 w-4 shrink-0 ${selectedTableInfo ? 'text-emerald-500' : 'text-muted-foreground/60'}`} />
                  ) : (
                    <BedDouble className={`h-4 w-4 shrink-0 ${selectedTableInfo ? 'text-violet-500' : 'text-muted-foreground/60'}`} />
                  )}
                  {selectedTableInfo ? (
                    <>
                      <span className="text-sm font-extrabold text-foreground tabular-nums">
                        {posMode === 'tables' ? `T${(selectedTableInfo as any).table_number}` : `R${(selectedTableInfo as any).room_number || (selectedTableInfo as any).number}`}
                      </span>
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${posMode === 'tables'
                        ? (TABLE_STATUS_COLORS[selectedTableInfo.status] || 'bg-gray-400')
                        : selectedTableInfo.status === 'occupied' ? 'bg-orange-500'
                          : selectedTableInfo.status === 'vacant' || selectedTableInfo.status === 'available' ? 'bg-emerald-500'
                            : selectedTableInfo.status === 'reserved' ? 'bg-blue-500'
                              : selectedTableInfo.status === 'cleaning' ? 'bg-cyan-500'
                                : 'bg-gray-400'
                      }`} />
                      <span className="text-xs font-semibold text-muted-foreground capitalize hidden sm:inline">
                        {posMode === 'tables'
                          ? (TABLE_STATUS_LABELS[selectedTableInfo.status] || selectedTableInfo.status)
                          : selectedTableInfo.status}
                      </span>
                    </>
                  ) : (
                    <span className="text-sm font-extrabold text-muted-foreground/60 flex-1 text-left">
                      {posMode === 'tables' ? 'Select Table' : 'Select Room'}
                    </span>
                  )}
                  <motion.div
                    animate={{ rotate: entityDropdownOpen ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                  </motion.div>
                </button>

                {/* Dropdown panel */}
                <AnimatePresence>
                  {entityDropdownOpen && (
                    <motion.div
                      className="absolute top-full left-0 right-0 mt-1.5 z-50 rounded-xl border border-border bg-card shadow-xl shadow-black/5 overflow-hidden"
                      initial={{ opacity: 0, y: -6, scaleY: 0.95 }}
                      animate={{ opacity: 1, y: 0, scaleY: 1 }}
                      exit={{ opacity: 0, y: -6, scaleY: 0.95 }}
                      transition={{ duration: 0.15, ease: 'easeOut' }}
                      style={{ transformOrigin: 'top center' }}
                      role="listbox"
                    >
                      {/* Search input */}
                      <div className="relative border-b border-border">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50 pointer-events-none" />
                        <input
                          value={entitySearchQuery}
                          onChange={e => setEntitySearchQuery(e.target.value)}
                          placeholder={`Search ${posMode}...`}
                          className="w-full h-9 bg-transparent pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground/40"
                          autoFocus
                        />
                      </div>

                      {/* Options list */}
                      <div className="max-h-60 overflow-y-auto no-scrollbar py-1.5">
                        {/* "None" option */}
                        <button
                          onClick={() => { setSelectedTableId(''); setEntityDropdownOpen(false); setEntitySearchQuery(''); }}
                          className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-sm transition-colors text-left
                            ${
                              !selectedTableId
                                ? posMode === 'tables'
                                  ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400'
                                  : 'bg-violet-50 dark:bg-violet-950/20 text-violet-600 dark:text-violet-400'
                                : 'text-muted-foreground hover:bg-muted'
                            }`}
                        >
                          <div className="w-5 h-5 rounded-md border border-dashed border-border flex items-center justify-center">
                            <X className="h-3 w-3 text-muted-foreground/50" />
                          </div>
                          <span className="font-semibold">{posMode === 'tables' ? 'No table' : 'No room'}</span>
                        </button>

                        {/* Divider */}
                        <div className="mx-3 my-1 border-t border-border/50" />

                        {filteredEntities.length === 0 && entitySearchQuery && (
                          <div className="px-3.5 py-8 text-center text-sm text-muted-foreground">
                            No {posMode} match your search
                          </div>
                        )}

                        {filteredEntities.map((entity: any) => {
                          const isSelected = entity.id === selectedTableId;
                          const entityNumber = posMode === 'tables' ? entity.table_number : (entity.room_number || entity.number || '');
                          const statusLabel = posMode === 'tables'
                            ? (TABLE_STATUS_LABELS[entity.status] || entity.status)
                            : entity.status;
                          const colorClass = posMode === 'tables'
                            ? (TABLE_STATUS_COLORS[entity.status] || 'bg-gray-400')
                            : entity.status === 'occupied' ? 'bg-orange-500'
                              : entity.status === 'vacant' || entity.status === 'available' ? 'bg-emerald-500'
                                : entity.status === 'reserved' ? 'bg-blue-500'
                                  : entity.status === 'cleaning' ? 'bg-cyan-500'
                                    : 'bg-gray-400';
                          const runningTotal = posMode === 'tables' && entity.status === 'occupied' ? entity.running_total : null;

                          return (
                            <button
                              key={entity.id}
                              onClick={() => { setSelectedTableId(entity.id); setEntityDropdownOpen(false); setEntitySearchQuery(''); }}
                              role="option"
                              aria-selected={isSelected}
                              className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-sm transition-colors text-left
                                ${
                                  isSelected
                                    ? posMode === 'tables'
                                      ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400'
                                      : 'bg-violet-50 dark:bg-violet-950/20 text-violet-600 dark:text-violet-400'
                                    : 'text-foreground hover:bg-muted'
                                }`}
                            >
                              {posMode === 'tables' ? (
                                <Table2 className={`h-4 w-4 shrink-0 ${isSelected ? 'text-emerald-500' : 'text-muted-foreground/50'}`} />
                              ) : (
                                <BedDouble className={`h-4 w-4 shrink-0 ${isSelected ? 'text-violet-500' : 'text-muted-foreground/50'}`} />
                              )}
                              <div className="flex-1 flex items-center gap-2 min-w-0">
                                <span className={`font-bold tabular-nums ${
                                  isSelected
                                    ? posMode === 'tables'
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : 'text-violet-600 dark:text-violet-400'
                                    : 'text-foreground'
                                }`}>
                                  {posMode === 'tables' ? `T${entityNumber}` : `R${entityNumber}`}
                                </span>
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${colorClass}`} />
                                <span className="text-xs text-muted-foreground capitalize truncate">{statusLabel}</span>
                              </div>
                              {runningTotal != null && (
                                <span className="text-xs font-semibold tabular-nums text-amber-600 dark:text-amber-400 shrink-0">
                                  {npr(runningTotal)}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>

              {/* Customer input — compact with label */}
              <motion.div
                className="relative shrink-0"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.14, type: 'spring' as const, stiffness: 400, damping: 28 }}
              >
                <div className="flex items-center gap-0.5 h-10 rounded-xl border border-border bg-card/50
                                transition-all duration-200
                                focus-within:ring-2 focus-within:ring-emerald-500/30 focus-within:border-emerald-400
                                hover:border-emerald-300 dark:hover:border-emerald-700">
                  <span className="flex items-center gap-1 pl-3.5 text-xs font-medium text-muted-foreground/70 shrink-0">
                    <UserIcon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Customer:</span>
                  </span>
                  <input
                    placeholder="Walk-in"
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    className="bg-transparent outline-none w-24 sm:w-28 text-sm placeholder:text-muted-foreground/40"
                  />
                  {customerName && (
                    <button
                      onClick={() => setCustomerName('')}
                      className="p-0.5 rounded hover:bg-muted transition-colors shrink-0 mr-1"
                      tabIndex={-1}
                    >
                      <X className="h-3.5 w-3.5 text-muted-foreground/60" />
                    </button>
                  )}
                </div>
              </motion.div>
            </div>
          </div>

          {/* Menu grid with smooth crossfade between skeleton and content */}
          <div className="relative grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3" key={selectedCat}>
            {/* Skeleton layer — fades out when loading completes */}
            <motion.div
              className="col-span-full grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3"
              animate={{ opacity: isMenuLoading ? 1 : 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              style={{ pointerEvents: isMenuLoading ? 'auto' : 'none', position: isMenuLoading ? 'relative' : 'absolute', inset: 0 }}
            >
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-border bg-card overflow-hidden">
                  <div className="h-20 lg:h-24 bg-muted animate-pulse" />
                  <div className="p-2.5 space-y-2">
                    <div className="h-3 w-3/4 bg-muted animate-pulse rounded" />
                    <div className="h-2 w-1/2 bg-muted animate-pulse rounded" />
                  </div>
                </div>
              ))}
            </motion.div>

            {/* Content layer — fades in when data arrives */}
            <motion.div
              className="col-span-full grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3"
              variants={stagger}
              initial="hidden"
              animate={isMenuLoading ? 'hidden' : 'show'}
            >
              {!isMenuLoading && availableItems.length === 0 ? (
                <div className="col-span-full flex flex-col items-center justify-center py-16 text-muted-foreground">
                  {searchQuery ? (
                    <Search className="h-12 w-12 mb-3 text-muted-foreground/20" />
                  ) : (
                    <ShoppingCart className="h-12 w-12 mb-3 text-muted-foreground/20" />
                  )}
                  <p className="text-lg font-semibold mb-1">
                    {searchQuery ? `No items match "${searchQuery}"` : 'No menu items loaded'}
                  </p>
                  <p className="text-sm">
                    {searchQuery ? (
                      <>
                        Try a different search term or{' '}
                        <button
                          onClick={() => setSearchQuery('')}
                          className="text-emerald-500 hover:text-emerald-600 underline underline-offset-2 transition-colors"
                        >
                          clear filter
                        </button>
                      </>
                    ) : (
                      'Add menu items in the Menu page, then set up your POS categories'
                    )}
                  </p>
                </div>
              ) : null}
              {!isMenuLoading && availableItems.map(item => {
              const inCart = cartItemIds.has(item.id);
              const qty = cartCountByItem[item.id] ?? 0;
              const justAdded = lastAdded === item.id;
              return (
                <motion.div key={item.id} variants={fadeUp} onClick={() => { if (!inCart) addToCart(item as any); }}
                  className={`group relative rounded-xl border overflow-hidden text-left cursor-pointer transition-all ${inCart ? 'border-emerald-400 ring-1 ring-emerald-400/50 shadow-sm shadow-emerald-500/10' : 'border-border hover:border-emerald-300 dark:hover:border-emerald-700 bg-card'}`}
                  whileHover={{ y: -2, transition: { duration: 0.15 } }} whileTap={{ scale: 0.97 }} layout>                    {/* ── Item Image (with CSS fallback behind) ── */}
                  <div className={`relative h-20 lg:h-24 overflow-hidden transition-all duration-300 ${
                    inCart
                      ? 'bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-950/40 dark:to-emerald-900/20'
                      : 'bg-gradient-to-br from-muted to-muted/50 group-hover:from-emerald-50 group-hover:to-emerald-50/50 dark:group-hover:from-emerald-950/20 dark:group-hover:to-transparent'
                  }`}>
                    {/* Fallback layer — always in DOM, visible when image is missing/broken */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <AnimatePresence mode="wait">
                        {justAdded ? (
                          <motion.div key="check" initial={{ scale: 0, rotate: -180 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0, rotate: 180 }} className="text-emerald-500">
                            <Zap className="h-8 w-8" />
                          </motion.div>
                        ) : inCart ? (
                          <motion.span key="qty" initial={{ scale: 0.5 }} animate={{ scale: 1 }} className="text-3xl font-bold text-primary/30">
                            {qty}
                          </motion.span>
                        ) : (
                          <motion.div key="icon" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-muted-foreground/30 group-hover:text-muted-foreground/50 transition-colors">
                            <UtensilsCrossed className="h-7 w-7" />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Image layer — sits on top of fallback when it loads */}
                    {item.image && (
                      <img
                        src={item.image}
                        alt={item.name}
                        onError={(e) => { e.currentTarget.style.display = 'none' }}
                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                      />
                    )}

                    {/* Dark overlay for in-cart items (above image) */}
                    {inCart && (
                      <div className="absolute inset-0 bg-black/20" />
                    )}

                    {/* In-cart quantity badge (above everything) */}
                    <AnimatePresence>
                      {inCart && item.image && (
                        <motion.span
                          key="qty-badge"
                          initial={{ scale: 0.5 }}
                          animate={{ scale: 1 }}
                          className="absolute bottom-2 right-2 flex items-center justify-center min-w-[24px] h-6 rounded-full bg-emerald-500 text-xs font-bold text-white shadow-lg"
                        >
                          {qty}
                        </motion.span>
                      )}
                    </AnimatePresence>

                    {/* Just-added overlay (above everything) */}
                    <AnimatePresence>
                      {justAdded && item.image && (
                        <motion.div
                          key="check-overlay"
                          initial={{ scale: 0, rotate: -180 }}
                          animate={{ scale: 1, rotate: 0 }}
                          exit={{ scale: 0, rotate: 180 }}
                          className="absolute inset-0 flex items-center justify-center bg-emerald-500/40 backdrop-blur-[2px]"
                        >
                          <Zap className="h-8 w-8 text-white drop-shadow-lg" />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <div className="absolute top-1.5 right-1.5 rounded-md bg-background/90 px-1.5 py-0.5 text-[11px] font-semibold shadow-sm backdrop-blur-sm">{npr(item.price)}</div>
                  <AnimatePresence>{inCart && (<motion.div className="absolute top-1.5 left-1.5 flex items-center gap-0.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-md px-1.5 py-0.5 text-xs font-bold shadow-sm" initial={{ scale: 0, x: -10 }} animate={{ scale: 1, x: 0 }} exit={{ scale: 0, x: -10 }} key="badge"><ShoppingCart className="h-3 w-3" /> {qty}</motion.div>)}</AnimatePresence>
                  <div className="p-2.5">
                    <h3 className="text-sm font-semibold truncate">
                      {q ? <HighlightText text={item.name} query={q} /> : item.name}
                    </h3>
                    <AnimatePresence>{inCart && (<motion.div className="flex items-center gap-1 mt-2" onClick={e => e.stopPropagation()} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                      <motion.button whileTap={{ scale: 0.9 }} onClick={() => updateQty(item.id, -1)} className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-border bg-card hover:bg-muted transition-colors"><Minus className="h-4 w-4" /></motion.button>
                      <span className="w-10 text-center text-sm font-bold tabular-nums">{qty}</span>
                      <motion.button whileTap={{ scale: 0.9 }} onClick={() => addToCart(item as any)} className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md bg-emerald-500 text-white hover:bg-emerald-600 transition-colors"><Plus className="h-4 w-4" /></motion.button>
                    </motion.div>)}</AnimatePresence>
                  </div>
                </motion.div>
              );
            })}
            </motion.div>
          </div>
        </motion.div>

        {/* ─── Cart Sidebar (Desktop) ─── */}
        <AnimatePresence mode="wait">
          {cartPanelOpen ? (
            <motion.aside key="cart" variants={slideIn} initial="hidden" animate="show" exit="exit"
              className="hidden lg:grid w-full max-w-sm xl:w-96 border-l border-emerald-200 dark:border-emerald-800/50 grid-rows-[auto_1fr_auto] min-h-0 overflow-hidden lg:backdrop-blur-xl lg:bg-card/70">
              <div className="p-4 border-b border-emerald-100 dark:border-emerald-900/30 bg-gradient-to-r from-emerald-50/50 to-transparent dark:from-emerald-950/10">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Current Order</h2>
                    <AnimatePresence>{totalNewCartItems > 0 && (<motion.span className="flex items-center justify-center min-w-[20px] h-5 rounded-full bg-emerald-500 text-[11px] font-bold text-white px-1.5" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} key={totalNewCartItems}>{totalNewCartItems}</motion.span>)}</AnimatePresence>
                  </div>
                  <div className="flex items-center gap-1">
                    {newCartItems.length > 0 && (<motion.button whileTap={{ scale: 0.9 }} onClick={clearCart} className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-xs text-destructive font-medium">Clear</motion.button>)}
                    <motion.button whileTap={{ scale: 0.9 }} onClick={() => setCartPanelOpen(false)} className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors"><ChevronRight className="h-4 w-4 text-muted-foreground" /></motion.button>
                  </div>
                </div>
                {customerName && (<motion.div className="flex items-center gap-2 rounded-lg bg-muted p-2" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                  <UserIcon className="h-4 w-4 text-emerald-400 shrink-0" /><div className="flex-1"><p className="text-sm font-medium">{customerName}</p></div>
                  <button onClick={() => setCustomerName('')}><X className="h-4 w-4 text-muted-foreground" /></button>
                </motion.div>)}
                {selectedTableInfo && (<motion.div className={`flex items-center gap-2 mt-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${posMode === 'tables' ? (selectedTableInfo.status === 'available' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/20') : 'bg-violet-50 text-violet-700 dark:bg-violet-950/20'}`} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}>
                  {posMode === 'tables' ? <Table2 className="h-4 w-4 shrink-0" /> : <BedDouble className="h-4 w-4 shrink-0" />}
                  <span>{posMode === 'tables' ? `Table ${(selectedTableInfo as any).table_number}` : `Room ${(selectedTableInfo as any).room_number || (selectedTableInfo as any).number}`}</span>
                  <span className="text-xs ml-auto capitalize">{selectedTableInfo.status}</span>
                </motion.div>)}
              </div>

              <div className="overflow-y-auto no-scrollbar min-h-0 p-5 space-y-4">                {activePreviousBatches.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                      Previous Batches
                      <span className="text-[10px] font-normal text-muted-foreground/60">({activePreviousBatches.length})</span>
                    </p>
                    {activePreviousBatches.map((batch, idx) => (
                      <div key={batch.id} className="rounded-lg border border-muted bg-muted/20 p-3 opacity-75">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <Lock className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                            <span className="text-xs font-bold text-foreground/60">
                              Order #{idx + 1}
                            </span>
                            <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider ${
                              batch.status === 'paid'
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                : batch.status === 'partial'
                                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                                  : 'bg-muted text-muted-foreground'
                            }`}>
                              {batch.status}
                            </span>
                          </div>
                        </div>
                        {/* Items for this batch */}
                        <div className="space-y-0.5 mb-1.5">
                          {batch.items.map(item => {
                            const isSettled = item.status === 'paid' || item.status === 'credit' || item.status === 'cancelled' || item.status === 'voided';
                            return (
                              <div key={item.id} className={`flex items-center justify-between text-xs transition-all duration-200 ${isSettled ? 'text-muted-foreground/30' : 'text-muted-foreground'}`}>
                                <div className="flex items-center gap-1.5 min-w-0">
                                  {item.status === 'voided' && (
                                    <span className="shrink-0 inline-flex items-center rounded bg-red-100 dark:bg-red-950/30 px-1 py-0.5 text-[9px] font-bold text-red-600 dark:text-red-400 uppercase leading-none">VOIDED</span>
                                  )}
                                  <span className={`truncate ${isSettled ? 'line-through text-muted-foreground/30' : ''}`}>{item.name} × {item.quantity}</span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className={`tabular-nums ${isSettled ? 'line-through text-muted-foreground/30' : ''}`}>{npr(item.unit_price * item.quantity)}</span>
                                  {!isSettled && (
                                    <button
                                      onClick={() => setVoidConfirm({ type: 'batch', batchId: batch.id, itemId: item.id, itemName: `${item.name} ×${item.quantity}` })}
                                      className="text-[10px] font-semibold text-red-500/60 hover:text-red-600 dark:hover:text-red-400 px-1.5 py-0.5 rounded-full hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                                    >
                                      Void
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex items-center justify-between border-t border-muted/50 pt-1">
                          <span className="text-[10px] font-medium text-muted-foreground/60">Subtotal</span>
                          <span className="text-xs font-semibold tabular-nums text-muted-foreground">{npr(batch.subtotal)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              <div className="mb-2">                     <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-2">Current Order</p>
                    {newCartItems.length > 0 ? (<motion.div layout className="space-y-2">{newCartItems.map(line => (
                      <motion.div key={line.menu_item_id} className="flex items-start gap-3 rounded-lg border border-emerald-200 dark:border-emerald-800/50 bg-card p-3 hover:bg-muted/30 transition-colors" layout initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20, height: 0, marginBottom: 0, padding: 0 }}>
                        <motion.div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-950/40 dark:to-emerald-900/20 flex items-center justify-center text-sm font-bold text-emerald-600 dark:text-emerald-400 shrink-0" key={line.quantity} initial={{ scale: 1.3 }} animate={{ scale: 1 }}>{line.quantity}</motion.div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium truncate">{line.name}</span>
                            <div className="flex items-center gap-2">
                              {line.status === 'voided' && (
                                <span className="inline-flex items-center gap-0.5 rounded-md bg-red-100 dark:bg-red-950/30 px-1.5 py-0.5 text-[10px] font-bold text-red-600 dark:text-red-400 uppercase">VOID</span>
                              )}
                              <span className="text-sm font-medium tabular-nums">{npr(line.unit_price * line.quantity)}</span>
                            </div>
                          </div>
                          {line.status === 'voided' ? (
                            <div className="flex items-center gap-1.5 mt-1.5">
                              <span className="text-[11px] text-red-500/70 dark:text-red-400/70 italic">🚫 Voided</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 mt-1.5">
                              <motion.button whileTap={{ scale: 0.9 }} onClick={() => updateQty(line.menu_item_id, -1)} className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-border hover:bg-muted transition-colors"><Minus className="h-4 w-4" /></motion.button>
                              <span className="text-sm font-bold w-10 text-center tabular-nums">{line.quantity}</span>
                              <motion.button whileTap={{ scale: 0.9 }} onClick={() => updateQty(line.menu_item_id, 1)} className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-border hover:bg-muted transition-colors"><Plus className="h-4 w-4" /></motion.button>
                              <input placeholder="Notes" value={line.notes} onChange={e => updateNotes(line.menu_item_id, e.target.value)} className="ml-auto min-h-[44px] w-full max-w-28 rounded-md border border-border bg-transparent px-2 text-[11px] outline-none focus:ring-1 focus:ring-ring" />
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => setVoidConfirm({ type: 'cart', menuItemId: line.menu_item_id, itemName: `${line.name} ×${line.quantity}` })}
                                  className="shrink-0 text-[11px] font-semibold text-red-500/60 hover:text-red-600 dark:hover:text-red-400 px-2 py-1 rounded-full hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                                >
                                  Void
                                </button>
                                <motion.button whileTap={{ scale: 0.9 }} onClick={() => removeItem(line.menu_item_id)} className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"><Trash2 className="h-4 w-4" /></motion.button>
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    ))}</motion.div>
                ) : (
                  <motion.div className="flex flex-col items-center justify-center py-12 text-muted-foreground" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <motion.div animate={{ y: [0, -5, 0] }} transition={{ duration: 2, repeat: Infinity }}><ShoppingCart className="h-10 w-10 mb-3 text-muted-foreground/30" /></motion.div>
                    <p className="text-sm">Cart is empty</p><p className="text-xs mt-1">Tap items to add them</p>
                  </motion.div>
                )}
              </div>
              </div>

              <div className="p-4 bg-card border-t border-border space-y-2">
                {/* Running total — previous batches (original) + current batch */}
                <div className="space-y-1">
                  {originalPreviousTotal > 0 && (
                    <div className="flex items-center justify-between text-xs text-muted-foreground/70">
                      <span>Previous batches</span>
                      <span className="tabular-nums">{npr(originalPreviousTotal)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between" key={newSubtotal}>
                    <span className="text-sm text-muted-foreground">{originalPreviousTotal > 0 ? 'Current batch' : 'Subtotal'}</span>
                    <span className="text-sm font-semibold tabular-nums">{npr(newSubtotal)}</span>
                  </div>
                  {voidedSummary.count > 0 && (
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] font-medium text-red-500/60 dark:text-red-400/60">Voided Items: {voidedSummary.count}</span>
                      <span className="text-[10px] font-medium tabular-nums text-red-500/60 dark:text-red-400/60 line-through">{npr(voidedSummary.amount)}</span>
                    </div>
                  )}
                  {totalRunning > 0 && (
                    <div className="flex items-center justify-between border-t border-border pt-1.5 mt-1">
                      <span className="text-xs font-bold uppercase text-foreground">Running Total</span>
                      <span className="text-base font-bold tabular-nums text-amber-600 dark:text-amber-400">{npr(totalRunning)}</span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {selectedTableId && (
                    <RequirePermission permission="payments.receive">
                      <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => setShowPayment(true)}
                        disabled={allUnpaidItemsForPayment.length === 0}
                        className="h-14 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-white text-sm font-semibold hover:from-amber-400 hover:to-amber-500 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-amber-500/20"><Receipt className="h-4 w-4" /> Pay Bill</motion.button>
                    </RequirePermission>
                  )}
                  <button onClick={() => navigate('/orders')} className="h-12 rounded-lg border-2 border-border text-sm font-medium hover:bg-muted transition-colors">View Bills</button>
                </div>

                {/* "Place Order" when no batches exist, "Create Another Order Batch" when batches exist */}
                <RequirePermission permission="orders.create">
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handlePlaceOrder} disabled={!selectedTableId || newCartItems.length === 0}
                    className="w-full h-14 rounded-xl bg-emerald-500 text-background font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-emerald-600 transition-all shadow-sm shadow-emerald-500/20">
                    {activePreviousBatches.length > 0 ? (
                      <>Create Another Order Batch</>
                    ) : (
                      <>Place Order ({totalNewCartItems})</>
                    )}
                  </motion.button>
                </RequirePermission>
              </div>
            </motion.aside>
          ) : (
            <motion.div key="collapsed" initial={{ width: 0, opacity: 0 }} animate={{ width: 48, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
              className="hidden lg:flex flex-col items-center py-4 gap-3 w-12 border-l border-border bg-card shrink-0">
              <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => setCartPanelOpen(true)}
                className="relative flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 text-white hover:from-emerald-400 hover:to-emerald-500 transition-all shadow-lg shadow-emerald-500/20">
                <ShoppingCart className="h-4 w-4" />
                <AnimatePresence>{totalNewCartItems > 0 && (<motion.span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[16px] h-4 rounded-full bg-emerald-500 text-[10px] font-bold text-white px-1 shadow-sm" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>{totalNewCartItems}</motion.span>)}</AnimatePresence>
              </motion.button>
              <ChevronLeft className="h-4 w-4 text-muted-foreground" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ─── Mobile Cart FAB ─── */}
      <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => setMobileCartOpen(true)}
        className="fixed bottom-20 right-4 z-40 lg:hidden flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/30">
        <ShoppingCart className="h-6 w-6" />
        <AnimatePresence>{totalNewCartItems > 0 && (<motion.span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[22px] h-5 rounded-full bg-emerald-500 text-[11px] font-bold text-white px-1.5 shadow-sm" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} key={totalNewCartItems}>{totalNewCartItems}</motion.span>)}</AnimatePresence>
      </motion.button>

      {/* ─── Mobile Cart Drawer ─── */}
      <AnimatePresence>{mobileCartOpen && (
        <motion.div className="fixed inset-0 z-50 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileCartOpen(false)}>
          <motion.div className="absolute inset-0 bg-black/50 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.div className="absolute bottom-0 left-0 right-0 max-h-[85vh] rounded-t-2xl bg-card shadow-2xl grid grid-rows-[auto_auto_1fr_auto] overflow-hidden"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} onClick={e => e.stopPropagation()}>
            <div className="flex justify-center pt-2 pb-0"><div className="w-10 h-1 rounded-full bg-muted-foreground/20" /></div>
            <div className="flex items-center justify-between p-4 border-b border-border bg-gradient-to-r from-emerald-50/50 to-transparent dark:from-emerald-950/10">
              <div className="flex items-center gap-2"><h2 className="text-base font-semibold">Cart</h2>{totalNewCartItems > 0 && <span className="flex items-center justify-center min-w-[22px] h-5 rounded-full bg-emerald-500 text-[11px] font-bold text-white px-1.5">{totalNewCartItems}</span>}</div>
              <button onClick={() => setMobileCartOpen(false)} className="p-1 hover:bg-muted rounded-lg transition-colors"><X className="h-5 w-5" /></button>
            </div>
            <div className="overflow-y-auto min-h-0 p-4 space-y-4">
              {activePreviousBatches.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    Previous Batches
                    <span className="text-[10px] font-normal text-muted-foreground/60">({activePreviousBatches.length})</span>
                  </p>
                  {activePreviousBatches.map((batch, idx) => (
                    <div key={batch.id} className="rounded-lg border border-muted bg-muted/20 p-3 opacity-75">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <Lock className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                          <span className="text-xs font-bold text-foreground/60">Order #{idx + 1}</span>
                          <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider ${
                            batch.status === 'paid'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                              : batch.status === 'partial'
                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                                : 'bg-muted text-muted-foreground'
                          }`}>{batch.status}</span>
                        </div>
                      </div>
                      <div className="space-y-0.5 mb-1.5">
                        {batch.items.map(item => {
                          const isSettled = item.status === 'paid' || item.status === 'credit' || item.status === 'cancelled' || item.status === 'voided';
                          return (
                            <div key={item.id} className={`flex items-center justify-between text-xs transition-all duration-200 ${isSettled ? 'text-muted-foreground/30' : 'text-muted-foreground'}`}>
                              <div className="flex items-center gap-1.5 min-w-0">
                                {item.status === 'voided' && (
                                  <span className="shrink-0 inline-flex items-center rounded bg-red-100 dark:bg-red-950/30 px-1 py-0.5 text-[9px] font-bold text-red-600 dark:text-red-400 uppercase leading-none">VOIDED</span>
                                )}
                                <span className={`truncate ${isSettled ? 'line-through text-muted-foreground/30' : ''}`}>{item.name} × {item.quantity}</span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className={`tabular-nums ${isSettled ? 'line-through text-muted-foreground/30' : ''}`}>{npr(item.unit_price * item.quantity)}</span>
                                {!isSettled && (
                                  <button
                                    onClick={() => setVoidConfirm({ type: 'batch', batchId: batch.id, itemId: item.id, itemName: `${item.name} ×${item.quantity}` })}
                                    className="text-[10px] font-semibold text-red-500/60 hover:text-red-600 dark:hover:text-red-400 px-1.5 py-0.5 rounded-full hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                                  >
                                    Void
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex items-center justify-between border-t border-muted/50 pt-1">
                        <span className="text-[10px] font-medium text-muted-foreground/60">Subtotal</span>
                        <span className="text-xs font-semibold tabular-nums text-muted-foreground">{npr(batch.subtotal)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {newCartItems.length > 0 ? (
                <motion.div layout className="space-y-2"><p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-2">Current Order</p>
                  {newCartItems.map(line => (<motion.div key={line.menu_item_id} className="flex items-start gap-3 rounded-lg border border-emerald-200 dark:border-emerald-800/50 bg-card p-3 hover:bg-muted/30 transition-colors" layout initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-950/40 dark:to-emerald-900/20 flex items-center justify-center text-sm font-bold text-emerald-600 shrink-0">{line.quantity}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium truncate">{line.name}</span>
                        <div className="flex items-center gap-2">
                          {line.status === 'voided' && (
                            <span className="inline-flex items-center gap-0.5 rounded-md bg-red-100 dark:bg-red-950/30 px-1.5 py-0.5 text-[10px] font-bold text-red-600 dark:text-red-400 uppercase">VOID</span>
                          )}
                          <span className="text-sm font-medium tabular-nums">{npr(line.unit_price * line.quantity)}</span>
                        </div>
                      </div>
                      {line.status === 'voided' ? (
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <span className="text-[11px] text-red-500/70 dark:text-red-400/70 italic">🚫 Voided</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <button onClick={() => updateQty(line.menu_item_id, -1)} className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-border hover:bg-muted transition-colors"><Minus className="h-4 w-4" /></button>
                          <span className="text-sm font-bold w-10 text-center tabular-nums">{line.quantity}</span>
                          <button onClick={() => updateQty(line.menu_item_id, 1)} className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-border hover:bg-muted transition-colors"><Plus className="h-4 w-4" /></button>
                          <input placeholder="Notes" value={line.notes} onChange={e => updateNotes(line.menu_item_id, e.target.value)} className="ml-auto min-h-[44px] w-full max-w-28 rounded-md border border-border bg-transparent px-2 text-[11px] outline-none focus:ring-1 focus:ring-ring" />                           <div className="flex items-center gap-1">
                              <button
                                onClick={() => setVoidConfirm({ type: 'cart', menuItemId: line.menu_item_id, itemName: `${line.name} ×${line.quantity}` })}
                                className="shrink-0 text-[11px] font-semibold text-red-500/60 hover:text-red-600 dark:hover:text-red-400 px-2 py-1 rounded-full hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                              >
                                Void
                              </button>
                              <motion.button whileTap={{ scale: 0.9 }} onClick={() => removeItem(line.menu_item_id)} className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"><Trash2 className="h-4 w-4" /></motion.button>
                            </div>
                        </div>
                      )}
                    </div>
                  </motion.div>))}
                </motion.div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground"><ShoppingCart className="h-10 w-10 mb-3 text-muted-foreground/30" /><p className="text-sm">Cart is empty</p><p className="text-xs mt-1">Tap items to add them</p></div>
              )}
            </div>
            <div className="p-4 bg-card border-t border-border space-y-2">
              {/* Running total — unpaid items across previous batches + current cart */}
              <div className="space-y-1">
                {originalPreviousTotal > 0 && (
                  <div className="flex items-center justify-between text-xs text-muted-foreground/70">
                    <span>Previous batches</span>
                    <span className="tabular-nums">{npr(originalPreviousTotal)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{originalPreviousTotal > 0 ? 'Current batch' : 'Subtotal'}</span>
                  <span className="text-sm font-semibold tabular-nums">{npr(newSubtotal)}</span>
                </div>
                {totalRunning > 0 && (
                  <div className="flex items-center justify-between border-t border-border pt-1.5 mt-1">
                    <span className="text-xs font-bold uppercase text-foreground">Running Total</span>
                    <span className="text-base font-bold tabular-nums text-amber-600 dark:text-amber-400">{npr(totalRunning)}</span>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {selectedTableId && (<button onClick={() => setShowPayment(true)} disabled={allUnpaidItemsForPayment.length === 0} className="h-14 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-white text-sm font-semibold hover:from-amber-400 hover:to-amber-500 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99] shadow-sm"><Receipt className="h-4 w-4" /> Pay Bill</button>)}
                <button onClick={() => navigate('/orders')} className="h-12 rounded-lg border-2 border-border text-sm font-medium hover:bg-muted transition-colors">View Bills</button>
              </div>
              <button onClick={handlePlaceOrder} disabled={!selectedTableId || newCartItems.length === 0} className="w-full h-14 rounded-xl bg-emerald-500 text-background font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-emerald-600 transition-all active:scale-[0.99] shadow-sm">                    {activePreviousBatches.length > 0 ? (
                      <>Create Another Order Batch</>
                    ) : (
                      <>Place Order ({totalNewCartItems})</>
                    )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}</AnimatePresence>

      {/* ─── Payment Dialog ─── */}
      {showPayment && (
        <PosPaymentDialog orderId={`ord-${Date.now()}`} unpaidItems={allUnpaidItemsForPayment}
          customerName={customerName || undefined} selectedTableId={selectedTableId}
          isRoomPayment={posMode === 'rooms'}
          onClose={() => setShowPayment(false)} onComplete={(invNum, result) => handlePaymentComplete(result)} />
      )}

      {/* ─── Keyboard Shortcuts Modal ─── */}
      <AnimatePresence>{showShortcuts && (
        <motion.div className="fixed inset-0 z-[60] flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowShortcuts(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <motion.div className="relative bg-card rounded-2xl shadow-2xl border border-border p-6 max-w-sm w-full" variants={scaleIn} initial="hidden" animate="show" exit="hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-bold flex items-center gap-2"><Keyboard className="h-5 w-5 text-emerald-500" />Keyboard Shortcuts</h3><button onClick={() => setShowShortcuts(false)} className="p-1 hover:bg-muted rounded-lg"><X className="h-4 w-4" /></button></div>
            <div className="space-y-2 text-sm">{[['/', 'Focus search'],['Esc', 'Clear / Close'],['C', 'Toggle cart'],['? (Shift+)', 'Toggle shortcuts']].map(([key, desc]) => (
              <div key={key} className="flex items-center justify-between"><span className="text-muted-foreground">{desc}</span><kbd className="px-2 py-0.5 rounded bg-muted text-xs font-mono border border-border">{key}</kbd></div>
            ))}</div>
          </motion.div>
        </motion.div>
      )}</AnimatePresence>
    
      {/* ─── Void confirmation dialog ─── */}
      <AnimatePresence>
        {voidConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50"
              onClick={() => setVoidConfirm(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="relative bg-background border rounded-xl shadow-2xl p-6 max-w-sm w-full"
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 p-2.5 rounded-full bg-red-100 dark:bg-red-950/30">
                  <Ban className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold">Void Item</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Are you sure you want to void &ldquo;{voidConfirm.itemName}&rdquo;?
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setVoidConfirm(null)}
                  className="px-5 py-2.5 text-sm font-medium text-muted-foreground bg-muted rounded-lg hover:bg-muted/80 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (voidConfirm.type === 'batch') {
                      voidBatchItem(voidConfirm.batchId, voidConfirm.itemId);
                    } else {
                      voidCartItem(voidConfirm.menuItemId);
                    }
                    setVoidConfirm(null);
                  }}
                  className="px-5 py-2.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors shadow-sm"
                >
                  Void Item
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
</PageTransition>
  );
}
