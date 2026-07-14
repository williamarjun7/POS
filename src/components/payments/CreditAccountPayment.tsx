import { useState, useMemo, useEffect } from 'react';
import { ArrowLeft, Search, X, User, CreditCard, Plus, Loader2 } from 'lucide-react';
import { useCustomerBalance } from '@/lib/services/customer-ledger';
import { insforge } from '@/lib/services/auth-service';

interface MockCustomer {
  id: string;
  name: string;
  phone: string | null;
}

const npr = (amount: number) =>
  `Rs. ${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`;

interface CustomerBalanceRowProps {
  customer: MockCustomer;
  onSelect: (customer: MockCustomer) => void;
}

function CustomerBalanceRow({ customer, onSelect }: CustomerBalanceRowProps) {
  const balance = useCustomerBalance(customer.name);
  return (
    <button
      key={customer.id}
      onClick={() => onSelect(customer)}
      className="w-full flex items-center gap-3 p-3 rounded-xl border border-border hover:border-purple-400 hover:bg-purple-50/50 dark:hover:bg-purple-950/10 transition-all text-left"
    >
      <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
        <User className="h-5 w-5 text-purple-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{customer.name}</p>
        {customer.phone && <p className="text-xs text-muted-foreground">{customer.phone}</p>}
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs text-muted-foreground">Outstanding</p>
        <p className={`text-sm font-semibold tabular-nums ${balance > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
          {npr(balance)}
        </p>
      </div>
    </button>
  );
}

interface CreditAccountPaymentProps {
  grandTotal: number;
  onBack: () => void;
  onPay: (customerId: string, customerName: string) => void;
  submitting: boolean;
}

export function CreditAccountPayment({ grandTotal, onBack, onPay, submitting }: CreditAccountPaymentProps) {
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<MockCustomer | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [creating, setCreating] = useState(false);
  const [nameError, setNameError] = useState('');
  const [customersList, setCustomersList] = useState<MockCustomer[]>([]);

  // Fetch real customers from DB on mount
  useEffect(() => {
    let cancelled = false;
    insforge.database
      .from('customers')
      .select('id, name, phone')
      .order('name', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error && data) {
          setCustomersList(data as MockCustomer[]);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const selectedBalance = useCustomerBalance(selectedCustomer?.name ?? '');

  const filtered = useMemo(() => {
    if (!search) return [];
    return customersList.filter(c =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.phone && c.phone.includes(search))
    ).slice(0, 10);
  }, [search, customersList]);

  const handleSelect = (customer: MockCustomer) => {
    setSelectedCustomer(customer);
    setSearch('');
  };

  const handlePay = () => {
    if (selectedCustomer) {
      onPay(selectedCustomer.id, selectedCustomer.name);
    }
  };

  const handleCreateCustomer = async () => {
    if (!newName.trim()) { setNameError('Name is required'); return; }
    setCreating(true);
    await new Promise(resolve => setTimeout(resolve, 800));
    setSelectedCustomer({
      id: `cust-new-${Date.now()}`,
      name: newName.trim(),
      phone: newPhone.trim() || null,
    });
    setShowAddModal(false);
    setCreating(false);
    setNewName('');
    setNewPhone('');
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h2 className="text-lg font-semibold">Credit Account</h2>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Bill Total</span>
            <span className="text-2xl font-bold tabular-nums">{npr(grandTotal)}</span>
          </div>
        </div>

        {!selectedCustomer ? (
          <>
            <div>
              <label className="text-sm font-medium mb-2 block">Search Customer</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search by name or phone..."
                  className="w-full h-12 rounded-xl border border-border bg-transparent pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500"
                  autoFocus
                />
              </div>
            </div>
            {filtered.length > 0 && (
              <div className="space-y-1.5">
                {filtered.map(customer => (
                  <CustomerBalanceRow key={customer.id} customer={customer} onSelect={handleSelect} />
                ))}
              </div>
            )}
            {search && filtered.length === 0 && (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground mb-4">No customers found matching "{search}"</p>
                <button onClick={() => setShowAddModal(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-500 hover:bg-purple-600 text-white text-sm font-semibold transition-colors">
                  <Plus className="h-4 w-4" /> Add New Customer
                </button>
              </div>
            )}
            {!search && (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground mb-4">Start typing to search for a customer</p>
                <button onClick={() => setShowAddModal(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-500 hover:bg-purple-600 text-white text-sm font-semibold transition-colors">
                  <Plus className="h-4 w-4" /> Add New Customer
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-xl bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                  <User className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="font-semibold text-sm">{selectedCustomer.name}</p>
                  {selectedCustomer.phone && <p className="text-xs text-muted-foreground">Phone: {selectedCustomer.phone}</p>}
                </div>
              </div>
              <button onClick={() => setSelectedCustomer(null)} className="p-1 rounded hover:bg-purple-200/50 dark:hover:bg-purple-800/50">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="rounded-xl border border-border p-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Outstanding Balance</span>
                <span className={`font-semibold tabular-nums ${selectedBalance > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {npr(selectedBalance)}
                </span>
              </div>
              <hr className="border-border" />
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Bill Amount</span>
                <span className="font-bold tabular-nums">{npr(grandTotal)}</span>
              </div>
              {selectedBalance > 0 && (
                <p className="text-xs text-muted-foreground">
                  After this charge: <strong className="text-amber-600">{npr(selectedBalance + grandTotal)}</strong>
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="p-4 border-t shrink-0 space-y-2">
        <button onClick={handlePay} disabled={!selectedCustomer || submitting}
          className="w-full h-14 rounded-xl bg-gradient-to-r from-purple-500 to-purple-600 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:from-purple-400 hover:to-purple-500 transition-all active:scale-[0.99] shadow-sm">
          {submitting ? <><Loader2 className="h-5 w-5 animate-spin" /> Processing...</> :
           !selectedCustomer ? <><User className="h-5 w-5" /> Select a Customer</> :
           <><CreditCard className="h-5 w-5" /> Complete Credit Sale</>}
        </button>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-xl border bg-background shadow-lg p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold">Add Credit Customer</h3>
              <button onClick={() => setShowAddModal(false)} className="min-h-[44px] min-w-[44px] flex items-center justify-center">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  Customer Name <span className="text-destructive">*</span>
                </label>
                <input type="text" value={newName} onChange={e => { setNewName(e.target.value); setNameError(''); }}
                  placeholder="e.g. Prabin"
                  className={`w-full h-11 rounded-xl border ${nameError ? 'border-destructive' : 'border-border'} bg-transparent px-4 text-sm outline-none focus:ring-2 focus:ring-purple-500/30`}
                  autoFocus />
                {nameError && <p className="text-xs text-destructive mt-1">{nameError}</p>}
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  Phone Number <span className="text-xs text-muted-foreground font-normal">(Optional)</span>
                </label>
                <input type="tel" value={newPhone} onChange={e => setNewPhone(e.target.value)}
                  placeholder="e.g. 98XXXXXXXX"
                  className="w-full h-11 rounded-xl border border-border bg-transparent px-4 text-sm outline-none focus:ring-2 focus:ring-purple-500/30" />
              </div>
            </div>
            <div className="mt-6">
              <button onClick={handleCreateCustomer} disabled={creating}
                className="w-full h-12 rounded-xl bg-gradient-to-r from-purple-500 to-purple-600 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:from-purple-400 hover:to-purple-500 transition-all">
                {creating ? <><Loader2 className="h-5 w-5 animate-spin" /> Creating...</> : 'Create Customer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
