/**
 * CustomerProfile — Visit-Centric Customer Profile Panel
 * ──────────────────────────────────────────────────────
 *
 * Orchestration layer. Individual tabs are extracted into
 * CustomerProfile/tabs/ and ProfileHeader is in CustomerProfile/ProfileHeader.tsx.
 *
 * Tab Structure:
 *   Overview      — Analytics + recent visits + payment breakdown
 *   Visit History — Chronological visits with expandable details + bill preview
 *   Invoices      — Full invoice history
 *   Payments      — Full payment history
 *   Ledger        — Financial ledger
 *   Timeline      — Chronological activity feed
 */

import { useState, useMemo, useEffect, useCallback, useRef } from "react"
import { Wallet, Users } from "lucide-react"
import { ProfileSkeleton } from "@/components/customers/CustomerProfile/ProfileSkeleton"
import { ProfileHeader } from "@/components/customers/CustomerProfile/ProfileHeader"
import { OverviewTab } from "@/components/customers/CustomerProfile/tabs/OverviewTab"
import { InvoicesTab } from "@/components/customers/CustomerProfile/tabs/InvoicesTab"
import { PaymentsTab } from "@/components/customers/CustomerProfile/tabs/PaymentsTab"
import { LedgerTab } from "@/components/customers/CustomerProfile/tabs/LedgerTab"
import { Tabs, type Tab } from "@/components/Tabs"
import { insforge } from "@/lib/services/auth-service"
import type { Customer } from "@/lib/services/customer-service"
import type { InvoiceRow, PaymentRow, OrderBatchRow, OrderBatchItemRow, InvoiceItemRow } from "@/lib/db/types"
import { getPaymentMethodLabel } from "@/lib/payment-methods"
import { useCustomerLedgerData } from "@/lib/services/customer-aggregation"
import type { CustomerLedgerEntry } from "@/lib/services/customer-aggregation"
import { VisitHistory } from "@/components/customers/VisitHistory"
import { CustomerTimeline } from "@/components/customers/CustomerTimeline"
import { buildVisits, type CustomerVisit } from "@/components/customers/VisitHistory"
import { buildTimelineEvents, type TimelineEvent } from "@/components/customers/CustomerTimeline"
import { BillPreview } from "@/components/customers/BillPreview"

/* ─── Types (shared across tabs) ──────────────────────────── */

export interface CustomerOrder {
  id: string; orderNumber: string; date: string; tableRoom?: string
  itemsCount: number; grandTotal: number; payStatus: string; status: string
  items: CustomerOrderItem[]; discount: number; paidAmount: number; customerName?: string
}

export interface CustomerOrderItem {
  name: string; quantity: number; unitPrice: number; notes: string; status: string
  servingType?: 'dine_in' | 'takeaway'
  packagingFee?: number
}

export interface CustomerInvoice {
  id: string; invoiceNumber: string; date: string
  amount: number; paid: number; remaining: number; status: string; paymentMethod: string
}

export interface CustomerPayment {
  id: string; date: string; method: string; amount: number
  reference: string; relatedInvoice: string; status: string; notes?: string
}

export interface LedgerEntry {
  id: string; date: string; description: string
  debit: number; credit: number; runningBalance: number; type: 'invoice' | 'payment' | 'adjustment' | 'refund'
}

/* ─── Data Fetching Hook ───────────────────────────────────── */

interface EnhancedProfileData {
  orders: CustomerOrder[]; invoices: CustomerInvoice[]; payments: CustomerPayment[]
  ledger: LedgerEntry[]; visits: CustomerVisit[]; timelineEvents: TimelineEvent[]
  rawInvoices: any[]; rawPayments: any[]; rawInvoiceItems: any[]
  currentBalance: number; loading: boolean; error: string | null
}

