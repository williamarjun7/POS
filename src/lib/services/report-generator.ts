/**
 * Report Generator Service
 * ──────────────────────────
 * Generates real CSV/HTML exports from live DB data for each report card.
 * Uses the existing `exportCsv` helper for CSV and an HTML-based approach for PDF.
 */

import { db, insforge } from '@/lib/db/insforge'
import type {
  PaymentRow,
  InvoiceRow,
  CustomerRow,
  InventoryItemRow,
  RoomRow,
  BookingRow,
  MenuItemRow,
  MenuCategoryRow,
} from '@/lib/db/types'

type ReportFormat = 'PDF' | 'Excel' | 'CSV'

interface GenerateParams {
  reportId: string
  reportTitle: string
  format: ReportFormat
  startDate?: string
  endDate?: string
}

function triggerDownload(data: { title: string; headers: string[]; rows: string[][] }, filename: string, format: ReportFormat) {
  if (format === 'PDF') {
    // Open print-friendly HTML for the user to print/save as PDF
    const rowsHtml = data.rows
      .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
      .join('\n')
    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${data.title}</title>
<style>
  body { font-family: 'Segoe UI', sans-serif; margin: 40px; color: #1a1a1a; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .meta { font-size: 12px; color: #666; margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #f3f4f6; text-align: left; padding: 8px 10px; border-bottom: 2px solid #d1d5db; font-weight: 600; }
  td { padding: 6px 10px; border-bottom: 1px solid #e5e7eb; }
  @media print { body { margin: 20px; } }
</style></head>
<body>
  <h1>${data.title}</h1>
  <p class="meta">Generated on ${new Date().toLocaleString()}</p>
  <table><thead><tr>${data.headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
  <tbody>${rowsHtml}</tbody></table>
  <script>window.print()</script>
</body></html>`
    const blob = new Blob([html], { type: 'text/html;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    window.open(url)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return
  }

  const ext = 'csv'
  const csvContent = [
    data.headers.join(','),
    ...data.rows.map((r) =>
      r.map((c) => (typeof c === 'string' && c.includes(',') ? `"${c}"` : c)).join(',')
    ),
  ].join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `${filename}.${ext}`
  link.click()
  URL.revokeObjectURL(link.href)
}

// ─── Date helpers ───────────────────────────────────────────

function startOfDay(offset = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function startOfWeek(): string {
  const d = new Date()
  d.setDate(d.getDate() - d.getDay())
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function startOfMonth(): string {
  const d = new Date()
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function fmtCurrency(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── Report Handlers ────────────────────────────────────────

async function dailySalesReport(params: GenerateParams) {
  const from = params.startDate ? `${params.startDate}T00:00:00Z` : startOfDay()
  const [paymentsRes, invoicesRes] = await Promise.all([
    insforge.database
      .from('payments')
      .select('*')
      .gte('created_at', from),
    insforge.database
      .from('invoices')
      .select('*')
      .gte('created_at', from),
  ])
  const payments = ((paymentsRes as any).data ?? []) as PaymentRow[]
  const invoices = ((invoicesRes as any).data ?? []) as InvoiceRow[]

  const rows: string[][] = []
  for (const inv of invoices) {
    rows.push([inv.invoice_number, inv.customer_name, fmtDate(inv.created_at), inv.status, fmtCurrency(inv.total)])
  }
  for (const pmt of payments) {
    rows.push([`Payment #${pmt.id.slice(0, 8)}`, pmt.reference || '-', fmtDate(pmt.created_at), pmt.payment_method, fmtCurrency(pmt.amount)])
  }

  triggerDownload(
    { title: params.reportTitle, headers: ['Invoice', 'Customer', 'Date', 'Status', 'Amount'], rows },
    `daily-sales-${new Date().toISOString().slice(0, 10)}`,
    params.format,
  )
}

async function weeklySalesSummary(params: GenerateParams) {
  const from = params.startDate ? `${params.startDate}T00:00:00Z` : startOfWeek()
  const { data } = await insforge.database
    .from('payments')
    .select('*')
    .gte('created_at', from)
  const payments = (data ?? []) as PaymentRow[]
  const grouped: Record<string, { count: number; total: number }> = {}
  for (const p of payments) {
    const day = new Date(p.created_at).toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' })
    if (!grouped[day]) grouped[day] = { count: 0, total: 0 }
    grouped[day].count++
    grouped[day].total += p.amount
  }
  const rows = Object.entries(grouped).map(([day, d]) => [day, String(d.count), fmtCurrency(d.total)])
  triggerDownload(
    { title: params.reportTitle, headers: ['Day', 'Transactions', 'Total'], rows },
    `weekly-sales-${new Date().toISOString().slice(0, 10)}`,
    params.format,
  )
}

async function monthlySalesReport(params: GenerateParams) {
  const from = params.startDate ? `${params.startDate}T00:00:00Z` : startOfMonth()
  const { data } = await insforge.database
    .from('payments')
    .select('*')
    .gte('created_at', from)
  const payments = (data ?? []) as PaymentRow[]
  const byMethod: Record<string, number> = {}
  for (const p of payments) {
    byMethod[p.payment_method] = (byMethod[p.payment_method] || 0) + p.amount
  }
  const rows = Object.entries(byMethod).map(([method, total]) => [method, fmtCurrency(total)])
  const total = payments.reduce((s, p) => s + p.amount, 0)
  rows.push(['TOTAL', fmtCurrency(total)])
  triggerDownload(
    { title: params.reportTitle, headers: ['Payment Method', 'Total'], rows },
    `monthly-sales-${new Date().toISOString().slice(0, 7)}`,
    params.format,
  )
}

async function categoryWiseSales(params: GenerateParams) {
  // Fetch actual sales data from invoice_items joined with menu_items
  const itemsRes = await insforge.database
    .from('invoice_items')
    .select('name, quantity, total_price')

  const invoiceItems = (itemsRes.data ?? []) as Array<{ name: string; quantity: number; total_price: number }>
  // Map menu items to categories
  const menuItems = (await db.findMany<MenuItemRow>('menu_items')).data ?? []
  const menuCats = (await db.findMany<MenuCategoryRow>('menu_categories')).data ?? []
  const catMap = new Map(menuCats.map(c => [c.id, c.name]))
  const itemToCat = new Map(menuItems.map(i => [i.name, catMap.get(i.category_id) || 'Uncategorized']))

  const grouped: Record<string, { sold: number; revenue: number }> = {}
  for (const item of invoiceItems) {
    const catName = itemToCat.get(item.name) || 'Uncategorized'
    if (!grouped[catName]) grouped[catName] = { sold: 0, revenue: 0 }
    grouped[catName].sold += item.quantity
    grouped[catName].revenue += Number(item.total_price)
  }

  const rows = Object.entries(grouped).map(([cat, data]) => [cat, String(data.sold), fmtCurrency(data.revenue)])
  triggerDownload(
    { title: params.reportTitle, headers: ['Category', 'Items Sold', 'Revenue'], rows },
    'category-sales',
    params.format,
  )
}

async function profitLossStatement(params: GenerateParams) {
  const from = params.startDate ? `${params.startDate}T00:00:00Z` : startOfMonth()
  const [paymentsRes, expensesRes] = await Promise.all([
    insforge.database
      .from('payments')
      .select('amount')
      .gte('created_at', from),
    insforge.database
      .from('expenses')
      .select('amount')
      .gte('date', from.split('T')[0]),
  ])
  const revenue = ((paymentsRes.data ?? []) as Array<{ amount: number }>).reduce((s, p) => s + Number(p.amount), 0)
  const expenses = ((expensesRes.data ?? []) as Array<{ amount: number }>).reduce((s, e) => s + Number(e.amount), 0)
  const profit = revenue - expenses
  const rows = [
    ['Revenue (Payments)', fmtCurrency(revenue)],
    ['Expenses', fmtCurrency(expenses)],
    ['Net Profit / Loss', fmtCurrency(profit)],
  ]
  triggerDownload(
    { title: params.reportTitle, headers: ['Item', 'Amount'], rows },
    'profit-loss',
    params.format,
  )
}

async function cashFlowReport(params: GenerateParams) {
  const from = params.startDate ? `${params.startDate}T00:00:00Z` : startOfMonth()
  const { data } = await insforge.database
    .from('payments')
    .select('amount, created_at')
    .gte('created_at', from)
  const payments = (data ?? []) as Array<{ amount: number; created_at: string }>
  const byDate: Record<string, number> = {}
  for (const p of payments) {
    const d = fmtDate(p.created_at)
    byDate[d] = (byDate[d] || 0) + Number(p.amount)
  }
  const sorted = Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b))
  let running = 0
  const rows = sorted.map(([date, amt]) => {
    running += amt
    return [date, fmtCurrency(amt), fmtCurrency(running)]
  })
  triggerDownload(
    { title: params.reportTitle, headers: ['Date', 'Inflow', 'Running Balance'], rows },
    'cash-flow',
    params.format,
  )
}



async function stockStatusReport(params: GenerateParams) {
  const invRes = await db.findMany<InventoryItemRow>('inventory_items')
  const items = (invRes.data ?? []).filter((i) => i.current_stock < i.min_stock)
  const rows = items.map((i) => [i.name, i.category, String(i.current_stock), String(i.min_stock), i.unit])
  triggerDownload(
    { title: params.reportTitle, headers: ['Item', 'Category', 'Current Stock', 'Min Stock', 'Unit'], rows },
    'stock-status',
    params.format,
  )
}

async function consumptionReport(params: GenerateParams) {
  const invRes = await db.findMany<InventoryItemRow>('inventory_items')
  const items = invRes.data ?? []
  const rows = items.map((i) => [i.name, i.category, String(i.current_stock), i.unit, fmtCurrency(i.cost_per_unit)])
  triggerDownload(
    { title: params.reportTitle, headers: ['Item', 'Category', 'Stock', 'Unit', 'Cost/Unit'], rows },
    'consumption',
    params.format,
  )
}

async function topCustomersReport(params: GenerateParams) {
  const customersRes = await db.findMany<CustomerRow>('customers')
  const sorted = (customersRes.data ?? [])
    .sort((a, b) => b.total_spent - a.total_spent)
    .slice(0, 50)
  const rows = sorted.map((c) => [
    c.name,
    c.phone,
    String(c.total_orders),
    fmtCurrency(c.total_spent),
    c.last_visit ? fmtDate(c.last_visit) : '-',
  ])
  triggerDownload(
    { title: params.reportTitle, headers: ['Customer', 'Phone', 'Orders', 'Total Spent', 'Last Visit'], rows },
    'top-customers',
    params.format,
  )
}

async function roomOccupancyReport(params: GenerateParams) {
  const [roomsRes, bookingsRes] = await Promise.all([
    db.findMany<RoomRow>('rooms'),
    db.findMany<BookingRow>('bookings'),
  ])
  const rooms = roomsRes.data ?? []
  const activeBookings = (bookingsRes.data ?? []).filter(
    (b) => b.status !== 'cancelled' && b.status !== 'checked_out',
  )
  const rows = rooms.map((r) => [
    r.room_number,
    String(r.floor),
    r.status,
    fmtCurrency(r.price_per_night),
    activeBookings.filter((b) => b.room_id === r.id).length > 0 ? 'Yes' : 'No',
  ])
  triggerDownload(
    { title: params.reportTitle, headers: ['Room', 'Floor', 'Status', 'Price/Night', 'Booked'], rows },
    'room-occupancy',
    params.format,
  )
}



// ─── Handler Map ────────────────────────────────────────────

const handlers: Record<string, (p: GenerateParams) => Promise<void>> = {
  '1': dailySalesReport,
  '2': weeklySalesSummary,
  '3': monthlySalesReport,
  '4': categoryWiseSales,
  '5': profitLossStatement,
  '6': cashFlowReport,
  '8': stockStatusReport,
  '9': consumptionReport,
  '10': topCustomersReport,
  '11': roomOccupancyReport,
}

export async function generateReport(params: GenerateParams): Promise<void> {
  const handler = handlers[params.reportId]
  if (!handler) {
    // Fallback: generic data export (last 30 days, or custom range)
    const from = params.startDate ? `${params.startDate}T00:00:00Z` : startOfDay(-30)
    await insforge.database
      .from('invoices')
      .select('*')
      .gte('created_at', from)
    const { data: fallbackData } = await insforge.database
      .from('invoices')
      .select('invoice_number, customer_name, created_at, status, total')
      .gte('created_at', from)
    const fallbackRows = (fallbackData ?? []).map((inv: any) => [
      inv.invoice_number,
      inv.customer_name,
      fmtDate(inv.created_at),
      inv.status,
      fmtCurrency(inv.total),
    ])
    triggerDownload(
      { title: params.reportTitle, headers: ['Invoice', 'Customer', 'Date', 'Status', 'Amount'], rows: fallbackRows },
      `report-${params.reportId}`,
      params.format,
    )
    return
  }
  await handler(params)
}