function useCustomerProfileData(customer: Customer | null, _refreshKey: number = 0): EnhancedProfileData {
  const [orders, setOrders] = useState<CustomerOrder[]>([])
  const [invoices, setInvoices] = useState<CustomerInvoice[]>([])
  const [payments, setPayments] = useState<CustomerPayment[]>([])
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [visits, setVisits] = useState<CustomerVisit[]>([])
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([])
  const [rawInvoices, setRawInvoices] = useState<any[]>([])
  const [rawPayments, setRawPayments] = useState<PaymentRow[]>([])
  const [rawInvoiceItems, setRawInvoiceItems] = useState<any[]>([])
  const [currentBalance, setCurrentBalance] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const prevCustomerIdRef = useRef<string | null>(null)

  const ledgerData = useCustomerLedgerData(customer?.id)

  const fetchData = useCallback(async () => {
    if (!customer) {
      setOrders([]); setInvoices([]); setPayments([]); setLedger([])
      setVisits([]); setTimelineEvents([]); setRawInvoices([])
      setRawPayments([]); setRawInvoiceItems([]); setCurrentBalance(0)
      setLoading(false)
      return
    }

    if (prevCustomerIdRef.current !== customer.id) {
      prevCustomerIdRef.current = customer.id
      setOrders([]); setInvoices([]); setPayments([]); setLedger([])
      setVisits([]); setTimelineEvents([]); setRawInvoices([])
      setRawPayments([]); setRawInvoiceItems([]); setCurrentBalance(0)
      setError(null); setLoading(true)
    }

    setLoading(true)
    setError(null)

    try {
      const customerName = customer.name
      const customerId = customer.id

      const [ordersResult, invoicesResult] = await Promise.all([
        insforge.database
          .from('order_batches')
          .select('*, order_batch_items(*), restaurant_tables!order_batches_table_id_fkey!left(table_number)')
          .or(`customer_id.eq.${customerId},customer_name.eq.${customerName}`)
          .order('created_at', { ascending: false })
          .limit(200),
        insforge.database
          .from('invoices')
          .select('*')
          .or(`customer_id.eq.${customerId},customer_name.eq.${customerName}`)
          .order('created_at', { ascending: false })
          .limit(200),
      ])

      const invoiceRows = (invoicesResult.data ?? []) as InvoiceRow[]
      const customerInvoiceIds = invoiceRows.map((inv: InvoiceRow) => inv.id)

      let invItemRows: InvoiceItemRow[] = []
      if (customerInvoiceIds.length > 0) {
        const itemsResult = await insforge.database
          .from('invoice_items').select('*')
          .in('invoice_id', customerInvoiceIds)
          .limit(500)
        invItemRows = (itemsResult.data ?? []) as InvoiceItemRow[]
      }

      const paymentFilters = [`customer_id.eq.${customerId}`]
      if (customerInvoiceIds.length > 0) {
        paymentFilters.push(`invoice_id.in.(${customerInvoiceIds.join(',')})`)
      }
      const paymentsResponse = await insforge.database
        .from('payments').select('*')
        .or(paymentFilters.join(','))
        .order('created_at', { ascending: false })
        .limit(200)

      const paymentsData = (paymentsResponse as { data: PaymentRow[] | null }).data ?? []
      const paymentRows = paymentsData as PaymentRow[]
      setRawPayments(paymentRows)

      const paidByInvoice = new Map<string, number>()
      for (const p of paymentRows) {
        if (p.invoice_id) {
          paidByInvoice.set(p.invoice_id, (paidByInvoice.get(p.invoice_id) ?? 0) + Number(p.amount))
        }
      }

      setPayments(paymentRows.map(p => ({
        id: p.id, date: p.created_at, method: p.payment_method, amount: Number(p.amount),
        reference: p.reference ?? '', relatedInvoice: p.invoice_id ? `INV-${p.invoice_id.slice(0, 8).toUpperCase()}` : '-',
        status: 'completed', notes: p.notes ?? undefined,
      })))

      setRawInvoices(invoiceRows)
      setInvoices(invoiceRows.map(inv => {
        const invPaid = paidByInvoice.get(inv.id) ?? 0
        return {
          id: inv.id, invoiceNumber: inv.invoice_number, date: inv.created_at, amount: Number(inv.total),
          paid: inv.status === 'paid' || invPaid >= Number(inv.total) ? Number(inv.total) : invPaid,
          remaining: Math.max(0, Number(inv.total) - invPaid), status: inv.status,
          paymentMethod: inv.payment_method ?? 'cash',
        }
      }))

      type BatchWithJoin = OrderBatchRow & {
        order_batch_items?: OrderBatchItemRow[]
        restaurant_tables?: { table_number: string } | null
      }
      const batchRows = (ordersResult.data ?? []) as BatchWithJoin[]
      setOrders(batchRows.map(batch => {
        const items = (batch.order_batch_items ?? []).map(item => ({
          name: item.name, quantity: item.quantity, unitPrice: Number(item.unit_price),
          notes: item.notes, status: item.status,
          servingType: (item.serving_type ?? 'dine_in') as 'dine_in' | 'takeaway',
          packagingFee: Number(item.packaging_fee ?? 0),
        }))
        const tableLabel = batch.restaurant_tables?.table_number
          ? `Table ${batch.restaurant_tables.table_number}`
          : batch.room_id ? `Room ${batch.room_id.slice(0, 8).toUpperCase()}` : undefined
        return {
          id: batch.id, orderNumber: `ORD-${batch.id.slice(0, 8).toUpperCase()}`, date: batch.created_at,
          tableRoom: tableLabel, itemsCount: items.length, grandTotal: Number(batch.subtotal),
          payStatus: batch.status === 'paid' ? 'paid' : batch.status === 'partial' ? 'partial' : 'unpaid',
          status: batch.status, items, discount: Number(batch.discount), paidAmount: Number(batch.paid_amount),
          customerName: batch.customer_name ?? undefined,
        }
      }))

      setRawInvoiceItems(invItemRows)
      const computedVisits = buildVisits({ invoices: invoiceRows, orders: batchRows, payments: paymentRows, invoiceItems: invItemRows })
      setVisits(computedVisits)

      const createdDate = customer?.id
        ? invoiceRows.length > 0
          ? invoiceRows.reduce((earliest, inv) =>
              new Date(inv.created_at).getTime() < new Date(earliest).getTime() ? inv : earliest, invoiceRows[0]).created_at
          : customer.lastVisit
        : new Date().toISOString()

      setTimelineEvents(buildTimelineEvents(createdDate, computedVisits))

      if (ledgerData && ledgerData.entries.length > 0) {
        const converted: LedgerEntry[] = ledgerData.entries.map((entry: CustomerLedgerEntry) => ({
          id: entry.id, date: entry.date, description: entry.description,
          debit: entry.type === 'charge' ? entry.amount : 0, credit: entry.type === 'payment' ? entry.amount : 0,
          runningBalance: 0, type: entry.type === 'charge' ? 'invoice' : 'payment' as const,
        }))
        converted.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        let balance = 0
        for (const entry of converted) { balance += entry.debit - entry.credit; entry.runningBalance = balance }
        converted.reverse()
        setLedger(converted)
        setCurrentBalance(Math.max(0, balance))
      } else {
        const ledgerEntries: LedgerEntry[] = []
        for (const inv of invoiceRows) {
          ledgerEntries.push({
            id: `inv-${inv.id}`, date: inv.created_at,
            description: inv.status === 'credit_invoice' ? `Credit Sale — Invoice ${inv.invoice_number}` : `Invoice ${inv.invoice_number}`,
            debit: Number(inv.total), credit: 0, runningBalance: 0, type: 'invoice',
          })
        }
        for (const p of paymentRows) {
          if (p.payment_method === 'credit') continue
          ledgerEntries.push({
            id: `pay-${p.id}`, date: p.created_at,
            description: p.notes ?? `Payment via ${getPaymentMethodLabel(p.payment_method)}`,
            debit: 0, credit: Number(p.amount), runningBalance: 0, type: 'payment',
          })
        }
        ledgerEntries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        let balance = 0
        for (const entry of ledgerEntries) { balance += entry.debit - entry.credit; entry.runningBalance = balance }
        ledgerEntries.reverse()
        setLedger(ledgerEntries)
        setCurrentBalance(Math.max(0, balance))
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load customer data'
      setError(msg)
      if (import.meta.env.DEV) console.error('[CustomerProfile] fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [customer, ledgerData])

  useEffect(() => { fetchData() }, [fetchData])

  return { orders, invoices, payments, ledger, visits, timelineEvents, rawInvoices, rawPayments, rawInvoiceItems, currentBalance, loading, error }
}

/* ══════════════════════════════════════════════════════════════
   MAIN EXPORT
   ══════════════════════════════════════════════════════════════ */

interface CustomerProfileProps {
  customer: Customer | null; open: boolean; onClose: () => void; onEdit: () => void
  onNewSale: () => void; onRecordPayment: (customerId: string) => void
  isMobile?: boolean; refreshKey?: number
}

function ErrorState({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="flex flex-col items-center gap-4 text-center max-w-xs">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
          <Wallet className="h-7 w-7 text-destructive" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">Error loading data</h3>
          <p className="text-sm text-muted-foreground mt-1">{message}</p>
        </div>
        <button onClick={onClose} className="rounded-xl bg-muted px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted/80 transition-colors">Go back</button>
      </div>
    </div>
  )
}

export function CustomerProfile({
  customer, open: _open, onClose, onEdit, onNewSale, onRecordPayment, refreshKey = 0,
}: CustomerProfileProps) {
  const [activeTab, setActiveTab] = useState("overview")
  const [billPreviewVisit, setBillPreviewVisit] = useState<CustomerVisit | null>(null)

  const { orders, invoices, payments, ledger, visits, timelineEvents, currentBalance, loading, error } =
    useCustomerProfileData(customer, refreshKey)

  const tabs: Tab[] = useMemo(() => {
    const realPaymentCount = payments.filter(p => p.method !== 'credit').length
    const showCounts = !loading
    return [
      { id: "overview", label: "Overview" },
      { id: "visits", label: showCounts ? `Visits (${visits.length})` : "Visits" },
      { id: "invoices", label: showCounts ? `Invoices (${invoices.length})` : "Invoices" },
      { id: "payments", label: showCounts ? `Payments (${realPaymentCount})` : "Payments" },
      { id: "ledger", label: showCounts ? `Ledger (${ledger.length})` : "Ledger" },
      { id: "timeline", label: "Timeline" },
    ]
  }, [visits.length, invoices.length, payments.length, ledger.length, loading])

  if (!customer) {
    return (
      <div className="flex h-full min-h-[400px] items-center justify-center p-8">
        <div className="flex flex-col items-center gap-4 text-center max-w-xs">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
            <Users className="h-8 w-8 text-muted-foreground/40" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">Select a customer</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Choose a customer from the list to view their invoices, payments, and activity.
          </p>
        </div>
      </div>
    )
  }

  if (loading && orders.length === 0 && invoices.length === 0) return <ProfileSkeleton />

  return (
    <div className="flex h-full flex-col bg-card rounded-2xl border border-border shadow-xl">
      <div className="flex-1 overflow-y-auto no-scrollbar">
        {/* Sticky header inside the scrollable container */}
        <ProfileHeader customer={customer} visits={visits} onClose={onClose} onEdit={onEdit}
          onNewSale={onNewSale} onRecordPayment={() => onRecordPayment(customer.id)} sticky={true} />

        <div className="sticky top-0 z-10 bg-card border-b border-border px-4 pb-1 pt-0">
          <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
        </div>
        {error && !loading && <ErrorState message={error} onClose={onClose} />}

        {!error && activeTab === "overview" && (
          <OverviewTab visits={visits} invoices={invoices} payments={payments} orders={orders}
            loading={loading} customerCreatedAt={customer?.lastVisit} onViewBill={setBillPreviewVisit} />
        )}
        {!error && activeTab === "visits" && (
          <div className="p-5 pt-4"><VisitHistory visits={visits} loading={loading} showDateFilter={true} /></div>
        )}
        {!error && activeTab === "invoices" && (
          <InvoicesTab invoices={invoices} visits={visits} loading={loading} onViewBill={setBillPreviewVisit} customerId={customer.id} />
        )}
        {!error && activeTab === "payments" && (
          <PaymentsTab payments={payments} loading={loading} customerId={customer.id} />
        )}
        {!error && activeTab === "ledger" && (
          <LedgerTab ledger={ledger} loading={loading} currentBalance={currentBalance} />
        )}
        {!error && activeTab === "timeline" && (
          <div className="p-5 pt-4"><CustomerTimeline events={timelineEvents} loading={loading} /></div>
        )}
      </div>

      {billPreviewVisit && <BillPreview visit={billPreviewVisit} onClose={() => setBillPreviewVisit(null)} />}
    </div>
  )
}
